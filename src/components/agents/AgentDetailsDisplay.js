// src/components/agents/AgentDetailsDisplay.js
import React from 'react';
import { Typography, Paper, List, ListItem, ListItemText, Box, Chip } from '@mui/material';
import LoopIcon from '@mui/icons-material/Loop';
import { getPlatformById } from '../../constants/platformConstants';
import { Link as RouterLink } from 'react-router-dom';

const AgentDetailsDisplay = ({ agent, model }) => { // Now accepts model object
    if (!agent) return null;

    const showParentConfigDisplay = agent.agentType === 'Agent' || agent.agentType === 'LoopAgent';
    const platformInfo = agent.platform ? getPlatformById(agent.platform) : null;

    return (
        <>
            {platformInfo && (
                <Typography
                    variant="body2"
                    color="text.secondary"
                    component="div"
                    sx={{ mb: 1.5, display: 'flex', alignItems: 'center' }}
                >
                    Platform:&nbsp;
                    <Chip label={platformInfo.name} size="small" variant="outlined" />
                </Typography>
            )}

            <Typography variant="subtitle1" fontWeight="medium">Description:</Typography>
            <Typography variant="body2" color="text.secondary" paragraph>{agent.description || "N/A"}</Typography>

            {showParentConfigDisplay && model && (
                <>
                    <Typography variant="subtitle1" fontWeight="medium">
                        Model Configuration:
                    </Typography>
                    <Paper variant="outlined" sx={{ p: 1.5, my: 1, bgcolor: 'action.hover' }}>
                        <Typography variant="body2" component={RouterLink} to={`/model/${model.id}`} sx={{fontWeight: 'bold', textDecoration: 'none'}}>{model.name}</Typography>
                        <Typography variant="caption" display="block">Provider: {model.provider} | Name: {model.modelString}</Typography>
                        <Typography variant="caption" display="block">Temperature: {model.temperature}</Typography>
                        <Typography variant="body2" sx={{mt: 1, whiteSpace: 'pre-wrap', maxHeight: 100, overflow: 'auto'}}>
                            <strong>System Prompt:</strong> {model.systemInstruction || "N/A"}
                        </Typography>
                    </Paper>
                </>
            )}

            {showParentConfigDisplay && !model && (
                <Typography color="error.main">Model details could not be loaded.</Typography>
            )}

            {agent.outputKey && (
                <>
                    <Typography variant="subtitle1" fontWeight="medium">Output Key:</Typography>
                    <Typography variant="body2" color="text.secondary" paragraph>{agent.outputKey}</Typography>
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

            {showParentConfigDisplay && agent.tools && agent.tools.length > 0 && (
                <>
                    <Typography variant="subtitle1" fontWeight="medium" sx={{mt: 1.5}}>Tools:</Typography>
                    <List dense disablePadding sx={{ maxHeight: 180, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 0.5, mt: 0.5 }}>
                        {agent.tools.map((tool, idx) => (
                            <ListItem key={tool.id || idx} disableGutters sx={{ py: 0.2 }}>
                                <ListItemText primary={tool.name} secondary={tool.id} primaryTypographyProps={{ variant: 'body2' }} secondaryTypographyProps={{ variant: 'caption' }} />
                            </ListItem>
                        ))}
                    </List>
                </>
            )}

            {(!agent.tools || agent.tools.length === 0) && showParentConfigDisplay && (
                <Typography variant="body2" color="text.secondary" sx={{mt:1.5}}>No tools configured for this agent.</Typography>
            )}
        </>
    );
};

export default AgentDetailsDisplay;  