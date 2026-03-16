# /// script
# dependencies = ["requests>=2.31"]
# ///
"""Call the gateway's chat completion endpoint.

Usage:
  echo '{"messages": [{"role": "user", "content": "Hello"}]}' | uv run scripts/chat_completion.py
  uv run scripts/chat_completion.py --model gpt-4o --base-url http://localhost:9090

Reads a JSON object from stdin with at least a "messages" field.
Prints the assistant's response content to stdout.
"""

import argparse
import json
import sys

import requests

DEFAULT_BASE_URL = "http://localhost:9090"
DEFAULT_MODEL = "gpt-4o-mini"


def chat_completion(messages: list, model: str, base_url: str, **kwargs) -> str:
    payload = {"model": model, "messages": messages, **kwargs}
    resp = requests.post(f"{base_url}/v1/chat/completions", json=payload)
    resp.raise_for_status()
    result = resp.json()
    choices = result.get("choices")
    if not choices:
        print("Error: No choices in response", file=sys.stderr)
        sys.exit(1)
    return choices[0]["message"]["content"]


def main() -> None:
    parser = argparse.ArgumentParser(description="Chat completion via gateway")
    parser.add_argument("--model", default=None, help="Model override")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Gateway base URL")
    args = parser.parse_args()

    data = json.load(sys.stdin)
    messages = data.pop("messages")
    model = args.model or data.pop("model", DEFAULT_MODEL)
    # Remaining keys (temperature, response_format, etc.) pass through
    try:
        result = chat_completion(messages, model, args.base_url, **data)
    except requests.ConnectionError:
        print(f"Error: Cannot connect to {args.base_url}. Is the gateway running?", file=sys.stderr)
        sys.exit(1)
    except requests.HTTPError as e:
        print(f"Error: Request failed with status {e.response.status_code}", file=sys.stderr)
        print(f"  Response: {e.response.text}", file=sys.stderr)
        sys.exit(1)
    print(result)


if __name__ == "__main__":
    main()
