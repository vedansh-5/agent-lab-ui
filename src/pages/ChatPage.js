// src/pages/ChatPage.js
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getChatDetails, listenToChatMessages, addChatMessage, getModelsForProjects, getAgentsForProjects } from '../services/firebaseService';
import { executeQuery } from '../services/agentService';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import { Container, Typography, Box, Paper, Button, IconButton, TextField, Menu, MenuItem, Select, InputLabel, FormControl, Tooltip, Chip, Avatar } from '@mui/material';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import PersonIcon from '@mui/icons-material/Person';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ModelTrainingIcon from '@mui/icons-material/ModelTraining';
import AddIcon from '@mui/icons-material/Add';

// Helper for user-friendly participant display (user, agent, or model)
const parseParticipant = (str, models, agents, users, currentUser) => {
    if (!str) return { label: 'Unknown', icon: <PersonIcon /> };
    const [type, id] = str.split(':');
    if (type === 'user') {
        if (currentUser && id === currentUser.uid) return { label: 'You', icon: <Avatar src={currentUser.photoURL}>{currentUser.displayName?.slice(0,1)}</Avatar> };
        // For now, just show 'user'
        return { label: 'User', icon: <PersonIcon /> };
    }
    if (type === 'agent') {
        const agent = agents.find(a => a.id === id);
        return { label: agent ? agent.name : `Agent: ${id}`, icon: <SmartToyIcon color="secondary" /> };
    }
    if (type === 'model') {
        const model = models.find(m => m.id === id);
        return { label: model ? model.name : `Model: ${id}`, icon: <ModelTrainingIcon color="primary" /> };
    }
    return { label: str, icon: <PersonIcon /> };
};

function getPathToLeaf(messagesMap, leafMessageId) {
    const path = [];
    let currId = leafMessageId;
    while(currId) {
        const msg = messagesMap[currId];
        if (!msg) break;
        path.unshift(msg);
        currId = msg.parentMessageId;
    }
    return path;
}

function getChildrenForMessage(messagesMap, parentId) {
    // Returns list of message objects
    return Object.values(messagesMap)
        .filter(msg => msg.parentMessageId === parentId)
        .sort((a, b) => (a.timestamp?.seconds ?? 0) - (b.timestamp?.seconds ?? 0));
}

function findLeafOfBranch(messagesMap, branchRootId) {
    let current = messagesMap[branchRootId];
    if (!current) return branchRootId;

    while (true) {
        const children = getChildrenForMessage(messagesMap, current.id);
        if (children.length > 0) {
            // If there are multiple children, we are at a fork point. The "leaf" of this branch
            // is the latest child, which itself might be the root of a sub-branch.
            current = children.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0)).pop();
        } else {
            // No children, this is the leaf.
            return current.id;
        }
    }
}

const BranchNavigator = ({ message, messagesMap, activePath, onNavigate }) => {
    const children = getChildrenForMessage(messagesMap, message.id);
    if (children.length <= 1) {
        return null;
    }

    // Find which of my children is in the active path
    const activeChild = children.find(child => activePath.some(pathMsg => pathMsg.id === child.id));
    // Default to the latest fork if the active path doesn't contain any of the children
    const activeIndex = activeChild ? children.indexOf(activeChild) : children.length - 1;

    const handleNav = (direction) => {
        let newIndex = activeIndex + direction;
        if (newIndex < 0) newIndex = children.length - 1;
        if (newIndex >= children.length) newIndex = 0;
        const newBranchRootId = children[newIndex].id;
        const newLeafId = findLeafOfBranch(messagesMap, newBranchRootId);
        onNavigate(newLeafId);
    };

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mt: 0.5, bgcolor: 'action.hover', borderRadius: 1, p: 0.2 }}>
            <Tooltip title="Previous Fork">
                <IconButton size="small" onClick={() => handleNav(-1)}><ChevronLeft /></IconButton>
            </Tooltip>
            <Typography variant="caption" sx={{ mx: 1, fontWeight: 'medium' }}>
                Fork {activeIndex + 1} / {children.length}
            </Typography>
            <Tooltip title="Next Fork">
                <IconButton size="small" onClick={() => handleNav(1)}><ChevronRight /></IconButton>
            </Tooltip>
        </Box>
    );
};

const ChatPage = () => {
    const { currentUser } = useAuth();
    const { chatId } = useParams();
    const [chat, setChat] = useState(null);
    const [messages, setMessages] = useState([]); // Flat array
    const [messagesMap, setMessagesMap] = useState({}); // id -> msg
    const [activeLeafMsgId, setActiveLeafMsgId] = useState(null); // The last selected message ID
    const [childIndices, setChildIndices] = useState({}); // msgId -> which child is selected of its children
    const [composerValue, setComposerValue] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);

    // Participants management: agents, models (selected for this chat)
    const [agents, setAgents] = useState([]);
    const [models, setModels] = useState([]);
    const [replyAs, setReplyAs] = useState(null); // { type, id }
    const [participants, setParticipants] = useState([]); // [{type, id, displayName, ...}]
    const [addMenuAnchor, setAddMenuAnchor] = useState(null);

    // Child selection for branching/forking navigation
    const conversationPath = useMemo(() => {
        if (!messagesMap || !activeLeafMsgId) return [];
        return getPathToLeaf(messagesMap, activeLeafMsgId);
    }, [messagesMap, activeLeafMsgId]);

    // Load chat metadata and set up listeners
    useEffect(() => {
        setLoading(true);
        let unsubscribe;

        const setupListener = async () => {
            try {
                const chatData = await getChatDetails(chatId);
                setChat(chatData);

                const projIds = chatData.projectIds || [];
                const [projAgents, projModels] = await Promise.all([
                    getAgentsForProjects(projIds),
                    getModelsForProjects(projIds)
                ]);
                setAgents(projAgents);
                setModels(projModels);
                setParticipants([
                    ...projAgents.map(a => ({ type: 'agent', id: a.id, displayName: a.name })),
                    ...projModels.map(m => ({ type: 'model', id: m.id, displayName: m.name })),
                ]);
                // Use a functional update for replyAs to avoid race conditions
                setReplyAs(prev => {
                    if (!prev && projAgents.length > 0) {
                        return { type: 'agent', id: projAgents[0].id };
                    }
                    return prev;
                });

                unsubscribe = listenToChatMessages(chatId, (newMsgs) => {
                    const newMessagesMap = newMsgs.reduce((acc, m) => ({ ...acc, [m.id]: m }), {});
                    setMessages(newMsgs);
                    setMessagesMap(newMessagesMap);

                    setActiveLeafMsgId(prevLeafId => {
                        // Case 1: Initial load or previous leaf was deleted. Find the latest leaf overall.
                        if (!prevLeafId || !newMessagesMap[prevLeafId]) {
                            const leafCandidates = newMsgs.filter(m => !newMsgs.some(x => x.parentMessageId === m.id));
                            return (leafCandidates.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0)).pop()?.id || null);
                        }

                        // Case 2: A new reply chain might have been added to our current branch.
                        // Find the deepest descendant from our previously active leaf.
                        const newLeafId = findLeafOfBranch(newMessagesMap, prevLeafId);

                        // If the new leaf is different, it means our branch grew. Update the view.
                        // If it's the same, another branch was updated, so we stay put.
                        return newLeafId;
                    });
                });
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        setupListener();

        return () => {
            if (unsubscribe) {
                unsubscribe();
            }
        };
    }, [chatId]);

    // Handler for clicking fork icon
    const handleFork = (msgId) => {
        setActiveLeafMsgId(msgId);
    }

    // Handler to select different children if a node is a fork point
    const handleNavigateBranch = (newLeafId) => {
        setActiveLeafMsgId(newLeafId);
    };

    // Handler for opening "Add" participant menu
    function handleOpenAddParticipantMenu(e) { setAddMenuAnchor(e.currentTarget); }
    function handleCloseAddParticipantMenu() { setAddMenuAnchor(null); }
    function handleAddParticipant(participant) {
        setParticipants(prev => ([...prev, participant]));
        setAddMenuAnchor(null);
    }

    // Handler for sending a message (as agent/model)
    async function handleSendMessage(e) {
        e.preventDefault();
        if (!composerValue.trim() || !replyAs) return;
        setSending(true);
        try {
            await executeQuery({
                chatId,
                agentId: replyAs.type === 'agent' ? replyAs.id : undefined,
                modelId: replyAs.type === 'model' ? replyAs.id : undefined,
                message: composerValue,
                adkUserId: currentUser.uid,
                parentMessageId: activeLeafMsgId
            });
            setComposerValue('');
            // activeLeafMsgId will jump to new message due to listener
        } catch (err) {
            setError(err.message);
        } finally {
            setSending(false);
        }
    }

    // Helper to create all possible participant options for "Reply As" menu
    const replyAsOptions = useMemo(() => (
        participants.map(p => ({
            value: JSON.stringify({ type: p.type, id: p.id }),
            label: `${p.type === 'agent' ? 'Agent' : 'Model'}: ${p.displayName}`
        }))
    ), [participants]);

    if (loading || !chat) return <Box sx={{display: 'flex', justifyContent: 'center'}}><LoadingSpinner /></Box>;
    if (error) return <ErrorMessage message={error} />;

    return (
        <Container maxWidth="md" sx={{ py: 3 }}>
            <Paper sx={{ p: {xs: 2, md: 4} }}>
                <Typography variant="h4" gutterBottom>{chat.title}</Typography>

                {/* Render conversation chain */}
                <Box sx={{ bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider', p: 2, minHeight: 320, overflowY: 'auto', maxHeight: '60vh' }}>
                    {conversationPath.map((msg, idx) => {
                        const participant = parseParticipant(msg.participant, models, agents, [], currentUser);

                        return (
                            <Box key={msg.id} sx={{ position: 'relative', mb: 2 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                    {participant.icon}
                                    <Typography variant="subtitle2">{participant.label}</Typography>
                                    <Tooltip title="Create a new response from this point">
                                        <IconButton size="small" onClick={() => handleFork(msg.id)}>
                                            <CallSplitIcon fontSize="small" style={{ transform: "rotate(180deg)" }} />
                                        </IconButton>
                                    </Tooltip>
                                </Box>
                                <Paper variant="outlined" sx={{ p: 1.5, wordBreak: 'break-word', whiteSpace: 'pre-wrap', mb: 0.5,
                                    bgcolor: msg.participant?.startsWith('user') ? 'primary.light' : msg.participant?.startsWith('agent') ? 'grey.100' : 'secondary.light' }}>
                                    <Typography variant="body1">{msg.content || <span style={{color: "grey"}}>(no content)</span>}</Typography>
                                    {/* Loading spinner if this is an assistant message that is still running */}
                                    {msg.run && msg.run.status === 'running' && (
                                        <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                                            <LoadingSpinner small />
                                            <Typography variant="caption" sx={{ ml: 1 }}>Thinking...</Typography>
                                        </Box>
                                    )}
                                    {/* Show error if present */}
                                    {msg.run && msg.run.status === 'error' && Array.isArray(msg.run.queryErrorDetails) && msg.run.queryErrorDetails.length > 0 && (
                                        <Box sx={{mt: 1}}>
                                            <ErrorMessage message={msg.run.queryErrorDetails.join('\n')} severity="warning"/>
                                        </Box>
                                    )}
                                </Paper>
                                <BranchNavigator message={msg} messagesMap={messagesMap} activePath={conversationPath} onNavigate={handleNavigateBranch} />
                            </Box>
                        );
                    })}
                </Box>

                {/* Message composer */}
                <Box component="form" onSubmit={handleSendMessage} sx={{ display: 'flex', alignItems: 'flex-end', mt: 2, gap: 1 }}>
                    {/* "Reply As" dropdown */}
                    <FormControl sx={{ minWidth: 160 }}>
                        <InputLabel id="reply-as-label">Reply As</InputLabel>
                        <Select
                            labelId="reply-as-label"
                            value={replyAs ? JSON.stringify(replyAs) : ''}
                            label="Reply As"
                            onChange={(e) => setReplyAs(JSON.parse(e.target.value))}
                        >
                            {replyAsOptions.map(opt => (
                                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    {/* Add participant button (show agents/models not already in participants) */}
                    <Tooltip title="Add more agents or models">
                        <IconButton onClick={handleOpenAddParticipantMenu}><AddIcon /></IconButton>
                    </Tooltip>
                    <Menu open={Boolean(addMenuAnchor)} anchorEl={addMenuAnchor} onClose={handleCloseAddParticipantMenu}>
                        {[...agents, ...models]
                            .filter(ent => !participants.some(p => p.type === (ent.agentType ? 'agent' : 'model') && p.id === ent.id))
                            .map(ent => (
                                <MenuItem key={ent.id} onClick={() => handleAddParticipant({
                                    type: ent.agentType ? 'agent' : 'model',
                                    id: ent.id,
                                    displayName: ent.name,
                                })}>
                                    <Chip icon={ent.agentType ? <SmartToyIcon /> : <ModelTrainingIcon />} label={ent.name} variant="outlined"/>
                                </MenuItem>
                            ))}
                    </Menu>

                    <TextField
                        value={composerValue}
                        onChange={e => setComposerValue(e.target.value)}
                        variant="outlined"
                        size="small"
                        placeholder="Type your message..."
                        sx={{ flexGrow: 1 }}
                        disabled={sending}
                        multiline
                        maxRows={4}
                    />
                    <Button variant="contained" endIcon={<PlayArrowIcon />} type="submit" disabled={sending || !composerValue.trim() || !replyAs}>
                        Send
                    </Button>
                </Box>
            </Paper>
        </Container>
    );
}

export default ChatPage;