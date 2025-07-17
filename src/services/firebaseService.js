// src/services/firebaseService.js  
import { db } from '../firebaseConfig';
import {
    collection,
    addDoc,
    getDocs,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    serverTimestamp,
    orderBy,
    onSnapshot // Import onSnapshot
} from 'firebase/firestore';

// Agents
export const createAgentInFirestore = async (userId, agentData, isImport = false) => {
    try {
        const dataToSave = {
            userId,
            ...agentData,
            isPublic: false, // Always private on creation/import
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            deploymentStatus: "not_deployed",
            vertexAiResourceName: null,
            lastDeployedAt: null,
            lastDeploymentAttemptAt: null,
            deploymentError: null,
        };
        // Remove fields that should not be in the agentData from import
        if (isImport) {
            delete dataToSave.id; // Firestore will generate
            delete dataToSave.userId; // Already set above
        }

        const docRef = await addDoc(collection(db, "agents"), {
            userId,
            ...agentData,
            isPublic: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            deploymentStatus: "not_deployed",
            vertexAiResourceName: null,
            lastDeployedAt: null,
            lastDeploymentAttemptAt: null,
            deploymentError: null,
        });
        return docRef.id;
    } catch (e) {
        console.error("Error adding agent to Firestore: ", e);
        throw e;
    }
};

export const getMyAgents = async (userId) => {
    const q = query(collection(db, "agents"), where("userId", "==", userId), orderBy("updatedAt", "desc"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const getPublicAgents = async (currentUserId) => {
    const q = query(
        collection(db, "agents"),
        where("isPublic", "==", true),
        orderBy("updatedAt", "desc")
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(agent => agent.userId !== currentUserId);
};


export const getAgentDetails = async (agentId) => {
    const docRef = doc(db, "agents", agentId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
    } else {
        throw new Error("Agent not found");
    }
};

export const updateAgentInFirestore = async (agentId, updatedData) => {
    const agentRef = doc(db, "agents", agentId);
    await updateDoc(agentRef, {
        ...updatedData,
        updatedAt: serverTimestamp()
    });
};

export const deleteAgentFromFirestore = async (agentId) => {
    await deleteDoc(doc(db, "agents", agentId));
};

// Agent Runs
export const getAgentRuns = async (agentId) => {
    const q = query(collection(db, "agents", agentId, "runs"), orderBy("timestamp", "desc"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// New function to listen to a specific agent run in real-time
export const listenToAgentRun = (agentId, runId, onUpdate) => {
    const runRef = doc(db, "agents", agentId, "runs", runId);
    const unsubscribe = onSnapshot(runRef, (docSnap) => {
        if (docSnap.exists()) {
            onUpdate({ id: docSnap.id, ...docSnap.data() });
        } else {
            console.warn(`Run document ${runId} does not exist or was deleted.`);
            onUpdate(null, new Error("Run document not found."));
        }
    }, (error) => {
        console.error(`Error listening to run document ${runId}:`, error);
        onUpdate(null, error);
    });

    return unsubscribe; // Return the unsubscribe function to the caller
};

// Gofannon Tool Manifest
export const getStoredGofannonManifest = async () => {
    const docRef = doc(db, "gofannonToolManifest", "latest");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return docSnap.data();
    }
    return null;
};


// --- User Profile and Permissions Functions ---
export const ensureUserProfile = async (authUser) => {
    if (!authUser) return null;
    const userRef = doc(db, "users", authUser.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
        await updateDoc(userRef, {
            lastLoginAt: serverTimestamp(),
            email: authUser.email,
            displayName: authUser.displayName || null,
            photoURL: authUser.photoURL || null,
        });
        return { uid: userSnap.id, ...userSnap.data() };
    } else {
        const newUserProfile = {
            uid: authUser.uid,
            email: authUser.email,
            displayName: authUser.displayName || null,
            photoURL: authUser.photoURL || null,
            createdAt: serverTimestamp(),
            lastLoginAt: serverTimestamp(),
        };
        await setDoc(userRef, newUserProfile);
        return newUserProfile;
    }
};

export const getUsersForAdminReview = async () => {
    const usersCol = collection(db, "users");
    const userSnapshot = await getDocs(usersCol);
    const allUsers = userSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return allUsers.filter(user => user.permissions === undefined);
};

export const updateUserPermissions = async (targetUserId, permissionsData) => {
    const userRef = doc(db, "users", targetUserId);
    try {
        await updateDoc(userRef, {
            permissions: permissionsData,
            permissionsLastUpdatedAt: serverTimestamp(),
        });
    } catch (error) {
        console.error(`Error updating permissions for user ${targetUserId}:`, error);
        throw error;
    }
};  