import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";

const firebaseConfig = {
    apiKey: "AIzaSyD4adujxJs1-uWL06t-pdhtWq4yL7Y2XPY",
    authDomain: "agent-web-ui.firebaseapp.com",
    projectId: "agent-web-ui",
    storageBucket: "agent-web-ui.firebasestorage.app",
    messagingSenderId: "292555495497",
    appId: "1:292555495497:web:7f00d82dcc8da880b50798"

};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
const db = getFirestore(app);
const functions = getFunctions(app, "us-central1"); // Specify region if not default

// Helper to create callable functions
const createCallable = (functionName) => httpsCallable(functions, functionName);

export { auth, googleProvider, db, functions, createCallable };