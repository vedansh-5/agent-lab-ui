# Deploying an MCP Server with Stdio Transport to Google Cloud Run

This guide shows you how to deploy an **MCP server** (such as [@pinecone-database/mcp](https://docs.pinecone.io/guides/operations/mcp-server)) to [Google Cloud Run](https://cloud.google.com/run/docs/deploying), using a gateway container that supports the **stdio transport** and exposes it as an HTTP streaming endpoint.

We will use [`supergateway`](https://github.com/supercorp-ai/supergateway?tab=readme-ov-file) — a lightweight container that can wrap any stdio-based server and serve it over HTTP, making it easy to integrate into Cloud Run or other container-based environments.

---

## Prerequisites

- A Google Cloud project with billing enabled.
- `gcloud` CLI installed and initialized (`gcloud init`).
- Docker Hub or Artifact Registry access to the image `supercorp/supergateway`.
- Your MCP server dependencies and API keys ready.

---

## About the MCP Server and Stdio Transport

The [MCP server](https://docs.pinecone.io/guides/operations/mcp-server) from Pinecone can run in various transport modes. In this example, we use:

- **Stdio transport**: The MCP server runs as a subprocess, communicating through standard input/output.
- **Streamable HTTP**: Exposes the MCP server via an HTTP-compatible streaming interface, so it can serve as an HTTP API on Cloud Run.

---

## Deployment Command

Below is an example command to deploy to Google Cloud Run:

```bash
gcloud run deploy maps-mcp-server \
--platform=managed \
--allow-unauthenticated \
--region=us-central1 \
--image docker.io/supercorp/supergateway \
--args="--stdio","npx -y @modelcontextprotocol/server-google-maps","--outputTransport","streamableHttp","--port","8080","--cors","--baseUrl","http://0.0.0.0:8080","--healthEndpoint","/healthz" \
--set-env-vars "GOOGLE_MAPS_API_KEY=AIzaSyCX7Ae3Csa1RBvGrJEzXl9r8LRg-CksuUY"
```

### Explanation

- **gcloud run deploy pinecone-mcp-server**: Deploys a new service called `pinecone-mcp-server`.
- **--platform=managed**: Uses fully managed Cloud Run.
- **--allow-unauthenticated**: Allows public HTTP access (modify as needed for security).
- **--region=us-central1**: Choose the region closest to your users.
- **--image docker.io/supercorp/supergateway**: Uses the [supergateway container image](https://github.com/supercorp-ai/supergateway).
- **--args**: Arguments passed to `supergateway`. Here, it starts an MCP subprocess via stdio and serves it using the `streamableHttp` transport on port `8080`.
- **--set-env-vars "PINECONE_API_KEY=<YOUR_API_KEY>"**: Sets your Pinecone API key in the environment, required by the MCP server.

---

## Configuration Details

### Stdio Command

The argument `"npx -y @pinecone-database/mcp"` launches the MCP server using npx. You can replace this with any other stdio-based executable as needed.

### HTTP and CORS

The flags:

- `--outputTransport streamableHttp`
- `--cors`
- `--baseUrl "http://0.0.0.0:8080"`

ensure the service listens on all interfaces (`0.0.0.0`) and is accessible as a standard HTTP server with Cross-Origin Resource Sharing enabled.

---

## After Deployment

Once deployed, Cloud Run will provide a service URL. You can use this URL to send requests to your MCP server directly.

You can check the health endpoint:

```bash
curl https://<YOUR_CLOUD_RUN_URL>/healthz
```
For reasons I don't fully understand, the above sometimes 404s. The MCP server is 
available at:

```bash
https://<YOUR_CLOUD_RUN_URL>/mcp
```

---

## Resources

- [Google Cloud Run Deployment Docs](https://cloud.google.com/run/docs/deploying)
- [Pinecone MCP Server Guide](https://docs.pinecone.io/guides/operations/mcp-server)
- [supergateway README](https://github.com/supercorp-ai/supergateway?tab=readme-ov-file)

---

## Summary

This setup provides a clean, serverless-friendly way to run an arbitrary stdio-based MCP server, fully managed and auto-scaled by Google Cloud Run. You can adapt this example to other stdio-based tools by changing the `--args` command as needed.

---

**Happy deploying! 🚀**
