"""Bounded public-web fetch. DNS is checked once and the connection uses that IP.

No environment proxies, automatic redirects, cookies, or parser network requests.
"""
import http.client
import ipaddress
import queue
import socket
import ssl
import threading
import time
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
    return str(addresses[0])


class _PinnedConnection(http.client.HTTPConnection):
    def __init__(self, host, port, address, secure, timeout):
        super().__init__(host, port, timeout=timeout)
        self.address, self.secure = address, secure

    def connect(self):
        self.sock = socket.create_connection((self.address, self.port), self.timeout)
        self.active_socket = self.sock
        if self.secure:
            # Validate the certificate and SNI against the original hostname.
            self.sock = ssl.create_default_context().wrap_socket(self.sock, server_hostname=self.host)
            self.active_socket = self.sock


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
                raise ValueError("Use an http or https article URL without credentials.")
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
                connection.request("GET", target, headers={"User-Agent": USER_AGENT, "Accept-Encoding": "identity"})
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
                if response.getheader("Content-Encoding", "identity").lower() != "identity":
                    raise ValueError("Server ignored the uncompressed-content request. Paste the article text instead.")
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
                from bs4 import UnicodeDammit
                return url, UnicodeDammit(bytes(body), is_html=True).unicode_markup or ""
            finally:
                timer.cancel()
                if response:
                    response.close()
                connection.close()
        except (OSError, http.client.HTTPException, UnicodeError) as exc:
            raise ValueError("Article download failed or timed out. Check the URL or paste the text instead.") from exc
    raise ValueError("Too many redirects.")
