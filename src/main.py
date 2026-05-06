import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from cj import CJError, authenticate, ensure_token, get_categories, list_products


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

        products = list_products(page_num=1, page_size=3)
        product_data = products.get("data", {})
        items = product_data.get("content") or []
        if items:
            first_item = items[0]
            product_list = first_item.get("productList") or []
            if product_list:
                print(f"Example product: {product_list[0].get('nameEn')}")
    except CJError as exc:
        print(f"CJ connection failed: {exc}")


if __name__ == "__main__":
    main()
