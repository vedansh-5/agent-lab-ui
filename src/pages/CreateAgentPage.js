import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AgentForm from '../components/agents/AgentForm';
import { useAuth } from '../contexts/AuthContext';
import { createAgentInFirestore, getAgentDetails, updateAgentInFirestore } from '../services/firebaseService';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import { Container, Typography, Box } from '@mui/material';

const CreateAgentPage = ({ isEditMode = false }) => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const { agentId } = useParams();

    const [initialAgentData, setInitialAgentData] = useState(null); // Will include childAgents, maxLoops etc.
    const [loading, setLoading] = useState(isEditMode);
    const [error, setError] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isEditMode && agentId && currentUser) {
            const fetchAgent = async () => {
                setLoading(true);
                setError(null);
                try {
                    const agent = await getAgentDetails(agentId);
                    if (agent.userId !== currentUser.uid) {
                        setError("You are not authorized to edit this agent.");
                        setInitialAgentData(null); // Clear any potentially stale data
                        return;
                    }
                    // Ensure childAgents is an array, even if undefined in Firestore
                    // Ensure maxLoops has a default if not present
                    setInitialAgentData({
                        ...agent,
                        childAgents: agent.childAgents || [],
                        maxLoops: agent.maxLoops || 3,
                    });
                } catch (err) {
                    console.error("Error fetching agent for edit:", err);
                    setError(`Failed to load agent details: ${err.message}`);
                } finally {
                    setLoading(false);
                }
            };
            fetchAgent();
        } else if (!isEditMode) {
            // For new agent, provide default empty/initial values expected by AgentForm
            setInitialAgentData({
                name: '',
                description: '',
                agentType: 'Agent',
                model: 'gemini-1.5-flash-001', // Default model from AgentForm constants
                instruction: '',
                tools: [],
                maxLoops: 3,
                childAgents: [],
            });
            setLoading(false);
        }
    }, [isEditMode, agentId, currentUser]);


    const handleSaveAgent = async (agentData) => { // agentData now includes childAgents, maxLoops
        if (!currentUser) {
            setError("You must be logged in to save an agent.");
            return;
        }
        setIsSubmitting(true);
        setError(null);
        try {
            let newAgentId;
            // Clean up client-side 'id' from childAgents before saving to Firestore,
            // as Firestore generates its own IDs for subcollections if we ever go that route.
            // For now, they are just part of the parent document.
            const finalAgentData = {
                ...agentData,
                childAgents: agentData.childAgents ? agentData.childAgents.map(ca => {
                    const { id, ...rest } = ca; // Remove client-side id
                    return rest;
                }) : []
            };


            if (isEditMode && agentId) {
                await updateAgentInFirestore(agentId, finalAgentData);
                newAgentId = agentId;
                alert("Agent updated successfully!");
            } else {
                newAgentId = await createAgentInFirestore(currentUser.uid, finalAgentData);
                alert("Agent created successfully!");
            }
            navigate(`/agent/${newAgentId}`);
        } catch (err) {
            console.error("Error saving agent:", err);
            const errorMessage = `Failed to ${isEditMode ? 'update' : 'create'} agent. ${err.message || 'Please try again.'}`;
            setError(errorMessage);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) return <Box display="flex" justifyContent="center" py={5}><LoadingSpinner /></Box>;
    if (error && (isEditMode && !initialAgentData)) return <Container><ErrorMessage message={error} /></Container>;
    if (isEditMode && !initialAgentData && !error) {
        return <Box display="flex" justifyContent="center" py={5}><Typography>Loading agent data...</Typography></Box>;
    }
    // Ensure initialAgentData is available before rendering AgentForm
    if (!initialAgentData) {
        // This case should ideally be covered by loading or error states
        return <Box display="flex" justifyContent="center" py={5}><Typography>Preparing form...</Typography></Box>;
    }

    return (
        <Container maxWidth="md">
            <Typography variant="h4" component="h1" gutterBottom sx={{ mb: 3 }}>
                {isEditMode ? 'Edit Agent' : 'Create New Agent'}
            </Typography>
            {error && !isSubmitting && <ErrorMessage message={error} sx={{ mb: 2 }} />}

            <AgentForm
                onSubmit={handleSaveAgent}
                initialData={initialAgentData}
                isSaving={isSubmitting}
            />
        </Container>
    );
};

export default CreateAgentPage;