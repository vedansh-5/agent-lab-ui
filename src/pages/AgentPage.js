// src/pages/AgentsPage.js
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getMyAgents, getPublicAgents, deleteAgentFromFirestore, createAgentInFirestore } from '../services/firebaseService';
import { deleteAgentDeployment } from '../services/agentService';
import AgentList from '../components/agents/AgentList';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import PlatformSelectionDialog from '../components/agents/PlatformSelectionDialog';
import { PLATFORM_IDS } from '../constants/platformConstants';

import {
    Box, Typography, Button, Container, Paper, CircularProgress, Fab,
    ButtonGroup, ClickAwayListener, Grow, Popper, MenuList, MenuItem as MuiMenuItem, Divider
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import NoteAddIcon from '@mui/icons-material/NoteAdd';


const AgentsPage = () => {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [myAgents, setMyAgents] = useState([]);
    const [publicAgents, setPublicAgents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deletingAgentId, setDeletingAgentId] = useState(null);
    const [error, setError] = useState(null);
    const [isPlatformDialogOpen, setIsPlatformDialogOpen] = useState(false);

    const [openSplitButton, setOpenSplitButton] = useState(false);
    const anchorRefSplitButton = useRef(null);
    const fileInputRef = useRef(null);


    useEffect(() => {
        if (currentUser) {
            const fetchAgents = async () => {
                try {
                    setLoading(true);
                    setError(null);
                    const [userAgentsData, publicAgentsData] = await Promise.all([
                        getMyAgents(currentUser.uid),
                        getPublicAgents(currentUser.uid)
                    ]);
                    setMyAgents(userAgentsData);
                    setPublicAgents(publicAgentsData);
                } catch (err) {
                    console.error("Error fetching agents:", err);
                    setError("Failed to load agents. Please try again.");
                } finally {
                    setLoading(false);
                }
            };
            fetchAgents();
        }
    }, [currentUser]);

    const handleDeleteAgentConfig = async (agentToDelete) => {
        if (!agentToDelete || !agentToDelete.id) return;
        if (!currentUser || (agentToDelete.userId !== currentUser.uid && !currentUser.permissions?.isAdmin)) {
            alert("You are not authorized to delete this agent.");
            return;
        }

        if (window.confirm(`Are you sure you want to delete the agent configuration "${agentToDelete.name}"? This will also attempt to remove any associated (non-active/error) Vertex AI deployment if present. This action cannot be undone.`)) {
            setDeletingAgentId(agentToDelete.id);
            setError(null);
            try {
                if (agentToDelete.vertexAiResourceName &&
                    !['deployed', 'deploying_initiated', 'deploying_in_progress'].includes(agentToDelete.deploymentStatus)) {
                    try {
                        await deleteAgentDeployment(agentToDelete.vertexAiResourceName, agentToDelete.id);
                    } catch (vertexDeleteError) {
                        console.warn(`Could not delete Vertex AI deployment ${agentToDelete.vertexAiResourceName}:`, vertexDeleteError);
                    }
                }
                await deleteAgentFromFirestore(agentToDelete.id);
                setMyAgents(prevAgents => prevAgents.filter(agent => agent.id !== agentToDelete.id));
                setPublicAgents(prevAgents => prevAgents.filter(agent => agent.id !== agentToDelete.id));
            } catch (err) {
                console.error("Error deleting agent config:", err);
                setError(`Failed to delete agent configuration "${agentToDelete.name}": ${err.message}`);
            } finally {
                setDeletingAgentId(null);
            }
        }
    };

    const handleOpenPlatformDialog = () => setIsPlatformDialogOpen(true);
    const handleClosePlatformDialog = () => setIsPlatformDialogOpen(false);

    const handlePlatformSelected = (platform) => {
        setIsPlatformDialogOpen(false);
        if (platform.id === PLATFORM_IDS.GOOGLE_VERTEX) {
            navigate('/create-agent', { state: { platformId: platform.id } });
        } else if (!platform.isConstructed) {
            navigate(`/platform-under-construction/${platform.id}`);
        }
    };

    const handleSplitButtonToggle = () => setOpenSplitButton((prevOpen) => !prevOpen);
    const handleSplitButtonClose = (event) => {
        if (anchorRefSplitButton.current && anchorRefSplitButton.current.contains(event.target)) {
            return;
        }
        setOpenSplitButton(false);
    };

    const handleImportMenuItemClick = () => {
        fileInputRef.current.click();
        setOpenSplitButton(false);
    };

    const handleCreateBlankMenuItemClick = () => {
        handleOpenPlatformDialog();
        setOpenSplitButton(false);
    }

    const handleFileImport = async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        setError(null);
        setLoading(true);

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const importedData = JSON.parse(e.target.result);

                if (!importedData.name || !importedData.agentType || !importedData.modelId) {
                    throw new Error("Imported JSON is missing required fields (name, agentType, modelId).");
                }

                const agentDataForFirestore = { ...importedData };
                // Clean up fields that should not be imported
                const fieldsToDelete = ['id', 'userId', 'isPublic', 'createdAt', 'updatedAt', 'deploymentStatus', 'vertexAiResourceName', 'lastDeployedAt', 'lastDeploymentAttemptAt', 'deploymentError', 'litellm_api_key'];
                fieldsToDelete.forEach(field => delete agentDataForFirestore[field]);

                const newAgentId = await createAgentInFirestore(currentUser.uid, agentDataForFirestore, true);
                alert(`Agent "${agentDataForFirestore.name}" imported successfully!`);
                navigate(`/agent/${newAgentId}/edit`);
            } catch (parseError) {
                console.error("Error importing agent:", parseError);
                setError(`Failed to import agent: ${parseError.message}`);
            } finally {
                setLoading(false);
                if (fileInputRef.current) fileInputRef.current.value = "";
            }
        };
        reader.readAsText(file);
    };


    if (loading && myAgents.length === 0 && publicAgents.length === 0) return <Box display="flex" justifyContent="center" py={5}><LoadingSpinner /></Box>;

    return (
        <Container maxWidth="lg">
            <input
                type="file"
                accept=".json"
                ref={fileInputRef}
                onChange={handleFileImport}
                style={{ display: 'none' }}
            />
            <Fab
                color="primary"
                aria-label="add agent"
                onClick={handleCreateBlankMenuItemClick}
                sx={{
                    position: 'fixed',
                    bottom: (theme) => theme.spacing(3),
                    right: (theme) => theme.spacing(3),
                    display: { xs: 'flex', md: 'none' }
                }}
            >
                <AddIcon />
            </Fab>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4" component="h1">
                    Agents
                </Typography>
                <ButtonGroup variant="contained" ref={anchorRefSplitButton}>
                    <Button onClick={handleCreateBlankMenuItemClick} startIcon={<NoteAddIcon />}>Create Agent</Button>
                    <Button
                        size="small"
                        aria-controls={openSplitButton ? 'split-button-menu' : undefined}
                        aria-expanded={openSplitButton ? 'true' : undefined}
                        onClick={handleSplitButtonToggle}
                    >
                        <ArrowDropDownIcon />
                    </Button>
                </ButtonGroup>
                <Popper open={openSplitButton} anchorEl={anchorRefSplitButton.current} role={undefined} transition disablePortal placement="bottom-end" sx={{zIndex: 1}} >
                    {({ TransitionProps, placement }) => (
                        <Grow {...TransitionProps} style={{ transformOrigin: placement === 'bottom-end' ? 'right top' : 'right bottom' }} >
                            <Paper>
                                <ClickAwayListener onClickAway={handleSplitButtonClose}>
                                    <MenuList id="split-button-menu">
                                        <MuiMenuItem onClick={handleImportMenuItemClick}>
                                            <FileUploadIcon sx={{mr:1}} fontSize="small"/> Import Agent
                                        </MuiMenuItem>
                                    </MenuList>
                                </ClickAwayListener>
                            </Paper>
                        </Grow>
                    )}
                </Popper>
            </Box>

            {error && <ErrorMessage message={error} />}
            {deletingAgentId && <Box sx={{display: 'flex', alignItems: 'center', justifyContent: 'center', my: 2}}><CircularProgress size={20} sx={{mr:1}} /> <Typography>Deleting agent...</Typography></Box>}

            <Typography variant="h5" component="h2" gutterBottom sx={{mt: 3}}>
                Your Agents
            </Typography>
            {myAgents.length > 0 ? (
                <AgentList agents={myAgents} onDeleteAgentConfig={handleDeleteAgentConfig} />
            ) : (
                !error && !loading && (
                    <Paper elevation={0} sx={{ p:3, textAlign: 'center', backgroundColor: 'action.hover' }}>
                        <Typography color="text.secondary">You haven't created any agents yet.</Typography>
                    </Paper>
                )
            )}

            <Divider sx={{ my: 4 }} />

            <Typography variant="h5" component="h2" gutterBottom>
                Public Agents
            </Typography>
            {publicAgents.length > 0 ? (
                <AgentList agents={publicAgents} onDeleteAgentConfig={handleDeleteAgentConfig} />
            ) : (
                !error && !loading && (
                    <Paper elevation={0} sx={{ p:3, textAlign: 'center', backgroundColor: 'action.hover' }}>
                        <Typography color="text.secondary">No public agents available currently.</Typography>
                    </Paper>
                )
            )}
            <PlatformSelectionDialog
                open={isPlatformDialogOpen}
                onClose={handleClosePlatformDialog}
                onSelectPlatform={handlePlatformSelected}
            />
        </Container>
    );
};

export default AgentsPage;