"""CJdropshipping API helpers."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any
from urllib import error, request

BASE_URL = "https://developers.cjdropshipping.com/api2.0/v1"
TOKEN_FILE = Path("data") / "cj_tokens.json"


class CJError(RuntimeError):
    pass


def _load_tokens() -> dict[str, Any] | None:
    if not TOKEN_FILE.exists():
        return None
    return json.loads(TOKEN_FILE.read_text(encoding="utf-8"))


def _save_tokens(tokens: dict[str, Any]) -> None:
    TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    TOKEN_FILE.write_text(json.dumps(tokens, indent=2), encoding="utf-8")


def _request(path: str, payload: dict[str, Any] | None = None, token: str | None = None) -> dict[str, Any]:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["CJ-Access-Token"] = token

    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = request.Request(BASE_URL + path, data=body, headers=headers, method="POST")
    try:
        with request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise CJError(f"CJ HTTP error {exc.code}: {detail}") from exc
    except error.URLError as exc:
        raise CJError(f"CJ request failed: {exc.reason}") from exc

    if data.get("code") not in (200, "200") or data.get("success") is False or data.get("result") is False:
        raise CJError(data.get("message") or "CJ request failed")
    return data


def authenticate(api_key: str | None = None) -> dict[str, Any]:
    api_key = api_key or os.getenv("CJ_API_KEY")
    if not api_key:
        raise CJError("Missing CJ API key. Set CJ_API_KEY or pass api_key.")
    data = _request("/authentication/getAccessToken", {"apiKey": api_key})
    tokens = data["data"]
    _save_tokens(tokens)
    return tokens


def refresh() -> dict[str, Any]:
    tokens = _load_tokens()
    if not tokens or not tokens.get("refreshToken"):
        raise CJError("No refresh token found. Authenticate first.")
    data = _request("/authentication/refreshAccessToken", {"refreshToken": tokens["refreshToken"]})
    tokens = data["data"]
    _save_tokens(tokens)
    return tokens


def _expired(expiry: str | None) -> bool:
    if not expiry:
        return True
    try:
        when = datetime.fromisoformat(expiry.replace("Z", "+00:00"))
    except ValueError:
        return True
    return when <= datetime.now(timezone.utc) + timedelta(minutes=5)


def ensure_token(api_key: str | None = None) -> str:
    tokens = _load_tokens()
    if not tokens:
        return authenticate(api_key)["accessToken"]
    if _expired(tokens.get("accessTokenExpiryDate")):
        return refresh()["accessToken"]
    return tokens["accessToken"]


def cj_request(path: str, payload: dict[str, Any] | None = None, api_key: str | None = None) -> dict[str, Any]:
    token = ensure_token(api_key)
    return _request(path, payload=payload, token=token)
