"""Bounded public-web fetch. DNS is checked once and the connection uses that IP.

No environment proxies, automatic redirects, cookies, or parser network requests.
"""
import codecs
import http.client
import ipaddress
import queue
import socket
import ssl
import threading
import time
import zlib
from email.message import Message
from urllib.parse import urljoin, urlsplit, urlunsplit

MAX_BYTES = 2 * 1024 * 1024
MAX_REDIRECTS = 3
TIMEOUT_SECONDS = 15
USER_AGENT = "DDRM-ArticleReader/1.0"


def _resolve(host, port, timeout):
    # getaddrinfo has no timeout. A daemon bounds the caller even if OS DNS stalls.
    result = queue.Queue(maxsize=1)
    def lookup():
        try:
            result.put(socket.getaddrinfo(host, port, type=socket.SOCK_STREAM))
        except OSError as exc:
            result.put(exc)
    threading.Thread(target=lookup, daemon=True).start()
    try:
        answers = result.get(timeout=max(0.001, timeout))
    except queue.Empty as exc:
        raise ValueError("URL lookup timed out. Paste the article text instead.") from exc
    if isinstance(answers, Exception) or not answers:
        raise ValueError("URL host could not be resolved. Check the address or paste the article text.")
    addresses = [ipaddress.ip_address(row[4][0]) for row in answers]
    if any(not ip.is_global or (getattr(ip, "ipv4_mapped", None) and not ip.ipv4_mapped.is_global) for ip in addresses):
        raise ValueError("URL must resolve only to public internet addresses; private and local networks are blocked.")
    # IPv4 first: a machine with a broken IPv6 route otherwise fails every dual-stack site (example.com).
    return str(sorted(addresses, key=lambda ip: ip.version)[0])


class _PinnedConnection(http.client.HTTPConnection):
    def __init__(self, host, port, address, secure, timeout):
        super().__init__(host, port, timeout=timeout)
        self.address, self.secure = address, secure
        # HTTPConnection assumes port 80, so HTTPS sent "Host: x:443"; Pantip and Yonhap answer that with 400.
        self.default_port = 443 if secure else 80

    def connect(self):
        self.sock = socket.create_connection((self.address, self.port), self.timeout)
        self.active_socket = self.sock
        if self.secure:
            # Validate the certificate and SNI against the original hostname.
            self.sock = ssl.create_default_context().wrap_socket(self.sock, server_hostname=self.host)
            self.active_socket = self.sock


def _decode(body, content_type):
    """BOM, then the HTTP charset, as browsers do; guess only when neither is declared.

    UnicodeDammit decodes strictly, so one bad byte (Pantip share links) made it
    pick Mac Roman and garble the whole page. A declared charset replaces only bad bytes.
    shortcut: only the UTF-8 BOM is recognised; add UTF-16 BOMs if such pages appear.
    """
    if body.startswith(codecs.BOM_UTF8):
        return body[len(codecs.BOM_UTF8):].decode("utf-8", errors="replace")
    header = Message()
    header["Content-Type"] = content_type
    charset = header.get_content_charset()
    if charset:
        try:
            return body.decode(charset, errors="replace")
        except LookupError:
            pass  # Unknown charset name: fall back to detection.
    from bs4 import UnicodeDammit
    return UnicodeDammit(body, is_html=True).unicode_markup or ""


def _inflate(body, encoding):
    """Undo gzip/deflate with the same 2 MB cap as the download (a small bomb must not expand unbounded)."""
    if encoding == "identity":
        return body
    inflater = zlib.decompressobj(zlib.MAX_WBITS | 32 if encoding == "gzip" else zlib.MAX_WBITS)
    try:
        out = inflater.decompress(body, MAX_BYTES + 1)
    except zlib.error:
        out = zlib.decompressobj(-zlib.MAX_WBITS).decompress(body, MAX_BYTES + 1)  # raw deflate, as some servers send
    if len(out) > MAX_BYTES:
        raise ValueError("Article exceeds the 2 MB download limit.")
    return out


def _abort(connection):
    active_socket = getattr(connection, "active_socket", connection.sock)
    if active_socket:
        try:
            active_socket.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
    connection.close()


def fetch_html(url):
    deadline = time.monotonic() + TIMEOUT_SECONDS
    for hop in range(MAX_REDIRECTS + 1):
        try:
            parts = urlsplit(url)
            if parts.scheme not in {"http", "https"} or not parts.hostname or parts.username is not None or parts.password is not None:
                raise ValueError("Enter a full web address starting with http:// or https:// (no user name or password).")
            if any(ord(c) < 32 or c.isspace() for c in url) or "\\" in url:
                raise ValueError("URL contains invalid characters.")
            port = parts.port or (443 if parts.scheme == "https" else 80)
            if port not in {80, 443}:
                raise ValueError("Article URLs must use port 80 or 443.")
            host = parts.hostname.encode("idna").decode("ascii")
            address = _resolve(host, port, deadline - time.monotonic())
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError()
            connection = _PinnedConnection(host, port, address, parts.scheme == "https", remaining)
            timer = threading.Timer(remaining, _abort, args=(connection,))
            timer.daemon = True
            timer.start()
            response = None
            try:
                target = urlunsplit(("", "", parts.path or "/", parts.query, ""))
                connection.request("GET", target, headers={"User-Agent": USER_AGENT, "Accept-Encoding": "gzip, deflate"})
                response = connection.getresponse()
                if response.status in {301, 302, 303, 307, 308}:
                    location = response.getheader("Location")
                    if not location or hop == MAX_REDIRECTS:
                        raise ValueError("URL redirected too many times or without a destination.")
                    url = urljoin(url, location)
                    continue  # Each destination is validated and resolved before connecting.
                if response.status != 200:
                    raise ValueError(f"Article is inaccessible (HTTP {response.status}). Paste the text instead.")
                mime = response.getheader("Content-Type", "").split(";")[0].strip().lower()
                if mime not in {"text/html", "application/xhtml+xml", "text/plain", ""}:
                    raise ValueError("URL does not contain a supported text article.")
                encoding = response.getheader("Content-Encoding", "identity").lower()
                if encoding not in {"identity", "gzip", "deflate"}:
                    raise ValueError(f"The site sent {encoding}-compressed content, which is not supported. Paste the article text instead.")
                length = response.getheader("Content-Length")
                if length and int(length) > MAX_BYTES:
                    raise ValueError("Article exceeds the 2 MB download limit.")
                body = bytearray()
                while True:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise TimeoutError()
                    if connection.sock:
                        connection.sock.settimeout(remaining)
                    chunk = response.read1(min(65536, MAX_BYTES + 1 - len(body)))
                    if not chunk:
                        break
                    body.extend(chunk)
                    if len(body) > MAX_BYTES:
                        raise ValueError("Article exceeds the 2 MB download limit.")
                if time.monotonic() >= deadline:
                    raise TimeoutError()
                if length and len(body) != int(length):
                    raise ValueError("Article download was incomplete. Retry or paste the text.")
                return url, _decode(_inflate(bytes(body), encoding), response.getheader("Content-Type", ""))
            finally:
                timer.cancel()
                if response:
                    response.close()
                connection.close()
        except ssl.SSLError as exc:
            raise ValueError("The site's security certificate could not be verified. Paste the article text instead.") from exc
        except (TimeoutError, socket.timeout) as exc:
            raise ValueError("The site took too long to answer. Retry later or paste the article text.") from exc
        except (ConnectionError, OSError) as exc:
            raise ValueError("Could not connect to the site. Check the URL or paste the article text.") from exc
        except (http.client.HTTPException, UnicodeError, zlib.error) as exc:
            raise ValueError("The site sent a response that could not be read. Paste the article text instead.") from exc
    raise ValueError("Too many redirects.")
