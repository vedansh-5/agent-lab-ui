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

    // If content is a string, display it (possibly as Markdown if applicable)
    if (typeof content === 'string') {
        return <ReactMarkdown components={muiMarkdownComponentsConfig} remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>;
    }

    // If content has 'parts', iterate through them
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

    // Default: Pretty print JSON for other object structures
    return (
        <Typography component="pre" variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', bgcolor: 'action.hover', p:1, borderRadius:1 }}>
            {JSON.stringify(content, null, 2)}
        </Typography>
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
                    <Accordion key={index} sx={{ mb: 1 }} TransitionProps={{ unmountOnExit: true }}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Typography sx={{ width: {xs: '40%', sm:'33%'}, flexShrink: 0 }}>
                                Event {index + 1}
                            </Typography>
                            <Typography sx={{ color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                Type: <Chip label={event.type || "Unknown"} size="small" variant="outlined" />
                            </Typography>
                        </AccordionSummary>
                        <AccordionDetails sx={{ bgcolor: 'background.default', borderTop: '1px solid', borderColor: 'divider' }}>
                            <EventContentDisplay content={event.content} />
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