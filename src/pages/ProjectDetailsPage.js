// src/pages/ProjectDetailsPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import {
    getProjectDetails, getAgentsForProjects, getModelsForProjects, getChatsForProjects, createChat
} from '../services/firebaseService';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import {
    Container, Typography, Box, Paper, Tabs, Tab, Button,
    List, ListItemText, ListItemButton, Dialog, DialogTitle, DialogContent, TextField, DialogActions
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ChatIcon from '@mui/icons-material/Chat';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ModelTrainingIcon from '@mui/icons-material/ModelTraining';

function TabPanel(props) {
    const { children, value, index, ...other } = props;
    return (
        <div role="tabpanel" hidden={value !== index} {...other}>
            {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
        </div>
    );
}

const ProjectDetailsPage = () => {
    const { projectId } = useParams();
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [project, setProject] = useState(null);
    const [agents, setAgents] = useState([]);
    const [models, setModels] = useState([]);
    const [chats, setChats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [tabValue, setTabValue] = useState(0);
    const [isChatDialogOpen, setIsChatDialogOpen] = useState(false);
    const [newChatTitle, setNewChatTitle] = useState('');

    const fetchData = useCallback(async () => {
        if (!currentUser || !projectId) return;
        try {
            setLoading(true);
            const projectDetails = await getProjectDetails(projectId);
            setProject(projectDetails);

            const [projectAgents, projectModels, projectChats] = await Promise.all([
                getAgentsForProjects([projectId]),
                getModelsForProjects([projectId]),
                getChatsForProjects([projectId])
            ]);
            setAgents(projectAgents);
            setModels(projectModels);
            setChats(projectChats);
        } catch (err) {
            console.error("Error fetching project details:", err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [currentUser, projectId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleTabChange = (event, newValue) => {
        setTabValue(newValue);
    };

    const handleCreateNew = () => {
        const preselectedProject = { state: { preselectedProjectIds: [projectId] } };
        if (tabValue === 0) setIsChatDialogOpen(true); // Chats
        if (tabValue === 1) navigate('/create-agent', preselectedProject); // Agents
        if (tabValue === 2) navigate('/create-model', preselectedProject); // Models
    };

    const handleCreateChat = async () => {
        if (!newChatTitle.trim()) return;
        try {
            const newChatId = await createChat(currentUser.uid, {
                title: newChatTitle,
                projectIds: [projectId]
            });
            setIsChatDialogOpen(false);
            setNewChatTitle('');
            navigate(`/chat/${newChatId}`);
        } catch (err) {
            console.error("Error creating chat:", err);
            // Handle error display
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}><LoadingSpinner /></Box>;
    if (error) return <ErrorMessage message={error} />;
    if (!project) return <Typography>Project not found.</Typography>;

    const tabLabels = ["Chats", "Agents", "Models"];

    return (
        <Container maxWidth="lg">
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box>
                    <Typography variant="h4" component="h1">{project.name}</Typography>
                    <Typography color="text.secondary">{project.description}</Typography>
                </Box>
                <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreateNew}>
                    New {tabLabels[tabValue]}
                </Button>
            </Box>

            <Paper>
                <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs value={tabValue} onChange={handleTabChange} centered>
                        <Tab icon={<ChatIcon />} label="Chats" />
                        <Tab icon={<SmartToyIcon />} label="Agents" />
                        <Tab icon={<ModelTrainingIcon />} label="Models" />
                    </Tabs>
                </Box>
                <TabPanel value={tabValue} index={0}>
                    <List>
                        {chats.map(chat => (
                            <ListItemButton key={chat.id} component={RouterLink} to={`/chat/${chat.id}`}>
                                <ListItemText
                                    primary={chat.title}
                                    secondary={`Last active: ${chat.lastInteractedAt?.toDate().toLocaleString()}`}
                                />
                            </ListItemButton>
                        ))}
                    </List>
                </TabPanel>
                <TabPanel value={tabValue} index={1}>
                    <List>
                        {agents.map(agent => (
                            <ListItemButton key={agent.id} component={RouterLink} to={`/agent/${agent.id}`}>
                                <ListItemText primary={agent.name} secondary={agent.description} />
                            </ListItemButton>
                        ))}
                    </List>
                </TabPanel>
                <TabPanel value={tabValue} index={2}>
                    <List>
                        {models.map(model => (
                            <ListItemButton key={model.id} component={RouterLink} to={`/model/${model.id}`}>
                                <ListItemText primary={model.name} secondary={model.description} />
                            </ListItemButton>
                        ))}
                    </List>
                </TabPanel>
            </Paper>

            <Dialog open={isChatDialogOpen} onClose={() => setIsChatDialogOpen(false)}>
                <DialogTitle>Start a New Chat</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Chat Title"
                        type="text"
                        fullWidth
                        variant="standard"
                        value={newChatTitle}
                        onChange={(e) => setNewChatTitle(e.target.value)}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setIsChatDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreateChat} disabled={!newChatTitle.trim()}>Create</Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
};

export default ProjectDetailsPage;