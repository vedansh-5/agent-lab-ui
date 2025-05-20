import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAgentDetails, updateAgentInFirestore } from '../services/firebaseService';
import { deployAgent, deleteAgentDeployment } from '../services/agentService';
import AgentRunner from '../components/agents/AgentRunner'; // MUI-fied
import RunHistory from '../components/agents/RunHistory'; // MUI-fied
import LoadingSpinner from '../components/common/LoadingSpinner'; // MUI-fied
import ErrorMessage from '../components/common/ErrorMessage'; // MUI-fied

import {
    Container,
    CircularProgress,
    Stack,
    Typography,
    Box,
    Paper,
    Grid,
    Button,
    List, ListItem, ListItemText, Divider,
    Alert, AlertTitle, IconButton, Tooltip
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';

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
            setLoading(false); // No user or agentId, stop loading
            return;
        }
        setLoading(true); // Set loading true at the start of fetch
        // setError(null); // Clear previous errors for a fresh fetch, or not if you want to keep them
        try {
            const agentData = await getAgentDetails(agentId);
            if (agentData.userId !== currentUser.uid) {
                setError("You are not authorized to view this agent.");
                setAgent(null);
                return;
            }
            setAgent(agentData);
            setError(null); // Clear error on successful fetch
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
            await deployAgent(agent, agent.id);
            // Consider using Snackbar for notifications
            alert("Agent deployment initiated! It may take a few minutes. Refresh to see status.");
            await updateAgentInFirestore(agent.id, { deploymentStatus: 'deploying', deploymentError: null });
            fetchAgentData();
        } catch (err) {
            console.error("Error deploying agent:", err);
            const deployError = err.message || "Failed to deploy agent. Check console for details.";
            setError(deployError);
            await updateAgentInFirestore(agent.id, { deploymentStatus: 'error', deploymentError: deployError });
            fetchAgentData(); // Re-fetch to show error state correctly
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
                deploymentStatus: 'not_deployed',
                vertexAiResourceName: null, // Or firestore.FieldValue.delete()
                deploymentError: null,
                lastDeployedAt: null, // Or firestore.FieldValue.delete()
            });
            fetchAgentData();
        } catch (err) {
            console.error("Error deleting agent deployment:", err);
            setError(err.message || "Failed to delete agent deployment. Check console.");
            // Optionally update Firestore with delete_error status
        } finally {
            setIsDeleting(false);
        }
    };

    if (loading && !agent) return <Box display="flex" justifyContent="center" py={5}><LoadingSpinner /></Box>;
    if (error && !agent) return <Container><ErrorMessage message={error} /></Container>; // If agent couldn't be loaded at all
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
            case 'error': return { icon: <ErrorIcon color="error" />, color: 'error.main', text: 'Error' };
            default: return { icon: <CloudOffIcon color="disabled"/>, color: 'text.disabled', text: 'Not Deployed' };
        }
    };
    const statusInfo = getStatusIconAndColor();

    return (
        <Container maxWidth="lg" sx={{ py: 3 }}>
            {error && <ErrorMessage message={error} severity="error" sx={{ mb:2 }} />}
            <Paper elevation={3} sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box>
                        <Typography variant="h4" component="h1" gutterBottom>
                            {agent.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block">
                            ID: {agent.id}
                        </Typography>
                    </Box>
                    <Button
                        variant="outlined"
                        color="secondary"
                        component={RouterLink}
                        to={`/agent/${agent.id}/edit`}
                        startIcon={<EditIcon />}
                    >
                        Edit Config
                    </Button>
                </Box>
                <Divider sx={{ my: 2 }} />

                <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                        <Typography variant="subtitle1" fontWeight="medium">Description:</Typography>
                        <Typography variant="body2" color="text.secondary" paragraph>{agent.description || "N/A"}</Typography>

                        <Typography variant="subtitle1" fontWeight="medium">Type:</Typography>
                        <Typography variant="body2" color="text.secondary" paragraph>{agent.agentType}</Typography>

                        <Typography variant="subtitle1" fontWeight="medium">Model:</Typography>
                        <Typography variant="body2" color="text.secondary" paragraph>{agent.model}</Typography>
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <Typography variant="subtitle1" fontWeight="medium">Instruction:</Typography>
                        <Paper variant="outlined" sx={{ p: 1.5, my: 1, whiteSpace: 'pre-wrap', maxHeight: 150, overflow: 'auto', bgcolor:'action.hover' }}>
                            {agent.instruction || "N/A"}
                        </Paper>

                        <Typography variant="subtitle1" fontWeight="medium" sx={{mt:1.5}}>Tools:</Typography>
                        {agent.tools && agent.tools.length > 0 ? (
                            <List dense disablePadding>
                                {agent.tools.map(tool => (
                                    <ListItem key={tool.id} disableGutters sx={{py:0.5}}>
                                        <ListItemText primary={tool.name} secondary={tool.id} primaryTypographyProps={{variant:'body2'}} secondaryTypographyProps={{variant:'caption'}} />
                                    </ListItem>
                                ))}
                            </List>
                        ) : (
                            <Typography variant="body2" color="text.secondary">No tools configured.</Typography>
                        )}
                    </Grid>
                </Grid>

                <Divider sx={{ my: 3 }} />
                <Box>
                    <Box sx={{display: 'flex', alignItems: 'center', justifyContent:'space-between', mb:1}}>
                        <Typography variant="h6" component="h3">
                            Deployment Status
                        </Typography>
                        <Tooltip title="Refresh Status">
                            <IconButton onClick={fetchAgentData} size="small" disabled={loading}>
                                {loading ? <CircularProgress size={20}/> :<RefreshIcon />}
                            </IconButton>
                        </Tooltip>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        {statusInfo.icon}
                        <Typography variant="body1" fontWeight="medium" color={statusInfo.color}>
                            {statusInfo.text}
                        </Typography>
                    </Box>

                    {agent.vertexAiResourceName && (
                        <Typography variant="caption" color="text.secondary" display="block" sx={{mb:1}}>
                            Resource Name: {agent.vertexAiResourceName}
                        </Typography>
                    )}
                    {agent.lastDeployedAt?.toDate && (
                        <Typography variant="caption" color="text.secondary" display="block" sx={{mb:1}}>
                            Last Deployed: {new Date(agent.lastDeployedAt.toDate()).toLocaleString()}
                        </Typography>
                    )}
                    {hasDeploymentError && agent.deploymentError && (
                        <Alert severity="error" sx={{my:1}}>
                            <AlertTitle>Deployment Error</AlertTitle>
                            {agent.deploymentError}
                        </Alert>
                    )}

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mt={2}>
                        {!isDeployed && !isDeployingStatus && (
                            <Button
                                variant="contained"
                                color={hasDeploymentError ? "warning" : "success"}
                                onClick={handleDeploy}
                                disabled={isDeploying || loading}
                                startIcon={isDeploying ? <CircularProgress size={20} color="inherit" /> : <CloudUploadIcon />}
                            >
                                {isDeploying ? 'Deploying...' : (hasDeploymentError ? 'Retry Deployment' : 'Deploy to Vertex AI')}
                            </Button>
                        )}
                        {isDeployed && (
                            <Button
                                variant="contained"
                                color="error"
                                onClick={handleDeleteDeployment}
                                disabled={isDeleting || loading}
                                startIcon={isDeleting ? <CircularProgress size={20} color="inherit" /> : <DeleteForeverIcon />}
                            >
                                {isDeleting ? 'Deleting...' : 'Delete Vertex AI Deployment'}
                            </Button>
                        )}
                    </Stack>
                </Box>
            </Paper>

            {isDeployed && agent.vertexAiResourceName && currentUser && (
                <AgentRunner
                    agentResourceName={agent.vertexAiResourceName}
                    agentFirestoreId={agent.id}
                    adkUserId={currentUser.uid}
                />
            )}
            {isDeployingStatus && !isDeploying && ( // Show if status is deploying but not actively clicking deploy
                <Alert severity="info" icon={<HourglassEmptyIcon className="animate-pulse"/>} sx={{mt:2}}>
                    Deployment is in progress. This can take several minutes. You can refresh the status using the button above.
                </Alert>
            )}

            <RunHistory agentId={agent.id} />
        </Container>
    );
};

export default AgentPage;
