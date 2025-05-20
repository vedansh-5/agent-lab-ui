import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AgentForm from '../components/agents/AgentForm'; // Already MUI-fied
import { useAuth } from '../contexts/AuthContext';
import { createAgentInFirestore, getAgentDetails, updateAgentInFirestore } from '../services/firebaseService';
import LoadingSpinner from '../components/common/LoadingSpinner'; // Already MUI-fied
import ErrorMessage from '../components/common/ErrorMessage'; // Already MUI-fied

import { Container, Typography, Box } from '@mui/material'; // Added Alert
// import { useSnackbar } from 'notistack'; // For better notifications (optional, needs setup)

const CreateAgentPage = ({ isEditMode = false }) => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const { agentId } = useParams();

    const [initialAgentData, setInitialAgentData] = useState(null);
    const [loading, setLoading] = useState(isEditMode);
    const [error, setError] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false); // Separate state for form submission

    // const { enqueueSnackbar } = useSnackbar(); // Optional: for nicer notifications

    useEffect(() => {
        if (isEditMode && agentId && currentUser) { // Added currentUser check for early exit
            const fetchAgent = async () => {
                setLoading(true);
                setError(null);
                try {
                    const agent = await getAgentDetails(agentId);
                    if (agent.userId !== currentUser.uid) {
                        setError("You are not authorized to edit this agent.");
                        setInitialAgentData(null);
                        return;
                    }
                    setInitialAgentData(agent);
                } catch (err) {
                    console.error("Error fetching agent for edit:", err);
                    setError(`Failed to load agent details: ${err.message}`);
                } finally {
                    setLoading(false);
                }
            };
            fetchAgent();
        } else if (!isEditMode) {
            setLoading(false); // Not edit mode, no initial loading needed for data
        }
    }, [isEditMode, agentId, currentUser]);


    const handleSaveAgent = async (agentData) => {
        if (!currentUser) {
            setError("You must be logged in to save an agent.");
            // enqueueSnackbar("You must be logged in.", { variant: 'error' });
            return;
        }
        setIsSubmitting(true);
        setError(null);
        try {
            let newAgentId;
            if (isEditMode && agentId) {
                await updateAgentInFirestore(agentId, agentData);
                newAgentId = agentId;
                // enqueueSnackbar("Agent updated successfully!", { variant: 'success' });
                alert("Agent updated successfully!"); // Simple alert
            } else {
                newAgentId = await createAgentInFirestore(currentUser.uid, agentData);
                // enqueueSnackbar("Agent created successfully!", { variant: 'success' });
                alert("Agent created successfully!"); // Simple alert
            }
            navigate(`/agent/${newAgentId}`);
        } catch (err) {
            console.error("Error saving agent:", err);
            const errorMessage = `Failed to ${isEditMode ? 'update' : 'create'} agent. ${err.message || 'Please try again.'}`;
            setError(errorMessage);
            // enqueueSnackbar(errorMessage, { variant: 'error' });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) return <Box display="flex" justifyContent="center" py={5}><LoadingSpinner /></Box>;

    // If error and no data to show form for edit mode, display error prominently.
    if (error && (isEditMode && !initialAgentData)) return <Container><ErrorMessage message={error} /></Container>;

    // For edit mode, ensure initialAgentData is loaded before rendering form, unless there was an auth error
    if (isEditMode && !initialAgentData && !error) { // Still loading or not found, but not an explicit error yet
        return <Box display="flex" justifyContent="center" py={5}><Typography>Loading agent data or agent not found...</Typography></Box>;
    }

    return (
        <Container maxWidth="md">
            <Typography variant="h4" component="h1" gutterBottom sx={{ mb: 3 }}>
                {isEditMode ? 'Edit Agent' : 'Create New Agent'}
            </Typography>
            {error && !isSubmitting && <ErrorMessage message={error} sx={{ mb: 2 }} />} {/* Show general page errors if not submitting */}

            {/* Render form if not in edit mode OR if in edit mode and data is loaded */}
            {(!isEditMode || (isEditMode && initialAgentData)) && (
                <AgentForm
                    onSubmit={handleSaveAgent}
                    initialData={isEditMode ? initialAgentData : {}}
                    isSaving={isSubmitting}
                />
            )}
        </Container>
    );
};

export default CreateAgentPage;