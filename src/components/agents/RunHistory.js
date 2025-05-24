// src/components/agents/RunHistory.js
import React, { useState, useEffect } from 'react';
import { getAgentRuns } from '../../services/firebaseService';
import LoadingSpinner from '../common/LoadingSpinner';
import ErrorMessage from '../common/ErrorMessage';
import RunHistoryItem from './RunHistoryItem';
import { Paper, Typography, Box } from '@mui/material';

const RunHistory = ({ agentId, onSelectRun }) => { // Added onSelectRun prop
    const [runs, setRuns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchRuns = async () => {
            if (!agentId) return;
            try {
                setLoading(true);
                setError(null);
                const agentRuns = await getAgentRuns(agentId);
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
                        <RunHistoryItem
                            key={run.id || index}
                            run={run}
                            index={index}
                            onSelectRun={onSelectRun} // Pass down the callback
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