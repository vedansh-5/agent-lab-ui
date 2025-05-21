// src/components/agents/AgentListItem.js
import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Card, CardContent, CardActions, Typography, Button, Chip, Box } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { styled } from '@mui/material/styles';

const StyledCard = styled(Card)(({ theme }) => ({
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    height: '100%',
    transition: 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
    '&:hover': {
        transform: 'translateY(-4px)',
        boxShadow: theme.shadows[6],
    }
}));

const getStatusChipColor = (status) => {
    switch (status) {
        case 'deployed': return 'success';
        case 'deploying_initiated':
        case 'deploying_in_progress':
        case 'deploying': return 'warning'; // 'deploying' for backward compatibility if old data exists
        case 'error':
        case 'error_not_found_after_init':
        case 'error_resource_vanished':
            return 'error';
        default: return 'default';
    }
};

const AgentListItem = ({ agent }) => {
    return (
        <StyledCard>
            <CardContent>
                <Typography variant="h5" component="h2" gutterBottom noWrap title={agent.name}>
                    {agent.name}
                </Typography>
                <Box sx={{ mb: 1 }}>
                    <Chip
                        label={agent.deploymentStatus?.replace(/_/g, ' ') || 'Not Deployed'}
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
                    minHeight: '2.5em'
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
    );
};

export default AgentListItem;  