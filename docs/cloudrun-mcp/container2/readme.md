

```bash
sudo docker build -t us-central1-docker.pkg.dev/$PROJECT_ID/my-repo/mcp-proxy .
```

```bash
sudo docker push us-central1-docker.pkg.dev/$PROJECT_ID/my-repo/mcp-proxy
```


```bash
gcloud run deploy mcp-proxy \
  --image us-central1-docker.pkg.dev/$PROJECT_ID/my-repo/mcp-proxy:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```
