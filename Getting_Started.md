# Getting Started with AgentLabUI

Welcome to AgentLabUI! This guide will walk you through setting up the project on a fresh OSX or Ubuntu system. We'll cover everything from installing necessary tools to deploying the application.

## Table of Contents

1.  [Prerequisites](#1-prerequisites)
    *   [Node.js and npm](#nodejs-and-npm)
    *   [Git](#git)
    *   [Python and pip](#python-and-pip)
    *   [Code Editor](#code-editor)
2.  [Firebase Project Setup](#2-firebase-project-setup)
    *   [Create a Firebase Project](#create-a-firebase-project)
    *   [Register a Web App & Get Config](#register-a-web-app--get-config)
    *   [Enable Authentication](#enable-authentication)
    *   [Enable Firestore](#enable-firestore)
    *   [Enable Firebase Functions](#enable-firebase-functions)
3.  [Local Project Setup](#3-local-project-setup)
    *   [Clone the Repository](#clone-the-repository)
    *   [Configure Firebase for the Frontend](#configure-firebase-for-the-frontend)
    *   [Install Frontend Dependencies](#install-frontend-dependencies)
    *   [Create Gofannon Manifest](#create-gofannon-manifest)
    *   [Install Firebase CLI](#install-firebase-cli)
    *   [Log in to Firebase CLI](#log-in-to-firebase-cli)
    *   [Initialize Firebase in Your Project](#initialize-firebase-in-your-project)
4.  [Vertex AI Configuration (for Agent Deployment)](#4-vertex-ai-configuration-for-agent-deployment)
5.  [Running and Deploying the Application](#5-running-and-deploying-the-application)
    *   [Run the Frontend (React App)](#run-the-frontend-react-app)
    *   [Deploy Firebase Components](#deploy-firebase-components)
6.  [First Use](#6-first-use)
7.  [Troubleshooting (Common Issues)](#7-troubleshooting-common-issues)

---  

## 1. Prerequisites

Before you begin, you'll need to install a few tools.

### Node.js and npm

Node.js is a JavaScript runtime, and npm is its package manager.
*   **Recommendation:** Use Node Version Manager (nvm) to install Node.js and npm. This allows you to manage multiple Node.js versions easily.
    *   Open your terminal and run:
        ```bash  
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash  
        ```  
    *   Close and reopen your terminal, or source your shell profile (e.g., `source ~/.bashrc`, `source ~/.zshrc`).
    *   Install the latest LTS (Long Term Support) version of Node.js:
        ```bash  
        nvm install --lts  
        nvm use --lts  
        ```  
    *   Verify installation:
        ```bash  
        node -v  
        npm -v  
        ```  
*   **Alternative (Direct Install):** Download from [Node.js official website](https://nodejs.org/).

### Git

Git is a version control system used to download (clone) the project.
*   **OSX:** Git often comes pre-installed. If not, installing Xcode Command Line Tools will include it:
    ```bash  
    xcode-select --install  
    ```  
*   **Ubuntu:**
    ```bash  
    sudo apt update  
    sudo apt install git  
    ```  
*   Verify installation:
    ```bash  
    git --version  
    ```  

### Python and pip

Firebase Functions in this project are written in Python.
*   **OSX:** Python 3 usually comes pre-installed. Check with `python3 --version`. If you need to install or manage versions, consider [pyenv](https://github.com/pyenv/pyenv).
*   **Ubuntu:**
    ```bash  
    sudo apt update  
    sudo apt install python3 python3-pip python3-venv  
    ```  
*   Verify installation:
    ```bash  
    python3 --version  
    pip3 --version  
    ```  
    This project's functions use Python 3. Ensure your system's `python3` points to a compatible version (e.g., 3.9+).

### Code Editor

A good code editor will make development easier. We recommend Visual Studio Code (VS Code).
*   Download from [VS Code official website](https://code.visualstudio.com/).

---  

## 2. Firebase Project Setup

This project uses Firebase for authentication, database, backend functions, and hosting.

### Create a Firebase Project

1.  Go to the [Firebase Console](https://console.firebase.google.com/).
2.  Click on "**Add project**".
3.  Enter a name for your project (e.g., `my-agentlab-ui`).
4.  Accept the Firebase terms and click "**Continue**".
5.  You can choose to enable Google Analytics or not (it's optional for this project). Click "**Continue**" or "**Create project**".
6.  Wait for your project to be created.

### Register a Web App & Get Config

1.  Once your project is ready, click the "**Web**" icon ( `</>` ) to add a Firebase app to your project.
2.  Enter an "App nickname" (e.g., "AgentLabUI Web App").
3.  **Do NOT check** the box for "Also set up Firebase Hosting for this app" at this stage. We'll configure hosting later via the Firebase CLI.
4.  Click "**Register app**".
5.  Firebase will display an SDK setup snippet. Under "Add Firebase SDK", you'll see a `firebaseConfig` object. **Copy this entire object.** It will look like this:
    ```javascript  
    const firebaseConfig = {  
      apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXX",  
      authDomain: "your-project-id.firebaseapp.com",  
      projectId: "your-project-id",  
      storageBucket: "your-project-id.appspot.com",  
      messagingSenderId: "123456789012",  
      appId: "1:123456789012:web:abcdef1234567890abcdef",  
      measurementId: "G-ABCDEFGHIJ" // Optional  
    };  
    ```  
    You will need these values for `src/firebaseConfig.json` in the next section.
6.  Click "**Continue to console**".

### Enable Authentication

1.  In your Firebase project console, go to "**Authentication**" (in the "Build" section of the left-hand menu).
2.  Click "**Get started**".
3.  Under the "**Sign-in method**" tab, click on "**Google**" from the list of providers.
4.  Enable Google Sign-in by toggling the switch.
5.  Select a "Project support email".
6.  Click "**Save**".

### Enable Firestore

1.  Go to "**Firestore Database**" (in the "Build" section).
2.  Click "**Create database**".
3.  Choose "**Start in production mode**" or "**Start in test mode**". For initial development, "test mode" is easier but less secure. You can change rules later.
    *   **Test mode rule (expires in 30 days):**
        ```  
        rules_version = '2';  
        service cloud.firestore {  
          match /databases/{database}/documents {  
            match /{document=**} {  
              allow read, write: if request.time < timestamp.date(YEAR, MONTH, DAY+30);  
            }  
          }  
        }  
        ```  
    *   **Production mode (secure - recommended starting point):** We'll deploy actual rules later. For now, you can use this minimal rule that allows authenticated users to read/write their own data (adjust as needed for the app's logic):
        ```  
        rules_version = '2';  
        service cloud.firestore {  
          match /databases/{database}/documents {  
            // Example: Agents can be read by anyone, written only by owner  
            match /agents/{agentId} {  
              allow read: if true; // Or if request.auth != null;  
              allow create, update, delete: if request.auth != null && request.auth.uid == resource.data.userId;  
            }  
            // Example: Gofannon manifest readable by authenticated users  
            match /gofannonToolManifest/{docId} {  
               allow read: if request.auth != null;  
               allow write: if false; // Only functions should write this  
            }  
            // Default deny all other paths  
            match /{document=**} {  
              allow read, write: if false;  
            }  
          }  
        }  
        ```  
        **For simplicity during initial setup, you might start with test mode and then deploy stricter rules.**
4.  Choose a "Cloud Firestore location" (e.g., `us-central1`). **This cannot be changed later.**
5.  Click "**Enable**".

### Enable Firebase Functions

1.  Go to "**Functions**" (in the "Build" section).
2.  If this is your first time using Functions, you might be prompted to upgrade your project to the "Blaze (pay as you go)" plan. Firebase Functions (beyond the free tier) require this. Click "**Upgrade project**" and follow the steps to set up a billing account if you haven't already.
3.  Once billing is set up, you should see the Functions dashboard. No further action is needed in the console for now.

---  

## 3. Local Project Setup

Now, let's get the project code onto your computer and configure it.

### Clone the Repository

1.  Open your terminal.
2.  Navigate to the directory where you want to store the project (e.g., `cd ~/Developer`).
3.  Clone the project repository (replace `https://github.com/your-username/your-agentlabui-repo.git` with the actual repository URL):
    ```bash  
    git clone https://github.com/your-username/your-agentlabui-repo.git agentlabui  
    cd agentlabui  
    ```  

### Configure Firebase for the Frontend

The frontend application needs your Firebase project's credentials.

1.  Inside the cloned project directory (`agentlabui`), navigate to the `src` folder:
    ```bash  
    cd src  
    ```  
2.  Create a new file named `firebaseConfig.json`.
3.  Open `src/firebaseConfig.json` in your code editor.
4.  Paste the `firebaseConfig` object you copied from the Firebase console earlier. It should look like this, but with **your actual values**:
    ```json  
    {  
        "apiKey": "YOUR_API_KEY",  
        "authDomain": "YOUR_PROJECT_ID.firebaseapp.com",  
        "projectId": "YOUR_PROJECT_ID",  
        "storageBucket": "YOUR_PROJECT_ID.appspot.com",  
        "messagingSenderId": "YOUR_MESSAGING_SENDER_ID",  
        "appId": "YOUR_APP_ID",  
        "measurementId": "YOUR_MEASUREMENT_ID"  
    }  
    ```  
5.  Save the `src/firebaseConfig.json` file. This file is listed in `.gitignore`, so your credentials won't be committed to Git.

### Install Frontend Dependencies

1.  Navigate back to the project's root directory:
    ```bash  
    cd ..  
    ```  
2.  Install the necessary Node.js packages for the React frontend:
    ```bash  
    npm install  
    ```  
    (If you prefer Yarn: `yarn install`)

### Create Gofannon Manifest

The backend functions expect a Gofannon tool manifest file.

1.  Navigate to the `functions` directory:
    ```bash  
    cd functions  
    ```  
2.  Create a file named `gofannon_manifest.json`.
3.  Open `functions/gofannon_manifest.json` and add the following basic structure. If you have Gofannon tools, you can add their configurations here.
    ```json  
    {  
      "tools": [  
        // {  
        //   "id": "my_custom_gofannon_tool",  
        //   "name": "My Custom Gofannon Tool",  
        //   "description": "A tool that does something cool.",  
        //   "module_path": "my_tools.custom_tool_module",  
        //   "class_name": "CustomTool"  
        // }  
      ]  
    }  
    ```  
4.  Save the file.

### Install Firebase CLI

The Firebase Command Line Interface (CLI) is used to manage and deploy your Firebase project.

1.  Install the Firebase CLI globally using npm:
    ```bash  
    npm install -g firebase-tools  
    ```  
2.  Verify installation:
    ```bash  
    firebase --version  
    ```  

### Log in to Firebase CLI

1.  Log in to Firebase using your Google account:
    ```bash  
    firebase login  
    ```  
    This will open a browser window for you to authenticate.

### Initialize Firebase in Your Project

If the cloned repository doesn't include a `.firebaserc` file or a `firebase.json` file tailored for general use, you'll need to initialize Firebase for your specific project.

1.  Navigate back to the project's root directory (`agentlabui`):
    ```bash  
    cd ..   
    ```  
    (If you are already in the root, skip this.)
2.  Run the Firebase initialization command:
    ```bash  
    firebase init  
    ```  
3.  You'll be asked "Which Firebase features do you want to set up for this directory?". Select the following using the spacebar, then press Enter:
    *   `Firestore: Configure security rules and indexes files for Firestore.`
    *   `Functions: Configure a Cloud Functions directory and optionally emulators.`
    *   `Hosting: Configure and deploy Firebase Hosting sites.`
4.  **Project Setup:**
    *   Choose "**Use an existing project**" and select the Firebase project you created earlier.
5.  **Firestore Setup:**
    *   "What file should be used for Firestore Rules?": Press Enter for the default (`firestore.rules`).
    *   "What file should be used for Firestore indexes?": Press Enter for the default (`firestore.indexes.json`).  
        *(You'll need to create `firestore.rules` with your desired security rules, or copy them from the Firebase console if you set them there).*
6.  **Functions Setup:**
    *   "What language would you like to use to write Cloud Functions?": Choose **Python**.
    *   "Do you want to use ESLint...": If it asks this for Python (it might not), you can say No. (ESLint is for JavaScript).
    *   "File functions/requirements.txt already exists. Overwrite?": **No**.
    *   "File functions/.gitignore already exists. Overwrite?": **No**.
    *   "Would you like to install dependencies now with pip?": **Yes**.
7.  **Hosting Setup:**
    *   "What do you want to use as your public directory?": Type `build`. (This is where the React app's production files will be.)
    *   "Configure as a single-page app (rewrite all urls to /index.html)?": **Yes**.
    *   "Set up automatic builds and deploys with GitHub?": **No** (for now).
    *   "File build/index.html already exists. Overwrite?": This might appear if you've run `npm run build` before. If so, say **No** if you want to keep your current build, or Yes if you don't mind it being overwritten with a placeholder. It will be correctly built later.

This process creates `firebase.json` and `.firebaserc` files, configuring your local project to work with your Firebase project.
  
---  

## 4. Vertex AI Configuration (for Agent Deployment)

AgentLabUI allows you to deploy agents to Google Cloud's Vertex AI using the Agent Development Kit (ADK). This requires some Google Cloud setup.

1.  **Google Cloud Project:** Your Firebase project is also a Google Cloud Project. You can use this same project for Vertex AI.
2.  **Enable Vertex AI API:**
    *   Go to the [Google Cloud Console](https://console.cloud.google.com/).
    *   Select your project.
    *   In the navigation menu, go to "Vertex AI".
    *   If it's your first time, click "**Enable Vertex AI API**" (or similar prompts to enable the API).
3.  **IAM Permissions:** The Firebase Functions service account needs permissions to interact with Vertex AI and Cloud Storage.
    *   In the Google Cloud Console, go to "IAM & Admin" -> "IAM".
    *   Find the service account named `your-project-id@appspot.gserviceaccount.com`.
    *   Click the pencil icon (Edit principal) for this service account.
    *   Add the following roles:
        *   `Vertex AI User` (for deploying and managing Vertex AI resources)
        *   `Service Account User` (to allow the service account to act as itself, sometimes needed by ADK)
        *   `Storage Object Admin` (for the ADK staging bucket, which will be `gs://your-project-id-adk-staging`)
    *   Click "Save".
4.  **Staging Bucket:** The application will attempt to use a Cloud Storage bucket named `gs://<your-project-id>-adk-staging`. This bucket is typically created automatically on the first ADK deployment if it doesn't exist and the service account has `Storage Admin` or sufficient creation permissions on the project level. If not, you might need to create it manually via the Cloud Storage console.

---  

## 5. Running and Deploying the Application

### Run the Frontend (React App)

1.  Ensure you are in the project's root directory (`agentlabui`).
2.  Start the React development server:
    ```bash  
    npm start  
    ```  
    (If you prefer Yarn: `yarn start`)
3.  This will open the application in your web browser, usually at `http://localhost:3000`.

### Deploy Firebase Components

To make your application and backend functions accessible online, you need to deploy them to Firebase.

1.  **Build the React App for Production:**  
    Before deploying hosting, create an optimized build of your React app:
    ```bash  
    npm run build  
    ```  
    This creates a `build` folder in your project root.

2.  **Deploy to Firebase:**  
    From the project root directory, deploy all configured Firebase features (Hosting, Functions, Firestore rules):
    ```bash  
    firebase deploy  
    ```  
    Or, to deploy specific parts:
    *   Deploy only functions: `firebase deploy --only functions`
    *   Deploy only hosting: `firebase deploy --only hosting`
    *   Deploy only Firestore rules: `firebase deploy --only firestore:rules` (Make sure `firestore.rules` exists and is correctly configured).

    After deployment, the Firebase CLI will output the URL for your hosted web application.

---  

## 6. First Use

1.  **Open the application:**
    *   Locally: `http://localhost:3000`
    *   After deployment: Use the Firebase Hosting URL provided by `firebase deploy`.
2.  **Log in:** Click the "Login with Google" button.
3.  You should be redirected to the dashboard, where you can start creating agents.

---  

## 7. Troubleshooting (Common Issues)

*   **Permission Errors (Firebase/GCP):**
    *   Ensure your Firebase project is on the Blaze plan for Functions.
    *   Double-check IAM permissions for the `your-project-id@appspot.gserviceaccount.com` service account in the GCP console, especially for Vertex AI and Cloud Storage access.
    *   Verify Firestore security rules.
*   **`firebaseConfig.json` not found:** Ensure you've created `src/firebaseConfig.json` correctly with your project's credentials.
*   **Function deployment errors:**
    *   Check the Firebase console Functions logs for detailed error messages.
    *   Ensure Python and pip are correctly installed and that `functions/requirements.txt` lists all necessary Python dependencies.
    *   The `functions/gofannon_manifest.json` file must exist.
*   **ADK deployment issues (`deploy_agent_to_vertex` function):**
    *   These can be complex. Check the Cloud Function logs in the Firebase console or Google Cloud Logging for detailed ADK or Vertex AI errors.
    *   Ensure the Vertex AI API is enabled and IAM permissions are correct.
    *   The ADK staging bucket (`gs://your-project-id-adk-staging`) must be accessible.
*   **CORS errors (less likely with Callable Functions):** Firebase Callable Functions handle CORS automatically. If you encounter them, it might be a misconfiguration or an issue with how requests are made.

---  

That's it! You should now have AgentLabUI up and running. Happy agent building!  