# Use the official Python 3.11 slim image as base
FROM python:3.11-slim

ARG PORT=8080
ENV PORT=${PORT}

# Install Node.js (which includes npx)
RUN apt-get update && \
    apt-get install -y curl && \
    apt-get install -y git && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir git+https://github.com/IBM/mcp-context-forge.git

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Verify installations
RUN python --version && node --version && npx --version

# Set working directory
WORKDIR /app

# Default command (update as needed)
CMD python3 -m mcpgateway.translate --stdio "npx -y @pinecone-database/mcp" --port $PORT --logLevel debug --host 0.0.0.0 --cors "*"
