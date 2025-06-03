// src/components/agents/ChildAgentFormDialog.js
import React, { useState, useEffect } from 'react';
import {
    TextField, Button, Select, MenuItem, FormControl, InputLabel,
    Grid, Dialog, DialogTitle, DialogContent, DialogActions, FormHelperText,
    Checkbox, FormControlLabel, Typography
} from '@mui/material';
import { v4 as uuidv4 } from 'uuid';
import ToolSelector from '../tools/ToolSelector';
import {
    AGENT_TYPES,
    MODEL_PROVIDERS,
    GOOGLE_GEMINI_MODELS_LIST,
    DEFAULT_GEMINI_MODEL
} from '../../constants/agentConstants';


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
    const [currentChildAgentType, setCurrentChildAgentType] = useState(AGENT_TYPES[0]); // Should be LlmAgent, not orchestrator

    // Model Configuration State for Child
    const [modelProvider, setModelProvider] = useState(MODEL_PROVIDERS[0].id);
    const [model, setModel] = useState(DEFAULT_GEMINI_MODEL); // For Gemini
    const [modelNameForEndpoint, setModelNameForEndpoint] = useState('');
    const [apiBase, setApiBase] = useState('');
    const [apiKey, setApiKey] = useState('');


    const [instruction, setInstruction] = useState('');
    const [selectedTools, setSelectedTools] = useState([]);
    const [enableCodeExecution, setEnableCodeExecution] = useState(false);
    const [outputKey, setOutputKey] = useState('');
    const [formError, setFormError] = useState('');
    const [nameError, setNameError] = useState('');
    const [usedCustomRepoUrls, setUsedCustomRepoUrls] = useState([]);

    const handleUsedCustomRepoUrlsChange = (urls) => {
        setUsedCustomRepoUrls(urls);
    };

    const handleCodeExecutionChange = (event) => {
        const isChecked = event.target.checked;
        setEnableCodeExecution(isChecked);
        if (isChecked) {
            setSelectedTools([]);
            setUsedCustomRepoUrls([]);
        }
    };

    const handleSelectedToolsChange = (newTools) => {
        setSelectedTools(newTools);
        if (newTools.length > 0 && enableCodeExecution) {
            setEnableCodeExecution(false);
        }
        const currentCustomRepoUrls = newTools
            .filter(st => st.type === 'custom_repo' && st.sourceRepoUrl)
            .map(st => st.sourceRepoUrl);
        setUsedCustomRepoUrls(Array.from(new Set(currentCustomRepoUrls)));
    };

    useEffect(() => {
        if (childAgentData) { // Editing an existing child
            setName(childAgentData.name || '');
            setDescription(childAgentData.description || '');
            // Child agents within orchestrators are typically 'Agent' or 'LoopAgent' for execution
            // They don't become orchestrators themselves *within this form context*
            setCurrentChildAgentType(childAgentData.agentType || AGENT_TYPES[0]);

            const initialProvider = childAgentData.modelProvider || MODEL_PROVIDERS[0].id;
            setModelProvider(initialProvider);
            if (initialProvider === 'google_gemini') {
                setModel(childAgentData.model || DEFAULT_GEMINI_MODEL);
                setModelNameForEndpoint(childAgentData.modelNameForEndpoint || '');
                setApiBase(childAgentData.apiBase || '');
                setApiKey(childAgentData.apiKey || '');
            } else if (initialProvider === 'openai_compatible') {
                setModelNameForEndpoint(childAgentData.modelNameForEndpoint || '');
                setApiBase(childAgentData.apiBase || '');
                setApiKey(childAgentData.apiKey || '');
                setModel(childAgentData.model || DEFAULT_GEMINI_MODEL);
            }

            setInstruction(childAgentData.instruction || '');
            const initialEnableCodeExec = childAgentData.enableCodeExecution || false;
            setEnableCodeExecution(initialEnableCodeExec);
            setSelectedTools(initialEnableCodeExec ? [] : (childAgentData.tools || []));
            setOutputKey(childAgentData.outputKey || '');

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
            setCurrentChildAgentType(AGENT_TYPES[0]); // Default to 'Agent' for a child step
            setModelProvider(MODEL_PROVIDERS[0].id);
            setModel(DEFAULT_GEMINI_MODEL);
            setModelNameForEndpoint('');
            setApiBase('');
            setApiKey('');
            setInstruction('');
            setSelectedTools([]);
            setEnableCodeExecution(false);
            setOutputKey('');
            setUsedCustomRepoUrls([]);
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

        // Child agents are 'Agent' or 'LoopAgent', not orchestrators themselves in this context
        if (!instruction.trim()) {
            setFormError('Child agent/step instruction is required.');
            return;
        }

        const childDataToSave = {
            id: childAgentData?.id || uuidv4(),
            name,
            description,
            agentType: currentChildAgentType, // This should be 'Agent' or 'LoopAgent'
            modelProvider,
            instruction,
            tools: enableCodeExecution ? [] : selectedTools,
            enableCodeExecution,
            usedCustomRepoUrls: enableCodeExecution ? [] : usedCustomRepoUrls,
        };

        if (modelProvider === 'google_gemini') {
            if (!model) {
                setFormError('Gemini Model is required for Google Gemini provider.');
                return;
            }
            childDataToSave.model = model;
        } else if (modelProvider === 'openai_compatible') {
            if (!modelNameForEndpoint) {
                setFormError('Model Name for Endpoint is required for OpenAI-Compatible provider.');
                return;
            }
            if (!apiBase) {
                setFormError('API Base URL is required for OpenAI-Compatible provider.');
                return;
            }
            childDataToSave.modelNameForEndpoint = modelNameForEndpoint;
            childDataToSave.apiBase = apiBase;
            childDataToSave.apiKey = apiKey;
        }


        const trimmedOutputKey = outputKey.trim();
        if (trimmedOutputKey) {
            childDataToSave.outputKey = trimmedOutputKey;
        }

        // For a child agent, 'childAgents' and 'maxLoops' are not typically set here,
        // unless this dialog is also used for editing deeply nested LoopAgents,
        // which adds complexity. Assuming LoopAgent's maxLoops is set on the parent form.
        if (currentChildAgentType === 'LoopAgent') {
            childDataToSave.maxLoops = childAgentData?.maxLoops || 3; // Or some default
        }


        onSave(childDataToSave);
        onClose();
    };

    const codeExecutionDisabledByToolSelection = selectedTools.length > 0;
    // Child agents in this dialog are always 'Agent' or 'LoopAgent' for their config
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
                            label="Name" value={name} onChange={handleNameChange} required
                            fullWidth variant="outlined" error={!!nameError}
                            helperText={nameError || "Unique name for this step/child agent."}
                        />
                    </Grid>
                    <Grid item xs={12}>
                        <TextField
                            label="Description (Optional)" value={description}
                            onChange={(e) => setDescription(e.target.value)} multiline rows={2}
                            fullWidth variant="outlined"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <FormControl fullWidth variant="outlined">
                            <InputLabel id="child-agentType-label">Agent Type (for this step)</InputLabel>
                            <Select
                                labelId="child-agentType-label"
                                value={currentChildAgentType}
                                onChange={(e) => setCurrentChildAgentType(e.target.value)}
                                label="Agent Type (for this step)"
                            >
                                {/* Child steps are executable units, not orchestrators themselves in this context */}
                                <MenuItem value="Agent">Agent (Standard LLM Task)</MenuItem>
                                <MenuItem value="LoopAgent">LoopAgent (Iterative Task)</MenuItem>
                            </Select>
                            <FormHelperText>Choose if this step is a standard task or an iterative loop.</FormHelperText>
                        </FormControl>
                    </Grid>

                    {showLlmFields && (
                        <>
                            <Grid item xs={12} sm={6}>
                                <FormControl fullWidth variant="outlined">
                                    <InputLabel id="child-modelProvider-label">Model Provider</InputLabel>
                                    <Select
                                        labelId="child-modelProvider-label"
                                        value={modelProvider}
                                        onChange={(e) => {
                                            const newProvider = e.target.value;
                                            setModelProvider(newProvider);
                                            if (newProvider === 'google_gemini') {
                                                setModel(DEFAULT_GEMINI_MODEL);
                                            } else {
                                                setModelNameForEndpoint(''); setApiBase(''); setApiKey('');
                                            }
                                        }}
                                        label="Model Provider"
                                    >
                                        {MODEL_PROVIDERS.map(provider => <MenuItem key={provider.id} value={provider.id}>{provider.name}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            </Grid>

                            {modelProvider === 'google_gemini' && (
                                <Grid item xs={12}>
                                    <FormControl fullWidth variant="outlined" error={!!formError && formError.includes('model')}>
                                        <InputLabel>Gemini Model</InputLabel>
                                        <Select value={model} onChange={(e) => setModel(e.target.value)} label="Gemini Model">
                                            {GOOGLE_GEMINI_MODELS_LIST.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                                        </Select>
                                        <FormHelperText>(Gemini 2 for built-in tools/executor)</FormHelperText>
                                    </FormControl>
                                </Grid>
                            )}
                            {modelProvider === 'openai_compatible' && (
                                <>
                                    <Grid item xs={12} sm={6}>
                                        <TextField
                                            label="Model Name (for Endpoint)" value={modelNameForEndpoint}
                                            onChange={(e) => setModelNameForEndpoint(e.target.value)}
                                            fullWidth variant="outlined" required
                                            helperText="Model ID for the endpoint."
                                        />
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <TextField
                                            label="API Base URL" value={apiBase}
                                            onChange={(e) => setApiBase(e.target.value)}
                                            fullWidth variant="outlined" required placeholder="e.g., https://api.example.com/v1"
                                            helperText="Base URL of the API."
                                        />
                                    </Grid>
                                    <Grid item xs={12}>
                                        <TextField
                                            label="API Key (Optional)" type="password" value={apiKey}
                                            onChange={(e) => setApiKey(e.target.value)}
                                            fullWidth variant="outlined" helperText="Leave blank if not required."
                                            autoComplete="new-password"
                                        />
                                    </Grid>
                                </>
                            )}
                            <Grid item xs={12}>
                                <TextField
                                    label="Output Key (Optional)" value={outputKey}
                                    onChange={(e) => setOutputKey(e.target.value)}
                                    fullWidth variant="outlined"
                                    helperText="If set, agent's text response is saved to session state."
                                />
                            </Grid>
                            <Grid item xs={12}>
                                <TextField
                                    label="Instruction (System Prompt)" value={instruction}
                                    onChange={(e) => setInstruction(e.target.value)}
                                    multiline rows={4} required={showLlmFields}
                                    fullWidth variant="outlined" placeholder="e.g., You are a specialized researcher..."
                                    error={!!formError && formError.includes('instruction')}
                                />
                            </Grid>
                            <Grid item xs={12}>
                                <FormControlLabel
                                    control={
                                        <Checkbox checked={enableCodeExecution} onChange={handleCodeExecutionChange} name="enableChildCodeExecution" disabled={codeExecutionDisabledByToolSelection} />
                                    }
                                    label="Enable Built-in Code Execution"
                                />
                                <FormHelperText sx={{ml:3.5, mt:-0.5}}>
                                    (Requires a compatible model. Cannot be used if other tools are selected.)
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
                                    onUsedCustomRepoUrlsChange={handleUsedCustomRepoUrlsChange}
                                />
                            </Grid>
                        </>
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