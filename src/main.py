from pathlib import Path
import os
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

from cj import authenticate, ensure_token, CJError


def main() -> None:
    try:
        tokens = authenticate() if os.getenv("CJ_API_KEY") else ensure_token()
        expiry = tokens["accessTokenExpiryDate"] if isinstance(tokens, dict) else None
        print("CJ connection ready.")
        if expiry:
            print(f"Access token expiry: {expiry}")
    except CJError as exc:
        print(f"CJ connection failed: {exc}")


if __name__ == "__main__":
    main()
