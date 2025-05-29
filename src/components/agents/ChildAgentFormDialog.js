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

    useEffect(() => {
        if (childAgentData) {
            setName(childAgentData.name || '');
            setDescription(childAgentData.description || '');
            setModel(childAgentData.model || GEMINI_MODELS[0]);
            setInstruction(childAgentData.instruction || '');
            setSelectedTools(childAgentData.tools || []);
            setEnableCodeExecution(childAgentData.enableCodeExecution || false);
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
    }, [childAgentData, open]);

    const handleSave = () => {
        if (!name.trim()) {
            setFormError('Child agent name is required.');
            return;
        }
        if (!instruction.trim()) {
            setFormError('Child agent instruction is required.');
            return;
        }

        const childDataToSave = {
            id: childAgentData?.id || uuidv4(),
            name,
            description,
            model,
            instruction,
            tools: selectedTools,
            enableCodeExecution,
            // outputKey: outputKey.trim() || undefined, // Old logic
        };

        const trimmedOutputKey = outputKey.trim();
        if (trimmedOutputKey) {
            childDataToSave.outputKey = trimmedOutputKey;
        }

        onSave(childDataToSave);
        onClose();
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>{childAgentData ? 'Edit Child Agent/Step' : 'Add New Child Agent/Step'}</DialogTitle>
            <DialogContent>
                <Grid container spacing={2} sx={{ pt: 1 }}>
                    <Grid item xs={12}>
                        <TextField
                            label="Child Agent/Step Name"
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
                            required
                            fullWidth
                            variant="outlined"
                            placeholder="e.g., You are a specialized researcher. Given a topic, find three key facts."
                            error={formError.includes('instruction')}
                        />
                    </Grid>
                    <Grid item xs={12}>
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={enableCodeExecution}
                                    onChange={(e) => setEnableCodeExecution(e.target.checked)}
                                    name="enableChildCodeExecution"
                                />
                            }
                            label="Enable Built-in Code Execution for this child agent"
                        />
                        <FormHelperText sx={{ml:3.5, mt:-0.5}}>(Requires a Gemini 2 model compatible with code execution.)</FormHelperText>
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
                    {childAgentData ? 'Save Changes' : 'Add Child Agent/Step'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default ChildAgentFormDialog;