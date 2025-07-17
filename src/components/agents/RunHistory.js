// src/components/agents/RunHistory.js
import React from 'react';
import LoadingSpinner from '../common/LoadingSpinner';
import ErrorMessage from '../common/ErrorMessage';
import RunHistoryItem from './RunHistoryItem';
import { Paper, Typography, Box } from '@mui/material';

const RunHistory = ({ runs, loading, error, onSelectRun }) => {
    // This component is now fully controlled by its parent (AgentPage).
    // It receives the list of runs and loading/error states as props.

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
                        <RunHistoryItem
                            key={run.id || index}
                            run={run}
                            index={index}
                            onSelectRun={onSelectRun}
                        />
                    ))}
                </Box>
            ) : (
                <Typography color="text.secondary">No run history available for this agent.</Typography>
            )}
        </Paper>
    );
};

export default RunHistory;  