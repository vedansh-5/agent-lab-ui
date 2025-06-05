name: 🔧 Tool Integration Issue
description: Report issues with Gofannon tools or custom tool integrations
title: "[TOOL] <short description>"
labels: ["tool-integration"]
assignees: []
projects: []
body:
- type: checkboxes
  attributes:
    label: Tool Type
    description: What kind of tool is affected?
    options:
    - label: Gofannon Tool
    - label: Custom Repository Tool
    - label: ADK Built-in Tool
    - label: Code Execution

- type: input
  attributes:
    label: Tool Name
    placeholder: e.g., gofannon-html-exporter
  validations:
    required: true

- type: input
  attributes:
    label: Repository URL
    placeholder: Optional - e.g., https://github.com/your-org/custom-tool
  validations:
    required: false

- type: input
  attributes:
    label: Tool Manifest Path
    placeholder: e.g., tools/my-tool/manifest.json
  validations:
    required: false

- type: textarea
  attributes:
    label: Integration Issue
    description: Describe what isn't working with the tool integration.
    placeholder: Include symptoms, relevant operations, or tool behavior.
  validations:
    required: true

- type: textarea
  attributes:
    label: Tool Configuration
    description: Paste your tool configuration (remove secrets).
    placeholder: |
      ```json
      {
        "name": "my-tool",
        "entry_point": "main.py"
      }
      ```
    render: markdown
  validations:
    required: false

- type: textarea
  attributes:
    label: Error Messages
    description: Paste any logs or stack traces.
    placeholder: |
      ```
      Traceback (most recent call last):
        File "main.py", line 10, in <module>
      ```
    render: markdown
  validations:
    required: false

- type: textarea
  attributes:
    label: Expected Behavior
    description: What did you expect the tool to do?
  validations:
    required: false

- type: textarea
  attributes:
    label: Additional Context
    description: Add any other context, screenshots, or related issues here.
  validations:
    required: false
