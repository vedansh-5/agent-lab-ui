import React, { useState, useEffect } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getUserAgents } from '../services/firebaseService';
import AgentList from '../components/agents/AgentList'; // This will also need refactoring
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';

import { Box, Typography, Button, Container, Fab, Paper } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';

const DashboardPage = () => {
    const { currentUser } = useAuth();
    const [agents, setAgents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (currentUser) {
            const fetchAgents = async () => {
                try {
                    setLoading(true);
                    setError(null);
                    const userAgents = await getUserAgents(currentUser.uid);
                    setAgents(userAgents);
                } catch (err) {
                    console.error("Error fetching agents:", err);
                    setError("Failed to load your agents. Please try again.");
                } finally {
                    setLoading(false);
                }
            };
            fetchAgents();
        }
    }, [currentUser]);

    if (loading) return <Box display="flex" justifyContent="center" py={5}><LoadingSpinner /></Box>;
    // ErrorMessage is already MUI-styled

    return (
        <Container maxWidth="lg">
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
                <Typography variant="h4" component="h1" gutterBottom>
                    Your Agents
                </Typography>
                <Button
                    variant="contained"
                    color="primary"
                    component={RouterLink}
                    to="/create-agent"
                    startIcon={<AddIcon />}
                >
                    Create New Agent
                </Button>
            </Box>

            {error && <ErrorMessage message={error} />}


            {agents.length > 0 ? (
                <AgentList agents={agents} />
            ) : (
                !error && ( // Only show this if no error and no agents
                    <Paper elevation={0} sx={{ p:3, textAlign: 'center', backgroundColor: 'background.default' }}>
                        <Typography variant="h6" color="text.secondary" gutterBottom>
                            You haven't created any agents yet.
                        </Typography>
                        <Button
                            variant="outlined"
                            color="secondary"
                            component={RouterLink}
                            to="/create-agent"
                        >
                            Create one now!
                        </Button>
                    </Paper>
                )
            )}
            {/* Floating Action Button for smaller screens or alternative */}
            <Fab
                color="primary"
                aria-label="add agent"
                component={RouterLink}
                to="/create-agent"
                sx={{
                    position: 'fixed',
                    bottom: (theme) => theme.spacing(3),
                    right: (theme) => theme.spacing(3),
                    display: { xs: 'flex', md: 'none' } // Show only on smaller screens
                }}
            >
                <AddIcon />
            </Fab>
        </Container>
    );
};

export default DashboardPage;