// src/components/agents/RunHistoryItem.js
import React, { useState, useEffect } from 'react';
import {
    Accordion, AccordionSummary, AccordionDetails, Box, Typography, Paper, Chip,
    Alert, AlertTitle
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PageviewIcon from '@mui/icons-material/Pageview';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import Inventory2Icon from '@mui/icons-material/Inventory2'; // For artifacts

const RunHistoryItem = ({ run, index, onSelectRun }) => {
    const [artifactSummary, setArtifactSummary] = useState('');

    useEffect(() => {
        if (run.outputEventsRaw) {
            try {
                const events = JSON.parse(run.outputEventsRaw);
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
                console.error("Error parsing events for artifact summary:", e);
                setArtifactSummary('');
            }
        }
    }, [run.outputEventsRaw]);


    const handleViewInRunner = (event) => {
        event.stopPropagation(); // Prevent Accordion toggle if not desired
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
                <Box
                    onClick={handleViewInRunner}
                    sx={{
                        display: 'inline-flex', alignItems: 'center', cursor: 'pointer', color: 'primary.main',
                        border: '1px solid', borderColor: 'primary.main', borderRadius: 1,
                        px: 1.5, py: 0.5, ml: 1, flexShrink: 0, fontSize: '0.8125rem',
                        '&:hover': { bgcolor: 'primary.action.hover' }
                    }}
                    role="button" tabIndex={0}
                    onKeyPress={(e) => { if (e.key === 'Enter' || e.key === ' ') handleViewInRunner(e); }}
                >
                    <PageviewIcon sx={{ mr: 0.5, fontSize: '1.125rem' }} />
                    <Typography variant="button" sx={{ lineHeight: 'inherit', fontSize: 'inherit' }}>View</Typography>
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
                        {run.finalResponseText || "No final text response recorded."}
                    </Paper>
                </Box>

                {/* Display Artifact Summary */}
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
                        <Alert /* ... existing error alert props ... */ >
                            {/* ... existing error alert content ... */}
                        </Alert>
                    </Box>
                )}

                {run.outputEventsRaw && (
                    <Box>
                        <Typography /* ... existing raw events props ... */ >Raw Events ({JSON.parse(run.outputEventsRaw)?.length || 0}):</Typography>
                        <Paper /* ... existing raw events paper props ... */ >
                            {JSON.stringify(JSON.parse(run.outputEventsRaw), null, 2)}
                        </Paper>
                    </Box>
                )}
            </AccordionDetails>
        </Accordion>
    );
};

export default RunHistoryItem;  