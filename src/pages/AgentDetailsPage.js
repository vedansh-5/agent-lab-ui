// src/pages/AgentDetailsPage.js
import React, { useState, useEffect } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { getAgentDetails, getModelDetails } from '../services/firebaseService';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import AgentDetailsDisplay from '../components/agents/AgentDetailsDisplay';
import { PLATFORM_IDS, getPlatformById } from '../constants/platformConstants';

import {
    Container, Typography, Box, Paper, Grid, Button, Link as MuiLink, Alert,
    Divider, AlertTitle
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';

// A simple display for A2A Agent Card details
const A2ACardDisplay = ({ agent }) => {
    if (!agent || !agent.agentCard) return null;
    const card = agent.agentCard;

    return (
        <Paper variant="outlined" sx={{ p: 2, mt: 2, bgcolor: 'action.hover' }}>
            <Typography variant="h6" gutterBottom>A2A Agent Card</Typography>
            <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                    <Typography variant="subtitle2" color="text.secondary">Endpoint URL</Typography>
                    <MuiLink href={agent.endpointUrl} target="_blank" rel="noopener noreferrer" sx={{ wordBreak: 'break-all' }}>{agent.endpointUrl}</MuiLink>
                </Grid>
                <Grid item xs={12} sm={6}>
                    <Typography variant="subtitle2" color="text.secondary">Version</Typography>
                    <Typography>{card.version}</Typography>
                </Grid>
                <Grid item xs={12}>
                    <Typography variant="subtitle2" color="text.secondary">Description</Typography>
                    <Typography>{card.description}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                    <Typography variant="subtitle2" color="text.secondary">Input Modes</Typography>
                    <Typography>{card.defaultInputModes?.join(', ') || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                    <Typography variant="subtitle2" color="text.secondary">Output Modes</Typography>
                    <Typography>{card.defaultOutputModes?.join(', ') || 'N/A'}</Typography>
                </Grid>
                {card.skills && card.skills.length > 0 && (
                    <Grid item xs={12}>
                        <Typography variant="subtitle2" color="text.secondary">Skills</Typography>
                        <Box>
                            {card.skills.map(skill => (
                                <Alert severity="info" key={skill.id} sx={{mt: 1}}>
                                    <AlertTitle>{skill.name}</AlertTitle>
                                    <Typography variant="caption">{skill.description}</Typography>
                                </Alert>
                            ))}
                        </Box>
                    </Grid>
                )}
            </Grid>
        </Paper>
    );
};


const AgentDetailsPage = () => {
    const { agentId } = useParams();
    const { currentUser } = useAuth();
    const [agent, setAgent] = useState(null);
    const [model, setModel] = useState(null); // For Vertex agents
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!agentId) return;
        const fetchAgent = async () => {
            try {
                setLoading(true);
                const agentData = await getAgentDetails(agentId);
                setAgent(agentData);

                // If it's a Vertex agent, fetch its associated model for display
                if (agentData.platform === PLATFORM_IDS.GOOGLE_VERTEX && agentData.modelId) {
                    try {
                        const modelData = await getModelDetails(agentData.modelId);
                        setModel(modelData);
                    } catch (modelError) {
                        console.warn(`Could not fetch model details for modelId ${agentData.modelId}:`, modelError);
                        setModel(null); // Set to null if model not found
                    }
                }

            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchAgent();
    }, [agentId]);

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}><LoadingSpinner /></Box>;
    if (error) return <ErrorMessage message={error} />;
    if (!agent) return <Typography>Agent not found.</Typography>;

    const isOwner = currentUser && agent.userId === currentUser.uid;
    const platformInfo = agent.platform ? getPlatformById(agent.platform) : { name: 'Unknown' };

    const getEditLink = () => {
        if (agent.platform === PLATFORM_IDS.A2A) {
            return `/agent/${agent.id}/edit-a2a`;
        }
        return `/agent/${agent.id}/edit`;
    };

    return (
        <Container maxWidth="md">
            <Paper elevation={3} sx={{ p: { xs: 2, md: 4 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box>
                        <Typography variant="h4" component="h1">{agent.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                            Platform: {platformInfo.name} | Agent ID: {agent.id}
                        </Typography>
                    </Box>
                    {isOwner && (
                        <Button
                            variant="outlined"
                            component={RouterLink}
                            to={getEditLink()}
                            startIcon={<EditIcon />}
                        >
                            Edit
                        </Button>
                    )}
                </Box>
                <Divider sx={{ my: 2 }} />

                {agent.platform === PLATFORM_IDS.A2A ? (
                    <A2ACardDisplay agent={agent} />
                ) : (
                    <AgentDetailsDisplay agent={agent} model={model} />
                )}

            </Paper>

        </Container>
    );
};

export default AgentDetailsPage;  