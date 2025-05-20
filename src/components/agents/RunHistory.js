import React, { useState, useEffect } from 'react';
import { getAgentRuns } from '../../services/firebaseService';
import LoadingSpinner from '../common/LoadingSpinner';
import ErrorMessage from '../common/ErrorMessage';

import {
    Paper, Typography, Accordion, AccordionSummary, AccordionDetails, Box, Chip
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

const RunHistory = ({ agentId }) => {
    const [runs, setRuns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchRuns = async () => {
            if (!agentId) return;
            try {
                setLoading(true);
                setError(null);
                const agentRuns = await getAgentRuns(agentId); // ensure this returns data sorted by timestamp desc
                setRuns(agentRuns);
            } catch (err) {
                console.error("Error fetching agent runs:", err);
                setError("Failed to load run history.");
            } finally {
                setLoading(false);
            }
        };
        fetchRuns();
    }, [agentId]);

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py:3 }}><LoadingSpinner /></Box>;
    if (error) return <ErrorMessage message={error} />;

    return (
        <Paper elevation={3} sx={{ p: { xs: 2, md: 3 }, mt: 4 }}>
            <Typography variant="h5" component="h2" gutterBottom>
                Run History
            </Typography>
            {runs.length > 0 ? (
                <Box sx={{ maxHeight: '500px', overflowY: 'auto' }}>
                    {runs.map((run, index) => (
                        <Accordion key={run.id || index} TransitionProps={{ unmountOnExit: true }}>
                            <AccordionSummary
                                expandIcon={<ExpandMoreIcon />}
                                aria-controls={`run-${index}-content`}
                                id={`run-${index}-header`}
                            >
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                    <Typography variant="subtitle1" sx={{ flexShrink: 0, mr: 2 }}>
                                        {run.inputMessage?.substring(0, 50)}{run.inputMessage?.length > 50 && '...'}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
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
                                            color: 'common.black' // Ensure readability in dark mode
                                        }}>
                                            {JSON.stringify(JSON.parse(run.outputEventsRaw), null, 2)}
                                        </Paper>
                                    </Box>
                                )}
                            </AccordionDetails>
                        </Accordion>
                    ))}
                </Box>
            ) : (
                <Typography color="text.secondary">No run history available for this agent.</Typography>
            )}
        </Paper>
    );
};

export default RunHistory;  