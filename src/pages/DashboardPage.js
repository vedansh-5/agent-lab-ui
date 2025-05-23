import React, { useState, useEffect } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom'; // Added useNavigate
import { useAuth } from '../contexts/AuthContext';
import { getUserAgents, deleteAgentFromFirestore } from '../services/firebaseService';
import { deleteAgentDeployment } from '../services/agentService'; // Import deleteAgentDeployment
import AgentList from '../components/agents/AgentList';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';

import PlatformSelectionDialog from '../components/agents/PlatformSelectionDialog'; // New import
import { PLATFORM_IDS } from '../constants/platformConstants'; // New import

import { Box, Typography, Button, Container, Fab, Paper, CircularProgress } from '@mui/material'; // Added CircularProgress
import AddIcon from '@mui/icons-material/Add';

const DashboardPage = () => {
    const { currentUser } = useAuth();
    const navigate = useNavigate(); // New
    const [agents, setAgents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deletingAgentId, setDeletingAgentId] = useState(null); // To show spinner on specific item or general
    const [error, setError] = useState(null);
    const [isPlatformDialogOpen, setIsPlatformDialogOpen] = useState(false); // New state

    useEffect(() => {
        if (currentUser) {
            const fetchAgents = async () => {
                try {
                    setLoading(true);
                    setError(null);
                    const userAgents = await getUserAgents(currentUser.uid);
                    setAgents(userAgents);
                } catch (err) {
                    console.error("Error fetching agents:", err);
                    setError("Failed to load your agents. Please try again.");
                } finally {
                    setLoading(false);
                }
            };
            fetchAgents();
        }
    }, [currentUser]);

    const handleDeleteAgentConfig = async (agentToDelete) => {
        if (!agentToDelete || !agentToDelete.id) return;

        if (window.confirm(`Are you sure you want to delete the agent configuration "${agentToDelete.name}"? This will also attempt to remove any associated (non-active/error) Vertex AI deployment if present. This action cannot be undone.`)) {
            setDeletingAgentId(agentToDelete.id);
            setError(null);
            try {
                // Attempt to delete Vertex AI deployment if it exists and is not in an active/healthy state
                if (agentToDelete.vertexAiResourceName &&
                    !['deployed', 'deploying_initiated', 'deploying_in_progress'].includes(agentToDelete.deploymentStatus)) {
                    try {
                        console.log(`Attempting to delete Vertex AI deployment ${agentToDelete.vertexAiResourceName} for agent ${agentToDelete.id}`);
                        await deleteAgentDeployment(agentToDelete.vertexAiResourceName, agentToDelete.id);
                        // console.log(`Vertex AI deployment ${agentToDelete.vertexAiResourceName} deletion initiated or confirmed.`);
                    } catch (vertexDeleteError) {
                        console.warn(`Could not delete Vertex AI deployment ${agentToDelete.vertexAiResourceName}:`, vertexDeleteError);
                        // Optionally, inform the user with a non-blocking message, e.g., using a Snackbar
                        // For now, we'll just log it and proceed with Firestore deletion.
                        // setError(`Note: Could not clean up Vertex AI deployment for ${agentToDelete.name}. Please check manually. Error: ${vertexDeleteError.message}`);
                    }
                }

                // Delete from Firestore
                await deleteAgentFromFirestore(agentToDelete.id);

                // Update local state
                setAgents(prevAgents => prevAgents.filter(agent => agent.id !== agentToDelete.id));
                // Optionally, show a success message (e.g., Snackbar)
                // alert(`Agent "${agentToDelete.name}" configuration deleted successfully.`);

            } catch (err) {
                console.error("Error deleting agent config:", err);
                setError(`Failed to delete agent configuration "${agentToDelete.name}": ${err.message}`);
            } finally {
                setDeletingAgentId(null);
            }
        }
    };

    const handleOpenPlatformDialog = () => { // New handler
        setIsPlatformDialogOpen(true);
    };

    const handleClosePlatformDialog = () => { // New handler
        setIsPlatformDialogOpen(false);
    };

    const handlePlatformSelected = (platform) => { // New handler
        setIsPlatformDialogOpen(false);
        if (platform.id === PLATFORM_IDS.GOOGLE_VERTEX) {
            // Pass platform information to CreateAgentPage via state
            navigate('/create-agent', { state: { platformId: platform.id } });
        } else if (!platform.isConstructed) {
            navigate(`/platform-under-construction/${platform.id}`);
        } else {
            // Handle other constructed platforms if any in the future
            console.warn("Selected platform is marked constructed but no route defined:", platform.name);
        }
    };


    if (loading && agents.length === 0) return <Box display="flex" justifyContent="center" py={5}><LoadingSpinner /></Box>;
    // ErrorMessage is already MUI-styled

    return (
        <Container maxWidth="lg">
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
                <Typography variant="h4" component="h1" gutterBottom>
                    Your Agents
                </Typography>
                <Button
                    variant="contained"
                    color="primary"
                    onClick={handleOpenPlatformDialog} // Changed from RouterLink
                    startIcon={<AddIcon />}
                >
                    Create New Agent
                </Button>
            </Box>

            {error && <ErrorMessage message={error} />}
            {deletingAgentId && <Box sx={{display: 'flex', alignItems: 'center', justifyContent: 'center', my: 2}}><CircularProgress size={20} sx={{mr:1}} /> <Typography>Deleting agent...</Typography></Box>}


            {agents.length > 0 ? (
                <AgentList agents={agents} onDeleteAgentConfig={handleDeleteAgentConfig} />
            ) : (
                !error && !loading && ( // Only show this if no error, not loading, and no agents
                    <Paper elevation={0} sx={{ p:3, textAlign: 'center', backgroundColor: 'background.default' }}>
                        <Typography variant="h6" color="text.secondary" gutterBottom>
                            You haven't created any agents yet.
                        </Typography>
                        <Button
                            variant="outlined"
                            color="secondary"
                            component={RouterLink}
                            to="/create-agent"
                        >
                            Create one now!
                        </Button>
                    </Paper>
                )
            )}
            {/* Floating Action Button for smaller screens or alternative */}
            <Fab
                color="primary"
                aria-label="add agent"
                onClick={handleOpenPlatformDialog} // Changed from RouterLink
                sx={{
                    position: 'fixed',
                    bottom: (theme) => theme.spacing(3),
                    right: (theme) => theme.spacing(3),
                    display: { xs: 'flex', md: 'none' } // Show only on smaller screens
                }}
            >
                <AddIcon />
            </Fab>

            <PlatformSelectionDialog
                open={isPlatformDialogOpen}
                onClose={handleClosePlatformDialog}
                onSelectPlatform={handlePlatformSelected}
            />
        </Container>
    );
};

export default DashboardPage;  