// src/components/agents/ChildAgentFormDialog.js
import React, { useState, useEffect, useRef } from 'react';
import {
    TextField, Button, Select, MenuItem, FormControl, InputLabel,
    Grid, Dialog, DialogTitle, DialogContent, DialogActions, FormHelperText,
    Checkbox, FormControlLabel, Typography
} from '@mui/material';
import { v4 as uuidv4 } from 'uuid';
import ToolSelector from '../tools/ToolSelector';
import {
    AGENT_TYPES,
    MODEL_PROVIDERS_LITELLM,
    DEFAULT_LITELLM_PROVIDER_ID,
    DEFAULT_LITELLM_BASE_MODEL_ID, // This is the full model string for default
    getLiteLLMProviderConfig
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
                                  childAgentData, // This is initialData for the child
                                  availableGofannonTools,
                                  loadingGofannon,
                                  gofannonError,
                                  onRefreshGofannon
                              }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [currentChildAgentType, setCurrentChildAgentType] = useState(AGENT_TYPES[0]);

    // Model Selection State for Child
    const [selectedProviderId, setSelectedProviderId] = useState(DEFAULT_LITELLM_PROVIDER_ID);
    const [selectedBaseModelId, setSelectedBaseModelId] = useState(DEFAULT_LITELLM_BASE_MODEL_ID);

    // LiteLLM Configuration State for Child
    const [litellmModelString, setLitellmModelString] = useState(DEFAULT_LITELLM_BASE_MODEL_ID);
    const [litellmApiBase, setLitellmApiBase] = useState('');
    const [litellmApiKey, setLitellmApiKey] = useState('');


    const [instruction, setInstruction] = useState('');
    const [selectedTools, setSelectedTools] = useState([]);
    const [enableCodeExecution, setEnableCodeExecution] = useState(false);
    const [outputKey, setOutputKey] = useState('');
    const [formError, setFormError] = useState('');
    const [nameError, setNameError] = useState('');
    const [usedCustomRepoUrls, setUsedCustomRepoUrls] = useState([]);

    const currentProviderConfig = getLiteLLMProviderConfig(selectedProviderId);
    const availableBaseModels = currentProviderConfig?.models || [];
    const initialDataProcessedRef = useRef(false);


    // Effect for initializing form state from childAgentData
    useEffect(() => {
        if (open) { // Only run when dialog opens
            initialDataProcessedRef.current = false; // Reset for new/edit
            if (childAgentData) {
                setName(childAgentData.name || '');
                setDescription(childAgentData.description || '');
                setCurrentChildAgentType(childAgentData.agentType || AGENT_TYPES[0]);

                let initialSelectedProvider = childAgentData.selectedProviderId || DEFAULT_LITELLM_PROVIDER_ID;
                let initialModelString = childAgentData.litellm_model_string || DEFAULT_LITELLM_BASE_MODEL_ID;

                if (!childAgentData.selectedProviderId && childAgentData.litellm_model_string) {
                    const foundProviderByPrefix = MODEL_PROVIDERS_LITELLM.find(
                        p => p.prefix && childAgentData.litellm_model_string.startsWith(p.prefix)
                    );
                    if (foundProviderByPrefix) {
                        initialSelectedProvider = foundProviderByPrefix.id;
                    } else if (!MODEL_PROVIDERS_LITELLM.some(p => p.id === initialSelectedProvider)) {
                        initialSelectedProvider = 'custom';
                    }
                }
                setSelectedProviderId(initialSelectedProvider);

                const providerConf = getLiteLLMProviderConfig(initialSelectedProvider);
                if (providerConf?.id !== 'custom' && providerConf?.models.some(m => m.id === initialModelString)) {
                    setSelectedBaseModelId(initialModelString);
                } else if (providerConf?.id === 'custom') {
                    setSelectedBaseModelId('');
                } else {
                    const firstModelOfProvider = providerConf?.models[0]?.id;
                    setSelectedBaseModelId(firstModelOfProvider || '');
                    initialModelString = firstModelOfProvider || (initialSelectedProvider === 'custom' ? initialModelString : '');
                }
                setLitellmModelString(initialModelString);

                setLitellmApiBase(childAgentData.litellm_api_base || '');
                setLitellmApiKey(childAgentData.litellm_api_key || '');
                setInstruction(childAgentData.instruction || '');
                const initialEnableCodeExec = childAgentData.enableCodeExecution || false;
                setEnableCodeExecution(initialEnableCodeExec);
                setSelectedTools(initialEnableCodeExec ? [] : (childAgentData.tools || []));
                setOutputKey(childAgentData.outputKey || '');
                setUsedCustomRepoUrls(
                    initialEnableCodeExec ? [] : (
                        childAgentData.usedCustomRepoUrls ||
                        (childAgentData.tools?.filter(t => t.type === 'custom_repo' && t.sourceRepoUrl).map(t => t.sourceRepoUrl) || [])
                    )
                );
            } else { // Creating a new child from scratch
                setName('');
                setDescription('');
                setCurrentChildAgentType(AGENT_TYPES[0]);
                setSelectedProviderId(DEFAULT_LITELLM_PROVIDER_ID);
                setSelectedBaseModelId(DEFAULT_LITELLM_BASE_MODEL_ID);
                setLitellmModelString(DEFAULT_LITELLM_BASE_MODEL_ID);
                setLitellmApiBase('');
                setLitellmApiKey('');
                setInstruction('');
                setSelectedTools([]);
                setEnableCodeExecution(false);
                setOutputKey('');
                setUsedCustomRepoUrls([]);
            }
            setFormError('');
            setNameError('');
            initialDataProcessedRef.current = true;
        }
    }, [childAgentData, open]);

    // Effect for handling selectedProviderId change
    useEffect(() => {
        if (!open || !initialDataProcessedRef.current) return; // Don't run on initial load if open is false or data not yet processed

        const providerConf = getLiteLLMProviderConfig(selectedProviderId);
        if (providerConf) {
            if (selectedProviderId === 'custom') {
                setSelectedBaseModelId('');
                // If switching to custom, clear model string unless it was already custom
                if (childAgentData?.selectedProviderId !== 'custom') {
                    setLitellmModelString('');
                } else {
                    setLitellmModelString(childAgentData?.litellm_model_string || '');
                }
            } else if (providerConf.models && providerConf.models.length > 0) {
                const firstModelId = providerConf.models[0].id;
                // If current selectedBaseModelId is not valid for new provider, default to first model
                const currentBaseIsValid = providerConf.models.some(m => m.id === selectedBaseModelId);
                const newBaseModel = currentBaseIsValid ? selectedBaseModelId : firstModelId;

                setSelectedBaseModelId(newBaseModel);
                setLitellmModelString(newBaseModel);
            } else {
                setSelectedBaseModelId('');
                setLitellmModelString('');
            }
        }
    }, [selectedProviderId, open, childAgentData, selectedBaseModelId]);

    // Effect for handling selectedBaseModelId change (for non-custom providers)
    useEffect(() => {
        if (!open || !initialDataProcessedRef.current) return;

        if (selectedProviderId !== 'custom' && selectedBaseModelId) {
            setLitellmModelString(selectedBaseModelId);
        }
    }, [selectedBaseModelId, selectedProviderId, open]);


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

        if (showLlmFields && !instruction.trim()) { // Only require instruction if LLM fields are shown
            setFormError('Child agent/step instruction is required.');
            return;
        }

        let finalModelStringForSubmit;
        if (selectedProviderId === 'custom') {
            finalModelStringForSubmit = litellmModelString.trim();
        } else {
            finalModelStringForSubmit = selectedBaseModelId; // This is the full model ID
        }

        if (showLlmFields && !finalModelStringForSubmit) { // Only require model string if LLM fields shown
            setFormError('LiteLLM Model String is required for child agent/step.');
            return;
        }

        const childDataToSave = {
            id: childAgentData?.id || uuidv4(),
            name,
            description,
            agentType: currentChildAgentType, // This should be 'Agent' or 'LoopAgent' for children
            instruction: showLlmFields ? instruction : null, // Nullify if not applicable
            tools: (showLlmFields && !enableCodeExecution) ? selectedTools : [],
            enableCodeExecution: showLlmFields ? enableCodeExecution : false,
            usedCustomRepoUrls: (showLlmFields && !enableCodeExecution) ? usedCustomRepoUrls : [],

            selectedProviderId: showLlmFields ? selectedProviderId : null,
            litellm_model_string: showLlmFields ? finalModelStringForSubmit : null,
            litellm_api_base: (showLlmFields && currentProviderConfig?.allowsCustomBase && litellmApiBase.trim()) ? litellmApiBase.trim() : null,
            litellm_api_key: (showLlmFields && currentProviderConfig?.allowsCustomKey && litellmApiKey.trim()) ? litellmApiKey.trim() : null,
        };

        const trimmedOutputKey = outputKey.trim();
        if (showLlmFields && trimmedOutputKey) {
            childDataToSave.outputKey = trimmedOutputKey;
        }

        if (currentChildAgentType === 'LoopAgent' && showLlmFields) { // LoopAgent specific field
            childDataToSave.maxLoops = childAgentData?.maxLoops || 3; // Keep existing or default
        }


        onSave(childDataToSave);
        onClose();
    };

    const codeExecutionDisabledByToolSelection = selectedTools.length > 0;
    // For child agents/steps, they are always effectively 'Agent' or 'LoopAgent' types in terms of having their own LLM config.
    // The parent (SequentialAgent/ParallelAgent) doesn't have its own LLM config.
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
                    <Grid item xs={12} sm={showLlmFields ? 6 : 12}>
                        <FormControl fullWidth variant="outlined">
                            <InputLabel id="child-agentType-label">Type (for this step)</InputLabel>
                            <Select
                                labelId="child-agentType-label"
                                value={currentChildAgentType}
                                onChange={(e) => setCurrentChildAgentType(e.target.value)}
                                label="Type (for this step)"
                            >
                                {/* Child agents in a sequence/parallel are individual LlmAgents or LoopAgents */}
                                <MenuItem value="Agent">Agent (Standard LLM Task)</MenuItem>
                                <MenuItem value="LoopAgent">LoopAgent (Iterative LLM Task)</MenuItem>
                            </Select>
                            <FormHelperText>Choose if this step is a standard task or an iterative loop.</FormHelperText>
                        </FormControl>
                    </Grid>

                    {showLlmFields && (
                        <>
                            <Grid item xs={12} sm={6}>
                                <FormControl fullWidth variant="outlined">
                                    <InputLabel id="child-modelProvider-label">LLM Provider (LiteLLM)</InputLabel>
                                    <Select
                                        labelId="child-modelProvider-label"
                                        value={selectedProviderId}
                                        onChange={(e) => setSelectedProviderId(e.target.value)}
                                        label="LLM Provider (LiteLLM)"
                                    >
                                        {MODEL_PROVIDERS_LITELLM.map(provider => <MenuItem key={provider.id} value={provider.id}>{provider.name}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            </Grid>

                            {selectedProviderId !== 'custom' && availableBaseModels.length > 0 && (
                                <Grid item xs={12} sm={6}>
                                    <FormControl fullWidth variant="outlined">
                                        <InputLabel id="child-baseModel-label">Base Model</InputLabel>
                                        <Select
                                            labelId="child-baseModel-label"
                                            value={selectedBaseModelId}
                                            onChange={(e) => setSelectedBaseModelId(e.target.value)}
                                            label="Base Model"
                                        >
                                            {availableBaseModels.map(m => <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>)}
                                        </Select>
                                    </FormControl>
                                </Grid>
                            )}

                            <Grid item xs={12}>
                                <TextField
                                    label="LiteLLM Model String"
                                    id="child-litellmModelString"
                                    value={litellmModelString}
                                    onChange={(e) => {
                                        if (selectedProviderId === 'custom') {
                                            setLitellmModelString(e.target.value);
                                        }
                                    }}
                                    fullWidth variant="outlined" required
                                    disabled={selectedProviderId !== 'custom'}
                                    helperText={
                                        selectedProviderId === 'custom'
                                            ? 'Full model string as LiteLLM expects it.'
                                            : `Selected model: ${litellmModelString || "N/A"}. Change via dropdowns.`
                                    }
                                    error={formError.includes('LiteLLM Model String')}
                                />
                            </Grid>

                            {currentProviderConfig?.allowsCustomBase && (
                                <Grid item xs={12} sm={(currentProviderConfig?.allowsCustomKey) ? 6 : 12}>
                                    <TextField
                                        label="API Base URL (Override)"
                                        id="child-litellmApiBase"
                                        value={litellmApiBase}
                                        onChange={(e) => setLitellmApiBase(e.target.value)}
                                        fullWidth variant="outlined"
                                        placeholder={`Default: ${currentProviderConfig?.apiBase || 'Not set'}`}
                                        helperText="Overrides provider default. Only if this provider allows it."
                                    />
                                </Grid>
                            )}
                            {currentProviderConfig?.allowsCustomKey && (
                                <Grid item xs={12} sm={(currentProviderConfig?.allowsCustomBase) ? 6 : 12}>
                                    <TextField
                                        label="API Key (Override)"
                                        id="child-litellmApiKey"
                                        type="password"
                                        value={litellmApiKey}
                                        onChange={(e) => setLitellmApiKey(e.target.value)}
                                        fullWidth variant="outlined"
                                        helperText={`Overrides key from env var (${currentProviderConfig?.requiresApiKeyInEnv || 'N/A'}). Only if provider allows.`}
                                        autoComplete="new-password"
                                    />
                                </Grid>
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
                                    error={formError.includes('instruction')}
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