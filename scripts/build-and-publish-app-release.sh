#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# build-and-publish-app-release.sh — Publica una release OTA a expo-ota-server
#
# Uso:
#   ./scripts/build-and-publish-app-release.sh [channel]
#
# Channels disponibles: development (default) | preview | production
#
# Variables de entorno requeridas (o en .env.local):
#   OTA_URL     URL base del servidor  (ej: http://192.168.1.177:3000)
#   UPLOAD_KEY  Clave secreta de subida configurada en el servidor
# ---------------------------------------------------------------------------

CHANNEL="${1:-development}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Cargar .env.local si existe
if [[ -f "$ROOT_DIR/.env.local" ]]; then
  # shellcheck disable=SC2046
  export $(grep -v '^#' "$ROOT_DIR/.env.local" | xargs)
fi

# --- Validaciones ---
if [[ -z "${OTA_URL:-}" ]]; then
  echo "ERROR: OTA_URL no definida. Añádela a .env.local o expórtala."
  exit 1
fi
if [[ -z "${UPLOAD_KEY:-}" ]]; then
  echo "ERROR: UPLOAD_KEY no definida. Añádela a .env.local o expórtala."
  exit 1
fi
if [[ "$CHANNEL" != "development" && "$CHANNEL" != "preview" && "$CHANNEL" != "production" ]]; then
  echo "ERROR: channel inválido '$CHANNEL'. Usa: development | preview | production"
  exit 1
fi

# --- Leer runtimeVersion desde app.json ---
RUNTIME_VERSION=$(jq -r '.expo.version' "$ROOT_DIR/app.json")

# --- Info de git ---
COMMIT_HASH=$(git -C "$ROOT_DIR" rev-parse HEAD)
COMMIT_MESSAGE=$(git -C "$ROOT_DIR" log -1 --pretty=%B | head -1)

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  OTA Publish"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Channel:         $CHANNEL"
echo "  Runtime version: $RUNTIME_VERSION"
echo "  Commit:          ${COMMIT_HASH:0:8} — $COMMIT_MESSAGE"
echo "  Servidor:        $OTA_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
read -r -p "¿Continuar? (s/N) " CONFIRM
if [[ "$CONFIRM" != "s" && "$CONFIRM" != "S" ]]; then
  echo "Cancelado."
  exit 0
fi

# --- Export ---
TIMESTAMP=$(date +"%Y%m%d%H%M%S")
OUTPUT_DIR="$ROOT_DIR/.ota-builds/$TIMESTAMP"

echo ""
echo "▶ Exportando bundle..."
bunx expo export --output-dir "$OUTPUT_DIR" --platform all

# --- Generar expoconfig.json ---
echo "▶ Generando expoconfig.json..."
jq '.expo' "$ROOT_DIR/app.json" > "$OUTPUT_DIR/expoconfig.json"

# --- Zip ---
ZIP_FILE="$ROOT_DIR/.ota-builds/$TIMESTAMP.zip"
echo "▶ Comprimiendo..."
(cd "$OUTPUT_DIR" && zip -rq "$ZIP_FILE" .)
rm -rf "$OUTPUT_DIR"

ZIP_SIZE=$(du -sh "$ZIP_FILE" | cut -f1)
echo "   → $ZIP_FILE ($ZIP_SIZE)"

# --- Upload ---
echo "▶ Subiendo a $OTA_URL/api/upload (channel: $CHANNEL)..."
HTTP_BODY_FILE=$(mktemp)
HTTP_CODE=$(curl -s -o "$HTTP_BODY_FILE" -w "%{http_code}" \
  -X POST "$OTA_URL/api/upload" \
  -F "file=@$ZIP_FILE" \
  -F "uploadKey=$UPLOAD_KEY" \
  -F "runtimeVersion=$RUNTIME_VERSION" \
  -F "commitHash=$COMMIT_HASH" \
  -F "commitMessage=$COMMIT_MESSAGE" \
  -F "channel=$CHANNEL"
)
HTTP_BODY=$(cat "$HTTP_BODY_FILE")
rm -f "$HTTP_BODY_FILE"

if [[ "$HTTP_CODE" == "200" ]]; then
  echo ""
  echo "✓ Release publicada correctamente"
  echo "  $HTTP_BODY"
  rm -f "$ZIP_FILE"
else
  echo ""
  echo "ERROR: El servidor respondió con HTTP $HTTP_CODE"
  echo "  $HTTP_BODY"
  echo "  El zip se mantiene en: $ZIP_FILE"
  exit 1
fi
