# Dockerfile using mcp-proxy  
  
# We start with a base image that has Node.js and npm/npx  
FROM node:22-slim
  
# Install supergateway globally in the container
RUN npm i -g supergateway
  
# Set the working directory  
WORKDIR /app  
  
# Cloud Run provides the PORT environment variable.  
ENV PORT 8080  
EXPOSE 8080  
  
# This is the key part.  
# We tell the container to run mcp-proxy.  
# The --command flag tells mcp-proxy what stdio application to run for each request.  
# We wrap the command in `sh -c` to ensure environment variables and npx are found correctly.  

CMD ["npx", "-y", "supergateway", "--stdio", "\"npx -y npx @tokenizing/mcp-npx-fetch\"", "--port", "8080","--outputTransport", "streamableHttp", "--logLevel", "debug", "--cors"]