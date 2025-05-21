// src/components/agents/DeploymentControls.js
import React from 'react';
import {
    Typography, Box, Button, IconButton, Tooltip, Alert, AlertTitle,
    CircularProgress, Stack
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import AutorenewIcon from '@mui/icons-material/Autorenew';


const getStatusIconAndColor = (deploymentStatus, isPollingActive) => {
    if (!deploymentStatus) return { icon: <CloudOffIcon color="disabled" />, color: 'text.disabled', text: 'Unknown' };

    switch (deploymentStatus) {
        case 'deployed': return { icon: <CheckCircleIcon color="success" />, color: 'success.main', text: 'Deployed' };
        case 'deploying_initiated': return { icon: <HourglassEmptyIcon color="info" className={isPollingActive ? "animate-pulse" : ""} />, color: 'info.main', text: 'Deployment Initiated' };
        case 'deploying_in_progress': return { icon: <AutorenewIcon color="info" className="animate-spin" />, color: 'info.main', text: 'Deployment In Progress' };
        case 'error': return { icon: <ErrorIcon color="error" />, color: 'error.main', text: 'Deployment Error' };
        case 'error_not_found_after_init': return { icon: <ErrorOutlineIcon color="error" />, color: 'error.main', text: 'Error: Engine Not Found Post-Init' };
        case 'error_resource_vanished': return { icon: <CloudOffIcon color="error" />, color: 'error.main', text: 'Error: Deployed Resource Vanished' };
        case 'not_found_on_vertex': return { icon: <CloudOffIcon color="action" />, color: 'text.secondary', text: 'Not Found on Vertex' };
        default:
            if (deploymentStatus.startsWith('unknown_vertex_state_')) {
                const subState = deploymentStatus.substring('unknown_vertex_state_'.length).replace(/_/g, ' ').toUpperCase();
                return { icon: <HelpOutlineIcon color="action" />, color: 'text.secondary', text: `Vertex State: ${subState}` };
            }
            const formattedStatus = deploymentStatus.replace(/_/g, ' ')
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
            return { icon: <CloudOffIcon color="disabled" />, color: 'text.disabled', text: formattedStatus || 'Not Deployed' };
    }
};

const DeploymentControls = ({
                                agent,
                                isDeploying,
                                isDeleting,
                                isCheckingStatus,
                                pollingIntervalId,
                                onDeploy,
                                onDeleteDeployment,
                                onManualStatusRefresh,
                                isLoadingPage // To disable buttons while main page is loading
                            }) => {
    if (!agent) return null;

    const statusInfo = getStatusIconAndColor(agent.deploymentStatus, !!pollingIntervalId);
    const canAttemptDeploy = !['deploying_initiated', 'deploying_in_progress', 'deployed'].includes(agent.deploymentStatus);
    const canDeleteDeployment = agent.vertexAiResourceName && !['deploying_initiated', 'deploying_in_progress'].includes(agent.deploymentStatus);
    const isDeploymentProcessActive = ['deploying_initiated', 'deploying_in_progress'].includes(agent.deploymentStatus);

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="h6" component="h3">Deployment Status</Typography>
                <Tooltip title="Refresh Status Now">
                    <span>
                        <IconButton onClick={onManualStatusRefresh} size="small" disabled={isLoadingPage || isCheckingStatus || isDeploying || isDeleting}>
                            {isCheckingStatus ? <CircularProgress size={20} /> : <RefreshIcon />}
                        </IconButton>
                    </span>
                </Tooltip>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                {statusInfo.icon}
                <Typography variant="body1" fontWeight="medium" color={statusInfo.color}>
                    {statusInfo.text}
                    {!!pollingIntervalId && <CircularProgress size={14} sx={{ ml: 1 }} color="inherit" />}
                </Typography>
            </Box>

            {agent.vertexAiResourceName && (<Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>Resource: {agent.vertexAiResourceName}</Typography>)}

            {agent.lastDeployedAt?.toDate && agent.deploymentStatus === 'deployed' && (
                <Typography variant="caption" color="text.secondary" display="block" sx={{mb:1}}>
                    Deployed At: {new Date(agent.lastDeployedAt.toDate()).toLocaleString()}
                </Typography>
            )}

            {agent.lastDeploymentAttemptAt?.toDate && (agent.deploymentStatus !== 'deployed' || !agent.lastDeployedAt) && (
                <Typography variant="caption" color="text.secondary" display="block" sx={{mb:1}}>
                    Last Attempt: {new Date(agent.lastDeploymentAttemptAt.toDate()).toLocaleString()}
                </Typography>
            )}


            {agent.deploymentStatus?.includes('error') && agent.deploymentError && (
                <Alert severity="error" sx={{ my: 1 }}>
                    <AlertTitle>Deployment Error Details</AlertTitle>
                    {agent.deploymentError}
                </Alert>
            )}

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mt={2}>
                {canAttemptDeploy && (
                    <Button
                        variant="contained"
                        color={agent.deploymentStatus?.includes('error') ? "warning" : "success"}
                        onClick={onDeploy}
                        disabled={isLoadingPage || isDeploying || isCheckingStatus || isDeleting}
                        startIcon={isDeploying ? <CircularProgress size={20} color="inherit" /> : <CloudUploadIcon />}
                    >
                        {isDeploying ? 'Initiating...' : (agent.deploymentStatus?.includes('error') ? 'Retry Deployment' : 'Deploy to Vertex AI')}
                    </Button>
                )}
                {canDeleteDeployment && (
                    <Button
                        variant="contained"
                        color="error"
                        onClick={onDeleteDeployment}
                        disabled={isLoadingPage || isDeleting || isCheckingStatus || isDeploying}
                        startIcon={isDeleting ? <CircularProgress size={20} color="inherit" /> : <DeleteForeverIcon />}
                    >
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
    );
};

export default DeploymentControls;