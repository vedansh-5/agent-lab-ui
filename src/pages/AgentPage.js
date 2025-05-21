// src/pages/AgentPage.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAgentDetails } from '../services/firebaseService';
import { deployAgent, deleteAgentDeployment, checkAgentDeploymentStatus } from '../services/agentService';

import AgentRunner from '../components/agents/AgentRunner';
import RunHistory from '../components/agents/RunHistory';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import AgentDetailsDisplay from '../components/agents/AgentDetailsDisplay'; // New
import ChildAgentsDisplay from '../components/agents/ChildAgentsDisplay';   // New
import DeploymentControls from '../components/agents/DeploymentControls'; // New

import { Container, Typography, Box, Paper, Grid, Button, Divider, Chip } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';

const AgentPage = () => {
    const { agentId } = useParams();
    const { currentUser } = useAuth();

    const [agent, setAgent] = useState(null);
    const [loading, setLoading] = useState(true); // For initial page load
    const [error, setError] = useState(null);
    const [isDeploying, setIsDeploying] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isCheckingStatus, setIsCheckingStatus] = useState(false); // For manual refresh spinner
    const [pollingIntervalId, setPollingIntervalId] = useState(null);
    const agentIdRef = useRef(agentId); // To use in interval callbacks without stale closure

    useEffect(() => {
        agentIdRef.current = agentId;
    }, [agentId]);

    const stopPolling = useCallback(() => {
        if (pollingIntervalId) {
            clearInterval(pollingIntervalId);
            setPollingIntervalId(null);
            console.log("Deployment status polling stopped for agent:", agentIdRef.current);
        }
    }, [pollingIntervalId]);

    const fetchAgentData = useCallback(async (isPoll = false) => {
        if (!currentUser || !agentIdRef.current) {
            if (!isPoll) setLoading(false);
            return;
        }
        if (!isPoll) {
            setLoading(true); // Only set loading for non-poll fetches
            setError(null);
        }

        try {
            const agentData = await getAgentDetails(agentIdRef.current);
            if (!agentData) {
                setError("Agent not found.");
                setAgent(null);
                stopPolling();
                if (!isPoll) setLoading(false);
                return;
            }
            if (agentData.userId !== currentUser.uid) {
                setError("You are not authorized to view this agent.");
                setAgent(null);
                stopPolling();
                if (!isPoll) setLoading(false);
                return;
            }
            setAgent({
                ...agentData,
                childAgents: agentData.childAgents || [],
                maxLoops: agentData.maxLoops || (agentData.agentType === 'LoopAgent' ? 3 : undefined)
            });
            if (!isPoll) setError(null); // Clear error only on full fetch, not poll

            const status = agentData.deploymentStatus;
            if (status === 'deploying_initiated' || status === 'deploying_in_progress') {
                if (!pollingIntervalId && !isPoll) { // Start polling only if not already polling AND it's not a poll itself
                    console.log(`Status is ${status}, starting polling for ${agentIdRef.current}`);
                    const newIntervalId = setInterval(async () => {
                        console.log(`Polling status for ${agentIdRef.current}...`);
                        try {
                            if (document.visibilityState === 'visible') {
                                await checkAgentDeploymentStatus(agentIdRef.current);
                                await fetchAgentData(true); // Re-fetch from FS (as a poll)
                            }
                        } catch (pollError) {
                            console.error("Error during polling status check:", pollError);
                        }
                    }, 30000);
                    setPollingIntervalId(newIntervalId);
                }
            } else {
                stopPolling();
            }

        } catch (err) {
            console.error("Error fetching agent details:", err);
            if (!isPoll) setError(`Failed to load agent details: ${err.message}`);
            setAgent(null);
            stopPolling();
        } finally {
            if (!isPoll) setLoading(false);
        }
    }, [currentUser, stopPolling, pollingIntervalId]);

    useEffect(() => {
        fetchAgentData();
        return () => stopPolling();
    }, [fetchAgentData, stopPolling]); // fetchAgentData has dependencies like pollingIntervalId

    const handleManualStatusRefresh = async () => {
        if (!agent || !agent.id || isCheckingStatus || isDeploying || isDeleting) return;
        setIsCheckingStatus(true);
        // setError(null); // Don't clear main page error for a simple refresh
        try {
            console.log(`Manually refreshing status for ${agent.id}`);
            await checkAgentDeploymentStatus(agent.id);
            await fetchAgentData();
        } catch (err) {
            console.error("Error manually refreshing status:", err);
            setError(`Failed to refresh status: ${err.message}`); // Update error if refresh fails
        } finally {
            setIsCheckingStatus(false);
        }
    };

    const handleDeploy = async () => {
        if (!agent) return;
        setIsDeploying(true);
        setError(null);
        stopPolling();

        try {
            const result = await deployAgent(agent, agent.id);
            if (result.success && result.resourceName) {
                // Success within timeout, UI will update via fetchAgentData
            } else if (result.wasTimeout) {
                // Timeout, UI will show 'deploying_initiated' and start polling
            } else {
                setError(result.message || "Deployment initiation failed.");
            }
        } catch (err) {
            console.error("Error deploying agent:", err);
            setError(err.message || "Failed to deploy agent. Check function logs.");
        } finally {
            setIsDeploying(false);
            await fetchAgentData(); // Re-fetch to get latest status and trigger polling
        }
    };

    const handleDeleteDeployment = async () => {
        if (!agent || !agent.vertexAiResourceName) return;
        if (!window.confirm("Are you sure you want to delete this agent's deployment from Vertex AI? This cannot be undone.")) return;
        setIsDeleting(true);
        setError(null);
        stopPolling();

        try {
            await deleteAgentDeployment(agent.vertexAiResourceName, agent.id);
            // alert("Agent deployment deletion initiated!"); // UI will update via fetchAgentData
        } catch (err) {
            console.error("Error deleting agent deployment:", err);
            setError(err.message || "Failed to delete agent deployment.");
        } finally {
            setIsDeleting(false);
            await fetchAgentData();
        }
    };

    if (loading && !agent) return <Box display="flex" justifyContent="center" py={5}><LoadingSpinner /></Box>;
    if (error && !agent) return <Container><ErrorMessage message={error} /></Container>; // Show error if agent couldn't load at all
    if (!agent) return (
        <Container>
            <Typography variant="h5" textAlign="center" color="text.secondary" mt={5}>
                Agent data not available.
            </Typography>
        </Container>
    );

    return (
        <Container maxWidth="lg" sx={{ py: 3 }}>
            {error && <ErrorMessage message={error} severity="error" sx={{ mb: 2 }} />} {/* Show non-critical errors here */}
            <Paper elevation={3} sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box>
                        <Typography variant="h4" component="h1" gutterBottom>
                            {agent.name} <Chip label={agent.agentType} size="small" color="secondary" variant="outlined" sx={{ ml: 1 }} />
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block">
                            ID: {agent.id}
                        </Typography>
                    </Box>
                    <Button variant="outlined" color="secondary" component={RouterLink} to={`/agent/${agent.id}/edit`} startIcon={<EditIcon />}>
                        Edit Config
                    </Button>
                </Box>
                <Divider sx={{ my: 2 }} />

                <Grid container spacing={3}>
                    <Grid item xs={12} md={6}>
                        <AgentDetailsDisplay agent={agent} />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        {/* Placeholder or specific content for the right column if AgentDetailsDisplay doesn't cover all */}
                        {/* For example, if tools were meant to be displayed separately for certain agent types */}
                        {(agent.agentType === 'Agent' || agent.agentType === 'LoopAgent') && agent.tools && agent.tools.length === 0 && (
                            <Typography variant="body2" color="text.secondary" sx={{mt:1.5}}>No tools configured.</Typography>
                        )}
                    </Grid>
                </Grid>

                <ChildAgentsDisplay agent={agent} />

                <Divider sx={{ my: 3 }} />
                <DeploymentControls
                    agent={agent}
                    isDeploying={isDeploying}
                    isDeleting={isDeleting}
                    isCheckingStatus={isCheckingStatus}
                    pollingIntervalId={pollingIntervalId}
                    onDeploy={handleDeploy}
                    onDeleteDeployment={handleDeleteDeployment}
                    onManualStatusRefresh={handleManualStatusRefresh}
                    isLoadingPage={loading} // Pass page loading state
                />
            </Paper>

            {agent.deploymentStatus === 'deployed' && agent.vertexAiResourceName && currentUser && (
                <AgentRunner agentResourceName={agent.vertexAiResourceName} agentFirestoreId={agent.id} adkUserId={currentUser.uid} />
            )}

            <RunHistory agentId={agent.id} />
        </Container>
    );
};

export default AgentPage;  