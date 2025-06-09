// src/components/agents/AgentDetailsDisplay.js
import React from 'react';
import { Typography, Paper, List, ListItem, ListItemText, Box, Chip } from '@mui/material';
import LoopIcon from '@mui/icons-material/Loop';
import { getPlatformById } from '../../constants/platformConstants'; // Kept for platform display


const AgentDetailsDisplay = ({ agent }) => {
    if (!agent) return null;

    const showParentConfigDisplay = agent.agentType === 'Agent' || agent.agentType === 'LoopAgent';
    const platformInfo = agent.platform ? getPlatformById(agent.platform) : null;

    const modelDisplay = () => {
        if (!agent.litellm_model_string) return "N/A (Model not configured)";
        let display = `LiteLLM Model String: ${agent.litellm_model_string}`;
        if (agent.litellm_api_base) {
            display += `\nAPI Base: ${agent.litellm_api_base}`;
        }
        // Avoid showing API key directly
        if (agent.litellm_api_key) {
            display += `\nAPI Key: Configured (not shown)`;
        } else if (agent.litellm_api_base) { // If api_base is set but no key for it
            display += `\nAPI Key: Not explicitly set for this base (may use environment default)`;
        }
        return display;
    };


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

            {showParentConfigDisplay && (
                <>
                    <Typography variant="subtitle1" fontWeight="medium">
                        {agent.agentType === 'LoopAgent' ? "Looped Agent Model:" : "Model:"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" paragraph sx={{wordBreak: 'break-all'}}>
                        {modelDisplay()} {/* Use new modelDisplay function */}
                    </Typography>

                    {agent.outputKey && (
                        <>
                            <Typography variant="subtitle1" fontWeight="medium">
                                {agent.agentType === 'LoopAgent' ? "Looped Agent Output Key:" : "Output Key:"}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" paragraph>
                                {agent.outputKey}
                            </Typography>
                        </>
                    )}

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

            {showParentConfigDisplay && agent.tools && agent.tools.length > 0 && (
                <>
                    <Typography variant="subtitle1" fontWeight="medium" sx={{mt: 1.5}}>
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
                <Box mt={1.5}>
                    <Typography variant="caption" color="text.secondary" fontStyle="italic">
                        (Orchestrator-level tools: {agent.tools.length}. These are typically not used by {agent.agentType}s themselves.)
                    </Typography>
                </Box>
            )}

            {(!agent.tools || agent.tools.length === 0) && showParentConfigDisplay && (
                <Typography variant="body2" color="text.secondary" sx={{mt:1.5}}>No tools configured for {agent.agentType === 'LoopAgent' ? "looped agent" : "this agent"}.</Typography>
            )}
        </>
    );
};

export default AgentDetailsDisplay;  