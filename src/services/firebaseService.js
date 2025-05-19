import { db } from '../firebaseConfig';
import { collection,
    addDoc,
    getDocs,
    doc,
    getDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    serverTimestamp,
    orderBy } from 'firebase/firestore';

// Agents
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
    // Consider also deleting associated runs and Vertex AI deployment if not handled elsewhere
    await deleteDoc(doc(db, "agents", agentId));
};


// Agent Runs (stored as subcollection under agent)
export const getAgentRuns = async (agentId) => {
    const q = query(collection(db, "agents", agentId, "runs"), orderBy("timestamp", "desc"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// Gofannon Tool Manifest (usually just reading the 'latest')
export const getStoredGofannonManifest = async () => {
    const docRef = doc(db, "gofannonToolManifest", "latest");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return docSnap.data();
    }
    return null; // Or fetch fresh if not found
};