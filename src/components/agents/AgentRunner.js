// src/components/agents/AgentRunner.js
import React, { useState, useRef, useEffect } from 'react';
import { queryAgent } from '../../services/agentService';
import ErrorMessage from '../common/ErrorMessage';
import AgentReasoningLogDialog from './AgentReasoningLogDialog';
import { muiMarkdownComponentsConfig } from '../common/MuiMarkdownComponents';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import {
    Paper, Typography, TextField, Button, Box, List, ListItem,
    ListItemText, Avatar, CircularProgress, IconButton, Tooltip, Alert
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import DeveloperModeIcon from '@mui/icons-material/DeveloperMode';
import LiveTvIcon from '@mui/icons-material/LiveTv'; // Icon for "Back to Live Chat"

const AgentRunner = ({
                         agentResourceName,
                         agentFirestoreId,
                         adkUserId,
                         historicalRunData, // New prop
                         onSwitchToLiveChat, // New prop
                         isLiveModeEnabled // New prop
                     }) => {
    const [message, setMessage] = useState('');
    const [conversation, setConversation] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [currentSessionId, setCurrentSessionId] = useState(null); // For live chat
    const conversationEndRef = useRef(null);

    const [isReasoningLogOpen, setIsReasoningLogOpen] = useState(false);
    const [selectedEventsForLog, setSelectedEventsForLog] = useState([]);

    const isHistoricalView = !!historicalRunData;

    const scrollToBottom = () => {
        conversationEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [conversation]);

    // Effect to load historical data when prop changes
    useEffect(() => {
        if (isHistoricalView && historicalRunData) {
            const historicalConversation = [];
            // User message
            historicalConversation.push({
                type: 'user',
                text: historicalRunData.inputMessage,
                timestamp: historicalRunData.timestamp?.toDate ? historicalRunData.timestamp.toDate() : new Date(),
            });
            // Agent response
            let agentEvents = [];
            try {
                agentEvents = historicalRunData.outputEventsRaw ? JSON.parse(historicalRunData.outputEventsRaw) : [];
            } catch (parseError) {
                console.error("Error parsing historical run events:", parseError);
                agentEvents = [{type: "error", content: "Error parsing raw events."}];
            }
            historicalConversation.push({
                type: 'agent',
                text: historicalRunData.finalResponseText || "Agent did not provide a text response.",
                events: agentEvents,
                timestamp: historicalRunData.timestamp?.toDate ? new Date(historicalRunData.timestamp.toDate().getTime() + 1000) : new Date(), // Approx
            });
            setConversation(historicalConversation);
            setMessage(''); // Clear any input from live mode
            setError(null); // Clear any errors from live mode
            setCurrentSessionId(null); // Not applicable for historical view
        } else if (!isHistoricalView) {
            // If switching back to live and conversation is not empty (and not due to loading historical)
            // then reset, unless we want to preserve live chat state.
            // For now, let's clear it to avoid confusion when switching.
            // setConversation([]); // Or preserve if desired
        }
    }, [historicalRunData, isHistoricalView]);


    const handleOpenReasoningLog = (events) => {
        setSelectedEventsForLog(events || []);
        setIsReasoningLogOpen(true);
    };

    const handleCloseReasoningLog = () => {
        setIsReasoningLogOpen(false);
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (isHistoricalView || !message.trim()) return; // Do nothing if historical or no message

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
                    events: result.events || [],
                    timestamp: new Date()
                };
                setConversation(prev => [...prev, agentResponse]);
                if (result.adkSessionId) {
                    setCurrentSessionId(result.adkSessionId);
                }
            } else {
                setError(result.message || "Agent query failed.");
                const errorResponse = { type: 'error', text: result.message || "Failed to get response", timestamp: new Date() };
                setConversation(prev => [...prev, errorResponse]);
            }
        } catch (err) {
            const errorMessage = err.message || "An error occurred while querying the agent.";
            setError(errorMessage);
            const errorResponse = { type: 'error', text: errorMessage, timestamp: new Date() };
            setConversation(prev => [...prev, errorResponse]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleResetSessionOrSwitchMode = () => {
        if (isHistoricalView) {
            onSwitchToLiveChat(); // Call prop to switch mode in parent
        } else {
            // Live mode: Reset session
            setCurrentSessionId(null);
            setConversation([]);
            setError(null);
        }
    };

    const getAvatar = (type) => {
        if (type === 'user') return <Avatar sx={{ bgcolor: 'primary.main' }}><PersonIcon /></Avatar>;
        if (type === 'agent') return <Avatar sx={{ bgcolor: 'secondary.main' }}><SmartToyIcon /></Avatar>;
        return <Avatar sx={{ bgcolor: 'error.main' }}><ErrorOutlineIcon /></Avatar>;
    };

    const runnerTitle = isHistoricalView ? "Run History Viewer" : "Run Agent (Live)";
    const canAttemptLiveChat = !isHistoricalView && isLiveModeEnabled;

    return (
        <Paper elevation={3} sx={{ p: { xs: 2, md: 3 }, mt: 4 }}>
            <Box sx={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <Typography variant="h5" component="h2" gutterBottom>
                    {runnerTitle}
                </Typography>
                {isLiveModeEnabled && ( // Show switch button only if live mode is ever possible
                    <Button
                        onClick={handleResetSessionOrSwitchMode}
                        startIcon={isHistoricalView ? <LiveTvIcon /> : <RestartAltIcon />}
                        color={isHistoricalView ? "primary" : "warning"}
                        variant="outlined"
                        size="small"
                        disabled={!isHistoricalView && isLoading} // Disable reset if loading in live
                    >
                        {isHistoricalView ? "Back to Live Chat" : "Reset Live Chat"}
                    </Button>
                )}
            </Box>
            {isHistoricalView && historicalRunData && (
                <Alert severity="info" sx={{mb:2}}>
                    You are viewing a historical run from {new Date(historicalRunData.timestamp?.toDate()).toLocaleString()}.
                    Input is disabled.
                </Alert>
            )}
            {!isLiveModeEnabled && !isHistoricalView && (
                <Alert severity="warning" sx={{mb:2}}>
                    Live agent interaction is not available. The agent might not be deployed or accessible.
                </Alert>
            )}


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
                            alignItems: 'flex-start',
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
                                    maxWidth: '80%',
                                    wordBreak: 'break-word',
                                    position: 'relative',
                                }}
                            >
                                <ListItemText
                                    disableTypography
                                    primary={
                                        entry.type === 'agent' ? (
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                components={muiMarkdownComponentsConfig}
                                            >
                                                {entry.text}
                                            </ReactMarkdown>
                                        ) : entry.type === 'user' ? (
                                            <Typography variant="body1">{entry.text}</Typography>
                                        ) : (
                                            <Typography variant="body1" color="error.contrastText">{entry.text}</Typography>
                                        )
                                    }
                                    secondary={
                                        <Typography
                                            variant="caption"
                                            sx={{
                                                display: 'block',
                                                textAlign: entry.type === 'user' ? 'right' : 'left',
                                                mt: 0.5,
                                                color: entry.type === 'user' ? 'primary.contrastText' :
                                                    entry.type === 'agent' ? 'text.secondary' :
                                                        'error.contrastText',
                                                opacity: entry.type === 'user' ? 0.8 : 1,
                                            }}
                                        >
                                            {new Date(entry.timestamp).toLocaleTimeString()}
                                            {entry.type === 'agent' && currentSessionId && !isHistoricalView && ` (S: ...${currentSessionId.slice(-4)})`}
                                            {entry.type === 'agent' && isHistoricalView && historicalRunData?.adkSessionId && ` (S: ...${historicalRunData.adkSessionId.slice(-4)})`}
                                        </Typography>
                                    }
                                />
                                {entry.type === 'agent' && entry.events && entry.events.length > 0 && (
                                    <Tooltip title="View Agent Reasoning Log" placement="top">
                                        <IconButton
                                            size="small"
                                            onClick={() => handleOpenReasoningLog(entry.events)}
                                            sx={{
                                                position: 'absolute',
                                                bottom: 2,
                                                right: 2,
                                                color: (theme) => theme.palette.action.active,
                                                '&:hover': { bgcolor: (theme) => theme.palette.action.hover }
                                            }}
                                            aria-label="view agent reasoning"
                                        >
                                            <DeveloperModeIcon fontSize="inherit" />
                                        </IconButton>
                                    </Tooltip>
                                )}
                            </Paper>
                        </ListItem>
                    ))}
                    {!isHistoricalView && isLoading && (
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

            {!isHistoricalView && error && <ErrorMessage message={error} sx={{ mb: 2 }} />}

            {canAttemptLiveChat && (
                <Box component="form" onSubmit={handleSendMessage} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TextField
                        fullWidth
                        variant="outlined"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Type your message to the agent..."
                        disabled={isLoading || isHistoricalView}
                        onKeyPress={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(e);}}}
                        size="small"
                        multiline
                        maxRows={5}
                    />
                    <Button
                        type="submit"
                        variant="contained"
                        color="primary"
                        disabled={isLoading || isHistoricalView || !message.trim()}
                        endIcon={<SendIcon />}
                        sx={{ height: '100%', alignSelf: 'flex-end' }}
                    >
                        Send
                    </Button>
                </Box>
            )}
            <AgentReasoningLogDialog
                open={isReasoningLogOpen}
                onClose={handleCloseReasoningLog}
                events={selectedEventsForLog}
            />
        </Paper>
    );
};

export default AgentRunner;  