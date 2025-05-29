// src/components/agents/ChildAgentFormDialog.js
import React, { useState, useEffect } from 'react';
import {
    TextField, Button, Select, MenuItem, FormControl, InputLabel,
    Grid, Dialog, DialogTitle, DialogContent, DialogActions, FormHelperText,
    Checkbox, FormControlLabel
} from '@mui/material';
import { v4 as uuidv4 } from 'uuid';
import ToolSelector from '../tools/ToolSelector';
import { GEMINI_MODELS } from '../../constants/agentConstants';

const AGENT_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const RESERVED_AGENT_NAME = "user";

function validateAgentName(name) { // Same validation function
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
    const [model, setModel] = useState(GEMINI_MODELS[0]);
    const [instruction, setInstruction] = useState('');
    const [selectedTools, setSelectedTools] = useState([]);
    const [enableCodeExecution, setEnableCodeExecution] = useState(false);
    const [outputKey, setOutputKey] = useState('');
    const [formError, setFormError] = useState('');
    const [nameError, setNameError] = useState(''); // Specific error for name field

    const handleCodeExecutionChange = (event) => {
        const isChecked = event.target.checked;
        setEnableCodeExecution(isChecked);
        if (isChecked) {
            setSelectedTools([]);
        }
    };

    const handleSelectedToolsChange = (newTools) => {
        setSelectedTools(newTools);
        if (newTools.length > 0 && enableCodeExecution) {
            setEnableCodeExecution(false);
        }
    };

    useEffect(() => {
        if (childAgentData) {
            setName(childAgentData.name || '');
            setDescription(childAgentData.description || '');
            setModel(childAgentData.model || GEMINI_MODELS[0]);
            setInstruction(childAgentData.instruction || '');
            const initialEnableCodeExec = childAgentData.enableCodeExecution || false;
            setEnableCodeExecution(initialEnableCodeExec);
            setSelectedTools(initialEnableCodeExec ? [] : (childAgentData.tools || []));
            setOutputKey(childAgentData.outputKey || '');
        } else {
            setName('');
            setDescription('');
            setModel(GEMINI_MODELS[0]);
            setInstruction('');
            setSelectedTools([]);
            setEnableCodeExecution(false);
            setOutputKey('');
        }
        setFormError('');
        setNameError(''); // Reset name error on data change
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

        if (!instruction.trim()) {
            setFormError('Child agent instruction is required.'); // This could be a general formError or specific to instruction field
            return;
        }

        const childDataToSave = {
            id: childAgentData?.id || uuidv4(),
            name,
            description,
            model,
            instruction,
            tools: enableCodeExecution ? [] : selectedTools,
            enableCodeExecution,
        };

        const trimmedOutputKey = outputKey.trim();
        if (trimmedOutputKey) {
            childDataToSave.outputKey = trimmedOutputKey;
        }

        onSave(childDataToSave);
        onClose();
    };

    const codeExecutionDisabledByToolSelection = selectedTools.length > 0;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>{childAgentData ? 'Edit Child Agent/Step' : 'Add New Child Agent/Step'}</DialogTitle>
            <DialogContent>
                <Grid container spacing={2} sx={{ pt: 1 }}>
                    <Grid item xs={12}>
                        <TextField
                            label="Child Agent/Step Name"
                            value={name}
                            onChange={handleNameChange} // Use new handler
                            required
                            fullWidth
                            variant="outlined"
                            error={!!nameError} // Show error state
                            helperText={nameError || "No spaces. Start with letter or _. Allowed: a-z, A-Z, 0-9, _. Not 'user'."} // Show error or hint
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
                            helperText="If set, agent's text response is saved to session state under this key."
                        />
                    </Grid>
                    <Grid item xs={12}>
                        <TextField
                            label="Child Instruction (System Prompt)"
                            value={instruction}
                            onChange={(e) => setInstruction(e.target.value)}
                            multiline
                            rows={4}
                            required // Keep this, validated generally by formError if needed
                            fullWidth
                            variant="outlined"
                            placeholder="e.g., You are a specialized researcher. Given a topic, find three key facts."
                            error={!!formError && formError.includes('instruction')} // If you want specific instruction error indication
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
                            label="Enable Built-in Code Execution for this child agent"
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
                        />
                    </Grid>
                    {formError && !nameError && <Grid item xs={12}><FormHelperText error>{formError}</FormHelperText></Grid>}
                </Grid>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button
                    onClick={handleSave}
                    variant="contained"
                    color="primary"
                    disabled={!!nameError} // Disable save if there's a name error
                >
                    {childAgentData ? 'Save Changes' : 'Add Child Agent/Step'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default ChildAgentFormDialog;