// src/pages/AgentPage.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link as RouterLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAgentDetails, updateAgentInFirestore, createAgentInFirestore } from '../services/firebaseService';
import { deployAgent, deleteAgentDeployment, checkAgentDeploymentStatus } from '../services/agentService';

import AgentRunner from '../components/agents/AgentRunner';
import RunHistory from '../components/agents/RunHistory';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import AgentDetailsDisplay from '../components/agents/AgentDetailsDisplay';
import ChildAgentsDisplay from '../components/agents/ChildAgentsDisplay';
import DeploymentControls from '../components/agents/DeploymentControls';

import {
    Container, Typography, Box, Paper, Grid, Button, Divider, Chip,
    FormControlLabel, Switch, Tooltip
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import FileCopyIcon from '@mui/icons-material/FileCopy'; // For Clone
import DownloadIcon from '@mui/icons-material/Download'; // For Export
import PublicIcon from '@mui/icons-material/Public';
import LockIcon from '@mui/icons-material/Lock';

import { PLATFORM_IDS, getPlatformById } from '../constants/platformConstants';

const AgentPage = () => {
    const { agentId } = useParams();
    const { currentUser } = useAuth();
    const navigate = useNavigate();

    const [agent, setAgent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isDeploying, setIsDeploying] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isCheckingStatus, setIsCheckingStatus] = useState(false);
    const [pollingIntervalId, setPollingIntervalId] = useState(null);
    const [activeHistoricalRun, setActiveHistoricalRun] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false); // For clone/share/export operations

    const agentIdRef = useRef(agentId);
    useEffect(() => { agentIdRef.current = agentId; }, [agentId]);


    const stopPolling = useCallback(() => {
        if (pollingIntervalId) {
            clearInterval(pollingIntervalId);
            setPollingIntervalId(null);
            // console.log("Deployment status polling stopped for agent:", agentIdRef.current);
        }
    }, [pollingIntervalId]);

    const fetchAgentData = useCallback(async (isPoll = false) => {
        if (!currentUser || !agentIdRef.current) {
            if (!isPoll) setLoading(false);
            return;
        }
        if (!isPoll) {
            setLoading(true);
            // setError(null); // Keep error from previous actions like clone/export unless it's a new full fetch
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

            setAgent({
                ...agentData,
                isPublic: agentData.isPublic || false,
                platform: agentData.platform || PLATFORM_IDS.GOOGLE_VERTEX,
                childAgents: agentData.childAgents || [],
                maxLoops: (agentData.agentType === 'LoopAgent')
                    ? ( (Number.isFinite(agentData.maxLoops) && agentData.maxLoops > 0) ? agentData.maxLoops : 3)
                    : null, // Set to null for non-LoopAgents or if undefined/invalid
                litellm_model_string: agentData.litellm_model_string,
                litellm_api_base: agentData.litellm_api_base,
                litellm_api_key: agentData.litellm_api_key,
            });

            if (!isPoll && !error) setError(null); // Clear fetch-specific error if no other error active

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
            stopPolling();
        } finally {
            if (!isPoll) setLoading(false);
        }
    }, [currentUser, stopPolling, pollingIntervalId, error]); // Added error to dependencies

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

    const handleSelectHistoricalRun = (runData) => setActiveHistoricalRun(runData);
    const handleSwitchToLiveChat = () => setActiveHistoricalRun(null);

    // --- New Feature Handlers ---
    const handleTogglePublic = async () => {
        if (!agent || !currentUser || (currentUser.uid !== agent.userId && !currentUser.permissions?.isAdmin)) {
            alert("You are not authorized to change this agent's publicity.");
            return;
        }
        setIsSubmitting(true);
        setError(null);
        try {
            const newIsPublicStatus = !agent.isPublic;
            await updateAgentInFirestore(agent.id, { isPublic: newIsPublicStatus });
            setAgent(prev => ({ ...prev, isPublic: newIsPublicStatus }));
            alert(`Agent is now ${newIsPublicStatus ? 'Public' : 'Private'}.`);
        } catch (err) {
            console.error("Error toggling agent publicity:", err);
            setError(`Failed to update agent publicity: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCloneAgent = async () => {
        if (!agent || !currentUser) return;
        setIsSubmitting(true);
        setError(null);
        try {
            const clonedAgentData = { ...agent }; // Start with a copy of the current agent state

            // Modify for clone
            clonedAgentData.name = `${agent.name}_Copy`;
            delete clonedAgentData.id; // Firestore will generate a new ID

            // Reset deployment and public status for the clone
            clonedAgentData.isPublic = false;
            clonedAgentData.deploymentStatus = "not_deployed";
            clonedAgentData.vertexAiResourceName = null;
            clonedAgentData.lastDeployedAt = null;
            clonedAgentData.lastDeploymentAttemptAt = null;
            clonedAgentData.deploymentError = null;

            // Explicitly handle maxLoops to avoid 'undefined'
            if (clonedAgentData.agentType === 'LoopAgent') {
                clonedAgentData.maxLoops = (Number.isFinite(clonedAgentData.maxLoops) && clonedAgentData.maxLoops > 0)
                    ? clonedAgentData.maxLoops
                    : 3; // Default to 3 if not set, invalid, or zero
            } else {
                clonedAgentData.maxLoops = null; // Set to null for non-LoopAgents
            }

            // Ensure API keys are nulled out for the clone
            clonedAgentData.litellm_api_key = null;
            if (clonedAgentData.childAgents && Array.isArray(clonedAgentData.childAgents)) {
                clonedAgentData.childAgents = clonedAgentData.childAgents.map(ca => ({
                    ...ca,
                    litellm_api_key: null // Null out API key for child agents too
                }));
            }

            const newAgentId = await createAgentInFirestore(currentUser.uid, clonedAgentData);
            alert(`Agent "${agent.name}" cloned successfully as "${clonedAgentData.name}".`);
            navigate(`/agent/${newAgentId}/edit`);
        } catch (err) {
            console.error("Error cloning agent:", err);
            setError(`Failed to clone agent: ${err.message}`);
            if (err.message && err.message.includes("Unsupported field value")) {
                console.log("Data sent to Firestore during clone attempt:", agent); // Log original agent state
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleExportAgent = () => {
        if (!agent) return;
        setError(null);
        try {
            const exportData = { ...agent };
            // Remove fields not suitable for export or that should be reset on import
            delete exportData.id;
            delete exportData.userId;
            delete exportData.createdAt;
            delete exportData.updatedAt;
            delete exportData.deploymentStatus;
            delete exportData.vertexAiResourceName;
            delete exportData.lastDeployedAt;
            delete exportData.lastDeploymentAttemptAt;
            delete exportData.deploymentError;
            delete exportData.isPublic; // Or set exportData.isPublic = false;

            // Ensure API keys are nulled out
            exportData.litellm_api_key = null;
            if (exportData.childAgents && Array.isArray(exportData.childAgents)) {
                exportData.childAgents = exportData.childAgents.map(ca => ({
                    ...ca,
                    litellm_api_key: null
                }));
            }

            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const href = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = href;
            const safeName = agent.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            link.download = `${safeName || 'agent_export'}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(href);
            alert("Agent configuration exported.");
        } catch (err) {
            console.error("Error exporting agent:", err);
            setError(`Failed to export agent: ${err.message}`);
        }
    };
    // --- End New Feature Handlers ---

    if (loading && !agent) return <Box display="flex" justifyContent="center" py={5}><LoadingSpinner /></Box>;
    if (error && !agent && !loading) return <Container><ErrorMessage message={error} /></Container>;
    if (!agent) return (
        <Container>
            <Typography variant="h5" textAlign="center" color="text.secondary" mt={5}>
                Agent data not available or you may not have permission.
            </Typography>
        </Container>
    );

    const isOwner = currentUser && agent && currentUser.uid === agent.userId;
    const isAdmin = currentUser && currentUser.permissions?.isAdmin;
    const canManageAgent = isOwner || isAdmin;

    const canRunAgentLive = agent.platform === PLATFORM_IDS.GOOGLE_VERTEX &&
        agent.deploymentStatus === 'deployed' &&
        agent.vertexAiResourceName &&
        currentUser && currentUser.permissions?.canRunAgent;

    const platformInfo = agent.platform ? getPlatformById(agent.platform) : null;

    return (
        <Container maxWidth="lg" sx={{ py: 3 }}>
            {error && <ErrorMessage message={error} severity="error" sx={{ mb: 2 }} />}
            <Paper elevation={3} sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', mb: 2 }}>
                    <Box sx={{mb: {xs: 2, sm: 0}}}>
                        <Typography variant="h4" component="h1" gutterBottom>
                            {agent.name}
                            <Chip label={agent.agentType} size="small" color="secondary" variant="outlined" sx={{ ml: 1, verticalAlign: 'middle' }} />
                            {platformInfo && (
                                <Chip label={platformInfo.name} size="small" variant="outlined" sx={{ ml: 1, verticalAlign: 'middle' }} />
                            )}
                            {agent.isPublic && <Chip icon={<PublicIcon fontSize="small"/>} label="Public" size="small" color="info" variant="filled" sx={{ ml: 1, verticalAlign: 'middle' }} />}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block">
                            ID: {agent.id}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block">
                            Owner UID: {agent.userId} {isOwner && "(You)"}
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        {canManageAgent && (
                            <>
                                <Button variant="outlined" color="info" onClick={handleCloneAgent} startIcon={<FileCopyIcon />} disabled={isSubmitting || loading}>
                                    Clone
                                </Button>
                                <Button variant="outlined" color="success" onClick={handleExportAgent} startIcon={<DownloadIcon />} disabled={isSubmitting || loading}>
                                    Export
                                </Button>
                                <Button variant="outlined" color="secondary" component={RouterLink} to={`/agent/${agent.id}/edit`} startIcon={<EditIcon />}>
                                    Edit Config
                                </Button>
                            </>
                        )}
                    </Box>
                </Box>

                {canManageAgent && (
                    <Box sx={{mt:1, mb:2}}>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={agent.isPublic || false}
                                    onChange={handleTogglePublic}
                                    disabled={isSubmitting || loading}
                                    color="primary"
                                />
                            }
                            label={agent.isPublic ? "Agent is Public (shared with all users)" : "Agent is Private (only visible to you)"}
                        />
                        <Tooltip title={agent.isPublic ? "Make this agent private to you." : "Share this agent with all users on this platform instance."}>
                            {agent.isPublic ? <LockIcon sx={{verticalAlign: 'middle', ml:0.5, color:'text.secondary'}}/> : <PublicIcon sx={{verticalAlign: 'middle', ml:0.5, color:'text.secondary'}}/>}
                        </Tooltip>
                    </Box>
                )}


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
                    isLiveModeEnabled={canRunAgentLive}
                />
            )}

            <RunHistory agentId={agent.id} onSelectRun={handleSelectHistoricalRun} />
        </Container>
    );
};

export default AgentPage;