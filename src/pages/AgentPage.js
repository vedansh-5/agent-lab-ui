// src/pages/AgentPage.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAgentDetails,
    // updateAgentInFirestore
} from '../services/firebaseService';
import { deployAgent, deleteAgentDeployment, checkAgentDeploymentStatus } from '../services/agentService';
import AgentRunner from '../components/agents/AgentRunner';
import RunHistory from '../components/agents/RunHistory';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';

import {
    Container, CircularProgress, Stack, Typography, Box, Paper, Grid, Button,
    List, ListItem, ListItemText, Divider, Alert, AlertTitle, IconButton, Tooltip,
    Accordion, AccordionSummary, AccordionDetails, Chip
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import LoopIcon from '@mui/icons-material/Loop';
import AutorenewIcon from '@mui/icons-material/Autorenew';


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
            setLoading(false);
            return;
        }
        if (!isPoll) setLoading(true);

        try {
            const agentData = await getAgentDetails(agentIdRef.current);
            if (!agentData) { // Agent might have been deleted
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
            setError(null);

            const status = agentData.deploymentStatus;
            if (status === 'deploying_initiated' || status === 'deploying_in_progress') {
                if (!pollingIntervalId && !isPoll) {
                    console.log(`Status is ${status}, starting polling for ${agentIdRef.current}`);
                    const newIntervalId = setInterval(async () => {
                        console.log(`Polling status for ${agentIdRef.current}...`);
                        try {
                            // Prevent multiple concurrent checks if one is slow
                            if(document.visibilityState === 'visible') { // Only poll if tab is active
                                await checkAgentDeploymentStatus(agentIdRef.current);
                                await fetchAgentData(true); // Re-fetch from FS (as a poll)
                            }
                        } catch (pollError) {
                            console.error("Error during polling status check:", pollError);
                            // Consider stopping polling on repeated critical errors
                        }
                    }, 30000); // Poll every 30 seconds
                    setPollingIntervalId(newIntervalId);
                }
            } else {
                stopPolling();
            }

        } catch (err) {
            console.error("Error fetching agent details:", err);
            setError(`Failed to load agent details: ${err.message}`);
            setAgent(null);
            stopPolling();
        } finally {
            if (!isPoll) setLoading(false);
        }
    }, [currentUser, stopPolling, pollingIntervalId]); // Ensure pollingIntervalId is a dep

    useEffect(() => {
        fetchAgentData(); // Initial fetch
        return () => { // Cleanup on unmount
            stopPolling();
        };
    }, [fetchAgentData, stopPolling]); // fetchAgentData is memoized

    const handleManualStatusRefresh = async () => {
        if (!agent || !agent.id || isCheckingStatus || isDeploying || isDeleting) return;
        setIsCheckingStatus(true);
        setError(null);
        try {
            console.log(`Manually refreshing status for ${agent.id}`);
            await checkAgentDeploymentStatus(agent.id);
            await fetchAgentData(); // Re-fetch updated data from Firestore
        } catch (err) {
            console.error("Error manually refreshing status:", err);
            setError(`Failed to refresh status: ${err.message}`);
        } finally {
            setIsCheckingStatus(false);
        }
    };

    const handleDeploy = async () => {
        if (!agent) return;
        setIsDeploying(true);
        setError(null);
        stopPolling(); // Stop any existing polling before new deploy attempt

        try {
            // Firestore is updated to 'deploying_initiated' by the backend function first.
            const result = await deployAgent(agent, agent.id);

            if (result.success && result.resourceName) { // Deployment confirmed completed within timeout
                // alert("Agent deployment successful and confirmed!"); // No need for alert, UI will update
            } else if (result.wasTimeout) {
                // alert(result.message); // "Deployment initiated, but confirmation timed out..."
                // UI will show 'deploying_initiated' and start polling via fetchAgentData
            } else {
                // Other errors from deployAgent
                setError(result.message || "Deployment initiation failed.");
            }
        } catch (err) {
            console.error("Error deploying agent:", err);
            const deployError = err.message || "Failed to deploy agent. Check function logs.";
            setError(deployError);
            // Backend tries to set 'error' in Firestore. If function call itself failed, it might not.
        } finally {
            setIsDeploying(false);
            await fetchAgentData(); // Crucial: re-fetch to get the latest status and trigger polling if needed
        }
    };

    const handleDeleteDeployment = async () => {
        if (!agent || !agent.vertexAiResourceName) return;
        if (!window.confirm("Are you sure you want to delete this agent's deployment from Vertex AI? This cannot be undone.")) {
            return;
        }
        setIsDeleting(true);
        setError(null);
        stopPolling();

        try {
            await deleteAgentDeployment(agent.vertexAiResourceName, agent.id);
            alert("Agent deployment deletion initiated!"); // UI will update after fetch
        } catch (err) {
            console.error("Error deleting agent deployment:", err);
            const deleteError = err.message || "Failed to delete agent deployment.";
            setError(deleteError);
        } finally {
            setIsDeleting(false);
            await fetchAgentData(); // Re-fetch to update status
        }
    };

    if (loading && !agent) return <Box display="flex" justifyContent="center" py={5}><LoadingSpinner /></Box>;
    if (error && !agent) return <Container><ErrorMessage message={error} /></Container>;
    if (!agent) return (
        <Container>
            <Typography variant="h5" textAlign="center" color="text.secondary" mt={5}>
                Agent not found or you do not have access.
            </Typography>
        </Container>
    );

    const getStatusIconAndColor = () => {
        if (!agent || !agent.deploymentStatus) return { icon: <CloudOffIcon color="disabled" />, color: 'text.disabled', text: 'Unknown' };
        const status = agent.deploymentStatus;
        const isPollingActive = !!pollingIntervalId;

        switch (status) {
            case 'deployed': return { icon: <CheckCircleIcon color="success" />, color: 'success.main', text: 'Deployed' };
            case 'deploying_initiated': return { icon: <HourglassEmptyIcon color="info" className={isPollingActive ? "animate-pulse" : ""} />, color: 'info.main', text: 'Deployment Initiated' };
            case 'deploying_in_progress': return { icon: <AutorenewIcon color="info" className="animate-spin" />, color: 'info.main', text: 'Deployment In Progress' };
            case 'error': return { icon: <ErrorIcon color="error" />, color: 'error.main', text: 'Deployment Error' };
            case 'error_not_found_after_init': return { icon: <ErrorOutlineIcon color="error" />, color: 'error.main', text: 'Error: Engine Not Found Post-Init' };
            case 'error_resource_vanished': return { icon: <CloudOffIcon color="error" />, color: 'error.main', text: 'Error: Deployed Resource Vanished' };
            case 'not_found_on_vertex': return { icon: <CloudOffIcon color="action" />, color: 'text.secondary', text: 'Not Found on Vertex' };
            default:
                if (status.startsWith('unknown_vertex_state_')) {
                    const subState = status.substring('unknown_vertex_state_'.length).replace(/_/g, ' ').toUpperCase();
                    return { icon: <HelpOutlineIcon color="action" />, color: 'text.secondary', text: `Vertex State: ${subState}` };
                }
                const formattedStatus = status.replace(/_/g, ' ')
                    .split(' ')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');
                return { icon: <CloudOffIcon color="disabled" />, color: 'text.disabled', text: formattedStatus || 'Not Deployed' };
        }
    };
    const statusInfo = getStatusIconAndColor();
    const canAttemptDeploy = !['deploying_initiated', 'deploying_in_progress', 'deployed'].includes(agent?.deploymentStatus);
    const canDeleteDeployment = agent?.vertexAiResourceName && !['deploying_initiated', 'deploying_in_progress'].includes(agent?.deploymentStatus);
    const isDeploymentProcessActive = ['deploying_initiated', 'deploying_in_progress'].includes(agent?.deploymentStatus);


    const showParentConfigDisplay = agent.agentType === 'Agent' || agent.agentType === 'LoopAgent';
    const showChildConfigDisplay = (agent.agentType === 'SequentialAgent' || agent.agentType === 'ParallelAgent') && agent.childAgents && agent.childAgents.length > 0;

    return (
        <Container maxWidth="lg" sx={{ py: 3 }}>
            {error && <ErrorMessage message={error} severity="error" sx={{ mb: 2 }} />}
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
                        <Typography variant="subtitle1" fontWeight="medium">Description:</Typography>
                        <Typography variant="body2" color="text.secondary" paragraph>{agent.description || "N/A"}</Typography>

                        {showParentConfigDisplay && (
                            <>
                                <Typography variant="subtitle1" fontWeight="medium">
                                    {agent.agentType === 'LoopAgent' ? "Looped Agent Model:" : "Model:"}
                                </Typography>
                                <Typography variant="body2" color="text.secondary" paragraph>{agent.model}</Typography>

                                <Typography variant="subtitle1" fontWeight="medium">
                                    {agent.agentType === 'LoopAgent' ? "Looped Agent Instruction:" : "Instruction:"}
                                </Typography>
                                <Paper variant="outlined" sx={{ p: 1.5, my: 1, whiteSpace: 'pre-wrap', maxHeight: 150, overflow: 'auto', bgcolor: 'action.hover' }}>
                                    {agent.instruction || "N/A"}
                                </Paper>
                            </>
                        )}
                        {agent.agentType === 'LoopAgent' && (
                            <>
                                <Typography variant="subtitle1" fontWeight="medium" sx={{ mt: 1.5, display: 'flex', alignItems: 'center' }}>
                                    <LoopIcon sx={{ mr: 0.5 }} fontSize="small" /> Max Loops:
                                </Typography>
                                <Typography variant="body2" color="text.secondary" paragraph>{agent.maxLoops || 'Default (3)'}</Typography>
                            </>
                        )}
                    </Grid>
                    <Grid item xs={12} md={6}>
                        {showParentConfigDisplay && agent.tools && agent.tools.length > 0 && (
                            <>
                                <Typography variant="subtitle1" fontWeight="medium">
                                    {agent.agentType === 'LoopAgent' ? "Looped Agent Tools:" : "Tools:"}
                                </Typography>
                                <List dense disablePadding sx={{ maxHeight: 180, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 0.5, mt: 0.5 }}>
                                    {agent.tools.map((tool, idx) => (
                                        <ListItem key={tool.id || idx} disableGutters sx={{ py: 0.2 }}>
                                            <ListItemText primary={tool.name} secondary={tool.id} primaryTypographyProps={{ variant: 'body2' }} secondaryTypographyProps={{ variant: 'caption' }} />
                                        </ListItem>
                                    ))}
                                </List>
                            </>
                        )}
                        {!showParentConfigDisplay && agent.tools && agent.tools.length > 0 && (
                            <Typography variant="body2" color="text.secondary" fontStyle="italic" sx={{ mt: 1.5 }}>
                                (Orchestrator-level tools: {agent.tools.length}. These are typically not used by Sequential/Parallel agents themselves.)
                            </Typography>
                        )}
                        {(!agent.tools || agent.tools.length === 0) && showParentConfigDisplay && (
                            <Typography variant="body2" color="text.secondary">No tools configured for {agent.agentType === 'LoopAgent' ? "looped agent" : "this agent"}.</Typography>
                        )}
                    </Grid>
                </Grid>

                {showChildConfigDisplay && (
                    <Box mt={3}>
                        <Divider sx={{ my: 2 }} />
                        <Typography variant="h6" component="h3" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                            <AccountTreeIcon sx={{ mr: 1 }} /> Child Agents ({agent.childAgents.length})
                        </Typography>
                        <Box sx={{ maxHeight: '400px', overflowY: 'auto' }}>
                            {agent.childAgents.map((child, index) => (
                                <Accordion key={child.name + index} sx={{ mb: 1 }} TransitionProps={{ unmountOnExit: true }}>
                                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                        <Typography sx={{ fontWeight: 'medium' }}>{index + 1}. {child.name}</Typography>
                                        <Chip label={`Model: ${child.model}`} size="small" sx={{ ml: 2 }} variant="outlined" />
                                    </AccordionSummary>
                                    <AccordionDetails sx={{ bgcolor: 'action.hover', borderTop: '1px solid', borderColor: 'divider' }}>
                                        {child.description && (
                                            <Typography variant="body2" color="text.secondary" paragraph>
                                                <strong>Description:</strong> {child.description}
                                            </Typography>
                                        )}
                                        <Typography variant="body2" paragraph>
                                            <strong>Instruction:</strong>
                                            <Paper variant="outlined" component="pre" sx={{ p: 1, mt: 0.5, whiteSpace: 'pre-wrap', maxHeight: 100, overflow: 'auto', fontSize: '0.875rem' }}>
                                                {child.instruction}
                                            </Paper>
                                        </Typography>
                                        {child.tools && child.tools.length > 0 ? (
                                            <>
                                                <Typography variant="body2" fontWeight="medium">Tools ({child.tools.length}):</Typography>
                                                <List dense disablePadding sx={{ pl: 2 }}>
                                                    {child.tools.map((tool, tIdx) => (
                                                        <ListItem key={tool.id || tIdx} disableGutters sx={{ py: 0 }}>
                                                            <ListItemText primary={tool.name} secondary={tool.id} primaryTypographyProps={{ fontSize: '0.875rem' }} secondaryTypographyProps={{ fontSize: '0.75rem' }} />
                                                        </ListItem>
                                                    ))}
                                                </List>
                                            </>
                                        ) : (
                                            <Typography variant="body2" color="text.secondary">No tools for this child agent.</Typography>
                                        )}
                                    </AccordionDetails>
                                </Accordion>
                            ))}
                        </Box>
                    </Box>
                )}


                <Divider sx={{ my: 3 }} />
                <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="h6" component="h3">Deployment Status</Typography>
                        <Tooltip title="Refresh Status Now">
                            <span> {/* Span for disabled button tooltip */}
                                <IconButton onClick={handleManualStatusRefresh} size="small" disabled={loading || isCheckingStatus || isDeploying || isDeleting}>
                                    {isCheckingStatus ? <CircularProgress size={20} /> : <RefreshIcon />}
                                </IconButton>
                            </span>
                        </Tooltip>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        {statusInfo.icon}
                        <Typography variant="body1" fontWeight="medium" color={statusInfo.color}>
                            {statusInfo.text}
                            {pollingIntervalId && <CircularProgress size={14} sx={{ ml: 1 }} color="inherit" />}
                        </Typography>
                    </Box>
                    {agent.vertexAiResourceName && (<Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>Resource: {agent.vertexAiResourceName}</Typography>)}

                    {agent.lastDeployedAt?.toDate && agent.deploymentStatus === 'deployed' && (<Typography variant="caption" color="text.secondary" display="block" sx={{mb:1}}>Deployed At: {new Date(agent.lastDeployedAt.toDate()).toLocaleString()}</Typography>)}

                    {agent.lastDeploymentAttemptAt?.toDate && (agent.deploymentStatus !== 'deployed' || !agent.lastDeployedAt) && (<Typography variant="caption" color="text.secondary" display="block" sx={{mb:1}}>Last Attempt: {new Date(agent.lastDeploymentAttemptAt.toDate()).toLocaleString()}</Typography>)}

                    {agent.deploymentStatus?.includes('error') && agent.deploymentError && (<Alert severity="error" sx={{ my: 1 }}><AlertTitle>Deployment Error Details</AlertTitle>{agent.deploymentError}</Alert>)}

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mt={2}>
                        {canAttemptDeploy && (
                            <Button variant="contained" color={agent?.deploymentStatus?.includes('error') ? "warning" : "success"} onClick={handleDeploy} disabled={isDeploying || loading || isCheckingStatus || isDeleting} startIcon={isDeploying ? <CircularProgress size={20} color="inherit" /> : <CloudUploadIcon />}>
                                {isDeploying ? 'Initiating...' : (agent?.deploymentStatus?.includes('error') ? 'Retry Deployment' : 'Deploy to Vertex AI')}
                            </Button>
                        )}
                        {canDeleteDeployment && (
                            <Button variant="contained" color="error" onClick={handleDeleteDeployment} disabled={isDeleting || loading || isCheckingStatus || isDeploying} startIcon={isDeleting ? <CircularProgress size={20} color="inherit" /> : <DeleteForeverIcon />}>
                                {isDeleting ? 'Deleting...' : 'Delete Vertex AI Deployment'}
                            </Button>
                        )}
                    </Stack>
                    {isDeploymentProcessActive &&
                        <Alert severity="info" icon={<HourglassEmptyIcon className={pollingIntervalId ? "animate-pulse" : ""} />} sx={{ mt: 2 }}>
                            Deployment is underway. Status is being monitored and will update automatically.
                            You can also manually refresh. This process can take several minutes.
                        </Alert>
                    }
                </Box>
            </Paper>

            {agent?.deploymentStatus === 'deployed' && agent.vertexAiResourceName && currentUser && (
                <AgentRunner agentResourceName={agent.vertexAiResourceName} agentFirestoreId={agent.id} adkUserId={currentUser.uid} />
            )}

            <RunHistory agentId={agent.id} />
        </Container>
    );
};

export default AgentPage;  