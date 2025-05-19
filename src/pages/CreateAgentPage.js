import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AgentForm from '../components/agents/AgentForm';
import { useAuth } from '../contexts/AuthContext';
import { createAgentInFirestore, getAgentDetails, updateAgentInFirestore } from '../services/firebaseService';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';

const CreateAgentPage = ({ isEditMode = false }) => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const { agentId } = useParams(); // For edit mode

    const [initialAgentData, setInitialAgentData] = useState(null);
    const [loading, setLoading] = useState(isEditMode); // Only load if in edit mode
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isEditMode && agentId) {
            const fetchAgent = async () => {
                try {
                    setLoading(true);
                    setError(null);
                    const agent = await getAgentDetails(agentId);
                    if (agent.userId !== currentUser.uid) {
                        setError("You are not authorized to edit this agent.");
                        setInitialAgentData(null); // Prevent form rendering
                        return;
                    }
                    setInitialAgentData(agent);
                } catch (err) {
                    console.error("Error fetching agent for edit:", err);
                    setError("Failed to load agent details.");
                } finally {
                    setLoading(false);
                }
            };
            fetchAgent();
        }
    }, [isEditMode, agentId, currentUser]);


    const handleSaveAgent = async (agentData) => {
        if (!currentUser) {
            setError("You must be logged in to save an agent.");
            return;
        }
        try {
            setLoading(true);
            setError(null);
            let newAgentId;
            if (isEditMode && agentId) {
                await updateAgentInFirestore(agentId, agentData);
                newAgentId = agentId;
                alert("Agent updated successfully!");
            } else {
                newAgentId = await createAgentInFirestore(currentUser.uid, agentData);
                alert("Agent created successfully!");
            }
            navigate(`/agent/${newAgentId}`);
        } catch (err) {
            console.error("Error saving agent:", err);
            setError(`Failed to ${isEditMode ? 'update' : 'create'} agent. Please try again.`);
        } finally {
            setLoading(false);
        }
    };

    if (loading && isEditMode) return <LoadingSpinner />; // Only show loading spinner when fetching for edit
    if (error) return <ErrorMessage message={error} />;
    // If in edit mode and data couldn't be loaded (and no error explicitly set to stop rendering),
    // we might not want to render the form or show a specific message.
    if (isEditMode && !initialAgentData && !error) return <p>Loading agent data or agent not found...</p>;


    return (
        <div>
            <h1 className="text-3xl font-bold mb-6">{isEditMode ? 'Edit Agent' : 'Create New Agent'}</h1>
            { (isEditMode && initialAgentData) || !isEditMode ? (
                <AgentForm
                    onSubmit={handleSaveAgent}
                    initialData={isEditMode ? initialAgentData : {}}
                    isSaving={loading && !isEditMode} // isSaving is true if creating and loading
                />
            ) : null // Or some other placeholder/error message
            }
        </div>
    );
};

export default CreateAgentPage;