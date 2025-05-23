import { db } from '../firebaseConfig';
import {
    collection,
    addDoc,
    getDocs,
    doc,
    getDoc,
    setDoc, // Changed from updateDoc for ensureUserProfile to allow creating with specific ID
    updateDoc,
    deleteDoc,
    query,
    where,
    serverTimestamp,
    orderBy
} from 'firebase/firestore';

// Agents (existing functions - no change for this part)
export const createAgentInFirestore = async (userId, agentData) => {
    // agentData: { name, description, agentType, model, instruction, tools: [{id, name, module_path, class_name}]}
    try {
        const docRef = await addDoc(collection(db, "agents"), {
            userId,
            ...agentData,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            deploymentStatus: "not_deployed"
        });
        return docRef.id;
    } catch (e) {
        console.error("Error adding agent to Firestore: ", e);
        throw e;
    }
};

export const getUserAgents = async (userId) => {
    const q = query(collection(db, "agents"), where("userId", "==", userId), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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

// Agent Runs (existing functions - no change for this part)
export const getAgentRuns = async (agentId) => {
    const q = query(collection(db, "agents", agentId, "runs"), orderBy("timestamp", "desc"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// Gofannon Tool Manifest (existing functions - no change for this part)
export const getStoredGofannonManifest = async () => {
    const docRef = doc(db, "gofannonToolManifest", "latest");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return docSnap.data();
    }
    return null;
};


// --- NEW User Profile and Permissions Functions ---

/**
 * Ensures a user profile document exists in Firestore.
 * If it doesn't, creates a basic one WITHOUT the 'permissions' field.
 * Returns the user profile data.
 */
export const ensureUserProfile = async (authUser) => {
    console.log('ensureUserProfile tripped')
    if (!authUser) return null;

    const userRef = doc(db, "users", authUser.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
        // User exists, update last login and return their data
        await updateDoc(userRef, {
            lastLoginAt: serverTimestamp(),
            // Optionally update email/displayName/photoURL if they changed in Auth
            email: authUser.email,
            displayName: authUser.displayName || null,
            photoURL: authUser.photoURL || null,
        });
        return { uid: userSnap.id, ...userSnap.data() };
    } else {
        // New user, create profile WITHOUT permissions field
        const newUserProfile = {
            uid: authUser.uid,
            email: authUser.email,
            displayName: authUser.displayName || null,
            photoURL: authUser.photoURL || null,
            createdAt: serverTimestamp(),
            lastLoginAt: serverTimestamp(),
            // 'permissions' field is intentionally omitted here
        };
        await setDoc(userRef, newUserProfile);
        return newUserProfile;
    }
};

/**
 * Fetches all users from the 'users' collection and filters
 * for those that do not have the 'permissions' field defined.
 */
export const getUsersForAdminReview = async () => {
    const usersCol = collection(db, "users");
    const userSnapshot = await getDocs(usersCol);
    const allUsers = userSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Filter for users where the 'permissions' field is not defined
    return allUsers.filter(user => user.permissions === undefined);
};

/**
 * Updates (or sets) the permissions field for a specific user.
 */
export const updateUserPermissions = async (targetUserId, permissionsData) => {
    const userRef = doc(db, "users", targetUserId);
    try {
        await updateDoc(userRef, {
            permissions: permissionsData,
            permissionsLastUpdatedAt: serverTimestamp(), // Track when permissions were last set/updated
        });
        console.log(`Permissions updated for user ${targetUserId}`);
    } catch (error) {
        console.error(`Error updating permissions for user ${targetUserId}:`, error);
        throw error;
    }
};