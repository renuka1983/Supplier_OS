#!/bin/bash
# SupplierOS — Frontend Build Script
# Run this after modifying any frontend source files.
# Usage: ./build.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

echo "🔨 Building SupplierOS React frontend..."

ESBUILD=$(find /home -name "esbuild" -path "*/tsx/*" 2>/dev/null | head -1)
if [ -z "$ESBUILD" ]; then
  ESBUILD=$(find /usr -name "esbuild" 2>/dev/null | head -1)
fi
if [ -z "$ESBUILD" ]; then
  echo "❌ esbuild not found. Install with: npm install -g tsx"
  exit 1
fi

REACT_DIR=$(find /home -path "*/node_modules/react" -type d 2>/dev/null | head -1)
if [ -z "$REACT_DIR" ]; then
  echo "❌ React not found. Install with: npm install -g react react-dom"
  exit 1
fi

mkdir -p "$FRONTEND_DIR/dist"

$ESBUILD "$FRONTEND_DIR/src/index.tsx" \
  --bundle \
  --outfile="$FRONTEND_DIR/dist/bundle.js" \
  --platform=browser \
  --target=es2020 \
  --jsx=automatic \
  --jsx-import-source=react \
  --alias:react="$REACT_DIR/index.js" \
  --alias:react-dom="$(dirname $REACT_DIR)/react-dom/index.js" \
  --alias:react/jsx-runtime="$REACT_DIR/jsx-runtime.js" \
  --alias:react-dom/client="$(dirname $REACT_DIR)/react-dom/client.js" \
  --minify \
  --log-level=warning

cp "$FRONTEND_DIR/public/index.html" "$FRONTEND_DIR/dist/index.html"

BUNDLE_SIZE=$(du -sh "$FRONTEND_DIR/dist/bundle.js" | cut -f1)
echo "✅ Bundle built: $BUNDLE_SIZE"
echo "   Output: $FRONTEND_DIR/dist/"
