"""Compatibility shim for older button/import paths.

This keeps legacy imports working while the CJ implementation lives in
``src/cj.py``.
"""

from cj import (
    CJError,
    authenticate,
    create_order_v2,
    ensure_token,
    get_categories,
    get_product_details,
    get_stock_by_variant,
    list_products,
    search_products,
)
