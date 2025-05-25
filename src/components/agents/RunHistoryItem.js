// src/components/agents/RunHistoryItem.js
import React from 'react';
import {
    Accordion, AccordionSummary, AccordionDetails, Box, Typography, Paper, Chip, Button,
    Alert, AlertTitle
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PageviewIcon from '@mui/icons-material/Pageview';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

const RunHistoryItem = ({ run, index, onSelectRun }) => {
    const handleViewInRunner = (event) => {
        event.stopPropagation();
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
                    '& .MuiAccordionSummary-content': {
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        width: '100%'
                    }
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1, overflow: 'hidden', mr: 1 }}>
                    <Typography variant="subtitle1" sx={{ flexShrink: 0, mr: 2,  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={run.inputMessage}>
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
                        {run.finalResponseText || "No final text response recorded."}
                    </Paper>
                </Box>

                {run.queryErrorDetails && run.queryErrorDetails.length > 0 && (
                    <Box mt={1} mb={2}>
                        <Alert
                            severity="warning"
                            sx={{ fontSize: '0.8rem', '& .MuiAlert-icon': {fontSize: '1.1rem', mr:0.5} }}
                            iconMapping={{ warning: <ErrorOutlineIcon fontSize="inherit" /> }}
                        >
                            <AlertTitle sx={{ fontSize: '0.9rem', fontWeight: 'bold', mb:0.5 }}>Diagnostics During Run:</AlertTitle>
                            <Box component="ul" sx={{ margin: 0, paddingLeft: '20px', listStyleType: 'disc', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight:'200px', overflowY:'auto' }}>
                                {run.queryErrorDetails.map((err, i) => (
                                    <Typography component="li" variant="caption" key={i} sx={{display:'list-item'}}>{typeof err === 'object' ? JSON.stringify(err) : err}</Typography>
                                ))}
                            </Box>
                        </Alert>
                    </Box>
                )}

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