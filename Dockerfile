# Use Python 3.11 slim image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    curl \
    tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend/ ./backend/

# Copy entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Create required directories
RUN mkdir -p backend/uploads backend/instance backend/chroma_data

# Set working directory to backend so relative imports work
WORKDIR /app/backend

ENV PYTHONPATH=/app/backend

# Render provides PORT; default to 10000 (Render's default)
ENV PORT=10000
EXPOSE ${PORT}

# Health check — give extra start-period so startup_check has time to run
HEALTHCHECK --interval=30s --timeout=30s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Entrypoint: runs startup_check.py first, then hands off to CMD
# If startup_check.py fails (missing env vars), container exits with code 1
# and Render marks the deploy as failed — no crash loop.
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["gunicorn", "-w", "1", "-k", "uvicorn.workers.UvicornWorker", "main:app", \
     "--bind", "0.0.0.0:10000", "--timeout", "120"]
