# Smol Agent on Google Cloud Run with A2A

This sample demonstrates how to wrap an agent from the [smol-agent](https://github.com/smol-ai/developer) framework, serve it using the A2A protocol, and deploy it to Google Cloud Run. The agent is configured to use OpenAI's `gpt-4o` model.

The agent takes a natural language prompt describing a task, generates a plan and Python code to accomplish the task, executes the code, and returns the result.

**WARNING**: This agent executes LLM-generated code. This is inherently insecure and should **not** be used in a production environment without proper sandboxing and security measures. This sample is for demonstration purposes only.

## Architecture

$$$mermaid  
sequenceDiagram  
participant Client as A2A Client  
participant GCR as Google Cloud Run (A2A Server)  
participant Agent as Smol Agent  
participant LLM as OpenAI API (gpt-4o)

    Client->>GCR: Send task prompt (e.g., "write a python script to calculate fibonacci")  
    GCR->>Agent: Forward prompt to Smol Agent  
      
    Agent->>LLM: Generate plan from prompt  
    LLM-->>Agent: Return plan  
    GCR-->>Client: Stream Status: "Plan generated..."  
  
    Agent->>LLM: Generate code from plan  
    LLM-->>Agent: Return Python code  
    GCR-->>Client: Stream Status: "Code generated..."  
  
    Agent->>Agent: Execute generated code  
    GCR-->>Client: Stream Status: "Executing code..."  
  
    Agent-->>GCR: Return final result of execution  
    GCR-->>Client: Return final artifact  
$$$

## Prerequisites

-   Python 3.12+
-   [UV](https://docs.astral.sh/uv/)
-   An OpenAI API Key.
-   Google Cloud SDK (`gcloud`) installed and authenticated.
-   A Google Cloud project with billing enabled and the Cloud Run API enabled.

## Local Setup & Running

1.  **Navigate to the directory:**

    $$$bash  
    cd docs/cloudrun-a2a  
    $$$

2.  **Create an environment file (`.env`):**

    $$$bash  
    echo "OPENAI_API_KEY=your_openai_api_key_here" > .env  
    $$$

3.  **Set up the Python environment and install dependencies:**

    $$$bash  
    uv venv  
    source .venv/bin/activate  
    uv sync  
    $$$

4.  **Run the agent locally:**

    The server will start on `http://localhost:8080`.

    $$$bash  
    uv run .  
    $$$

5.  **Test with the A2A CLI Client:**

    In a separate terminal (with the venv activated):

    $$$bash  
    cd samples/python/hosts/cli  
    uv run . --agent http://localhost:8080  
    $$$  
    **Example prompt:** `write a python script that calculates the 10th fibonacci number and prints it`

## Deployment to Google Cloud Run

### 1. Create a Service Account

Create a dedicated service account for the Cloud Run service.

$$$sh  
gcloud iam service-accounts create smol-a2a-agent-sa \  
--description="Service account for the smol-agent A2A Cloud Run service" \  
--display-name="Smol A2A Agent SA"  
$$$

### 2. Store API Key in Secret Manager

Store your OpenAI API key securely in Google Cloud Secret Manager.

$$$sh
# Create the secret
gcloud secrets create openai-api-key --replication-policy="automatic"

# Add the secret value (replace YOUR_API_KEY)
printf "YOUR_API_KEY" | gcloud secrets versions add openai-api-key --data-file=-  
$$$

### 3. Grant Secret Access to the Service Account

Allow the service account to access the secret.

$$$sh  
gcloud secrets add-iam-policy-binding openai-api-key \  
--member="serviceAccount:smol-a2a-agent-sa@$(gcloud config get-value project).iam.gserviceaccount.com" \  
--role="roles/secretmanager.secretAccessor"  
$$$

### 4. Deploy to Cloud Run

Deploy the agent using the `--source=.` flag, which tells Cloud Run to build and deploy from the current directory using Google Cloud Buildpacks.

$$$sh  
gcloud run deploy smol-a2a-agent \  
--source=. \  
--region="us-central1" \  
--allow-unauthenticated \  
--service-account="smol-a2a-agent-sa@$(gcloud config get-value project).iam.gserviceaccount.com" \  
--set-secrets="OPENAI_API_KEY=openai-api-key:latest"  
$$$

-   `--source=.`: Deploys from the current directory. Cloud Run uses the `Procfile` to determine how to run the service.
-   `--allow-unauthenticated`: Makes the agent publicly accessible for this demo.
-   `--set-secrets`: Securely mounts the OpenAI API key secret as an environment variable.

After deployment, Cloud Run will provide a **Service URL**. You must update your service to use this URL for its public-facing Agent Card.

### 5. Update the Agent Card URL

Get the URL from the previous step and update the `APP_URL` environment variable for the running service.

$$$sh
# Replace {SERVICE_URL} with the URL from the deploy command
SERVICE_URL="{SERVICE_URL}"

gcloud run services update smol-a2a-agent \  
--region="us-central1" \  
--update-env-vars="APP_URL=${SERVICE_URL}"  
$$$

Your agent is now live and can be accessed via the A2A CLI client using its public URL.

## Disclaimer

Important: The sample code provided is for demonstration purposes and illustrates the mechanics of the Agent-to-Agent (A2A) protocol. When building production applications, it is critical to treat any agent operating outside of your direct control as a potentially untrusted entity.

All data received from an external agent—including but not limited to its AgentCard, messages, artifacts, and task statuses—should be handled as untrusted input. For example, a malicious agent could provide an AgentCard containing crafted data in its fields (e.g., description, name, skills.description). If this data is used without sanitization to construct prompts for a Large Language Model (LLM), it could expose your application to prompt injection attacks. Failure to properly validate and sanitize this data before use can introduce security vulnerabilities into your application.

Developers are responsible for implementing appropriate security measures, such as input validation and secure handling of credentials to protect their systems and users.  