
## Editing `Dockerfile`

Make sure to edit `pyproject.toml` to include correct option installs on gofannon.

## Deploy

```bash
gcloud run deploy pinecone-mcp-server --platform=managed \
  --allow-unauthenticated \
  --region=us-central1 --source .
```

## Setting API Keys

## Accessing the MCP Server

