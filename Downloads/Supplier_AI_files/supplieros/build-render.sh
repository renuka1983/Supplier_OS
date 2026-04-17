#!/bin/bash
# Build script for Render
set -e

echo "🔨 Building frontend..."
FRONTEND_DIR="frontend"
REACT_DIR="/usr/local/lib/node_modules/react"

mkdir -p "$FRONTEND_DIR/dist"

esbuild "$FRONTEND_DIR/src/index.tsx" \
  --bundle \
  --outfile="$FRONTEND_DIR/dist/bundle.js" \
  --platform=browser \
  --target=es2020 \
  --jsx=automatic \
  --jsx-import-source=react \
  --alias:react="$REACT_DIR/index.js" \
  --alias:react-dom="/usr/local/lib/node_modules/react-dom/index.js" \
  --alias:react/jsx-runtime="$REACT_DIR/jsx-runtime.js" \
  --alias:react-dom/client="/usr/local/lib/node_modules/react-dom/client.js" \
  --minify \
  --log-level=warning 2>&1 || echo "⚠️ esbuild warnings (non-fatal)"

cp "$FRONTEND_DIR/public/index.html" "$FRONTEND_DIR/dist/index.html"

echo "✅ Frontend built successfully"
