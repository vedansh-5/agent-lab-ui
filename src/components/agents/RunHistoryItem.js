// src/components/agents/RunHistoryItem.js
import React, { useState, useEffect } from 'react';
import {
    Accordion, AccordionSummary, AccordionDetails, Box, Typography, Paper, Chip,
    Alert, Button as MuiButton // Renamed to avoid conflict if you have another Button
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PageviewIcon from '@mui/icons-material/Pageview';
import Inventory2Icon from '@mui/icons-material/Inventory2';

const RunHistoryItem = ({ run, index, onSelectRun }) => {
    const [artifactSummary, setArtifactSummary] = useState('');

    useEffect(() => {
        // Now read from the clean `outputEvents` array
        const events = run.outputEvents || [];
        try {
            const updates = {};
            if (Array.isArray(events)) {
                events.forEach(event => {
                    if (event && event.actions && event.actions.artifact_delta) {
                        for (const [filename, versionInfo] of Object.entries(event.actions.artifact_delta)) {
                            let versionDisplay = versionInfo;
                            if (typeof versionInfo === 'object' && versionInfo !== null && 'version' in versionInfo) {
                                versionDisplay = versionInfo.version;
                            } else if (typeof versionInfo === 'object' && versionInfo !== null) {
                                versionDisplay = JSON.stringify(versionInfo);
                            }
                            updates[filename] = versionDisplay;
                        }
                    }
                });
            }
            if (Object.keys(updates).length > 0) {
                const summaryString = Object.entries(updates)
                    .map(([file, ver]) => `${file} (v${ver})`)
                    .join(', ');
                setArtifactSummary(summaryString);
            } else {
                setArtifactSummary('');
            }
        } catch (e) {
            console.error("Error processing events for artifact summary:", e);
            setArtifactSummary('');
        }
    }, [run.outputEvents]);

    const handleViewButtonClick = (event) => {
        event.stopPropagation(); // Prevent Accordion toggle when the button is clicked
        if (onSelectRun) {
            onSelectRun(run);
        }
    };

    return (
        <Accordion TransitionProps={{ unmountOnExit: true }}>
            <AccordionSummary
                component="div" // Key Fix: Render AccordionSummary as a div
                expandIcon={<ExpandMoreIcon />}
                aria-controls={`run-${index}-content`}
                id={`run-${index}-header`}
                sx={{ // Style the div to behave like the summary
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                    cursor: 'pointer', // Keep it feeling clickable for accordion toggle
                    // Adjust padding if necessary, as default summary padding might change
                    // '& .MuiAccordionSummary-content': { margin: '0px important!' }, // Example override
                }}
                // The Accordion's own click handler will toggle it when the div (summary) is clicked
            >
                {/* Main content of the summary */}
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        flexGrow: 1,
                        overflow: 'hidden',
                        mr: 1, // Margin for spacing before the button
                    }}
                >
                    <Typography
                        variant="subtitle1"
                        sx={{
                            flexShrink: 0,
                            mr: 2,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                        }}
                        title={run.inputMessage}
                    >
                        {run.inputMessage?.substring(0, 50)}{run.inputMessage?.length > 50 && '...'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ml: 'auto', flexShrink:0, textAlign: 'right' }}>
                        {run.timestamp?.toDate ? new Date(run.timestamp.toDate()).toLocaleString() : 'N/A'}
                    </Typography>
                </Box>

                {/* Actual MUI Button for "View" action */}
                <MuiButton
                    size="small"
                    variant="outlined"
                    onClick={handleViewButtonClick}
                    startIcon={<PageviewIcon />}
                    sx={{ ml: 1, flexShrink: 0 }} // Ensure it doesn't get squeezed
                >
                    View
                </MuiButton>
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

                {artifactSummary && (
                    <Box mt={1} mb={2}>
                        <Typography variant="overline" display="flex" alignItems="center" color="text.secondary">
                            <Inventory2Icon fontSize="inherit" sx={{mr:0.5, verticalAlign: 'middle'}} />Artifacts Updated:
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all', ml:1 }}>
                            {artifactSummary}
                        </Typography>
                    </Box>
                )}

                {run.queryErrorDetails && run.queryErrorDetails.length > 0 && (
                    <Box mt={1} mb={2}>
                        <Alert severity="warning" >
                            <Typography variant="caption" sx={{fontWeight:'bold'}}>Query Error Details:</Typography>
                            <Box component="pre" sx={{whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize:'0.8rem', maxHeight:'100px', overflowY:'auto'}}>
                                {typeof run.queryErrorDetails === 'string' ? run.queryErrorDetails : JSON.stringify(run.queryErrorDetails, null, 2)}
                            </Box>
                        </Alert>
                    </Box>
                )}

                {run.outputEvents && run.outputEvents.length > 0 && (
                    <Box>
                        <Typography variant="overline" color="text.secondary" display="block">Raw Events ({run.outputEvents.length}):</Typography>
                        <Paper variant="outlined" component="pre" sx={{ p: 1, mt: 0.5, whiteSpace: 'pre-wrap', maxHeight: 150, overflow: 'auto', fontSize: '0.75rem', bgcolor: 'background.default' }}>
                            {JSON.stringify(run.outputEvents, null, 2)}
                        </Paper>
                    </Box>
                )}
            </AccordionDetails>
        </Accordion>
    );
};

export default RunHistoryItem;  