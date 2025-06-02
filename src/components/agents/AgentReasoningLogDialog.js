// src/components/agents/AgentReasoningLogDialog.js
import React from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    Typography, Accordion, AccordionSummary, AccordionDetails, Box, Chip, Paper
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { muiMarkdownComponentsConfig } from '../common/MuiMarkdownComponents';

const EventContentDisplay = ({ content }) => {
    if (content === null || content === undefined) return <Typography variant="caption" color="text.secondary">No content</Typography>;

    if (typeof content === 'string') {
        return <ReactMarkdown components={muiMarkdownComponentsConfig} remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>;
    }

    if (content.parts && Array.isArray(content.parts)) {
        return (
            <Box>
                {content.parts.map((part, idx) => (
                    <Paper variant="outlined" sx={{ p: 1, my: 0.5, bgcolor: 'action.hover' }} key={idx}>
                        {Object.entries(part).map(([key, value]) => (
                            <Box key={key} mb={0.5}>
                                <Typography variant="caption" fontWeight="bold" display="block" sx={{textTransform: 'capitalize'}}>{key.replace(/_/g, ' ')}:</Typography>
                                {typeof value === 'string' ? (
                                    <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{value}</Typography>
                                ) : (
                                    <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                        {JSON.stringify(value, null, 2)}
                                    </Typography>
                                )}
                            </Box>
                        ))}
                    </Paper>
                ))}
            </Box>
        );
    }
    return (
        <Typography component="pre" variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', bgcolor: 'action.hover', p:1, borderRadius:1 }}>
            {JSON.stringify(content, null, 2)}
        </Typography>
    );
};

// New component to display event actions
const EventActionsDisplay = ({ actions }) => {
    if (!actions || Object.keys(actions).length === 0) {
        return null;
    }

    // Destructure known ADK EventActions fields
    const { state_delta, artifact_delta, skip_summarization, transfer_to_agent, escalate, requested_auth_configs } = actions;

    // Determine if there's anything to display
    const hasStateDelta = state_delta && Object.keys(state_delta).length > 0;
    const hasArtifactDelta = artifact_delta && Object.keys(artifact_delta).length > 0;
    const hasAuthConfigs = requested_auth_configs && Object.keys(requested_auth_configs).length > 0;

    if (!hasStateDelta && !hasArtifactDelta && !skip_summarization && !transfer_to_agent && !escalate && !hasAuthConfigs) {
        return null; // Nothing relevant to display from actions
    }

    return (
        <Paper variant="outlined" sx={{ p: 1.5, mt: 1, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.800' : 'grey.50' }}>
            <Typography variant="subtitle2" gutterBottom fontWeight="bold" sx={{ color: 'text.secondary' }}>
                Actions Triggered:
            </Typography>
            {hasStateDelta && (
                <Box mb={1}>
                    <Typography variant="caption" display="block" fontWeight="medium">State Delta:</Typography>
                    <Typography component="pre" variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '0.75rem', bgcolor: 'action.hover', p: 0.5, borderRadius: 1 }}>
                        {JSON.stringify(state_delta, null, 2)}
                    </Typography>
                </Box>
            )}
            {hasArtifactDelta && (
                <Box mb={1}>
                    <Typography variant="caption" display="block" fontWeight="medium">Artifact Delta:</Typography>
                    {Object.entries(artifact_delta).map(([filename, version]) => (
                        <Typography key={filename} variant="body2" sx={{fontSize: '0.75rem', ml:1}}>
                            - {filename}: version {typeof version === 'object' ? JSON.stringify(version) : version}
                        </Typography>
                    ))}
                </Box>
            )}
            {skip_summarization && <Typography variant="body2" sx={{fontSize: '0.75rem'}}>- Skip Summarization: True</Typography>}
            {transfer_to_agent && <Typography variant="body2" sx={{fontSize: '0.75rem'}}>- Transfer to Agent: {transfer_to_agent}</Typography>}
            {escalate && <Typography variant="body2" sx={{fontSize: '0.75rem'}}>- Escalate: True</Typography>}
            {hasAuthConfigs && (
                <Box mt={1}>
                    <Typography variant="caption" display="block" fontWeight="medium">Requested Auth Configs:</Typography>
                    <Typography component="pre" variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '0.75rem', bgcolor: 'action.hover', p: 0.5, borderRadius: 1 }}>
                        {JSON.stringify(requested_auth_configs, null, 2)}
                    </Typography>
                </Box>
            )}
        </Paper>
    );
};


const AgentReasoningLogDialog = ({ open, onClose, events }) => {
    if (!events || events.length === 0) {
        return (
            <Dialog open={open} onClose={onClose} maxWidth="sm">
                <DialogTitle>Agent Reasoning Log</DialogTitle>
                <DialogContent>
                    <Typography>No events to display for this turn.</Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={onClose}>Close</Button>
                </DialogActions>
            </Dialog>
        );
    }

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper">
            <DialogTitle>Agent Reasoning Log ({events.length} {events.length === 1 ? 'event' : 'events'})</DialogTitle>
            <DialogContent dividers>
                {events.map((event, index) => (
                    <Accordion key={event.id || index} sx={{ mb: 1 }} TransitionProps={{ unmountOnExit: true }}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Typography sx={{ width: {xs: '40%', sm:'33%'}, flexShrink: 0 }}>
                                Event {index + 1} ({event.author || 'System'})
                            </Typography>
                            <Typography sx={{ color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                Type: <Chip label={event.type || "Unknown"} size="small" variant="outlined" />
                                {event.partial && <Chip label="Partial" size="small" sx={{ml:0.5}} color="info" variant="outlined" />}
                                {event.turn_complete && <Chip label="Turn Complete" size="small" sx={{ml:0.5}} color="success" variant="outlined" />}

                            </Typography>
                        </AccordionSummary>
                        <AccordionDetails sx={{ bgcolor: 'background.default', borderTop: '1px solid', borderColor: 'divider' }}>
                            <EventContentDisplay content={event.content} />
                            <EventActionsDisplay actions={event.actions} /> {/* Display actions here */}
                        </AccordionDetails>
                    </Accordion>
                ))}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    );
};

export default AgentReasoningLogDialog;  