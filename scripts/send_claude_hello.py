#!/usr/bin/env python3
"""Send a simple hello message to Claude using the official Anthropic SDK."""

from __future__ import annotations

import argparse
import os
import sys


DEFAULT_MODEL = "claude-sonnet-4-5"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Send 'hello' to Claude using a custom API key and base URL."
    )
    parser.add_argument(
        "--api-key",
        default=os.getenv("ANTHROPIC_API_KEY") or os.getenv("CLAUDE_API_KEY"),
        help="API key. Defaults to ANTHROPIC_API_KEY or CLAUDE_API_KEY.",
    )
    parser.add_argument(
        "--base-url",
        default=os.getenv("ANTHROPIC_BASE_URL")
        or os.getenv("CLAUDE_BASE_URL")
        or "https://api.anthropic.com",
        help="Base URL, for example https://api.anthropic.com.",
    )
    parser.add_argument(
        "--model",
        default=os.getenv("CLAUDE_MODEL", DEFAULT_MODEL),
        help=f"Claude model name. Defaults to {DEFAULT_MODEL}.",
    )
    parser.add_argument(
        "--message",
        default="hello",
        help="Message to send. Defaults to hello.",
    )
    parser.add_argument(
        "--max-tokens",
        type=int,
        default=128,
        help="Maximum output tokens. Defaults to 128.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=60.0,
        help="HTTP timeout in seconds. Defaults to 60.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.api_key:
        print(
            "Missing API key. Pass --api-key or set ANTHROPIC_API_KEY/CLAUDE_API_KEY.",
            file=sys.stderr,
        )
        return 2

    try:
        from anthropic import Anthropic, APIError
    except ImportError:
        print(
            "Missing dependency. Install it with: python3 -m pip install anthropic",
            file=sys.stderr,
        )
        return 2

    client = Anthropic(
        api_key=args.api_key,
        base_url=args.base_url,
        timeout=args.timeout,
    )

    try:
        message = client.messages.create(
            model=args.model,
            max_tokens=args.max_tokens,
            messages=[
                {
                    "role": "user",
                    "content": args.message,
                }
            ],
        )
    except APIError as exc:
        print(f"Claude API error: {exc}", file=sys.stderr)
        return 1

    text_parts = [
        block.text
        for block in message.content
        if getattr(block, "type", None) == "text"
    ]
    print("\n".join(part for part in text_parts if part))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
