#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

base_url="${MOVSCRIPT_NEW_API_BASE_URL:-}"
if [[ -z "${base_url}" ]]; then
  if [[ -t 0 ]]; then
    read -r -p "New API base URL [https://api.newapi.pro/v1]: " base_url
    base_url="${base_url:-https://api.newapi.pro/v1}"
  else
    echo "MOVSCRIPT_NEW_API_BASE_URL is required when stdin is not a TTY." >&2
    exit 2
  fi
fi

api_key="${MOVSCRIPT_NEW_API_API_KEY:-}"
if [[ -z "${api_key}" ]]; then
  if [[ -t 0 ]]; then
    read -r -s -p "New API API key: " api_key
    echo >&2
  else
    echo "MOVSCRIPT_NEW_API_API_KEY is required when stdin is not a TTY." >&2
    exit 2
  fi
fi

if [[ -z "${api_key}" ]]; then
  echo "New API API key cannot be empty." >&2
  exit 2
fi

model_env_keys=(
  MOVSCRIPT_NEW_API_CHAT_MODEL
  MOVSCRIPT_NEW_API_RESPONSES_MODEL
  MOVSCRIPT_NEW_API_IMAGE_MODEL
  MOVSCRIPT_NEW_API_IMAGE_EDIT_MODEL
  MOVSCRIPT_NEW_API_TTS_MODEL
  MOVSCRIPT_NEW_API_STT_MODEL
  MOVSCRIPT_NEW_API_TRANSLATION_MODEL
  MOVSCRIPT_NEW_API_SPEECH_TO_SPEECH_MODEL
  MOVSCRIPT_NEW_API_VIDEO_MODEL
  MOVSCRIPT_NEW_API_EMBEDDING_MODEL
  MOVSCRIPT_NEW_API_RERANK_MODEL
  MOVSCRIPT_NEW_API_MODERATION_MODEL
  MOVSCRIPT_NEW_API_REALTIME_MODEL
)

has_model_env=0
for key in "${model_env_keys[@]}"; do
  if [[ -n "${!key:-}" ]]; then
    has_model_env=1
    break
  fi
done

models_only="${MOVSCRIPT_NEW_API_MODELS_ONLY:-}"
if [[ "${has_model_env}" == "0" && -z "${models_only}" ]]; then
  models_only=1
  echo "No MOVSCRIPT_NEW_API_*_MODEL env var is set; running models-only smoke." >&2
fi

(
  cd "${ROOT_DIR}/services/data-service"
  MOVSCRIPT_NEW_API_REAL_SMOKE=1 \
    MOVSCRIPT_NEW_API_BASE_URL="${base_url}" \
    MOVSCRIPT_NEW_API_API_KEY="${api_key}" \
    MOVSCRIPT_NEW_API_MODELS_ONLY="${models_only}" \
    go test ./internal/infra/ai -run TestNewAPIRealSmokeFromEnvironment -count=1 -v
)
