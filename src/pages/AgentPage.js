import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAgentDetails, updateAgentInFirestore } from '../services/firebaseService';
import { deployAgent, deleteAgentDeployment } from '../services/agentService';
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
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'; // For Child Agent Accordion
import AccountTreeIcon from '@mui/icons-material/AccountTree'; // For child agents section
import LoopIcon from '@mui/icons-material/Loop'; // For Max Loops


const AgentPage = () => {
    const { agentId } = useParams();
    const { currentUser } = useAuth();

    const [agent, setAgent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isDeploying, setIsDeploying] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const fetchAgentData = useCallback(async () => {
        if (!currentUser || !agentId) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const agentData = await getAgentDetails(agentId);
            if (agentData.userId !== currentUser.uid) {
                setError("You are not authorized to view this agent.");
                setAgent(null);
                return;
            }
            // Ensure defaults for new fields if they don't exist on older documents
            setAgent({
                ...agentData,
                childAgents: agentData.childAgents || [],
                maxLoops: agentData.maxLoops || (agentData.agentType === 'LoopAgent' ? 3 : undefined) // Default only if LoopAgent
            });
            setError(null);
        } catch (err) {
            console.error("Error fetching agent details:", err);
            setError(`Failed to load agent details: ${err.message}`);
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
            // The agent object already contains childAgents and maxLoops if applicable
            await deployAgent(agent, agent.id);
            alert("Agent deployment initiated! It may take a few minutes. Refresh to see status.");
            await updateAgentInFirestore(agent.id, { deploymentStatus: 'deploying', deploymentError: null });
            fetchAgentData(); // Re-fetch to get deployment status and latest agent data
        } catch (err) {
            console.error("Error deploying agent:", err);
            const deployError = err.message || "Failed to deploy agent.";
            setError(deployError);
            await updateAgentInFirestore(agent.id, { deploymentStatus: 'error', deploymentError: deployError });
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
            await updateAgentInFirestore(agent.id, {
                deploymentStatus: 'not_deployed', // Or 'deleted_from_vertex'
                vertexAiResourceName: null,
                deploymentError: null,
                lastDeployedAt: null,
            });
            fetchAgentData();
        } catch (err) {
            console.error("Error deleting agent deployment:", err);
            const deleteError = err.message || "Failed to delete agent deployment.";
            setError(deleteError);
            // Optionally update Firestore with delete_error status if backend doesn't handle it fully
            // await updateAgentInFirestore(agent.id, { deploymentStatus: 'error_deleting', deploymentError: deleteError });
            fetchAgentData(); // Re-fetch to update status
        } finally {
            setIsDeleting(false);
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

    const isDeployed = agent.deploymentStatus === 'deployed' && agent.vertexAiResourceName;
    const isDeployingStatus = agent.deploymentStatus === 'deploying';
    const hasDeploymentError = agent.deploymentStatus === 'error';

    const getStatusIconAndColor = () => {
        switch (agent.deploymentStatus) {
            case 'deployed': return { icon: <CheckCircleIcon color="success" />, color: 'success.main', text: 'Deployed' };
            case 'deploying': return { icon: <HourglassEmptyIcon color="warning" className="animate-pulse" />, color: 'warning.main', text: 'Deploying' };
            case 'error': return { icon: <ErrorIcon color="error" />, color: 'error.main', text: 'Deployment Error' };
            case 'not_found_on_vertex': return { icon: <CloudOffIcon color="action" />, color: 'text.secondary', text: 'Not Found on Vertex' };
            default: return { icon: <CloudOffIcon color="disabled"/>, color: 'text.disabled', text: 'Not Deployed' };
        }
    };
    const statusInfo = getStatusIconAndColor();

    const showParentConfigDisplay = agent.agentType === 'Agent' || agent.agentType === 'LoopAgent';
    const showChildConfigDisplay = (agent.agentType === 'SequentialAgent' || agent.agentType === 'ParallelAgent') && agent.childAgents && agent.childAgents.length > 0;


    return (
        <Container maxWidth="lg" sx={{ py: 3 }}>
            {error && <ErrorMessage message={error} severity="error" sx={{ mb:2 }} />}
            <Paper elevation={3} sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box>
                        <Typography variant="h4" component="h1" gutterBottom>
                            {agent.name} <Chip label={agent.agentType} size="small" color="secondary" variant="outlined" sx={{ml:1}}/>
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
                                <Paper variant="outlined" sx={{ p: 1.5, my: 1, whiteSpace: 'pre-wrap', maxHeight: 150, overflow: 'auto', bgcolor:'action.hover' }}>
                                    {agent.instruction || "N/A"}
                                </Paper>
                            </>
                        )}
                        {agent.agentType === 'LoopAgent' && (
                            <>
                                <Typography variant="subtitle1" fontWeight="medium" sx={{mt:1.5, display:'flex', alignItems:'center'}}>
                                    <LoopIcon sx={{mr:0.5}} fontSize="small"/> Max Loops:
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
                                <List dense disablePadding sx={{maxHeight: 180, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1, p:0.5, mt:0.5}}>
                                    {agent.tools.map((tool, idx) => (
                                        <ListItem key={tool.id || idx} disableGutters sx={{py:0.2}}>
                                            <ListItemText primary={tool.name} secondary={tool.id} primaryTypographyProps={{variant:'body2'}} secondaryTypographyProps={{variant:'caption'}} />
                                        </ListItem>
                                    ))}
                                </List>
                            </>
                        )}
                        {!showParentConfigDisplay && agent.tools && agent.tools.length > 0 && (
                            <Typography variant="body2" color="text.secondary" fontStyle="italic" sx={{mt:1.5}}>
                                (Orchestrator-level tools: {agent.tools.length}. These are typically not used by Sequential/Parallel agents themselves.)
                            </Typography>
                        )}
                        {(!agent.tools || agent.tools.length === 0) && showParentConfigDisplay && (
                            <Typography variant="body2" color="text.secondary">No tools configured for {agent.agentType === 'LoopAgent' ? "looped agent" : "this agent"}.</Typography>
                        )}
                    </Grid>
                </Grid>

                {/* Child Agents Display */}
                {showChildConfigDisplay && (
                    <Box mt={3}>
                        <Divider sx={{ my: 2 }} />
                        <Typography variant="h6" component="h3" gutterBottom sx={{display:'flex', alignItems:'center'}}>
                            <AccountTreeIcon sx={{mr:1}}/> Child Agents ({agent.childAgents.length})
                        </Typography>
                        <Box sx={{ maxHeight: '400px', overflowY: 'auto' }}>
                            {agent.childAgents.map((child, index) => (
                                <Accordion key={child.name + index} sx={{mb:1}} TransitionProps={{ unmountOnExit: true }}>
                                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                        <Typography sx={{ fontWeight: 'medium' }}>{index + 1}. {child.name}</Typography>
                                        <Chip label={`Model: ${child.model}`} size="small" sx={{ml:2}} variant="outlined"/>
                                    </AccordionSummary>
                                    <AccordionDetails sx={{ bgcolor: 'action.hover', borderTop: '1px solid', borderColor: 'divider' }}>
                                        {child.description && (
                                            <Typography variant="body2" color="text.secondary" paragraph>
                                                <strong>Description:</strong> {child.description}
                                            </Typography>
                                        )}
                                        <Typography variant="body2" paragraph>
                                            <strong>Instruction:</strong>
                                            <Paper variant="outlined" component="pre" sx={{ p: 1, mt:0.5, whiteSpace: 'pre-wrap', maxHeight: 100, overflow: 'auto', fontSize:'0.875rem' }}>
                                                {child.instruction}
                                            </Paper>
                                        </Typography>
                                        {child.tools && child.tools.length > 0 ? (
                                            <>
                                                <Typography variant="body2" fontWeight="medium">Tools ({child.tools.length}):</Typography>
                                                <List dense disablePadding sx={{pl:2}}>
                                                    {child.tools.map((tool, tIdx) => (
                                                        <ListItem key={tool.id || tIdx} disableGutters sx={{py:0}}>
                                                            <ListItemText primary={tool.name} secondary={tool.id} primaryTypographyProps={{fontSize:'0.875rem'}} secondaryTypographyProps={{fontSize:'0.75rem'}}/>
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
                    <Box sx={{display: 'flex', alignItems: 'center', justifyContent:'space-between', mb:1}}>
                        <Typography variant="h6" component="h3">Deployment Status</Typography>
                        <Tooltip title="Refresh Status"><IconButton onClick={fetchAgentData} size="small" disabled={loading}>{loading ? <CircularProgress size={20}/> :<RefreshIcon />}</IconButton></Tooltip>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        {statusInfo.icon} <Typography variant="body1" fontWeight="medium" color={statusInfo.color}>{statusInfo.text}</Typography>
                    </Box>
                    {agent.vertexAiResourceName && (<Typography variant="caption" color="text.secondary" display="block" sx={{mb:1}}>Resource: {agent.vertexAiResourceName}</Typography>)}
                    {agent.lastDeployedAt?.toDate && (<Typography variant="caption" color="text.secondary" display="block" sx={{mb:1}}>Last Action: {new Date(agent.lastDeployedAt.toDate()).toLocaleString()}</Typography>)}
                    {hasDeploymentError && agent.deploymentError && (<Alert severity="error" sx={{my:1}}><AlertTitle>Deployment Error</AlertTitle>{agent.deploymentError}</Alert>)}

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mt={2}>
                        {(!isDeployed || hasDeploymentError) && !isDeployingStatus && ( // Show deploy/retry if not deployed, or error, and not currently deploying
                            <Button variant="contained" color={hasDeploymentError ? "warning" : "success"} onClick={handleDeploy} disabled={isDeploying || loading} startIcon={isDeploying ? <CircularProgress size={20} color="inherit" /> : <CloudUploadIcon />}>
                                {isDeploying ? 'Deploying...' : (hasDeploymentError ? 'Retry Deployment' : 'Deploy to Vertex AI')}
                            </Button>
                        )}
                        {(isDeployed || agent.vertexAiResourceName) && !isDeployingStatus && ( // Show delete if resourceName exists (even if status is error) and not currently deploying
                            <Button variant="contained" color="error" onClick={handleDeleteDeployment} disabled={isDeleting || loading || isDeploying} startIcon={isDeleting ? <CircularProgress size={20} color="inherit" /> : <DeleteForeverIcon />}>
                                {isDeleting ? 'Deleting...' : 'Delete Vertex AI Deployment'}
                            </Button>
                        )}
                    </Stack>
                </Box>
            </Paper>

            {isDeployed && agent.vertexAiResourceName && currentUser && (
                <AgentRunner agentResourceName={agent.vertexAiResourceName} agentFirestoreId={agent.id} adkUserId={currentUser.uid} />
            )}
            {isDeployingStatus && (
                <Alert severity="info" icon={<HourglassEmptyIcon className="animate-pulse"/>} sx={{mt:2}}>
                    Deployment is in progress. This can take several minutes. You can refresh the status.
                </Alert>
            )}

            <RunHistory agentId={agent.id} />
        </Container>
    );
};

export default AgentPage;  