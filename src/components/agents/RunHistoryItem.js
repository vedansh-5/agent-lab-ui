// src/components/agents/RunHistoryItem.js
import React from 'react';
import {
    Accordion, AccordionSummary, AccordionDetails, Box, Typography, Paper, Chip
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

const RunHistoryItem = ({ run, index }) => {
    return (
        <Accordion TransitionProps={{ unmountOnExit: true }}>
            <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                aria-controls={`run-${index}-content`}
                id={`run-${index}-header`}
            >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                    <Typography variant="subtitle1" sx={{ flexShrink: 0, mr: 2,  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {run.inputMessage?.substring(0, 50)}{run.inputMessage?.length > 50 && '...'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ml:1, flexShrink:0}}>
                        {run.timestamp?.toDate ? new Date(run.timestamp.toDate()).toLocaleString() : 'N/A'}
                    </Typography>
                </Box>
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