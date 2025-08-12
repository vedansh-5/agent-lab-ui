![AgentLabUI Logo](./logo.png)

# AgentLabUI - An AI Alliance Project

**AgentLabUI** is a web-based interface designed to simplify the creation, management, and deployment of AI agents. Built with React and Firebase, it leverages the power of Google's Agent Development Kit (ADK) and supports integration with Gofannon tools, enabling developers and researchers to rapidly prototype and experiment with sophisticated AI agent architectures.

This project is an initiative aimed at fostering collaboration and advancing AI agent development within the **AI Alliance** community and beyond.

## Overview

AgentLabUI provides a user-friendly dashboard to:
*   Design various types of AI agents (standalone, sequential, parallel, loop-based).
*   Configure agent properties like model, instructions, and tools.
*   Integrate custom tools via the Gofannon tool manifest.
*   Deploy configured agents to Google Cloud Vertex AI with a few clicks.
*   Manage and monitor deployed agents.
*   Test and interact with deployed agents directly through the UI.

Our goal is to lower the barrier to entry for working with advanced agent frameworks and to provide a practical tool for building and testing complex AI systems.

## Key Features

*   **Visual Agent Configuration:** Intuitive forms for defining agent parameters, including child agents for composite structures (Sequential, Parallel, Loop).
*   **Tool Integration:**
    *   Support for **Gofannon** tools via a manifest file.
    *   Support for ADK built-in tools (e.g., Google Search, Vertex AI Search) and code execution.
*   **One-Click Vertex AI Deployment:** Streamlined deployment of ADK-compatible agents to Vertex AI Reasoning Engines.
*   **Deployment Management:** Track deployment status, view resource names, and delete deployments from Vertex AI.
*   **Interactive Agent Runner:** Chat interface to query and test your deployed agents.
*   **Run History:** Log and review past interactions with your agents.
*   **Firebase Backend:** Secure authentication, Firestore database for agent configurations, and Cloud Functions for Python for backend logic.
*   **Theming Support:** Customizable UI themes for different client or branding needs.

## Core Concepts & Workflow

AgentLabUI is structured around a clear hierarchy of **Projects**, **Models**, and **Agents**. Understanding this workflow is key to effectively using the application. The typical flow is to first create a container for your work (a Project), then define the LLMs you will use (Models), and finally build your intelligent actors (Agents).

#### 1. Create a Project

Everything in AgentLabUI starts with a **Project**. A project acts as a workspace or a container that groups together related models, agents, and conversations, ensuring that resources are organized and logically separated.

*   **To Create:** Navigate to the "Projects" section and click "Create New Project". You only need to provide a unique name and an optional description.

#### 2. Create a Model

Once you have a project, you can create **Models**. A model configuration defines the specific Large Language Model (LLM) you want to use, along with its parameters like temperature and system instructions.

*   **Association:** Each model must be associated with one or more projects, making it available for use only within those projects.
*   **Configuration:** You can define the LLM provider (e.g., OpenAI, Google Vertex AI), the base model, and behavior-guiding parameters like the temperature and system prompt.
*   **Public Models:** You have the option to make a model "Public," which makes it visible and usable by all users across the platform, regardless of project association.

#### 3. Create an Agent

**Agents** are the core actors in the system. They use a selected model and a set of tools to perform tasks.

*   **Prerequisites:** To create an agent, you must first select a **Project** to associate it with. This determines which **Models** are available for the agent to use. You must then select one of these available models.
*   **Configuration:** You can define the agent's name, description, and type (e.g., a single agent, or a composite agent like a sequence or loop).
*   **Tools:** You can equip your agent with a variety of tools, such as those from the integrated Gofannon library, custom tools from a Git repository, or tools from an MCP-compliant server.

#### 4. Interacting within a Project Chat

Projects are where the interaction happens. Inside a project, you can create multiple **Chats**.

*   **Chat Interface:** Each chat provides an interface for you to interact with your configured resources. You can send text messages, share images, or provide links to GitHub repositories as context for your tasks.
*   **Execution Flow:** The interaction is a two-step process:
    1.  **Send a Message:** First, you type and send your question or instruction into the chat.
    2.  **Select an Actor:** After the message is sent, you use a dropdown menu to select which available **Model** or **Agent** (from the current project) should process your message. The selected actor then runs and produces a response in the chat.
    3.  **Click the Reply:** The reply from the selected agent appears in the chat, allowing you to review, iterate, or continue the conversation as needed.

## Tech Stack

*   **Frontend:** React, Material-UI (MUI)
*   **Backend:** Firebase (Authentication, Firestore, Cloud Functions for Python, Hosting)
*   **AI Agent Framework:** Google Agent Development Kit (ADK)
*   **Tool Framework Integration:** Gofannon

## Getting Started

For detailed instructions on how to set up, configure, and run this project locally and deploy it to Firebase, please refer to our comprehensive **[Getting_Started.md](./Getting_Started.md)** guide.

This guide covers:
*   Prerequisites (Node.js, Python, Firebase CLI, etc.)
*   Firebase project setup.
*   Local project configuration.
*   Vertex AI setup for agent deployment.
*   Running the development server and deploying the application.

## Available Scripts (Frontend - Create React App)

In the project directory, you can run the following `npm` scripts for the frontend React application:

### `npm start`

Runs the app in the development mode.\  
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\  
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\  
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\  
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\  
Your app is ready to be deployed via Firebase Hosting (as configured in `firebase.json`).

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More (React & Create React App)

*   [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).
*   [React documentation](https://reactjs.org/).

## Future Enhancements (Roadmap Ideas)

*   More granular control over ADK deployment options (e.g., specific machine types, regions per deployment).
*   Enhanced tool configuration UI (e.g., for Vertex AI Search datastore IDs).
*   Agent sharing and collaboration features.
*   Version control for agent configurations.
*   Integration with more evaluation and testing frameworks.
*   Expanded monitoring and analytics for deployed agents.

## Contributing

We welcome contributions from the community! If you'd like to contribute, please:
1.  Fork the repository.
2.  Create a new branch for your feature or bug fix.
3.  Make your changes.
4.  Submit a pull request with a clear description of your changes.

Please refer to `CONTRIBUTING.md` (if available) for more detailed guidelines.

## License

This project is licensed under the [Apache License 2.0](./LICENSE). (Assuming Apache 2.0, please create a LICENSE file or specify otherwise).