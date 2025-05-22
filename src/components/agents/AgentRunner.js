// src/components/agents/AgentRunner.js
import React, { useState, useRef, useEffect } from 'react';
import { queryAgent } from '../../services/agentService';
import ErrorMessage from '../common/ErrorMessage';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import {
    Paper, Typography, TextField, Button, Box, List, ListItem,
    ListItemText, Avatar, CircularProgress, IconButton, Link, Divider
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy'; // Icon for agent
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import RestartAltIcon from '@mui/icons-material/RestartAlt'; // Icon for reset session

// MUI components mapping for ReactMarkdown
const muiMarkdownComponents = {
    p: ({node, ...props}) => <Typography variant="body1" gutterBottom {...props} />,
    h1: ({node, ...props}) => <Typography variant="h4" component="h1" gutterBottom {...props} />, // Adjusted heading levels for chat context
    h2: ({node, ...props}) => <Typography variant="h5" component="h2" gutterBottom {...props} />,
    h3: ({node, ...props}) => <Typography variant="h6" component="h3" gutterBottom {...props} />,
    h4: ({node, ...props}) => <Typography variant="subtitle1" component="h4" gutterBottom {...props} />,
    h5: ({node, ...props}) => <Typography variant="subtitle2" component="h5" gutterBottom {...props} />,
    h6: ({node, ...props}) => <Typography variant="body2" component="h6" gutterBottom {...props} />,
    a: ({node, ...props}) => <Link target="_blank" rel="noopener noreferrer" {...props} />,
    ul: ({node, ordered, ...props}) => <List sx={{ listStyleType: 'disc', pl: 2.5, py:0.5 }} {...props} />,
    ol: ({node, ordered, ...props}) => <List sx={{ listStyleType: 'decimal', pl: 2.5, py:0.5 }} {...props} />,
    li: ({node, ...props}) => <ListItem sx={{ display: 'list-item', py: 0.2, px: 0 }} disableGutters {...props} />,
    hr: ({node, ...props}) => <Divider sx={{ my: 1 }} {...props} />,
    code: ({node, inline, className, children, ...props}) => {
        // const match = /language-(\w+)/.exec(className || '');
        return !inline ? ( // Code block
            <Paper component="pre" elevation={0} variant="outlined" sx={{
                p: 1.5,
                my: 1,
                overflow: 'auto',
                bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100',
                fontSize: '0.875rem',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap', // Ensure long lines wrap
                wordBreak: 'break-all', // Break long words/strings
            }} {...props}>
                <code>{children}</code>
            </Paper>
        ) : ( // Inline code
            <Typography component="code" sx={{
                fontFamily: 'monospace',
                bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                px: 0.5,
                py: 0.25,
                borderRadius: 1,
                fontSize: '0.875rem'
            }} {...props}>
                {children}
            </Typography>
        );
    },
    pre: ({node, ...props}) => <Box {...props} />, // The 'code' component above handles <pre><code> styling
    blockquote: ({node, ...props}) => (
        <Box
            component="blockquote"
            sx={{
                borderLeft: (theme) => `4px solid ${theme.palette.divider}`,
                pl: 2,
                ml: 0,
                mr: 0,
                my: 1.5,
                fontStyle: 'italic',
                color: 'text.secondary'
            }}
            {...props}
        />
    ),
    // Add table, th, td, tr if needed, styling them with MUI Table components
    table: ({node, ...props}) => <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', my: 1.5, '& th, & td': { border: (theme) => `1px solid ${theme.palette.divider}`, p: 1, textAlign: 'left'}}} {...props} />,
    thead: ({node, ...props}) => <Box component="thead" {...props} />,
    tbody: ({node, ...props}) => <Box component="tbody" {...props} />,
    tr: ({node, ...props}) => <Box component="tr" {...props} />,
    th: ({node, ...props}) => <Box component="th" sx={{fontWeight: 'bold', bgcolor: 'action.hover'}} {...props} />,
    td: ({node, ...props}) => <Box component="td" {...props} />,
};


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
                if (result.adkSessionId) {
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
        setConversation([]);
        setError(null);
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
                            alignItems: 'flex-start', // Align avatar to top of message
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
                                    maxWidth: '80%', // Increased max width
                                    wordBreak: 'break-word',
                                }}
                            >
                                <ListItemText
                                    disableTypography // Important when using ReactMarkdown or custom components inside
                                    primary={
                                        entry.type === 'agent' ? (
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                components={muiMarkdownComponents}
                                            >
                                                {entry.text}
                                            </ReactMarkdown>
                                        ) : entry.type === 'user' ? (
                                            <Typography variant="body1">{entry.text}</Typography>
                                        ) : ( // Error type
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
                                            {entry.type === 'agent' && currentSessionId && ` (S: ...${currentSessionId.slice(-4)})`}
                                        </Typography>
                                    }
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
                    onKeyPress={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(e);}}}
                    size="small"
                    multiline // Allow multiline input
                    maxRows={5} // Limit height
                />
                <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    disabled={isLoading || !message.trim()}
                    endIcon={<SendIcon />}
                    sx={{ height: '100%', alignSelf: 'flex-end' }} // Align button to bottom with multiline TextField
                >
                    Send
                </Button>
                {currentSessionId && (
                    <IconButton
                        onClick={handleResetSession}
                        title="Reset Conversation Session"
                        color="warning"
                        disabled={isLoading}
                        sx={{ alignSelf: 'flex-end' }} // Align button to bottom with multiline TextField
                    >
                        <RestartAltIcon />
                    </IconButton>
                )}
            </Box>
        </Paper>
    );
};

export default AgentRunner;  