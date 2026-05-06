import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from cj import (
    CJError,
    authenticate,
    create_order_v2,
    ensure_token,
    get_categories,
    get_stock_by_variant,
    search_products,
)


def main() -> None:
    try:
        tokens = authenticate() if os.getenv("CJ_API_KEY") else ensure_token()
        expiry = tokens["accessTokenExpiryDate"] if isinstance(tokens, dict) else None
        print("CJ connection ready.")
        if expiry:
            print(f"Access token expiry: {expiry}")

        categories = get_categories()
        category_data = categories.get("data", {})
        content = category_data.get("content") or []
        if content:
            first = content[0]
            first_name = first.get("categoryFirstName") or first.get("categoryName") or "Unknown"
            print(f"First category group: {first_name}")

        sample_query = os.getenv("CJ_SAMPLE_QUERY")
        if sample_query:
            sample = search_products(sample_query, page=1, size=3)
            sample_data = sample.get("data", {})
            sample_items = sample_data.get("content") or []
            if sample_items:
                sample_first = sample_items[0]
                sample_products = sample_first.get("productList") or []
                if sample_products:
                    print(f"Search example: {sample_products[0].get('nameEn')}")

        sample_variant = os.getenv("CJ_SAMPLE_VARIANT")
        if sample_variant:
            stock = get_stock_by_variant(sample_variant)
            print(f"Stock lookup status: {stock.get('code')}")

        sample_order = os.getenv("CJ_SAMPLE_ORDER")
        if sample_order:
            order = create_order_v2(json.loads(sample_order))
            print(f"Order creation status: {order.get('code')}")
    except CJError as exc:
        print(f"CJ connection failed: {exc}")


if __name__ == "__main__":
    main()
