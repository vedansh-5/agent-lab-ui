// src/components/agents/AgentForm.js

import React, { useState, useEffect } from 'react';
import ToolSelector from '../tools/ToolSelector';
import { fetchGofannonTools } from '../../services/agentService';
import {
    TextField, Button, Select, MenuItem, FormControl, InputLabel,
    Paper, Grid, Box, CircularProgress, Typography, IconButton, List,
    ListItem, ListItemText, ListItemSecondaryAction, Dialog, DialogTitle,
    DialogContent, DialogActions, FormHelperText
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs for child agents

const AGENT_TYPES = ["Agent", "SequentialAgent", "LoopAgent", "ParallelAgent"];
const GEMINI_MODELS = [ // Consider fetching this dynamically or expanding
    "gemini-1.5-flash-001", // Default, good balance
    "gemini-1.5-pro-001",   // More powerful
    // Older models if needed, but prefer latest generation
    // "gemini-1.0-pro",
    // "gemini-ultra" // If available and project supports
];


// --- ChildAgentForm Dialog Component ---
const ChildAgentFormDialog = ({ open, onClose, onSave, childAgentData, availableGofannonTools, loadingGofannon, gofannonError, onRefreshGofannon }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState(''); // Optional for child
    const [model, setModel] = useState(GEMINI_MODELS[0]);
    const [instruction, setInstruction] = useState('');
    const [selectedTools, setSelectedTools] = useState([]);
    const [formError, setFormError] = useState('');

    useEffect(() => {
        if (childAgentData) {
            setName(childAgentData.name || '');
            setDescription(childAgentData.description || '');
            setModel(childAgentData.model || GEMINI_MODELS[0]);
            setInstruction(childAgentData.instruction || '');
            setSelectedTools(childAgentData.tools || []);
        } else { // Reset for new child agent
            setName('');
            setDescription('');
            setModel(GEMINI_MODELS[0]);
            setInstruction('');
            setSelectedTools([]);
        }
        setFormError('');
    }, [childAgentData, open]); // Reset form when dialog opens or data changes

    const handleSave = () => {
        if (!name.trim()) {
            setFormError('Child agent name is required.');
            return;
        }
        if (!instruction.trim()) {
            setFormError('Child agent instruction is required.');
            return;
        }
        onSave({
            id: childAgentData?.id || uuidv4(), // Keep existing ID or generate new
            name,
            description,
            model,
            instruction,
            tools: selectedTools
        });
        onClose();
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>{childAgentData ? 'Edit Child Agent' : 'Add New Child Agent'}</DialogTitle>
            <DialogContent>
                <Grid container spacing={2} sx={{ pt: 1 }}>
                    <Grid item xs={12}>
                        <TextField
                            label="Child Agent Name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            fullWidth
                            variant="outlined"
                            error={formError.includes('name')}
                        />
                    </Grid>
                    <Grid item xs={12}>
                        <TextField
                            label="Child Description (Optional)"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            multiline
                            rows={2}
                            fullWidth
                            variant="outlined"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <FormControl fullWidth variant="outlined" error={formError.includes('model')}>
                            <InputLabel>Model</InputLabel>
                            <Select value={model} onChange={(e) => setModel(e.target.value)} label="Model">
                                {GEMINI_MODELS.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12}>
                        <TextField
                            label="Child Instruction (System Prompt)"
                            value={instruction}
                            onChange={(e) => setInstruction(e.target.value)}
                            multiline
                            rows={4}
                            required
                            fullWidth
                            variant="outlined"
                            placeholder="e.g., You are a specialized researcher. Given a topic, find three key facts."
                            error={formError.includes('instruction')}
                        />
                    </Grid>
                    <Grid item xs={12}>
                        <ToolSelector
                            availableGofannonTools={availableGofannonTools}
                            selectedTools={selectedTools}
                            setSelectedTools={setSelectedTools}
                            onRefreshGofannon={onRefreshGofannon}
                            loadingGofannon={loadingGofannon}
                            gofannonError={gofannonError}
                        />
                    </Grid>
                    {formError && <Grid item xs={12}><FormHelperText error>{formError}</FormHelperText></Grid>}
                </Grid>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={handleSave} variant="contained" color="primary">
                    {childAgentData ? 'Save Changes' : 'Add Child Agent'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};


// --- Main AgentForm Component ---
const AgentForm = ({ onSubmit, initialData = {}, isSaving = false }) => {
    const [name, setName] = useState(initialData.name || '');
    const [description, setDescription] = useState(initialData.description || '');
    const [agentType, setAgentType] = useState(initialData.agentType || AGENT_TYPES[0]);
    const [model, setModel] = useState(initialData.model || GEMINI_MODELS[0]);
    const [instruction, setInstruction] = useState(initialData.instruction || '');
    const [selectedTools, setSelectedTools] = useState(initialData.tools || []);
    const [maxLoops, setMaxLoops] = useState(initialData.maxLoops || 3); // For LoopAgent

    // Child Agents State
    const [childAgents, setChildAgents] = useState(initialData.childAgents || []);
    const [isChildFormOpen, setIsChildFormOpen] = useState(false);
    const [editingChild, setEditingChild] = useState(null); // null for new, object for edit

    const [availableGofannonTools, setAvailableGofannonTools] = useState([]);
    const [loadingTools, setLoadingTools] = useState(false);
    const [toolError, setToolError] = useState('');
    const [formError, setFormError] = useState('');


    const handleRefreshGofannonTools = async () => {
        setLoadingTools(true);
        setToolError('');
        try {
            const result = await fetchGofannonTools();
            if (result.success && result.manifest && result.manifest.tools) {
                setAvailableGofannonTools(result.manifest.tools);
            } else {
                setToolError("Could not load Gofannon tools from manifest.");
            }
        } catch (error) {
            console.error("Error fetching Gofannon tools:", error);
            setToolError(`Failed to fetch Gofannon tools: ${error.message}`);
        } finally {
            setLoadingTools(false);
        }
    };

    useEffect(() => {
        handleRefreshGofannonTools();
    }, []);

    // Update form fields if initialData changes (e.g., when switching to edit mode after fetch)
    useEffect(() => {
        setName(initialData.name || '');
        setDescription(initialData.description || '');
        setAgentType(initialData.agentType || AGENT_TYPES[0]);
        setModel(initialData.model || GEMINI_MODELS[0]);
        setInstruction(initialData.instruction || '');
        setSelectedTools(initialData.tools || []);
        setMaxLoops(initialData.maxLoops || 3);
        setChildAgents(initialData.childAgents || []);
        setFormError('');
    }, [initialData]);


    const handleSubmit = (e) => {
        e.preventDefault();
        setFormError('');

        if (!name.trim()) {
            setFormError("Agent Name is required.");
            return;
        }
        // Instruction might be optional for Sequential/Parallel parent, but good to have
        // if (!instruction.trim() && (agentType === 'Agent' || agentType === 'LoopAgent')) {
        //     setFormError("Instruction is required for Agent and LoopAgent types.");
        //     return;
        // }
        if ((agentType === 'SequentialAgent' || agentType === 'ParallelAgent') && childAgents.length === 0) {
            setFormError(`A ${agentType} requires at least one child agent.`);
            return;
        }


        const agentDataToSubmit = {
            name, description, agentType,
            model, // Model for 'Agent' and 'LoopAgent's child
            instruction, // Instruction for 'Agent' and 'LoopAgent's child
            tools: selectedTools, // Tools for 'Agent' and 'LoopAgent's child
        };

        if (agentType === 'LoopAgent') {
            agentDataToSubmit.maxLoops = Number(maxLoops);
        }
        if (agentType === 'SequentialAgent' || agentType === 'ParallelAgent') {
            agentDataToSubmit.childAgents = childAgents;
            // For Sequential/Parallel, the top-level model/instruction/tools are often ignored by ADK.
            // We still send them as they are in the form, backend can decide.
            // Or, we could clear them:
            // delete agentDataToSubmit.model;
            // delete agentDataToSubmit.instruction;
            // delete agentDataToSubmit.tools;
        }

        onSubmit(agentDataToSubmit);
    };

    // Child Agent Handlers
    const handleOpenChildForm = (childToEdit = null) => {
        setEditingChild(childToEdit);
        setIsChildFormOpen(true);
    };

    const handleCloseChildForm = () => {
        setIsChildFormOpen(false);
        setEditingChild(null);
    };

    const handleSaveChildAgent = (childData) => {
        if (editingChild) { // Update existing
            setChildAgents(prev => prev.map(c => c.id === childData.id ? childData : c));
        } else { // Add new
            setChildAgents(prev => [...prev, childData]);
        }
    };

    const handleDeleteChildAgent = (childId) => {
        if (window.confirm("Are you sure you want to remove this child agent?")) {
            setChildAgents(prev => prev.filter(c => c.id !== childId));
        }
    };

    const showParentConfig = agentType === 'Agent' || agentType === 'LoopAgent';
    const showChildConfig = agentType === 'SequentialAgent' || agentType === 'ParallelAgent';

    return (
        <Paper elevation={3} sx={{ p: { xs: 2, md: 4 } }}>
            <Box component="form" onSubmit={handleSubmit} noValidate>
                <Grid container spacing={3}>
                    {/* Common Fields */}
                    <Grid item xs={12}>
                        <TextField label="Agent Name" id="name" value={name} onChange={(e) => setName(e.target.value)} required fullWidth variant="outlined" />
                    </Grid>
                    <Grid item xs={12}>
                        <TextField label="Description" id="description" value={description} onChange={(e) => setDescription(e.target.value)} multiline rows={3} fullWidth variant="outlined" />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <FormControl fullWidth variant="outlined">
                            <InputLabel id="agentType-label">Agent Type</InputLabel>
                            <Select labelId="agentType-label" id="agentType" value={agentType} onChange={(e) => setAgentType(e.target.value)} label="Agent Type">
                                {AGENT_TYPES.map(type => <MenuItem key={type} value={type}>{type}</MenuItem>)}
                            </Select>
                        </FormControl>
                    </Grid>

                    {/* Fields for 'Agent' and 'LoopAgent' (defining the agent or the looped agent) */}
                    {showParentConfig && (
                        <>
                            <Grid item xs={12} sm={6}>
                                <FormControl fullWidth variant="outlined">
                                    <InputLabel id="model-label">Model</InputLabel>
                                    <Select labelId="model-label" id="model" value={model} onChange={(e) => setModel(e.target.value)} label="Model">
                                        {GEMINI_MODELS.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                                    </Select>
                                    <FormHelperText>
                                        {agentType === 'LoopAgent' ? "Model for the looped agent." : "Model for this agent."}
                                    </FormHelperText>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12}>
                                <TextField
                                    label={agentType === 'LoopAgent' ? "Looped Agent Instruction" : "Instruction (System Prompt)"}
                                    id="instruction" value={instruction} onChange={(e) => setInstruction(e.target.value)}
                                    multiline rows={5}
                                    placeholder="e.g., You are a helpful assistant."
                                    fullWidth variant="outlined"
                                />
                            </Grid>
                            <Grid item xs={12}>
                                <Typography variant="subtitle1" sx={{mb:1}}>
                                    {agentType === 'LoopAgent' ? "Tools for Looped Agent" : "Tools for Agent"}
                                </Typography>
                                <ToolSelector
                                    availableGofannonTools={availableGofannonTools}
                                    selectedTools={selectedTools}
                                    setSelectedTools={setSelectedTools}
                                    onRefreshGofannon={handleRefreshGofannonTools}
                                    loadingGofannon={loadingTools}
                                    gofannonError={toolError}
                                />
                            </Grid>
                        </>
                    )}

                    {/* Fields specific to LoopAgent */}
                    {agentType === 'LoopAgent' && (
                        <Grid item xs={12} sm={6}>
                            <TextField
                                label="Max Loops" type="number" id="maxLoops"
                                value={maxLoops}
                                onChange={(e) => setMaxLoops(Math.max(1, parseInt(e.target.value, 10) || 1))}
                                InputProps={{ inputProps: { min: 1 } }}
                                fullWidth variant="outlined"
                                helperText="Number of times the looped agent will run."
                            />
                        </Grid>
                    )}

                    {/* Child Agents Section for SequentialAgent and ParallelAgent */}
                    {showChildConfig && (
                        <Grid item xs={12}>
                            <Typography variant="h6" gutterBottom>Child Agents</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{mb:1}}>
                                Define the sequence or set of parallel agents that this orchestrator will manage.
                                The orchestrator's own Model, Instruction, and Tools fields (if shown above) are generally not used for its direct operation.
                            </Typography>
                            <Button
                                variant="outlined"
                                startIcon={<AddCircleOutlineIcon />}
                                onClick={() => handleOpenChildForm(null)}
                                sx={{ mb: 2 }}
                            >
                                Add Child Agent
                            </Button>
                            {childAgents.length > 0 ? (
                                <List dense sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                                    {childAgents.map((child, index) => (
                                        <ListItem key={child.id || index} divider={index < childAgents.length -1}>
                                            <ListItemText
                                                primary={child.name}
                                                secondary={`Model: ${child.model} | Tools: ${child.tools?.length || 0}`}
                                            />
                                            <ListItemSecondaryAction>
                                                <IconButton edge="end" aria-label="edit" onClick={() => handleOpenChildForm(child)}>
                                                    <EditIcon />
                                                </IconButton>
                                                <IconButton edge="end" aria-label="delete" onClick={() => handleDeleteChildAgent(child.id)}>
                                                    <DeleteIcon />
                                                </IconButton>
                                            </ListItemSecondaryAction>
                                        </ListItem>
                                    ))}
                                </List>
                            ) : (
                                <Typography color="text.secondary" sx={{fontStyle: 'italic'}}>
                                    No child agents added yet. A {agentType} requires at least one child.
                                </Typography>
                            )}
                        </Grid>
                    )}

                    {formError && <Grid item xs={12}><FormHelperText error sx={{fontSize: '1rem', textAlign:'center'}}>{formError}</FormHelperText></Grid>}

                    <Grid item xs={12}>
                        <Button
                            type="submit" variant="contained" color="primary" size="large"
                            disabled={isSaving} fullWidth
                            startIcon={isSaving ? <CircularProgress size={20} color="inherit" /> : null}
                        >
                            {isSaving ? 'Saving...' : (initialData.id ? 'Update Agent' : 'Create Agent')}
                        </Button>
                    </Grid>
                </Grid>
            </Box>

            {/* Child Agent Form Dialog */}
            <ChildAgentFormDialog
                open={isChildFormOpen}
                onClose={handleCloseChildForm}
                onSave={handleSaveChildAgent}
                childAgentData={editingChild}
                availableGofannonTools={availableGofannonTools} // Pass Gofannon tools for child's ToolSelector
                loadingGofannon={loadingTools}
                gofannonError={toolError}
                onRefreshGofannon={handleRefreshGofannonTools}
            />
        </Paper>
    );
};

export default AgentForm;  