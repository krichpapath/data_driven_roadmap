from fastapi.testclient import TestClient
from api import roadmap_api


def test_source_reference_round_trip(monkeypatch):
    seen = []
    def pipeline(**kwargs):
        seen.append(kwargs)
        return {"severity": .5}
    monkeypatch.setattr(roadmap_api, "run_pipeline", pipeline)
    ref = {"id": "japanese-source", "revision": 3, "name": "Report"}
    with TestClient(roadmap_api.app, base_url="http://127.0.0.1") as client:
        response = client.post('/api/recommend', json={"input_text": "Reviewed English translation", "roadmap": {}, "source_ref": ref})
        assert response.json()['result']['source_ref'] == ref
        assert seen[0]['input_text'] == 'Reviewed English translation'
        assert seen[0]['allow_external_ai'] is False
        assert client.post('/api/recommend', json={"input_text": "text", "roadmap": {}, "source_ref": {**ref, "revision": 0}}).status_code == 422


def test_extract_uses_existing_safe_extractor(monkeypatch):
    seen = []
    def extract(url):
        seen.append(url)
        return '日本語', '記事の本文'
    monkeypatch.setattr(roadmap_api, 'extract_article', extract)
    with TestClient(roadmap_api.app, base_url="http://127.0.0.1") as client:
        response = client.post('/api/extract', json={'url': 'https://example.org/article'})
        assert response.json()['text'] == '記事の本文'
        assert seen == ['https://example.org/article']
        def reject(url):
            raise ValueError('Only public network addresses are allowed.')
        monkeypatch.setattr(roadmap_api, 'extract_article', reject)
        assert client.post('/api/extract', json={'url': 'http://127.0.0.1/'}).status_code == 400


def test_extraction_failure_is_not_success(monkeypatch):
    def fail(url):
        raise RuntimeError('unreachable')
    monkeypatch.setattr(roadmap_api, 'extract_article', fail)
    with TestClient(roadmap_api.app, base_url="http://127.0.0.1") as client:
        response = client.post('/api/extract', json={'url': 'https://example.org/'})
        assert response.status_code == 502
        assert 'text' not in response.json()
