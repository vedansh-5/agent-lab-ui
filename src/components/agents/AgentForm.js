// src/components/agents/AgentForm.js
import React, { useState, useEffect } from 'react';
import ToolSelector from '../tools/ToolSelector';
import ChildAgentFormDialog from './ChildAgentFormDialog';
import { fetchGofannonTools } from '../../services/agentService';
import { AGENT_TYPES, GEMINI_MODELS } from '../../constants/agentConstants';
import {
    TextField, Button, Select, MenuItem, FormControl, InputLabel,
    Paper, Grid, Box, CircularProgress, Typography, IconButton, List,
    ListItem, ListItemText, ListItemSecondaryAction, FormHelperText,
    Checkbox, FormControlLabel
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';

const AGENT_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const RESERVED_AGENT_NAME = "user";

function validateAgentName(name) {
    if (!name || !name.trim()) {
        return "Agent Name is required.";
    }
    if (/\s/.test(name)) {
        return "Agent Name cannot contain spaces.";
    }
    if (!AGENT_NAME_REGEX.test(name)) {
        return "Agent Name must start with a letter or underscore, and can only contain letters, digits, or underscores.";
    }
    if (name.toLowerCase() === RESERVED_AGENT_NAME) {
        return `Agent Name cannot be "${RESERVED_AGENT_NAME}" as it's a reserved name.`;
    }
    if (name.length > 63) {
        return "Agent Name is too long (max 63 characters).";
    }
    return null; // No error
}


const AgentForm = ({ onSubmit, initialData = {}, isSaving = false }) => {
    const [name, setName] = useState(initialData.name || '');
    const [description, setDescription] = useState(initialData.description || '');
    const [agentType, setAgentType] = useState(initialData.agentType || AGENT_TYPES[0]);
    const [model, setModel] = useState(initialData.model || GEMINI_MODELS[0]);
    const [instruction, setInstruction] = useState(initialData.instruction || '');
    const [selectedTools, setSelectedTools] = useState(initialData.tools || []);
    const [maxLoops, setMaxLoops] = useState(initialData.maxLoops || 3);
    const [enableCodeExecution, setEnableCodeExecution] = useState(initialData.enableCodeExecution || false);
    const [outputKey, setOutputKey] = useState(initialData.outputKey || '');

    const [childAgents, setChildAgents] = useState(initialData.childAgents || []);
    const [isChildFormOpen, setIsChildFormOpen] = useState(false);
    const [editingChild, setEditingChild] = useState(null);

    const [availableGofannonTools, setAvailableGofannonTools] = useState([]);
    const [loadingTools, setLoadingTools] = useState(false);
    const [toolError, setToolError] = useState('');
    const [formError, setFormError] = useState('');
    const [nameError, setNameError] = useState(''); // Specific error for name field

    // Handler for when "Enable Code Execution" checkbox changes
    const handleCodeExecutionChange = (event) => {
        const isChecked = event.target.checked;
        setEnableCodeExecution(isChecked);
        if (isChecked) {
            setSelectedTools([]); // Clear selected tools if code execution is enabled
        }
    };

    // Handler for when ToolSelector changes selected tools
    const handleSelectedToolsChange = (newTools) => {
        setSelectedTools(newTools);
        if (newTools.length > 0 && enableCodeExecution) {
            setEnableCodeExecution(false);
        }
    };


    const handleRefreshGofannonTools = async () => {
        setLoadingTools(true);
        setToolError('');
        try {
            const result = await fetchGofannonTools();
            if (result.success && Array.isArray(result.manifest)) {
                setAvailableGofannonTools(result.manifest);
            } else {
                setToolError(result.message || "Could not load Gofannon tools or manifest is in an unexpected format.");
                setAvailableGofannonTools([]);
            }
        } catch (error) {
            console.error("Critical error during Gofannon tools fetch in AgentForm:", error);
            setToolError(`Critical failure fetching Gofannon tools: ${error.message}`);
            setAvailableGofannonTools([]);
        } finally {
            setLoadingTools(false);
        }
    };

    useEffect(() => {
        handleRefreshGofannonTools();
    }, []);

    useEffect(() => {
        setName(initialData.name || '');
        setDescription(initialData.description || '');
        setAgentType(initialData.agentType || AGENT_TYPES[0]);
        setModel(initialData.model || GEMINI_MODELS[0]);
        setInstruction(initialData.instruction || '');
        const initialEnableCodeExec = initialData.enableCodeExecution || false;
        setEnableCodeExecution(initialEnableCodeExec);
        setSelectedTools(initialEnableCodeExec ? [] : (initialData.tools || []));
        setMaxLoops(initialData.maxLoops || 3);
        setOutputKey(initialData.outputKey || '');
        setChildAgents(initialData.childAgents || []);
        setFormError('');
        setNameError(''); // Reset name error on initial data change
    }, [initialData]);

    const handleNameChange = (event) => {
        const newName = event.target.value;
        setName(newName);
        const validationError = validateAgentName(newName);
        setNameError(validationError || '');
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setFormError('');
        setNameError('');

        const agentNameError = validateAgentName(name);
        if (agentNameError) {
            setNameError(agentNameError);
            // setFormError("Please correct the errors above."); // Optional general error
            return;
        }

        if ((agentType === 'SequentialAgent' || agentType === 'ParallelAgent') && childAgents.length === 0) {
            setFormError(`A ${agentType} requires at least one child agent/step.`);
            return;
        }

        const agentDataToSubmit = {
            name, description, agentType,
            model, instruction,
            tools: enableCodeExecution ? [] : selectedTools,
            enableCodeExecution,
        };

        const trimmedOutputKey = outputKey.trim();
        if (trimmedOutputKey) {
            agentDataToSubmit.outputKey = trimmedOutputKey;
        }

        if (agentType === 'LoopAgent') {
            agentDataToSubmit.maxLoops = Number(maxLoops);
        }
        if (agentType === 'SequentialAgent' || agentType === 'ParallelAgent') {
            agentDataToSubmit.childAgents = childAgents;
        }

        if (initialData && initialData.platform) {
            agentDataToSubmit.platform = initialData.platform;
        }

        onSubmit(agentDataToSubmit);
    };

    const handleOpenChildForm = (childToEdit = null) => {
        setEditingChild(childToEdit);
        setIsChildFormOpen(true);
    };

    const handleCloseChildForm = () => {
        setIsChildFormOpen(false);
        setEditingChild(null);
    };

    const handleSaveChildAgent = (childData) => {
        if (editingChild) {
            setChildAgents(prev => prev.map(c => c.id === childData.id ? childData : c));
        } else {
            setChildAgents(prev => [...prev, childData]);
        }
    };

    const handleDeleteChildAgent = (childId) => {
        if (window.confirm("Are you sure you want to remove this child agent/step?")) {
            setChildAgents(prev => prev.filter(c => c.id !== childId));
        }
    };

    const showParentConfig = agentType === 'Agent' || agentType === 'LoopAgent';
    const showChildConfig = agentType === 'SequentialAgent' || agentType === 'ParallelAgent';

    let childAgentSectionTitle = "Child Agents";
    if (agentType === 'SequentialAgent') childAgentSectionTitle = "Sequential Steps";
    if (agentType === 'ParallelAgent') childAgentSectionTitle = "Parallel Tasks";

    const codeExecutionDisabledByToolSelection = selectedTools.length > 0;

    return (
        <Paper elevation={3} sx={{ p: { xs: 2, md: 4 } }}>
            <Box component="form" onSubmit={handleSubmit} noValidate>
                <Grid container spacing={3}>
                    <Grid item xs={12}>
                        <TextField
                            label="Agent Name"
                            id="name"
                            value={name}
                            onChange={handleNameChange} // Use new handler
                            required
                            fullWidth
                            variant="outlined"
                            error={!!nameError} // Show error state if nameError exists
                            helperText={nameError || "No spaces. Start with letter or _. Allowed: a-z, A-Z, 0-9, _. Not 'user'."} // Show error or hint
                        />
                    </Grid>
                    <Grid item xs={12}>
                        <TextField label="Description" id="description" value={description} onChange={(e) => setDescription(e.target.value)} multiline rows={3} fullWidth variant="outlined" />
                    </Grid>
                    <Grid item xs={12} sm={showParentConfig ? 4 : 6}>
                        <FormControl fullWidth variant="outlined">
                            <InputLabel id="agentType-label">Agent Type</InputLabel>
                            <Select labelId="agentType-label" id="agentType" value={agentType} onChange={(e) => setAgentType(e.target.value)} label="Agent Type">
                                {AGENT_TYPES.map(type => <MenuItem key={type} value={type}>{type}</MenuItem>)}
                            </Select>
                        </FormControl>
                    </Grid>

                    {showParentConfig && (
                        <>
                            <Grid item xs={12} sm={4}>
                                <FormControl fullWidth variant="outlined">
                                    <InputLabel id="model-label">Model</InputLabel>
                                    <Select labelId="model-label" id="model" value={model} onChange={(e) => setModel(e.target.value)} label="Model">
                                        {GEMINI_MODELS.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                                    </Select>
                                    <FormHelperText>
                                        {agentType === 'LoopAgent' ? "Model for the looped agent." : "Model for this agent."} (Gemini 2 for built-in tools/executor)
                                    </FormHelperText>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={4}>
                                <TextField
                                    label="Output Key (Optional)"
                                    id="outputKey" value={outputKey} onChange={(e) => setOutputKey(e.target.value)}
                                    fullWidth variant="outlined"
                                    helperText={agentType === 'LoopAgent' ? "Looped agent's response saved here." : "Agent's response saved here."}
                                />
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
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={enableCodeExecution}
                                            onChange={handleCodeExecutionChange}
                                            name="enableCodeExecution"
                                            disabled={codeExecutionDisabledByToolSelection}
                                        />
                                    }
                                    label="Enable Built-in Code Execution"
                                />
                                <FormHelperText sx={{ml:3.5, mt:-0.5}}>
                                    (For this agent or its looped child. Requires a Gemini 2 model. Cannot be used if other tools are selected.)
                                </FormHelperText>
                            </Grid>
                            <Grid item xs={12}>
                                <Typography variant="subtitle1" sx={{mb:1}}>
                                    {agentType === 'LoopAgent' ? "Tools for Looped Agent" : "Tools for Agent"}
                                </Typography>
                                <ToolSelector
                                    availableGofannonTools={availableGofannonTools}
                                    selectedTools={selectedTools}
                                    onSelectedToolsChange={handleSelectedToolsChange}
                                    onRefreshGofannon={handleRefreshGofannonTools}
                                    loadingGofannon={loadingTools}
                                    gofannonError={toolError}
                                    isCodeExecutionMode={enableCodeExecution}
                                />
                            </Grid>
                        </>
                    )}

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
                    {showChildConfig && (
                        <Grid item xs={12}>
                            <Typography variant="body2" color="text.secondary" sx={{mb:1}}>
                                For {agentType === 'SequentialAgent' ? 'Sequential Agents, these are executed in order.' : 'Parallel Agents, these are executed concurrently.'}
                                Model, Instruction, Tools, Output Key, and Code Execution are configured within each Child Agent/Step.
                            </Typography>
                        </Grid>
                    )}

                    {showChildConfig && (
                        <Grid item xs={12}>
                            <Typography variant="h6" gutterBottom>{childAgentSectionTitle}</Typography>
                            <Button
                                variant="outlined"
                                startIcon={<AddCircleOutlineIcon />}
                                onClick={() => handleOpenChildForm(null)}
                                sx={{ mb: 2 }}
                            >
                                {agentType === 'SequentialAgent' ? 'Add Step' : 'Add Parallel Task'}
                            </Button>
                            {childAgents.length > 0 ? (
                                <List dense sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                                    {childAgents.map((child, index) => (
                                        <ListItem key={child.id || index} divider={index < childAgents.length -1}>
                                            <ListItemText
                                                primary={`${index + 1}. ${child.name}`}
                                                secondary={`Model: ${child.model} | Tools: ${child.tools?.length || 0}${child.tools?.some(t => t.configuration) ? ' (some configured)' : ''} | Code Exec: ${child.enableCodeExecution ? 'Yes' : 'No'} | OutputKey: ${child.outputKey || 'N/A'}`}
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
                                    No child agents/steps added yet. A {agentType} requires at least one.
                                </Typography>
                            )}
                        </Grid>
                    )}

                    {formError && <Grid item xs={12}><FormHelperText error sx={{fontSize: '1rem', textAlign:'center'}}>{formError}</FormHelperText></Grid>}

                    <Grid item xs={12}>
                        <Button
                            type="submit" variant="contained" color="primary" size="large"
                            disabled={isSaving || !!nameError} // Disable submit if there's a name error
                            fullWidth
                            startIcon={isSaving ? <CircularProgress size={20} color="inherit" /> : null}
                        >
                            {isSaving ? 'Saving...' : (initialData.id ? 'Update Agent' : 'Create Agent')}
                        </Button>
                    </Grid>
                </Grid>
            </Box>

            <ChildAgentFormDialog
                open={isChildFormOpen}
                onClose={handleCloseChildForm}
                onSave={handleSaveChildAgent}
                childAgentData={editingChild}
                availableGofannonTools={availableGofannonTools}
                loadingGofannon={loadingTools}
                gofannonError={toolError}
                onRefreshGofannon={handleRefreshGofannonTools}
            />
        </Paper>
    );
};

export default AgentForm;  