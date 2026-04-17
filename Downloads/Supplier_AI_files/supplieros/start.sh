#!/bin/bash
# SupplierOS — Start Script
# Usage: ./start.sh [port]
# Default port: 8000

set -e

PORT=${1:-8000}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║          SupplierOS — Revenue Decisioning PoC         ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ─── CHECK PYTHON ────────────────────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
  echo "❌ Python 3 is required. Install it and try again."
  exit 1
fi

# ─── CHECK FLASK ─────────────────────────────────────────────────────────────
python3 -c "import flask" 2>/dev/null || {
  echo "📦 Installing Flask..."
  pip3 install flask --break-system-packages -q
}

# ─── SEED DATABASE ───────────────────────────────────────────────────────────
DB_FILE="$BACKEND_DIR/supplieros.db"
if [ ! -f "$DB_FILE" ]; then
  echo "🌱 Seeding database with synthetic data..."
  cd "$BACKEND_DIR" && python3 seed.py
  echo ""
else
  echo "✅ Database found: $DB_FILE"
fi

# ─── BUILD FRONTEND (if bundle missing) ──────────────────────────────────────
BUNDLE="$FRONTEND_DIR/dist/bundle.js"
if [ ! -f "$BUNDLE" ]; then
  echo "🔨 Building React frontend..."
  ESBUILD=$(find /home -name "esbuild" -path "*/tsx/*" 2>/dev/null | head -1)
  if [ -z "$ESBUILD" ]; then
    ESBUILD=$(find /usr -name "esbuild" 2>/dev/null | head -1)
  fi
  if [ -n "$ESBUILD" ]; then
    mkdir -p "$FRONTEND_DIR/dist"
    $ESBUILD "$FRONTEND_DIR/src/index.tsx" \
      --bundle \
      --outfile="$BUNDLE" \
      --platform=browser \
      --target=es2020 \
      --jsx=automatic \
      --jsx-import-source=react \
      --alias:react=$(find /home -path "*/node_modules/react/index.js" 2>/dev/null | head -1) \
      --alias:react-dom=$(find /home -path "*/node_modules/react-dom/index.js" 2>/dev/null | head -1) \
      --alias:react/jsx-runtime=$(find /home -path "*/node_modules/react/jsx-runtime.js" 2>/dev/null | head -1) \
      --alias:react-dom/client=$(find /home -path "*/node_modules/react-dom/client.js" 2>/dev/null | head -1) \
      --minify \
      --log-level=warning 2>&1
    cp "$FRONTEND_DIR/public/index.html" "$FRONTEND_DIR/dist/index.html"
    echo "✅ Frontend built"
  else
    echo "⚠️  esbuild not found — using pre-built bundle if available"
  fi
else
  echo "✅ Frontend bundle ready"
fi

# ─── START SERVER ─────────────────────────────────────────────────────────────
echo ""
echo "🚀 Starting SupplierOS on http://localhost:$PORT"
echo "   API:      http://localhost:$PORT/api"
echo "   Health:   http://localhost:$PORT/api/health"
echo ""
echo "   Press Ctrl+C to stop"
echo ""

cd "$BACKEND_DIR"
python3 app.py $PORT
