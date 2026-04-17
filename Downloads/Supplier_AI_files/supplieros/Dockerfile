FROM python:3.12-slim

LABEL maintainer="SupplierOS"
LABEL description="SupplierOS Revenue Decisioning Platform"

WORKDIR /app

# Install Python dependencies
RUN pip install --no-cache-dir flask==3.1.3

# Copy backend
COPY backend/ ./backend/

# Copy pre-built frontend
COPY frontend/dist/ ./frontend/dist/

# Copy start script
COPY start_docker.sh ./start.sh
RUN chmod +x ./start.sh

# Set port from environment or default to 8000
ENV PORT=8000
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:${PORT}/api/health')" || exit 1

CMD ["sh", "-c", "cd backend && python3 app.py $PORT"]
