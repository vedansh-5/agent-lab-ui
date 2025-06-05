name:  Bug
description: File a bug/issue
title: "[BUG] <title>"
labels: ["Bug", "Needs Triage"]
assignees: []
projects: []
body:
- type: checkboxes
  attributes:
    label: Is there an existing issue for this?
    description: Please search to see if an issue already exists for the bug you encountered.
    options:
    - label: I have searched the existing issues
      required: true

- type: textarea
  attributes:
    label: Current Behavior
    description: A concise description of what you're experiencing.
    placeholder: A clear and concise description of what the bug is.
  validations:
    required: false

- type: textarea
  attributes:
    label: Expected Behavior
    description: A concise description of what you expected to happen.
    placeholder: A clear and concise description of what you expected to happen.
  validations:
    required: false

- type: textarea
  attributes:
    label: Steps To Reproduce
    description: Steps to reproduce the behavior.
    placeholder: |
      1. Go to '...'
      2. Click on '...'
      3. Scroll down to '...'
      4. See error
  validations:
    required: false

- type: textarea
  attributes:
    label: Environment
    description: |
      List relevant environment details here.
    value: |
      - OS: 
      - Browser:
      - AgentLabUI Version/Commit:
      - Firebase CLI Version:
      - Node Version:
      - Python Version:
    render: markdown
  validations:
    required: false

- type: textarea
  attributes:
    label: Anything else?
    description: |
      Add any other context, screenshots, logs, or references here.

      Tip: You can attach images or log files by clicking this area to highlight it and then dragging files in.
  validations:
    required: false
