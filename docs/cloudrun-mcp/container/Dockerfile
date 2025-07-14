# syntax=docker/dockerfile:1
FROM python:3.11-slim

# ————————————————————————————————————————————————————————————————
# 1) Which NPM package to invoke over npx?  (build-time)
# ————————————————————————————————————————————————————————————————
ARG MCP_PACKAGE="@tokenizin/mcp-npx-fetch"
ARG PORT=8080
ENV PORT=${PORT}
ENV PACKAGE_NAME=${MCP_PACKAGE}

# ————————————————————————————————————————————————————————————————
# 2) At runtime, this is your stdio bridge command
#    By default: npx -y @pinecone-database/mcp
# ————————————————————————————————————————————————————————————————
ENV STDIO_CMD="npx -y ${PACKAGE_NAME}"

# ————————————————————————————————————————————————————————————————
# 3) Install Node.js (which brings in npx) + Python gateway
# ————————————————————————————————————————————————————————————————

RUN apt-get update && apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir mcp-contextforge-gateway
RUN npm install -g ${MCP_PACKAGE}

WORKDIR /app

# Cloud Run will inject $PORT → expose for clarity
EXPOSE ${PORT}

# ————————————————————————————————————————————————————————————————
# 4) ENTRYPOINT + CMD
#    - `sh -c` so that "$STDIO_CMD" expands properly even with spaces/flags
#    - binds to $PORT automatically
# ————————————————————————————————————————————————————————————————
ENTRYPOINT ["sh", "-c"]
CMD ["exec python -m mcpgateway.translate --stdio \"$STDIO_CMD\" --port $PORT --logLevel debug"]