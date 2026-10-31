"""Phase 1 regressions; no model downloads or hosted requests."""
import socket
import sys
from types import SimpleNamespace

import pytest
from core import guidance, extractor, url_fetch, pestle, sentiment
from api import roadmap_api


MATCHES = [{"item_id": "i1", "item_name": "Pilot", "layer": "Technology",
            "matched_drivers": ["Legal"], "time_bands": ["Now"], "matched_evidence": []}]
IMPACT = {"verdict": "Adjust", "severity": .5, "by_pestle": {"Legal": {"n_active": 1}}, "evidence": []}


@pytest.mark.parametrize("verdict", ["Maintain", "Adjust", "Revise"])
def test_external_off_blocks_every_guidance_path(monkeypatch, verdict):
    def forbidden(*args, **kwargs):
        pytest.fail("External AI off reached hosted credentials or network")
    monkeypatch.setattr(guidance, "_openrouter_key", forbidden)
    monkeypatch.setattr(guidance.requests, "post", forbidden)
    impact = {**IMPACT, "verdict": verdict}
    first = guidance.generate_guidance(impact, MATCHES)
    assert first == guidance.generate_expert_guidance(impact, {}, MATCHES)
    assert first["llm_provider"] == "deterministic"


def test_global_external_off_overrides_request(monkeypatch):
    monkeypatch.setenv("DDRM_EXTERNAL_AI", "off")
    monkeypatch.setattr(guidance, "_openrouter_key", lambda: pytest.fail("called key"))
    assert guidance.generate_expert_guidance(IMPACT, {}, MATCHES, allow_external_ai=True)["llm_provider"] == "deterministic"


def test_workshop_selection_actual_model_and_failure(monkeypatch):
    monkeypatch.setenv("DDRM_EXTERNAL_AI", "on")
    monkeypatch.setattr(guidance, "_openrouter_key", lambda: "fake")
    calls = []
    def hosted(**kwargs):
        calls.append(kwargs["model"])
        return {"model": "openai/gpt-6.1-sol-resolved", "parsed": {"expert_summary": "Review", "item_advices": []}}
    monkeypatch.setattr(guidance, "_post_openrouter", hosted)
    result = guidance.generate_expert_guidance(IMPACT, {}, MATCHES, llm_model="openai/gpt-6.1-sol", allow_external_ai=True)
    assert calls == ["openai/gpt-6.1-sol"]
    assert result["llm_model"] == "openai/gpt-6.1-sol-resolved"
    def fail(**kwargs):
        calls.append(kwargs["model"])
        raise TimeoutError("provider timed out")
    monkeypatch.setattr(guidance, "_post_openrouter", fail)
    result = guidance.generate_expert_guidance(IMPACT, {}, MATCHES, allow_external_ai=True)
    assert len(calls) == 2  # Failure must not start an additional hosted fallback call.
    assert result["llm_provider"] == "deterministic"
    assert "timed out" in result["llm_error"]


def test_single_guidance_selection(monkeypatch):
    monkeypatch.setenv("DDRM_EXTERNAL_AI", "on")
    monkeypatch.setattr(guidance, "_openrouter_key", lambda: "fake")
    def hosted(**kwargs):
        assert kwargs["model"] == "openai/gpt-6.1-sol"
        return {"model": "actual-model", "parsed": {"summary": "Review", "recommended_action": "review",
                "item_guidance": [], "questions_for_humans": []}}
    monkeypatch.setattr(guidance, "_post_openrouter", hosted)
    assert guidance.generate_guidance(IMPACT, MATCHES, llm_model="openai/gpt-6.1-sol", allow_external_ai=True)["llm_model"] == "actual-model"


@pytest.mark.parametrize("model", guidance.GUIDANCE_MODELS)
def test_api_controls_and_errors(monkeypatch, model):
    from fastapi.testclient import TestClient
    client = TestClient(roadmap_api.app)
    seen = []
    def pipeline(**kwargs):
        seen.append(kwargs)
        return {"verdict": "Maintain"}
    monkeypatch.setattr(roadmap_api, "run_pipeline", pipeline)
    payload = {"input_text": "News", "roadmap": {}, "llm_model": model, "allow_external_ai": False}
    assert client.post("/api/recommend", json=payload).status_code == 200
    assert seen[0]["llm_model"] == model and seen[0]["allow_external_ai"] is False
    assert client.get("/api/config").json()["guidance_models"] == list(guidance.GUIDANCE_MODELS)
    assert client.get("/api/config").json()["thresholds"] == {"adjust": .35, "revise": .65}
    for change in ({"llm_model": "unknown"}, {"input_mode": "unsupported"}):
        assert client.post("/api/recommend", json={**payload, **change}).status_code == 400
    assert len(seen) == 1
    for error, status in [(ValueError("inaccessible URL"), 400), (RuntimeError("model unavailable"), 503), (Exception("boom"), 500)]:
        def fail(**kwargs):
            raise error
        monkeypatch.setattr(roadmap_api, "run_pipeline", fail)
        response = client.post("/api/recommend", json=payload)
        assert response.status_code == status
        assert "result" not in response.json()


@pytest.mark.parametrize("address", ["127.0.0.1", "10.0.0.1", "169.254.169.254", "192.168.1.1", "::1", "fc00::1", "::ffff:127.0.0.1", "0.0.0.0"])
def test_private_dns_rejected(monkeypatch, address):
    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **kw: [(None, None, None, None, (address, 80))])
    with pytest.raises(ValueError, match="public"):
        url_fetch._resolve("example.com", 80, 1)


@pytest.mark.parametrize("url", ["file:///etc/passwd", "https://user:pass@example.com/", "http://example.com:8000/", "http://example.com/\nfoo"])
def test_invalid_urls_never_resolve(monkeypatch, url):
    monkeypatch.setattr(url_fetch, "_resolve", lambda *a: pytest.fail("resolved invalid URL"))
    with pytest.raises(ValueError):
        url_fetch.fetch_html(url)


def test_redirect_is_revalidated_and_connection_is_pinned(monkeypatch):
    calls = []
    def dns(host, *a, **kw):
        return [(None, None, None, None, ("93.184.216.34" if host == "public.example" else "127.0.0.1", 80))]
    monkeypatch.setattr(socket, "getaddrinfo", dns)
    class Connection:
        sock = None
        def __init__(self, host, port, address, secure, timeout):
            calls.append((host, address))
        def request(self, *a, **kw): pass
        def close(self): pass
        def getresponse(self):
            return SimpleNamespace(status=302, getheader=lambda key: "http://internal.example/", close=lambda: None)
    monkeypatch.setattr(url_fetch, "_PinnedConnection", Connection)
    with pytest.raises(ValueError, match="public"):
        url_fetch.fetch_html("http://public.example/")
    assert calls == [("public.example", "93.184.216.34")]


@pytest.mark.parametrize("port,secure", [(443, True), (80, False)])
def test_host_header_omits_default_port(port, secure):
    # Some sites (Pantip, Yonhap) reject "Host: name:443" with HTTP 400.
    connection = url_fetch._PinnedConnection("pantip.com", port, "93.184.216.34", secure, 5)
    connection.putrequest("GET", "/")  # buffers headers only; nothing connects
    assert b"Host: pantip.com" in connection._buffer


@pytest.mark.parametrize("body,content_type", [
    (b"\xef\xbb\xbf<p>\xe0\xb8\x81\xe0\xb8\xa3 \x8a</p>", ""),                       # BOM, no header
    (b"<p>\xe0\xb8\x81\xe0\xb8\xa3 \x8a</p>", 'text/html; charset="UTF-8"'),            # header only
], ids=["bom", "header"])
def test_declared_utf8_survives_one_bad_byte(body, content_type):
    # One invalid byte (as on Pantip) must not switch the whole page to Mac Roman.
    assert url_fetch._decode(body, content_type) == "<p>กร �</p>"


def test_undeclared_charset_is_still_detected():
    assert url_fetch._decode("<p>สวัสดี</p>".encode("utf-8"), "text/html") == "<p>สวัสดี</p>"
    assert url_fetch._decode("<p>สวัสดี</p>".encode("utf-8"), "text/html; charset=bogus") == "<p>สวัสดี</p>"


@pytest.mark.parametrize("headers,body,expected", [
    ({"Content-Length": "2097153"}, b"", "2 MB"),
    ({}, b"x" * (2097153), "2 MB"),
    ({"Content-Type": "application/pdf"}, b"", "supported"),
    ({"Content-Length": "100"}, b"short", "incomplete"),
], ids=["content-length", "stream-limit", "binary-type", "truncated-body"])
def test_download_bounds(monkeypatch, headers, body, expected):
    from io import BytesIO
    stream = BytesIO(body)
    response = SimpleNamespace(status=200, getheader=lambda k, d=None: headers.get(k, d), read1=stream.read1, close=stream.close)
    monkeypatch.setattr(url_fetch, "_resolve", lambda *a: "93.184.216.34")
    monkeypatch.setattr(url_fetch, "_PinnedConnection", lambda *a: SimpleNamespace(sock=None, request=lambda *a, **kw: None, getresponse=lambda: response, close=lambda: None))
    with pytest.raises(ValueError, match=expected):
        url_fetch.fetch_html("https://example.com/")


def test_all_extractors_reuse_one_download(monkeypatch):
    downloads, parsed = [], []
    def fetch(url):
        downloads.append(url)
        return url, "cached html"
    def parse(html):
        parsed.append(html)
        return "", ""
    monkeypatch.setattr(extractor, "fetch_html", fetch)
    for name in ("_extract_trafilatura", "_extract_readability", "_extract_bs4"):
        monkeypatch.setattr(extractor, name, parse)
    with pytest.raises(ValueError, match="No readable"):
        extractor.extract_article("https://example.com")
    assert len(downloads) == 1 and parsed == ["cached html"] * 3


def test_mixed_dns_and_late_eof_rejected(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **kw: [
        (None, None, None, None, (ip, 80)) for ip in ("93.184.216.34", "10.0.0.1")])
    with pytest.raises(ValueError, match="public"):
        url_fetch._resolve("example.com", 80, 1)
    clock = [0]
    monkeypatch.setattr(url_fetch.time, "monotonic", lambda: clock[0])
    monkeypatch.setattr(url_fetch, "_resolve", lambda *a: "93.184.216.34")
    def late_eof(size):
        clock[0] = url_fetch.TIMEOUT_SECONDS + 1
        return b""
    response = SimpleNamespace(status=200, getheader=lambda k, d=None: d, read1=late_eof, close=lambda: None)
    monkeypatch.setattr(url_fetch, "_PinnedConnection", lambda *a: SimpleNamespace(sock=None, request=lambda *a, **kw: None, getresponse=lambda: response, close=lambda: None))
    with pytest.raises(ValueError, match="too long to answer"):
        url_fetch.fetch_html("https://example.com/")


def test_unavailable_classifiers_are_actionable(monkeypatch):
    def unavailable(*a, **kw):
        raise OSError("offline")
    monkeypatch.setitem(sys.modules, "transformers", SimpleNamespace(pipeline=unavailable))
    monkeypatch.setattr(pestle, "_classifier", None)
    monkeypatch.setattr(sentiment, "_pipeline_cache", {})
    with pytest.raises(RuntimeError, match="PESTLE model unavailable"):
        pestle._get_classifier()
    with pytest.raises(RuntimeError, match="Sentiment model unavailable"):
        sentiment._get_pipeline("ProsusAI/finbert", 512)


def test_every_model_loads_in_float32(monkeypatch):
    # The PESTLE checkpoint is float16; loaded as saved, CPU assessments took minutes.
    import torch
    from core import keypoints
    calls = []
    monkeypatch.setitem(sys.modules, "transformers", SimpleNamespace(pipeline=lambda *a, **kw: calls.append(kw) or object()))
    monkeypatch.setitem(sys.modules, "sentence_transformers", SimpleNamespace(
        SentenceTransformer=lambda *a, **kw: calls.append(kw["model_kwargs"]) or object()))
    monkeypatch.setattr(pestle, "_classifier", None)
    monkeypatch.setattr(sentiment, "_pipeline_cache", {})
    monkeypatch.setattr(keypoints, "_model_cache", {})
    pestle._get_classifier()
    sentiment._get_pipeline("ProsusAI/finbert", 512)
    keypoints._get_embedder()
    assert [c["dtype"] for c in calls] == [torch.float32] * 3


def test_warm_up_loads_every_model_under_the_lock(monkeypatch):
    from core import keypoints
    from ui import app
    loaded = []
    def load(name):
        def fn(*args):
            assert app._PIPELINE_LOCK.locked(), "Warm-up raced an assessment"
            loaded.append(args[0] if args else name)
        return fn
    monkeypatch.setattr(keypoints, "_get_embedder", load("embedder"))
    monkeypatch.setattr(pestle, "_get_classifier", load("pestle"))
    monkeypatch.setattr(sentiment, "_get_pipeline", load("sentiment"))
    app.warm_models()
    assert loaded[:2] == ["embedder", "pestle"]
    assert set(loaded[2:]) == {"siebert/sentiment-roberta-large-english", "ProsusAI/finbert",
                               "climatebert/distilroberta-base-climate-sentiment"}


def test_simultaneous_assessments_are_serialized(monkeypatch):
    import concurrent.futures
    import threading
    import time
    from ui import app
    start = threading.Barrier(2)
    active = []
    def pipeline(*args):
        assert not active, "Model initialization raced another assessment"
        active.append(True)
        time.sleep(.05)
        active.pop()
        return {"verdict": "Maintain"}
    monkeypatch.setattr(app, "_run_pipeline", pipeline)
    def assess():
        start.wait(timeout=2)
        return app.run_pipeline("News", "Text", None, 7)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: assess(), range(2)))
    assert results == [{"verdict": "Maintain"}] * 2


@pytest.mark.parametrize("encoding", ["gzip", "deflate"])
def test_compressed_pages_are_inflated(monkeypatch, encoding):
    import gzip, zlib
    from io import BytesIO
    html = "<p>ข่าว news</p>".encode("utf-8")
    body = gzip.compress(html) if encoding == "gzip" else zlib.compress(html)
    headers = {"Content-Encoding": encoding, "Content-Type": "text/html; charset=utf-8"}
    stream = BytesIO(body)
    response = SimpleNamespace(status=200, getheader=lambda k, d=None: headers.get(k, d), read1=stream.read1, close=stream.close)
    monkeypatch.setattr(url_fetch, "_resolve", lambda *a: "93.184.216.34")
    monkeypatch.setattr(url_fetch, "_PinnedConnection", lambda *a: SimpleNamespace(sock=None, request=lambda *a, **kw: None, getresponse=lambda: response, close=lambda: None))
    assert url_fetch.fetch_html("https://example.com/")[1] == "<p>ข่าว news</p>"


def test_gzip_bomb_is_capped():
    import gzip
    with pytest.raises(ValueError, match="2 MB"):
        url_fetch._inflate(gzip.compress(b"0" * (url_fetch.MAX_BYTES + 10)), "gzip")


def test_ipv4_is_preferred(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **kw: [(None, None, None, None, ("2606:2800:220:1::", 443)), (None, None, None, None, ("93.184.216.34", 443))])
    assert url_fetch._resolve("example.com", 443, 1) == "93.184.216.34"
