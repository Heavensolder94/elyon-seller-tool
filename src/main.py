from cj import authenticate, ensure_token, CJError
import os


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
