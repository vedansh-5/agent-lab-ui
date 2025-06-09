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
import AgentDetailsDisplay from '../components/agents/AgentDetailsDisplay';
import ChildAgentsDisplay from '../components/agents/ChildAgentsDisplay';
import DeploymentControls from '../components/agents/DeploymentControls';

import { Container, Typography, Box, Paper, Grid, Button, Divider, Chip } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { PLATFORM_IDS, getPlatformById } from '../constants/platformConstants';

const AgentPage = () => {
    const { agentId } = useParams();
    const { currentUser } = useAuth();

    const [agent, setAgent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isDeploying, setIsDeploying] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isCheckingStatus, setIsCheckingStatus] = useState(false);
    const [pollingIntervalId, setPollingIntervalId] = useState(null);
    const [activeHistoricalRun, setActiveHistoricalRun] = useState(null); // New state for historical run

    const agentIdRef = useRef(agentId);

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
            setLoading(true);
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
                platform: agentData.platform || PLATFORM_IDS.GOOGLE_VERTEX,
                childAgents: agentData.childAgents || [],
                maxLoops: agentData.maxLoops || (agentData.agentType === 'LoopAgent' ? 3 : undefined),
                // Ensure LiteLLM fields are present, even if undefined from old data
                litellm_model_string: agentData.litellm_model_string,
                litellm_api_base: agentData.litellm_api_base,
                litellm_api_key: agentData.litellm_api_key,
            });
            if (!isPoll) setError(null);

            const status = agentData.deploymentStatus;
            if (status === 'deploying_initiated' || status === 'deploying_in_progress') {
                if (!pollingIntervalId && !isPoll) {
                    const newIntervalId = setInterval(async () => {
                        if (document.visibilityState === 'visible') {
                            await checkAgentDeploymentStatus(agentIdRef.current);
                            await fetchAgentData(true);
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
    }, [fetchAgentData, stopPolling]);

    const handleManualStatusRefresh = async () => {
        if (!agent || !agent.id || isCheckingStatus || isDeploying || isDeleting) return;
        setIsCheckingStatus(true);
        try {
            await checkAgentDeploymentStatus(agent.id);
            await fetchAgentData();
        } catch (err) {
            setError(`Failed to refresh status: ${err.message}`);
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
            await deployAgent(agent, agent.id);
        } catch (err) {
            setError(err.message || "Failed to deploy agent. Check function logs.");
        } finally {
            setIsDeploying(false);
            await fetchAgentData();
        }
    };

    const handleDeleteDeployment = async () => {
        if (!agent || !agent.vertexAiResourceName) return;
        if (!window.confirm("Are you sure you want to delete this agent's deployment from Vertex AI?")) return;
        setIsDeleting(true);
        setError(null);
        stopPolling();
        try {
            await deleteAgentDeployment(agent.vertexAiResourceName, agent.id);
        } catch (err) {
            setError(err.message || "Failed to delete agent deployment.");
        } finally {
            setIsDeleting(false);
            await fetchAgentData();
        }
    };

    const handleSelectHistoricalRun = (runData) => {
        setActiveHistoricalRun(runData);
    };

    const handleSwitchToLiveChat = () => {
        setActiveHistoricalRun(null);
    };

    if (loading && !agent) return <Box display="flex" justifyContent="center" py={5}><LoadingSpinner /></Box>;
    if (error && !agent) return <Container><ErrorMessage message={error} /></Container>;
    if (!agent) return (
        <Container>
            <Typography variant="h5" textAlign="center" color="text.secondary" mt={5}>
                Agent data not available.
            </Typography>
        </Container>
    );

    const canRunAgentLive = agent.platform === PLATFORM_IDS.GOOGLE_VERTEX &&
        agent.deploymentStatus === 'deployed' &&
        agent.vertexAiResourceName &&
        currentUser;
    const platformInfo = agent.platform ? getPlatformById(agent.platform) : null;

    return (
        <Container maxWidth="lg" sx={{ py: 3 }}>
            {error && <ErrorMessage message={error} severity="error" sx={{ mb: 2 }} />}
            <Paper elevation={3} sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box>
                        <Typography variant="h4" component="h1" gutterBottom>
                            {agent.name}
                            <Chip label={agent.agentType} size="small" color="secondary" variant="outlined" sx={{ ml: 1, verticalAlign: 'middle' }} />
                            {platformInfo && (
                                <Chip label={platformInfo.name} size="small" variant="outlined" sx={{ ml: 1, verticalAlign: 'middle' }} />
                            )}
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
                    <Grid item xs={12}>
                        <AgentDetailsDisplay agent={agent} />
                    </Grid>
                </Grid>
                <ChildAgentsDisplay agent={agent} />
                {agent.platform === PLATFORM_IDS.GOOGLE_VERTEX && (
                    <>
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
                            isLoadingPage={loading}
                        />
                    </>
                )}
            </Paper>

            {(canRunAgentLive || activeHistoricalRun) && (
                <AgentRunner
                    agentResourceName={agent.vertexAiResourceName}
                    agentFirestoreId={agent.id}
                    adkUserId={currentUser.uid}
                    historicalRunData={activeHistoricalRun}
                    onSwitchToLiveChat={handleSwitchToLiveChat}
                    isLiveModeEnabled={canRunAgentLive} // To know if live chat is even an option
                />
            )}

            <RunHistory agentId={agent.id} onSelectRun={handleSelectHistoricalRun} />
        </Container>
    );
};

export default AgentPage;  