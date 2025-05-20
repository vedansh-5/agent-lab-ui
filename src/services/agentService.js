import { createCallable } from '../firebaseConfig';

const getGofannonToolManifestCallable = createCallable('get_gofannon_tool_manifest');
const deployAgentToVertexCallable = createCallable('deploy_agent_to_vertex');
const queryDeployedAgentCallable = createCallable('query_deployed_agent');
const deleteVertexAgentCallable = createCallable('delete_vertex_agent');


export const fetchGofannonTools = async () => {
    try {
        const result = await getGofannonToolManifestCallable();
        return result.data; // { success: true, manifest: {...} }
    } catch (error) {
        console.error("Error fetching Gofannon tools:", error);
        throw error;
    }
};

export const deployAgent = async (agentConfig, agentDocId) => {
    try {
        // agentConfig is the object matching Firestore structure for an agent
        const result = await deployAgentToVertexCallable({ agentConfig, agentDocId });
        return result.data; // { success: true, resourceName: "..." }
    } catch (error) {
        console.error("Error deploying agent:", error);
        throw error;
    }
};

export const queryAgent = async (resourceName, message, userId, sessionId, agentDocId) => {
    try {
        // The 'userId' parameter here actually holds the ADK User ID from the component.
        // The key in the payload to the Cloud Function must be 'adkUserId'.
        const result = await queryDeployedAgentCallable({
            resourceName,
            message,
            adkUserId: userId, // Corrected: key is 'adkUserId', value is from the 'userId' parameter
            sessionId,
            agentDocId
        });
        return result.data;
    } catch (error) {
        console.error("Error querying agent:", error);
        throw error;
    }
};

export const deleteAgentDeployment = async (resourceName, agentDocId) => {
    try {
        const result = await deleteVertexAgentCallable({ resourceName, agentDocId });
        return result.data; // { success: true, message: "..." }
    } catch (error) {
        console.error("Error deleting agent deployment:", error);
        throw error;
    }
};  