// src/components/agents/ChildAgentFormDialog.js
import React, { useState, useEffect } from 'react';
import {
    TextField, Button, Select, MenuItem, FormControl, InputLabel,
    Grid, Dialog, DialogTitle, DialogContent, DialogActions, FormHelperText,
    Checkbox, FormControlLabel, Typography
} from '@mui/material';
import { v4 as uuidv4 } from 'uuid';
import ToolSelector from '../tools/ToolSelector';
import { AGENT_TYPES, GEMINI_MODELS } from '../../constants/agentConstants';

const AGENT_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const RESERVED_AGENT_NAME = "user";

function validateAgentName(name) {
    // ... (validation logic remains the same)
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


const ChildAgentFormDialog = ({
                                  open,
                                  onClose,
                                  onSave,
                                  childAgentData,
                                  availableGofannonTools,
                                  loadingGofannon,
                                  gofannonError,
                                  onRefreshGofannon
                              }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [currentChildAgentType, setCurrentChildAgentType] = useState(AGENT_TYPES[0]);
    const [model, setModel] = useState(GEMINI_MODELS[0]);
    const [instruction, setInstruction] = useState('');
    const [selectedTools, setSelectedTools] = useState([]);
    const [enableCodeExecution, setEnableCodeExecution] = useState(false);
    const [outputKey, setOutputKey] = useState('');
    const [formError, setFormError] = useState('');
    const [nameError, setNameError] = useState('');

    // New state for usedCustomRepoUrls for this child agent
    const [usedCustomRepoUrls, setUsedCustomRepoUrls] = useState([]);

    // New handler for usedCustomRepoUrls change from ToolSelector
    const handleUsedCustomRepoUrlsChange = (urls) => {
        setUsedCustomRepoUrls(urls);
    };

    const handleCodeExecutionChange = (event) => {
        const isChecked = event.target.checked;
        setEnableCodeExecution(isChecked);
        if (isChecked) {
            setSelectedTools([]);
            setUsedCustomRepoUrls([]); // Clear custom repos if code execution is on
        }
    };

    const handleSelectedToolsChange = (newTools) => {
        setSelectedTools(newTools);
        if (newTools.length > 0 && enableCodeExecution) {
            setEnableCodeExecution(false);
        }
        // Update usedCustomRepoUrls based on newTools for this child
        const currentCustomRepoUrls = newTools
            .filter(st => st.type === 'custom_repo' && st.sourceRepoUrl)
            .map(st => st.sourceRepoUrl);
        setUsedCustomRepoUrls(Array.from(new Set(currentCustomRepoUrls)));
    };

    useEffect(() => {
        if (childAgentData) { // Editing an existing child
            setName(childAgentData.name || '');
            setDescription(childAgentData.description || '');
            setCurrentChildAgentType(childAgentData.agentType || AGENT_TYPES[0]);
            setModel(childAgentData.model || GEMINI_MODELS[0]);
            setInstruction(childAgentData.instruction || '');
            const initialEnableCodeExec = childAgentData.enableCodeExecution || false;
            setEnableCodeExecution(initialEnableCodeExec);
            setSelectedTools(initialEnableCodeExec ? [] : (childAgentData.tools || []));
            setOutputKey(childAgentData.outputKey || '');

            // Initialize usedCustomRepoUrls for the child being edited
            let derivedInitialCustomRepoUrls = [];
            if (childAgentData.usedCustomRepoUrls && Array.isArray(childAgentData.usedCustomRepoUrls)) {
                derivedInitialCustomRepoUrls = childAgentData.usedCustomRepoUrls;
            } else if (childAgentData.tools && Array.isArray(childAgentData.tools)) {
                derivedInitialCustomRepoUrls = (initialEnableCodeExec ? [] : (childAgentData.tools || []))
                    .filter(st => st.type === 'custom_repo' && st.sourceRepoUrl)
                    .map(st => st.sourceRepoUrl);
            }
            const finalInitialCustomRepos = initialEnableCodeExec ? [] : derivedInitialCustomRepoUrls;
            setUsedCustomRepoUrls(Array.from(new Set(finalInitialCustomRepos)));

        } else { // Creating a new child from scratch
            setName('');
            setDescription('');
            setCurrentChildAgentType(AGENT_TYPES[0]);
            setModel(GEMINI_MODELS[0]);
            setInstruction('');
            setSelectedTools([]);
            setEnableCodeExecution(false);
            setOutputKey('');
            setUsedCustomRepoUrls([]); // Reset for new child
        }
        setFormError('');
        setNameError('');
    }, [childAgentData, open]);

    const handleNameChange = (event) => {
        const newName = event.target.value;
        setName(newName);
        const validationError = validateAgentName(newName);
        setNameError(validationError || '');
    };

    const handleSave = () => {
        setFormError('');
        setNameError('');

        const agentNameError = validateAgentName(name);
        if (agentNameError) {
            setNameError(agentNameError);
            return;
        }

        if ((currentChildAgentType === 'Agent' || currentChildAgentType === 'LoopAgent') && !instruction.trim()) {
            setFormError('Child agent instruction is required for this agent type.');
            return;
        }

        const childDataToSave = {
            id: childAgentData?.id || uuidv4(),
            name,
            description,
            agentType: currentChildAgentType,
            model,
            instruction,
            tools: enableCodeExecution ? [] : selectedTools,
            enableCodeExecution,
            usedCustomRepoUrls: enableCodeExecution ? [] : usedCustomRepoUrls, // Include usedCustomRepoUrls
        };

        const trimmedOutputKey = outputKey.trim();
        if (trimmedOutputKey) {
            childDataToSave.outputKey = trimmedOutputKey;
        }

        if (currentChildAgentType === 'SequentialAgent' || currentChildAgentType === 'ParallelAgent') {
            childDataToSave.childAgents = childAgentData?.childAgents || [];
        }
        if (currentChildAgentType === 'LoopAgent') {
            childDataToSave.maxLoops = childAgentData?.maxLoops || 3;
        }

        onSave(childDataToSave);
        onClose();
    };

    const codeExecutionDisabledByToolSelection = selectedTools.length > 0;
    const showLlmFields = currentChildAgentType === 'Agent' || currentChildAgentType === 'LoopAgent';

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>
                {childAgentData ? 'Edit Step / Child Agent' : 'Add New Step / Child Agent'}
                {currentChildAgentType && <Typography variant="caption" sx={{ml: 1}}>({currentChildAgentType})</Typography>}
            </DialogTitle>
            <DialogContent>
                <Grid container spacing={2} sx={{ pt: 1 }}>
                    <Grid item xs={12}>
                        <TextField
                            label="Name"
                            value={name}
                            onChange={handleNameChange}
                            required
                            fullWidth
                            variant="outlined"
                            error={!!nameError}
                            helperText={nameError || "Unique name for this step/child agent."}
                        />
                    </Grid>
                    <Grid item xs={12}>
                        <TextField
                            label="Description (Optional)"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            multiline
                            rows={2}
                            fullWidth
                            variant="outlined"
                        />
                    </Grid>

                    {showLlmFields && (
                        <>
                            <Grid item xs={12} sm={6}>
                                <FormControl fullWidth variant="outlined" error={!!formError && formError.includes('model')}>
                                    <InputLabel>Model</InputLabel>
                                    <Select value={model} onChange={(e) => setModel(e.target.value)} label="Model">
                                        {GEMINI_MODELS.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                                    </Select>
                                    <FormHelperText>(Gemini 2 for built-in tools/executor)</FormHelperText>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    label="Output Key (Optional)"
                                    value={outputKey}
                                    onChange={(e) => setOutputKey(e.target.value)}
                                    fullWidth
                                    variant="outlined"
                                    helperText="If set, agent's text response is saved to session state."
                                />
                            </Grid>
                            <Grid item xs={12}>
                                <TextField
                                    label="Instruction (System Prompt)"
                                    value={instruction}
                                    onChange={(e) => setInstruction(e.target.value)}
                                    multiline
                                    rows={4}
                                    required={showLlmFields}
                                    fullWidth
                                    variant="outlined"
                                    placeholder="e.g., You are a specialized researcher..."
                                    error={!!formError && formError.includes('instruction')}
                                />
                            </Grid>
                            <Grid item xs={12}>
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={enableCodeExecution}
                                            onChange={handleCodeExecutionChange}
                                            name="enableChildCodeExecution"
                                            disabled={codeExecutionDisabledByToolSelection}
                                        />
                                    }
                                    label="Enable Built-in Code Execution"
                                />
                                <FormHelperText sx={{ml:3.5, mt:-0.5}}>
                                    (Requires a Gemini 2 model. Cannot be used if other tools are selected.)
                                </FormHelperText>
                            </Grid>
                            <Grid item xs={12}>
                                <ToolSelector
                                    availableGofannonTools={availableGofannonTools}
                                    selectedTools={selectedTools}
                                    onSelectedToolsChange={handleSelectedToolsChange}
                                    onRefreshGofannon={onRefreshGofannon}
                                    loadingGofannon={loadingGofannon}
                                    gofannonError={gofannonError}
                                    isCodeExecutionMode={enableCodeExecution}
                                    onUsedCustomRepoUrlsChange={handleUsedCustomRepoUrlsChange} // Pass the new handler
                                />
                            </Grid>
                        </>
                    )}

                    {(currentChildAgentType === 'SequentialAgent' || currentChildAgentType === 'ParallelAgent') && (
                        <Grid item xs={12}>
                            <Typography variant="body2" color="text.secondary">
                                Editing properties for a {currentChildAgentType}. Its internal steps/tasks are part of its original definition and not directly editable here.
                            </Typography>
                        </Grid>
                    )}

                    {formError && !nameError && <Grid item xs={12}><FormHelperText error>{formError}</FormHelperText></Grid>}
                </Grid>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button
                    onClick={handleSave}
                    variant="contained"
                    color="primary"
                    disabled={!!nameError}
                >
                    {childAgentData ? 'Save Changes' : 'Add Step / Child Agent'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default ChildAgentFormDialog;  