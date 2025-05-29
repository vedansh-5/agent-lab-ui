// src/components/agents/ChildAgentsDisplay.js
import React from 'react';
import {
    Typography, Box, Accordion, AccordionSummary, AccordionDetails,
    List, ListItem, ListItemText, Paper, Chip
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AccountTreeIcon from '@mui/icons-material/AccountTree';

const ChildAgentsDisplay = ({ agent }) => {
    if (!agent || !['SequentialAgent', 'ParallelAgent'].includes(agent.agentType) || !agent.childAgents || agent.childAgents.length === 0) {
        return null;
    }

    let childAgentSectionTitle = "Child Agents";
    if (agent.agentType === 'SequentialAgent') childAgentSectionTitle = "Sequential Steps";
    if (agent.agentType === 'ParallelAgent') childAgentSectionTitle = "Parallel Tasks";


    return (
        <Box mt={3}>
            <Typography variant="h6" component="h3" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                <AccountTreeIcon sx={{ mr: 1 }} /> {childAgentSectionTitle} ({agent.childAgents.length})
            </Typography>
            <Box sx={{ maxHeight: '400px', overflowY: 'auto' }}>
                {agent.childAgents.map((child, index) => (
                    <Accordion key={child.name + index + (child.id || '')} sx={{ mb: 1 }} TransitionProps={{ unmountOnExit: true }}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Typography sx={{ fontWeight: 'medium' }}>{index + 1}. {child.name}</Typography>
                            <Chip label={`Model: ${child.model}`} size="small" sx={{ ml: 2 }} variant="outlined" />
                            {child.outputKey && <Chip label={`Output: ${child.outputKey}`} size="small" sx={{ ml: 1 }} variant="outlined" color="info" />}
                        </AccordionSummary>
                        <AccordionDetails sx={{ bgcolor: 'action.hover', borderTop: '1px solid', borderColor: 'divider' }}>
                            {child.description && (
                                <Typography variant="body2" color="text.secondary" paragraph>
                                    <strong>Description:</strong> {child.description}
                                </Typography>
                            )}
                            {child.outputKey && (
                                <Typography variant="body2" color="text.secondary" paragraph>
                                    <strong>Output Key:</strong> {child.outputKey}
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
                                <Typography variant="body2" color="text.secondary">No tools for this child agent/step.</Typography>
                            )}
                        </AccordionDetails>
                    </Accordion>
                ))}
            </Box>
        </Box>
    );
};

export default ChildAgentsDisplay;  