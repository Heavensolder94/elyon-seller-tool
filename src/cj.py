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


def get_categories(api_key: str | None = None) -> dict[str, Any]:
    return cj_request("/product/getCategory", api_key=api_key)


def list_products(
    page_num: int = 1,
    page_size: int = 20,
    category_id: str | None = None,
    api_key: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"pageNum": page_num, "pageSize": page_size}
    if category_id:
        payload["categoryId"] = category_id
    return cj_request("/product/list", payload=payload, api_key=api_key)


def search_products(
    keyword: str,
    page: int = 1,
    size: int = 20,
    category_id: str | None = None,
    country_code: str | None = None,
    min_inventory: int | None = None,
    max_inventory: int | None = None,
    api_key: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"keyWord": keyword, "page": page, "size": size}
    if category_id:
        payload["categoryId"] = category_id
    if country_code:
        payload["countryCode"] = country_code
    if min_inventory is not None:
        payload["startWarehouseInventory"] = min_inventory
    if max_inventory is not None:
        payload["endWarehouseInventory"] = max_inventory
    return cj_request("/product/listV2", payload=payload, api_key=api_key)


def get_product_details(
    pid: str | None = None,
    product_sku: str | None = None,
    variant_sku: str | None = None,
    api_key: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    if pid:
        payload["pid"] = pid
    if product_sku:
        payload["productSku"] = product_sku
    if variant_sku:
        payload["variantSku"] = variant_sku
    if not payload:
        raise CJError("Provide pid, product_sku, or variant_sku.")
    return cj_request("/product/query", payload=payload, api_key=api_key)


def get_stock_by_variant(variant_sku: str, api_key: str | None = None) -> dict[str, Any]:
    return cj_request("/product/stock/queryByVid", payload={"variantSku": variant_sku}, api_key=api_key)


def create_order_v2(
    order_data: dict[str, Any],
    platform_token: str | None = None,
    api_key: str | None = None,
) -> dict[str, Any]:
    headers = {"Content-Type": "application/json", "CJ-Access-Token": ensure_token(api_key)}
    if platform_token:
        headers["platformToken"] = platform_token

    body = json.dumps(order_data).encode("utf-8")
    req = request.Request(BASE_URL + "/shopping/order/createOrderV2", data=body, headers=headers, method="POST")
    try:
        with request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise CJError(f"CJ HTTP error {exc.code}: {detail}") from exc
    except error.URLError as exc:
        raise CJError(f"CJ request failed: {exc.reason}") from exc

    if data.get("code") not in (200, "200") or data.get("success") is False or data.get("result") is False:
        raise CJError(data.get("message") or "CJ order creation failed")
    return data
