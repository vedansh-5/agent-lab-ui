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
*   **Firebase Backend:** Secure authentication, Firestore database for agent configurations, and Cloud Functions for backend logic.
*   **Theming Support:** Customizable UI themes for different client or branding needs.

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