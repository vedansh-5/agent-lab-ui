import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Grid, Card, CardContent, CardActions, Typography, Button, Chip, Box } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { styled } from '@mui/material/styles';

const StyledCard = styled(Card)(({ theme }) => ({
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    height: '100%', // Make cards in a row equal height if needed via Grid alignItems="stretch"
    transition: 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
    '&:hover': {
        transform: 'translateY(-4px)',
        boxShadow: theme.shadows[6],
    }
}));

const getStatusChipColor = (status) => {
    switch (status) {
        case 'deployed': return 'success';
        case 'deploying': return 'warning';
        case 'error': return 'error';
        default: return 'default';
    }
};

const AgentList = ({ agents }) => {
    return (
        <Grid container spacing={3} alignItems="stretch">
            {agents.map(agent => (
                <Grid item xs={12} sm={6} md={4} key={agent.id}>
                    <StyledCard>
                        <CardContent>
                            <Typography variant="h5" component="h2" gutterBottom noWrap title={agent.name}>
                                {agent.name}
                            </Typography>
                            <Box sx={{ mb: 1 }}>
                                <Chip
                                    label={agent.deploymentStatus?.replace('_', ' ') || 'Not Deployed'}
                                    color={getStatusChipColor(agent.deploymentStatus)}
                                    size="small"
                                />
                            </Box>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                                Type: <Typography component="span" fontWeight="medium">{agent.agentType || 'Agent'}</Typography>
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                                Model: <Typography component="span" fontWeight="medium">{agent.model || 'N/A'}</Typography>
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{
                                mb: 2,
                                display: '-webkit-box',
                                WebkitBoxOrient: 'vertical',
                                WebkitLineClamp: 2,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                minHeight: '2.5em' // approx 2 lines
                            }}>
                                {agent.description || "No description."}
                            </Typography>
                        </CardContent>
                        <CardActions sx={{ justifyContent: 'flex-end', pt: 0, px:2, pb:2 }}>
                            <Button
                                size="small"
                                variant="outlined"
                                color="primary"
                                component={RouterLink}
                                to={`/agent/${agent.id}`}
                                startIcon={<PlayArrowIcon />}
                            >
                                View / Run
                            </Button>
                            <Button
                                size="small"
                                variant="outlined"
                                color="secondary"
                                component={RouterLink}
                                to={`/agent/${agent.id}/edit`}
                                startIcon={<EditIcon />}
                            >
                                Edit
                            </Button>
                        </CardActions>
                    </StyledCard>
                </Grid>
            ))}
        </Grid>
    );
};

export default AgentList;  