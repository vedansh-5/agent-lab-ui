import React, { useState, useRef, useEffect } from 'react';
import { queryAgent } from '../../services/agentService';
import ErrorMessage from '../common/ErrorMessage'; // Already MUI-fied

import {
    Paper, Typography, TextField, Button, Box, List, ListItem,
    ListItemText, Avatar, CircularProgress, IconButton
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy'; // Icon for agent
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import RestartAltIcon from '@mui/icons-material/RestartAlt'; // Icon for reset session

const AgentRunner = ({ agentResourceName, agentFirestoreId, adkUserId }) => {
    const [message, setMessage] = useState('');
    const [conversation, setConversation] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [currentSessionId, setCurrentSessionId] = useState(null);
    const conversationEndRef = useRef(null);

    const scrollToBottom = () => {
        conversationEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [conversation]);

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!message.trim()) return;

        const userMessage = { type: 'user', text: message, timestamp: new Date() };
        setConversation(prev => [...prev, userMessage]);
        const currentInput = message;
        setMessage('');
        setIsLoading(true);
        setError(null);

        try {
            const result = await queryAgent(agentResourceName, currentInput, adkUserId, currentSessionId, agentFirestoreId);
            if (result.success) {
                const agentResponse = {
                    type: 'agent',
                    text: result.responseText || "Agent responded.",
                    events: result.events,
                    timestamp: new Date()
                };
                setConversation(prev => [...prev, agentResponse]);
                if (result.adkSessionId) { // Ensure backend returns adkSessionId
                    setCurrentSessionId(result.adkSessionId);
                }
            } else {
                setError(result.message || "Agent query failed.");
                const errorResponse = { type: 'error', text: result.message || "Failed to get response", timestamp: new Date() };
                setConversation(prev => [...prev, errorResponse]);
            }
        } catch (err) {
            console.error("Error querying agent:", err);
            const errorMessage = err.message || "An error occurred while querying the agent.";
            setError(errorMessage);
            const errorResponse = { type: 'error', text: errorMessage, timestamp: new Date() };
            setConversation(prev => [...prev, errorResponse]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleResetSession = () => {
        setCurrentSessionId(null);
        setConversation([]); // Optionally clear conversation
        setError(null);
        // Optionally, show a Snackbar confirmation
        // alert("Session reset. The next message will start a new conversation.");
    };

    const getAvatar = (type) => {
        if (type === 'user') return <Avatar sx={{ bgcolor: 'primary.main' }}><PersonIcon /></Avatar>;
        if (type === 'agent') return <Avatar sx={{ bgcolor: 'secondary.main' }}><SmartToyIcon /></Avatar>;
        return <Avatar sx={{ bgcolor: 'error.main' }}><ErrorOutlineIcon /></Avatar>;
    };

    return (
        <Paper elevation={3} sx={{ p: { xs: 2, md: 3 }, mt: 4 }}>
            <Typography variant="h5" component="h2" gutterBottom>
                Run Agent
            </Typography>

            <Box
                sx={{
                    height: '400px',
                    overflowY: 'auto',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    p: 2,
                    mb: 2,
                    bgcolor: 'background.paper',
                }}
            >
                <List>
                    {conversation.map((entry, index) => (
                        <ListItem key={index} sx={{
                            display: 'flex',
                            flexDirection: entry.type === 'user' ? 'row-reverse' : 'row',
                            mb: 1,
                        }}>
                            {getAvatar(entry.type)}
                            <Paper
                                elevation={1}
                                sx={{
                                    p: 1.5,
                                    ml: entry.type !== 'user' ? 1.5 : 0,
                                    mr: entry.type === 'user' ? 1.5 : 0,
                                    bgcolor: entry.type === 'user' ? 'primary.light' :
                                        entry.type === 'agent' ? 'grey.200' :
                                            'error.light',
                                    color: entry.type === 'user' ? 'primary.contrastText' :
                                        entry.type === 'agent' ? 'text.primary' :
                                            'error.contrastText',
                                    maxWidth: '75%',
                                    wordBreak: 'break-word',
                                }}
                            >
                                <ListItemText
                                    primary={<Typography variant="body1">{entry.text}</Typography>}
                                    secondary={<Typography variant="caption" sx={{ display: 'block', textAlign: entry.type === 'user' ? 'right' : 'left', mt: 0.5 }}>
                                        {new Date(entry.timestamp).toLocaleTimeString()}
                                        {entry.type === 'agent' && currentSessionId && ` (S: ...${currentSessionId.slice(-4)})`}
                                    </Typography>}
                                />
                            </Paper>
                        </ListItem>
                    ))}
                    {isLoading && (
                        <ListItem sx={{ justifyContent: 'flex-start', mb: 1 }}>
                            <Avatar sx={{ bgcolor: 'secondary.main' }}><SmartToyIcon /></Avatar>
                            <Paper elevation={1} sx={{ p: 1.5, ml: 1.5, bgcolor: 'grey.200', display: 'inline-flex', alignItems: 'center' }}>
                                <CircularProgress size={20} sx={{ mr: 1 }} />
                                <Typography variant="body2" color="text.secondary">Agent is thinking...</Typography>
                            </Paper>
                        </ListItem>
                    )}
                    <div ref={conversationEndRef} />
                </List>
            </Box>

            {error && <ErrorMessage message={error} sx={{ mb: 2 }} />}

            <Box component="form" onSubmit={handleSendMessage} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TextField
                    fullWidth
                    variant="outlined"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Type your message to the agent..."
                    disabled={isLoading}
                    onKeyPress={(e) => { if (e.key === 'Enter' && !e.shiftKey) handleSendMessage(e);}}
                    size="small"
                />
                <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    disabled={isLoading || !message.trim()}
                    endIcon={<SendIcon />}
                    sx={{ height: '100%' }} // Match TextField height
                >
                    Send
                </Button>
                {currentSessionId && (
                    <IconButton
                        onClick={handleResetSession}
                        title="Reset Conversation Session"
                        color="warning"
                        disabled={isLoading}
                    >
                        <RestartAltIcon />
                    </IconButton>
                )}
            </Box>
        </Paper>
    );
};

export default AgentRunner;  