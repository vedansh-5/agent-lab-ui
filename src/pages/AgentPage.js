// src/pages/AgentPage.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link as RouterLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAgentDetails, getModelDetails, updateAgentInFirestore, createAgentInFirestore } from '../services/firebaseService';
import { deployAgent, deleteAgentDeployment, checkAgentDeploymentStatus } from '../services/agentService';

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
import FileCopyIcon from '@mui/icons-material/FileCopy';
import DownloadIcon from '@mui/icons-material/Download';
import PublicIcon from '@mui/icons-material/Public';
import LockIcon from '@mui/icons-material/Lock';
import ChatIcon from '@mui/icons-material/Chat';

import { PLATFORM_IDS, getPlatformById } from '../constants/platformConstants';

const AgentPage = () => {
    const { agentId } = useParams();
    const { currentUser } = useAuth();
    const navigate = useNavigate();

    const [agent, setAgent] = useState(null);
    const [model, setModel] = useState(null); // State for the associated model
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isDeploying, setIsDeploying] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isCheckingStatus, setIsCheckingStatus] = useState(false);
    const [pollingIntervalId, setPollingIntervalId] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const agentIdRef = useRef(agentId);
    useEffect(() => { agentIdRef.current = agentId; }, [agentId]);

    const stopPolling = useCallback(() => {
        if (pollingIntervalId) {
            clearInterval(pollingIntervalId);
            setPollingIntervalId(null);
        }
    }, [pollingIntervalId]);

    const fetchAgentData = useCallback(async (isPoll = false) => {
        if (!currentUser || !agentIdRef.current) return;
        if (!isPoll) setLoading(true);

        try {
            const agentData = await getAgentDetails(agentIdRef.current);
            if (!agentData) {
                setError("Agent not found.");
                setAgent(null);
                setModel(null);
                stopPolling();
                return;
            }
            setAgent(agentData);
            setError(null);

            // Fetch associated model if the agent has one
            if (agentData.modelId) {
                try {
                    const modelData = await getModelDetails(agentData.modelId);
                    setModel(modelData);
                } catch (modelErr) {
                    console.error("Error fetching model details:", modelErr);
                    setModel(null); // Set model to null if it can't be fetched
                    setError(prev => prev ? `${prev}\nCould not load associated model.` : 'Could not load associated model.');
                }
            } else {
                setModel(null);
            }

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
    }, [currentUser, pollingIntervalId, stopPolling]);

    useEffect(() => {
        fetchAgentData();
        return () => stopPolling();
    }, [fetchAgentData, stopPolling]);


    const handleManualStatusRefresh = async () => { /* ... unchanged ... */ };
    const handleDeploy = async () => { /* ... unchanged ... */ };
    const handleDeleteDeployment = async () => { /* ... unchanged ... */ };
    const handleTogglePublic = async () => { /* ... unchanged ... */ };
    const handleCloneAgent = async () => { /* ... unchanged ... */ };
    const handleExportAgent = async () => { /* ... unchanged ... */ };

    if (loading && !agent) return <Box display="flex" justifyContent="center" py={5}><LoadingSpinner /></Box>;
    if (error && !agent) return <Container><ErrorMessage message={error} /></Container>;
    if (!agent) return <Container><Typography>Agent data not available.</Typography></Container>;

    const isOwner = currentUser && agent && currentUser.uid === agent.userId;
    const isAdmin = currentUser && currentUser.permissions?.isAdmin;
    const canManageAgent = isOwner || isAdmin;
    const platformInfo = agent.platform ? getPlatformById(agent.platform) : null;

    return (
        <Container maxWidth="lg" sx={{ py: 3 }}>
            {error && <ErrorMessage message={error} severity="warning" sx={{ mb: 2 }} />}
            <Paper elevation={3} sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', mb: 2 }}>
                    <Box sx={{mb: {xs: 2, sm: 0}}}>
                        <Typography variant="h4" component="h1" gutterBottom>
                            {agent.name}
                            <Chip label={agent.agentType} size="small" color="secondary" variant="outlined" sx={{ ml: 1, verticalAlign: 'middle' }} />
                        </Typography>
                        {/* More header info... */}
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        {agent.projectIds?.[0] && (
                            <Button variant="contained" color="primary" component={RouterLink} to={`/project/${agent.projectIds[0]}`} startIcon={<ChatIcon />}>
                                Go to Project Chats
                            </Button>
                        )}
                        {canManageAgent && (
                            <Button variant="outlined" color="secondary" component={RouterLink} to={`/agent/${agent.id}/edit`} startIcon={<EditIcon />}>
                                Edit
                            </Button>
                        )}
                    </Box>
                </Box>

                {/* Other agent controls like clone, export, public toggle... */}
                <Divider sx={{ my: 2 }} />
                <Grid container spacing={3}>
                    <Grid item xs={12}>
                        <AgentDetailsDisplay agent={agent} model={model} />
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

            {/* AgentRunner is REMOVED. RunHistory can be kept for legacy data viewing if desired, or removed. */}
        </Container>
    );
};

export default AgentPage;