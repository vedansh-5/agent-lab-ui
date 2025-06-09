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
    MODEL_PROVIDERS_LITELLM, // Use the new constant
    DEFAULT_LITELLM_PROVIDER_ID,
    DEFAULT_LITELLM_BASE_MODEL_ID,
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
                                  childAgentData,
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
    const [litellmModelString, setLitellmModelString] = useState(childAgentData?.litellm_model_string || `${getLiteLLMProviderConfig(DEFAULT_LITELLM_PROVIDER_ID).prefix}${DEFAULT_LITELLM_BASE_MODEL_ID}`);
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
    const initialDataParsedProviderIdRef = useRef(null);

    // Effect to update model string when provider or base model changes
    useEffect(() => {
        const providerConf = getLiteLLMProviderConfig(selectedProviderId);
        if (providerConf) {
            if (selectedProviderId === 'custom') {
                if (!childAgentData?.litellm_model_string?.startsWith(providerConf.prefix || '')) {
                    if (!litellmModelString || MODEL_PROVIDERS_LITELLM.some(p => litellmModelString.startsWith(p.prefix || ''))) {
                        setLitellmModelString(childAgentData?.litellm_model_string || ''); // Keep if custom, or default to what was passed
                    }
                }
                setSelectedBaseModelId('');
            } else if (providerConf.models && providerConf.models.length > 0) {
                const newDefaultBaseModel = providerConf.models[0].id;
                const currentBaseModelIsValid = providerConf.models.some(m => m.id === selectedBaseModelId);

                let newBaseModelToSet = selectedBaseModelId;
                // If editing, try to keep the model if valid, otherwise default. For new, always default.
                if (!childAgentData || !currentBaseModelIsValid || selectedProviderId !== initialDataParsedProviderIdRef.current ) {
                    newBaseModelToSet = newDefaultBaseModel;
                }
                setSelectedBaseModelId(newBaseModelToSet);
                setLitellmModelString(`${providerConf.prefix}${newBaseModelToSet}`);

            } else { // Provider with no predefined models (like potentially Azure)
                setSelectedBaseModelId('');
                if (selectedProviderId === 'azure') {
                    setLitellmModelString(childAgentData?.litellm_model_string || (providerConf.prefix || ''));
                } else {
                    setLitellmModelString(providerConf.prefix || '');
                }
            }
        }
        if (!childAgentData) initialDataParsedProviderIdRef.current = selectedProviderId;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedProviderId, childAgentData]); // childAgentData in dep array to re-eval when dialog opens for different child

    useEffect(() => {
        if (selectedProviderId !== 'custom' && selectedBaseModelId) {
            const providerConf = getLiteLLMProviderConfig(selectedProviderId);
            if (providerConf && providerConf.prefix !== null) {
                setLitellmModelString(`${providerConf.prefix}${selectedBaseModelId}`);
            }
        }
    }, [selectedBaseModelId, selectedProviderId]);


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
        if (childAgentData) {
            setName(childAgentData.name || '');
            setDescription(childAgentData.description || '');
            setCurrentChildAgentType(childAgentData.agentType || AGENT_TYPES[0]);

            let initialProvider = DEFAULT_LITELLM_PROVIDER_ID;
            let initialBaseModel = DEFAULT_LITELLM_BASE_MODEL_ID;
            let initialFullModelStr = childAgentData.litellm_model_string || `${getLiteLLMProviderConfig(DEFAULT_LITELLM_PROVIDER_ID).prefix}${DEFAULT_LITELLM_BASE_MODEL_ID}`;

            if (childAgentData.litellm_model_string) {
                const foundProvider = MODEL_PROVIDERS_LITELLM.find(
                    p => p.prefix && childAgentData.litellm_model_string.startsWith(p.prefix)
                );
                if (foundProvider) {
                    initialProvider = foundProvider.id;
                    const modelPart = childAgentData.litellm_model_string.substring(foundProvider.prefix.length);
                    if (foundProvider.models.some(m => m.id === modelPart)) {
                        initialBaseModel = modelPart;
                    } else if (foundProvider.id !== 'azure') {
                        initialBaseModel = '';
                    }
                } else {
                    initialProvider = 'custom';
                    initialBaseModel = '';
                }
            }
            initialDataParsedProviderIdRef.current = initialProvider;
            setSelectedProviderId(initialProvider);
            setSelectedBaseModelId(initialBaseModel);
            setLitellmModelString(initialFullModelStr);
            setLitellmApiBase(childAgentData.litellm_api_base || '');
            setLitellmApiKey(childAgentData.litellm_api_key || '');

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
            setCurrentChildAgentType(AGENT_TYPES[0]);
            setSelectedProviderId(DEFAULT_LITELLM_PROVIDER_ID);
            setSelectedBaseModelId(DEFAULT_LITELLM_BASE_MODEL_ID);
            setLitellmModelString(`${getLiteLLMProviderConfig(DEFAULT_LITELLM_PROVIDER_ID).prefix}${DEFAULT_LITELLM_BASE_MODEL_ID}`);
            setLitellmApiBase('');
            setLitellmApiKey('');
            setInstruction('');
            setSelectedTools([]);
            setEnableCodeExecution(false);
            setOutputKey('');
            setUsedCustomRepoUrls([]);
            initialDataParsedProviderIdRef.current = DEFAULT_LITELLM_PROVIDER_ID;
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

        if (!instruction.trim()) {
            setFormError('Child agent/step instruction is required.');
            return;
        }

        let finalLitellmModelString = litellmModelString;
        if (selectedProviderId !== 'custom' && currentProviderConfig?.prefix && selectedBaseModelId) {
            finalLitellmModelString = `${currentProviderConfig.prefix}${selectedBaseModelId}`;
        } else if (selectedProviderId === 'azure' && currentProviderConfig?.prefix && !litellmModelString.startsWith(currentProviderConfig.prefix)){
            finalLitellmModelString = `${currentProviderConfig.prefix}${litellmModelString}`;
        }


        if (!finalLitellmModelString.trim()) {
            setFormError('LiteLLM Model String is required for child agent/step.');
            return;
        }

        const childDataToSave = {
            id: childAgentData?.id || uuidv4(),
            name,
            description,
            agentType: currentChildAgentType,
            instruction,
            tools: enableCodeExecution ? [] : selectedTools,
            enableCodeExecution,
            usedCustomRepoUrls: enableCodeExecution ? [] : usedCustomRepoUrls,
            litellm_model_string: finalLitellmModelString.trim(),
            litellm_api_base: selectedProviderId === 'custom' || currentProviderConfig?.allowsCustomBase ? (litellmApiBase.trim() || null) : null,
            litellm_api_key: selectedProviderId === 'custom' || currentProviderConfig?.allowsCustomKey ? (litellmApiKey.trim() || null) : null,
        };

        const trimmedOutputKey = outputKey.trim();
        if (trimmedOutputKey) {
            childDataToSave.outputKey = trimmedOutputKey;
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
                            <InputLabel id="child-agentType-label">Agent Type (for this step)</InputLabel>
                            <Select
                                labelId="child-agentType-label"
                                value={currentChildAgentType}
                                onChange={(e) => setCurrentChildAgentType(e.target.value)}
                                label="Agent Type (for this step)"
                            >
                                <MenuItem value="Agent">Agent (Standard LLM Task)</MenuItem>
                                <MenuItem value="LoopAgent">LoopAgent (Iterative Task)</MenuItem>
                            </Select>
                            <FormHelperText>Choose if this step is a standard task or an iterative loop.</FormHelperText>
                        </FormControl>
                    </Grid>

                    {showLlmFields && (
                        <>
                            <Grid item xs={12} sm={selectedProviderId === 'custom' ? 12 : 6}>
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
                                    {currentProviderConfig?.requiresApiKeyInEnv &&
                                        <FormHelperText>
                                            Ensure API Key ({currentProviderConfig.requiresApiKeyInEnv}) is in environment.
                                        </FormHelperText>
                                    }
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

                            {(selectedProviderId === 'custom' || (currentProviderConfig && currentProviderConfig.id === 'azure')) && (
                                <Grid item xs={12}>
                                    <TextField
                                        label="LiteLLM Model String"
                                        value={litellmModelString}
                                        onChange={(e) => setLitellmModelString(e.target.value)}
                                        fullWidth variant="outlined" required
                                        error={!!formError && formError.includes('LiteLLM Model String')}
                                        helperText={
                                            selectedProviderId === 'azure'
                                                ? 'For Azure, include prefix if not already, e.g., "azure/your-deployment-name"'
                                                : 'Full model string for LiteLLM.'
                                        }
                                    />
                                </Grid>
                            )}

                            {(selectedProviderId === 'custom' || currentProviderConfig?.allowsCustomBase) && (
                                <Grid item xs={12} sm={(selectedProviderId === 'custom' || currentProviderConfig?.allowsCustomKey) ? 6 : 12}>
                                    <TextField
                                        label="API Base URL (Optional)"
                                        value={litellmApiBase}
                                        onChange={(e) => setLitellmApiBase(e.target.value)}
                                        fullWidth variant="outlined"
                                        helperText="For custom LiteLLM endpoints."
                                    />
                                </Grid>
                            )}
                            {(selectedProviderId === 'custom' || currentProviderConfig?.allowsCustomKey) && (
                                <Grid item xs={12} sm={(selectedProviderId === 'custom' || currentProviderConfig?.allowsCustomBase) ? 6 : 12}>
                                    <TextField
                                        label="API Key (Optional)"
                                        type="password"
                                        value={litellmApiKey}
                                        onChange={(e) => setLitellmApiKey(e.target.value)}
                                        fullWidth variant="outlined"
                                        helperText="For custom endpoints or to override env vars."
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