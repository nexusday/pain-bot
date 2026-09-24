#!/usr/bin/env bash
# Detecta e instala dependencias de sistema para Pain-Bot (Ubuntu/Ptero/Linux).
# No requiere root para yt-dlp (se baja a ./bin). ffmpeg sí puede necesitar apt.

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="$ROOT/bin"
YTDLP_LOCAL="$BIN_DIR/yt-dlp"
YTDLP_NPM="$ROOT/node_modules/youtube-dl-exec/bin/yt-dlp"
OK=0
WARN=0

mkdir -p "$BIN_DIR"

tiene() {
  command -v "$1" >/dev/null 2>&1
}

version_ok() {
  local bin="$1"
  [ -n "$bin" ] && [ -e "$bin" ] && "$bin" --version >/dev/null 2>&1
}

echo "[deps] comprobando dependencias en $(uname -s) ($(uname -m))..."

# --- ffmpeg ---
if tiene ffmpeg && ffmpeg -version >/dev/null 2>&1; then
  echo "[deps] ✓ ffmpeg"
else
  echo "[deps] ✗ ffmpeg no encontrado"
  if tiene apt-get && [ "$(id -u)" = "0" ]; then
    echo "[deps] instalando ffmpeg con apt..."
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq && apt-get install -y -qq ffmpeg && echo "[deps] ✓ ffmpeg instalado" || {
      echo "[deps] ! no se pudo instalar ffmpeg con apt"
      WARN=1
    }
  elif tiene apt-get; then
    echo "[deps] ! sin root: no se puede apt install ffmpeg"
    echo "[deps]   pide a tu host imagen Docker con ffmpeg, o: sudo apt install ffmpeg"
    WARN=1
  else
    echo "[deps] ! instala ffmpeg manualmente"
    WARN=1
  fi
fi

# --- yt-dlp ---
YTDLP=""
if tiene yt-dlp && version_ok "$(command -v yt-dlp)"; then
  YTDLP="$(command -v yt-dlp)"
elif version_ok "$YTDLP_LOCAL"; then
  YTDLP="$YTDLP_LOCAL"
elif version_ok "$YTDLP_NPM"; then
  YTDLP="$YTDLP_NPM"
fi

if [ -n "$YTDLP" ]; then
  echo "[deps] ✓ yt-dlp ($YTDLP)"
else
  echo "[deps] ✗ yt-dlp no encontrado — descargando binario oficial..."
  URL="https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp"
  TMP="$YTDLP_LOCAL.part"

  if tiene curl; then
    curl -fsSL --retry 3 -o "$TMP" "$URL" || {
      echo "[deps] ! falló descarga con curl"
      rm -f "$TMP"
      WARN=1
      TMP=""
    }
  elif tiene wget; then
    wget -q -O "$TMP" "$URL" || {
      echo "[deps] ! falló descarga con wget"
      rm -f "$TMP"
      WARN=1
      TMP=""
    }
  else
    echo "[deps] ! no hay curl ni wget para bajar yt-dlp"
    WARN=1
    TMP=""
  fi

  if [ -n "${TMP:-}" ] && [ -f "$TMP" ]; then
    mv -f "$TMP" "$YTDLP_LOCAL"
    chmod +x "$YTDLP_LOCAL"
    # Copia también donde youtube-dl-exec lo espera
    mkdir -p "$(dirname "$YTDLP_NPM")"
    cp -f "$YTDLP_LOCAL" "$YTDLP_NPM" 2>/dev/null || true
    chmod +x "$YTDLP_NPM" 2>/dev/null || true

    if version_ok "$YTDLP_LOCAL"; then
      echo "[deps] ✓ yt-dlp instalado en $YTDLP_LOCAL"
      YTDLP="$YTDLP_LOCAL"
    else
      echo "[deps] ! yt-dlp descargado pero no ejecuta (¿arquitectura?)"
      WARN=1
    fi
  fi
fi

# --- paquete npm youtube-dl-exec ---
if [ -d "$ROOT/node_modules/youtube-dl-exec" ]; then
  echo "[deps] ✓ npm youtube-dl-exec"
  # Si el bin del paquete falta, enlaza el local
  if [ -n "$YTDLP" ] && [ ! -e "$YTDLP_NPM" ]; then
    mkdir -p "$(dirname "$YTDLP_NPM")"
    cp -f "$YTDLP" "$YTDLP_NPM" 2>/dev/null || ln -sf "$YTDLP" "$YTDLP_NPM" 2>/dev/null || true
    chmod +x "$YTDLP_NPM" 2>/dev/null || true
  fi
else
  echo "[deps] ✗ falta youtube-dl-exec — npm install..."
  if tiene npm; then
    (cd "$ROOT" && npm install youtube-dl-exec --no-fund --no-audit) && echo "[deps] ✓ youtube-dl-exec" || {
      echo "[deps] ! npm install youtube-dl-exec falló"
      WARN=1
    }
  else
    echo "[deps] ! npm no disponible"
    WARN=1
  fi
fi

if [ "$WARN" -eq 0 ]; then
  echo "[deps] todo listo"
  exit 0
fi

echo "[deps] listo con advertencias (el bot arranca igual)"
exit 0
