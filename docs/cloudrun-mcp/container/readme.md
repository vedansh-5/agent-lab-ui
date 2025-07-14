You are so far off the main branch now, it's almost unbelievable. 

## Step 1.
```bash
export PROJECT_ID=$(gcloud config get-value project)

# Create a repo
gcloud artifacts repositories create my-repo \
  --repository-format=docker \
  --location=us-central1

# Authenticate Docker with Google
gcloud auth configure-docker us-central1-docker.pkg.dev

# Build
docker build -t us-central1-docker.pkg.dev/$PROJECT_ID/my-repo/mcp-gateway-pinecone-test .

# Push
docker push us-central1-docker.pkg.dev/$PROJECT_ID/my-repo/mcp-gateway-pinecone-test
```

I don't know how this worked, but it did (for errors pushing containers).
https://github.com/vivekreddy0808/gcp-container-to-artifact-registry

```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com
```

```bash
gcloud run deploy pinecone-mcp \
  --image us-central1-docker.pkg.dev/$PROJECT_ID/my-repo/mcp-gateway-pinecone-test:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

docker push us-central1-docker.pkg.dev/$PROJECT_ID/my-repo/mcp-gateway-pinecone-test

