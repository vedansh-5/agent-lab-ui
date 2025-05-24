// src/components/agents/RunHistoryItem.js
import React from 'react';
import {
    Accordion, AccordionSummary, AccordionDetails, Box, Typography, Paper, Chip, Button
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PageviewIcon from '@mui/icons-material/Pageview'; // Icon for "View in Runner"

const RunHistoryItem = ({ run, index, onSelectRun }) => { // Added onSelectRun prop
    const handleViewInRunner = (event) => {
        event.stopPropagation(); // Prevent accordion from toggling if button is inside summary
        if (onSelectRun) {
            onSelectRun(run);
        }
    };

    return (
        <Accordion TransitionProps={{ unmountOnExit: true }}>
            <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                aria-controls={`run-${index}-content`}
                id={`run-${index}-header`}
                sx={{
                    '& .MuiAccordionSummary-content': { // Target the content area for better spacing
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        width: '100%'
                    }
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1, overflow: 'hidden', mr: 1 }}>
                    <Typography variant="subtitle1" sx={{ flexShrink: 0, mr: 2,  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {run.inputMessage?.substring(0, 50)}{run.inputMessage?.length > 50 && '...'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ml: 'auto', flexShrink:0, textAlign: 'right' }}>
                        {run.timestamp?.toDate ? new Date(run.timestamp.toDate()).toLocaleString() : 'N/A'}
                    </Typography>
                </Box>
                <Button
                    size="small"
                    variant="outlined"
                    onClick={handleViewInRunner}
                    startIcon={<PageviewIcon />}
                    sx={{ ml: 1, flexShrink: 0 }}
                >
                    View
                </Button>
            </AccordionSummary>
            <AccordionDetails sx={{ bgcolor: 'action.hover' }}>
                <Typography variant="caption" display="block" gutterBottom>
                    Run ID: {run.id}
                    {run.adkSessionId && <Chip label={`Session: ...${run.adkSessionId.slice(-6)}`} size="small" sx={{ml:1}}/>}
                </Typography>
                <Box mb={2}>
                    <Typography variant="overline" display="block" color="text.secondary">User Input:</Typography>
                    <Paper variant="outlined" sx={{ p: 1.5, whiteSpace: 'pre-wrap', bgcolor: 'background.default' }}>
                        {run.inputMessage}
                    </Paper>
                </Box>
                <Box mb={2}>
                    <Typography variant="overline" display="block" color="text.secondary">Agent Response:</Typography>
                    <Paper variant="outlined" sx={{ p: 1.5, whiteSpace: 'pre-wrap', bgcolor: 'background.default' }}>
                        {run.finalResponseText || "No final text response."}
                    </Paper>
                </Box>
                {run.outputEventsRaw && (
                    <Box>
                        <Typography variant="overline" display="block" color="text.secondary">Raw Events ({JSON.parse(run.outputEventsRaw)?.length || 0}):</Typography>
                        <Paper component="pre" variant="outlined" sx={{
                            p: 1.5,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                            maxHeight: '200px',
                            overflowY: 'auto',
                            fontSize: '0.75rem',
                            bgcolor: 'grey.100',
                            color: 'common.black'
                        }}>
                            {JSON.stringify(JSON.parse(run.outputEventsRaw), null, 2)}
                        </Paper>
                    </Box>
                )}
            </AccordionDetails>
        </Accordion>
    );
};

export default RunHistoryItem;  