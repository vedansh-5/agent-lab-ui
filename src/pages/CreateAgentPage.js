import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom'; // Added useLocation
import AgentForm from '../components/agents/AgentForm';
import { useAuth } from '../contexts/AuthContext';
import { createAgentInFirestore, getAgentDetails, updateAgentInFirestore } from '../services/firebaseService';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import { Container, Typography, Box } from '@mui/material';
import { PLATFORM_IDS, getPlatformById } from '../constants/platformConstants'; // For default platform and title

const CreateAgentPage = ({ isEditMode = false }) => {
    const navigate = useNavigate();
    const location = useLocation(); // New
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
                    setInitialAgentData({
                        ...agent,
                        platform: agent.platform || PLATFORM_IDS.GOOGLE_VERTEX, // Default if old agent
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
            const platformFromState = location.state?.platformId || PLATFORM_IDS.GOOGLE_VERTEX;
            if (platformFromState !== PLATFORM_IDS.GOOGLE_VERTEX) {
                // This case should not happen if routing is correct
                setError(`Cannot create agent for platform ID "${platformFromState}" via this form. Please select Google Vertex AI.`);
                setLoading(false);
                // Optionally navigate back or show a more permanent error
                // navigate('/dashboard');
                return;
            }
            setInitialAgentData({
                name: '',
                description: '',
                agentType: 'Agent',
                model: 'gemini-1.5-flash-001',
                instruction: '',
                tools: [],
                maxLoops: 3,
                childAgents: [],
                platform: platformFromState, // Set platform for new agent
            });
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isEditMode, agentId, currentUser, navigate]); // location removed to prevent re-trigger on unrelated state changes


    const handleSaveAgent = async (agentData) => { // agentData now includes childAgents, maxLoops
        if (!currentUser) {
            setError("You must be logged in to save an agent.");
            return;
        }
        setIsSubmitting(true);
        setError(null);
        try {
            let newAgentId;
            const finalAgentData = {
                ...agentData,
                platform: agentData.platform || (initialAgentData?.platform || PLATFORM_IDS.GOOGLE_VERTEX), // Ensure platform is set
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
                if (!finalAgentData.platform) {
                    setError("Platform information is missing. Cannot create agent.");
                    setIsSubmitting(false);
                    return;
                }
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
    if (error && (!initialAgentData || (isEditMode && !initialAgentData))) return <Container><ErrorMessage message={error} /></Container>;

    // Ensure initialAgentData is available before rendering AgentForm
    if (!initialAgentData) {
        // This case should ideally be covered by loading or error states
        return <Box display="flex" justifyContent="center" py={5}><Typography>Loading agent data or preparing form...</Typography></Box>;
    }

    const pageTitlePlatformName = initialAgentData?.platform
        ? (getPlatformById(initialAgentData.platform)?.name || 'Agent') // Use platform name from constants
        : 'Agent'; // Fallback if platform somehow missing, though unlikely with new flow

    return (
        <Container maxWidth="md">
            <Typography variant="h4" component="h1" gutterBottom sx={{ mb: 3 }}>
                {isEditMode ?
                    `Edit ${pageTitlePlatformName} Agent` :
                    `Create New ${pageTitlePlatformName} Agent`
                }
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