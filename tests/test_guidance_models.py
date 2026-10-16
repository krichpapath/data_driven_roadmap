"""Request compatibility and migration checks; no hosted calls."""
import pytest
from core import guidance


@pytest.mark.parametrize("model,reasoning,limit", [
    ("openai/gpt-6-luna", {"effort": "none", "exclude": True}, 2048),
    ("openai/gpt-6.1-sol", {"effort": "low", "exclude": True}, 4096),
    ("anthropic/claude-sonnet-5.5", {"effort": "low", "exclude": True}, 4096),
    ("anthropic/claude-haiku-5.5", {"effort": "none", "exclude": True}, 2048),
    ("qwen/qwen3.7-plus", {"enabled": False}, 2048),
])
def test_hosted_request_contract(monkeypatch, model, reasoning, limit):
    def post(url, **kwargs):
        payload = kwargs["json"]
        assert payload["model"] == model
        assert payload["reasoning"] == reasoning
        assert payload["max_tokens"] == limit
        assert payload["provider"] == {"require_parameters": True}
        assert "temperature" not in payload
        assert payload["response_format"]["json_schema"]["strict"] is True
        class Response:
            def raise_for_status(self): pass
            def json(self):
                return {"model": model + "-resolved", "choices": [
                    {"finish_reason": "stop", "message": {"content": '{"summary":"Review"}'}}]}
        return Response()
    monkeypatch.setattr(guidance.requests, "post", post)
    result = guidance._post_openrouter(api_key="fake", model=model, system_prompt="Review evidence",
        user_content="Synthetic", schema_name="advice", schema={}, title="Test")
    assert result == {"model": model + "-resolved", "parsed": {"summary": "Review"}}


@pytest.mark.parametrize("configured", ["", "openai/gpt-4o-mini", "openai/gpt-4o"])
def test_default_and_old_environment_migrate_to_luna(monkeypatch, configured):
    monkeypatch.setattr(guidance, "_dotenv_loaded", True)
    monkeypatch.setenv("OPENROUTER_MODEL", configured)
    assert guidance.resolve_guidance_model() == "openai/gpt-6-luna"
    with pytest.raises(ValueError, match="Unsupported"):
        guidance.resolve_guidance_model("openai/gpt-4o")


@pytest.mark.parametrize("finish,content,message", [
    ("length", '{"summary":"Incomplete"}', "token limit"),
    ("stop", None, "no advice"),
])
def test_incomplete_hosted_response_is_failure(monkeypatch, finish, content, message):
    class Response:
        def raise_for_status(self): pass
        def json(self):
            return {"choices": [{"finish_reason": finish, "message": {"content": content}}]}
    monkeypatch.setattr(guidance.requests, "post", lambda *a, **kw: Response())
    with pytest.raises(ValueError, match=message):
        guidance._post_openrouter(api_key="fake", model="openai/gpt-6-luna", system_prompt="",
            user_content="", schema_name="advice", schema={}, title="Test")
