name: 🛠️ Agent Configuration Issue
description: Report issues with agent setup, deployment, or configuration
title: "[AGENT] <short description>"
labels: ["agent-config"]
assignees: []
projects: []
body:
- type: checkboxes
  attributes:
    label: Agent Type
    description: Select the type of agent affected
    options:
    - label: LLM Agent (Reasoning)
    - label: Sequential Agent
    - label: Parallel Agent
    - label: Loop Agent

- type: input
  attributes:
    label: Model Provider
    placeholder: e.g., Google Gemini, Vertex AI
  validations:
    required: true

- type: input
  attributes:
    label: Tools Enabled
    placeholder: e.g., Gofannon, Code Execution
  validations:
    required: false

- type: input
  attributes:
    label: Deployment Status
    placeholder: e.g., Local, Vertex AI Deployed
  validations:
    required: false

- type: textarea
  attributes:
    label: Issue Description
    description: A clear description of the configuration issue.
  validations:
    required: true

- type: textarea
  attributes:
    label: Expected Configuration
    description: Describe what you expected to happen.
  validations:
    required: false

- type: textarea
  attributes:
    label: Current Behavior
    description: Describe what is actually happening.
  validations:
    required: false

- type: textarea
  attributes:
    label: Configuration JSON
    description: Paste your agent configuration (remove any sensitive data).
    placeholder: |
      ```json
      {
        "agent_type": "llm",
        "model": "vertex",
        "tools": ["gofannon"]
      }
      ```
    render: markdown
  validations:
    required: false

- type: textarea
  attributes:
    label: Additional Context
    description: |
      Provide any extra context, browser info, OS, screenshots, or version details.
      
      Examples:
        - Browser: Chrome 122
        - OS: Windows 11
        - AgentLabUI Version: v1.2.3
  validations:
    required: false
