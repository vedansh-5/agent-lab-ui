import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";

import firebaseCredentials from './firebaseConfig.json';

const app = initializeApp(firebaseCredentials);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
const db = getFirestore(app);
const functions = getFunctions(app, "us-central1"); // Specify region if not default

// Helper to create callable functions
const createCallable = (functionName) => httpsCallable(functions, functionName);

export { auth, googleProvider, db, functions, createCallable };