#!/usr/bin/env python3
"""Send a simple hello message to OpenAI using the official OpenAI SDK."""

from __future__ import annotations

import argparse
import os
import sys


DEFAULT_MODEL = "gpt-4o-mini"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Send 'hello' to OpenAI using a custom API key and base URL."
    )
    parser.add_argument(
        "--api-key",
        default=os.getenv("OPENAI_API_KEY"),
        help="API key. Defaults to OPENAI_API_KEY.",
    )
    parser.add_argument(
        "--base-url",
        default=os.getenv("OPENAI_BASE_URL") or "https://api.openai.com/v1",
        help="Base URL, for example https://api.openai.com/v1.",
    )
    parser.add_argument(
        "--model",
        default=os.getenv("OPENAI_MODEL", DEFAULT_MODEL),
        help=f"OpenAI model name. Defaults to {DEFAULT_MODEL}.",
    )
    parser.add_argument(
        "--message",
        default="hello",
        help="Message to send. Defaults to hello.",
    )
    parser.add_argument(
        "--max-output-tokens",
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


def response_text(response: object) -> str:
    output_text = getattr(response, "output_text", None)
    if output_text:
        return str(output_text)

    parts: list[str] = []
    for item in getattr(response, "output", []) or []:
        for content in getattr(item, "content", []) or []:
            text = getattr(content, "text", None)
            if text:
                parts.append(str(text))
    return "\n".join(parts)


def main() -> int:
    args = parse_args()
    if not args.api_key:
        print(
            "Missing API key. Pass --api-key or set OPENAI_API_KEY.",
            file=sys.stderr,
        )
        return 2

    try:
        from openai import APIError, OpenAI, OpenAIError
    except ImportError:
        print(
            "Missing dependency. Install it with: python3 -m pip install openai",
            file=sys.stderr,
        )
        return 2

    client = OpenAI(
        api_key=args.api_key,
        base_url=args.base_url,
        timeout=args.timeout,
    )

    try:
        response = client.responses.create(
            model=args.model,
            input=args.message,
            max_output_tokens=args.max_output_tokens,
        )
    except APIError as exc:
        print(f"OpenAI API error: {exc}", file=sys.stderr)
        return 1
    except OpenAIError as exc:
        print(f"OpenAI SDK error: {exc}", file=sys.stderr)
        return 1

    text = response_text(response)
    if text:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
