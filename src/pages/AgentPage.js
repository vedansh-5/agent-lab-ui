import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAgentDetails, updateAgentInFirestore } from '../services/firebaseService';
import { deployAgent, deleteAgentDeployment } from '../services/agentService';
import AgentRunner from '../components/agents/AgentRunner';
import RunHistory from '../components/agents/RunHistory';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';

const AgentPage = () => {
    const { agentId } = useParams();
    const { currentUser } = useAuth();
    // const navigate = useNavigate();

    const [agent, setAgent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isDeploying, setIsDeploying] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const fetchAgentData = useCallback(async () => {
        if (!currentUser) return;
        try {
            setLoading(true);
            setError(null);
            const agentData = await getAgentDetails(agentId);
            if (agentData.userId !== currentUser.uid) {
                setError("You are not authorized to view this agent.");
                setAgent(null);
                return;
            }
            setAgent(agentData);
        } catch (err) {
            console.error("Error fetching agent details:", err);
            setError("Failed to load agent details. It might have been deleted or an error occurred.");
            setAgent(null);
        } finally {
            setLoading(false);
        }
    }, [agentId, currentUser]);

    useEffect(() => {
        fetchAgentData();
    }, [fetchAgentData]);

    const handleDeploy = async () => {
        if (!agent) return;
        setIsDeploying(true);
        setError(null);
        try {
            // The agent object from Firestore is passed to the Cloud Function
            await deployAgent(agent, agent.id); // agent.id is the Firestore document ID
            alert("Agent deployment initiated! It may take a few minutes. Refresh to see status.");
            // Update local agent state or re-fetch
            await updateAgentInFirestore(agent.id, { deploymentStatus: 'deploying' });
            fetchAgentData(); // Re-fetch to get updated status
        } catch (err) {
            console.error("Error deploying agent:", err);
            setError(err.message || "Failed to deploy agent. Check console for details.");
            await updateAgentInFirestore(agent.id, { deploymentStatus: 'error', deploymentError: err.message });
            fetchAgentData();
        } finally {
            setIsDeploying(false);
        }
    };

    const handleDeleteDeployment = async () => {
        if (!agent || !agent.vertexAiResourceName) return;
        if (!window.confirm("Are you sure you want to delete this agent's deployment from Vertex AI? This cannot be undone.")) {
            return;
        }
        setIsDeleting(true);
        setError(null);
        try {
            await deleteAgentDeployment(agent.vertexAiResourceName, agent.id);
            alert("Agent deployment deletion initiated!");
            // Update local agent state or re-fetch
            await updateAgentInFirestore(agent.id, {
                deploymentStatus: 'not_deployed', // Or 'deleted'
                vertexAiResourceName: null, // Or use firestore.FieldValue.delete() in service
                deploymentError: null
            });
            fetchAgentData(); // Re-fetch
        } catch (err) {
            console.error("Error deleting agent deployment:", err);
            setError(err.message || "Failed to delete agent deployment. Check console.");
        } finally {
            setIsDeleting(false);
        }
    };


    if (loading) return <LoadingSpinner />;
    if (error) return <ErrorMessage message={error} />;
    if (!agent) return <p className="text-center text-gray-600">Agent not found or you don't have access.</p>;

    const isDeployed = agent.deploymentStatus === 'deployed' && agent.vertexAiResourceName;
    const isDeployingStatus = agent.deploymentStatus === 'deploying';
    const hasDeploymentError = agent.deploymentStatus === 'error';

    return (
        <div className="space-y-8">
            <div className="bg-white p-6 rounded-lg shadow">
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-3xl font-bold mb-1">{agent.name}</h1>
                        <p className="text-sm text-gray-500 mb-3">ID: {agent.id}</p>
                    </div>
                    <Link
                        to={`/agent/${agent.id}/edit`}
                        className="bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-2 px-3 rounded text-sm"
                    >
                        Edit Agent Config
                    </Link>
                </div>

                <p className="text-gray-700 mb-2"><span className="font-semibold">Description:</span> {agent.description || "N/A"}</p>
                <p className="text-gray-700 mb-2"><span className="font-semibold">Type:</span> {agent.agentType}</p>
                <p className="text-gray-700 mb-2"><span className="font-semibold">Model:</span> {agent.model}</p>
                <div className="mb-2">
                    <p className="font-semibold text-gray-700">Instruction:</p>
                    <pre className="bg-gray-100 p-3 rounded text-sm whitespace-pre-wrap">{agent.instruction || "N/A"}</pre>
                </div>
                <div className="mb-4">
                    <p className="font-semibold text-gray-700">Tools:</p>
                    {agent.tools && agent.tools.length > 0 ? (
                        <ul className="list-disc list-inside pl-4 text-sm">
                            {agent.tools.map(tool => <li key={tool.id}>{tool.name} ({tool.id})</li>)}
                        </ul>
                    ) : (
                        <p className="text-sm text-gray-500">No tools configured.</p>
                    )}
                </div>

                <div className="mt-4 pt-4 border-t">
                    <h2 className="text-xl font-semibold mb-2">Deployment Status</h2>
                    <p className="mb-1">
                        Status: <span className={`font-bold ${
                        agent.deploymentStatus === 'deployed' ? 'text-green-600' :
                            agent.deploymentStatus === 'deploying' ? 'text-yellow-600 animate-pulse' :
                                agent.deploymentStatus === 'error' ? 'text-red-600' :
                                    'text-gray-600'
                    }`}>
                    {agent.deploymentStatus ? agent.deploymentStatus.replace('_', ' ') : 'Not Deployed'}
                </span>
                    </p>
                    {agent.vertexAiResourceName && (
                        <p className="text-sm text-gray-600 mb-2">Resource Name: {agent.vertexAiResourceName}</p>
                    )}
                    {hasDeploymentError && agent.deploymentError && (
                        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-3 rounded mb-3 text-sm">
                            <p className="font-bold">Deployment Error:</p>
                            <p>{agent.deploymentError}</p>
                        </div>
                    )}

                    <div className="flex space-x-3">
                        {!isDeployed && !isDeployingStatus && (
                            <button
                                onClick={handleDeploy}
                                disabled={isDeploying}
                                className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
                            >
                                {isDeploying ? 'Deploying...' : (hasDeploymentError ? 'Retry Deployment' : 'Deploy to Vertex AI')}
                            </button>
                        )}
                        {isDeployed && (
                            <button
                                onClick={handleDeleteDeployment}
                                disabled={isDeleting}
                                className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
                            >
                                {isDeleting ? 'Deleting...' : 'Delete Vertex AI Deployment'}
                            </button>
                        )}
                        <button
                            onClick={fetchAgentData} // Simple refresh
                            className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded"
                        >
                            Refresh Status
                        </button>
                    </div>
                </div>
            </div>

            {isDeployed && agent.vertexAiResourceName && (
                <AgentRunner
                    agentResourceName={agent.vertexAiResourceName}
                    agentFirestoreId={agent.id}
                    adkUserId={currentUser.uid} // Or some other stable user ID for ADK sessions
                />
            )}
            {isDeployingStatus && (
                <div className="bg-yellow-100 text-yellow-700 p-4 rounded-lg shadow text-center">
                    <p className="font-semibold">Deployment in progress...</p>
                    <p className="text-sm">This can take several minutes. You can refresh the status or come back later.</p>
                    <LoadingSpinner />
                </div>
            )}


            <RunHistory agentId={agent.id} />
        </div>
    );
};

export default AgentPage;