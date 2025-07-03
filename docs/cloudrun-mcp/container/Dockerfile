# Start from Python base image (has pip)
FROM python:3.11-slim

# Install Node (needed to run MCP)
RUN apt-get update && apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install MCP Gateway (Python)
RUN pip install mcp-contextforge-gateway

# Create workdir
WORKDIR /app

# Expose the port used by MCP Gateway (default: 8080)
EXPOSE 8080

# Default command to start MCP Gateway, which will spawn MCP via stdio
# You can specify extra arguments to MCP here if needed
CMD ["python", "-m", "mcpgateway.translate", "--stdio","npx -y @pinecone-database/mcp", "--port", "8080"]
