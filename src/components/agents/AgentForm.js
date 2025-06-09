// src/components/agents/AgentForm.js
import React, {useState, useEffect, useRef} from 'react';
import ToolSelector from '../tools/ToolSelector';
import ChildAgentFormDialog from './ChildAgentFormDialog';
import ExistingAgentSelectorDialog from './ExistingAgentSelectorDialog';
import { fetchGofannonTools } from '../../services/agentService';
import {
    AGENT_TYPES,
    MODEL_PROVIDERS_LITELLM,
    DEFAULT_LITELLM_PROVIDER_ID,
    DEFAULT_LITELLM_BASE_MODEL_ID,
    getLiteLLMProviderConfig
} from '../../constants/agentConstants';
import { v4 as uuidv4 } from 'uuid';
import {
    TextField, Button, Select, MenuItem, FormControl, InputLabel,
    Paper, Grid, Box, CircularProgress, Typography, IconButton, List,
    ListItem, ListItemText, ListItemSecondaryAction, FormHelperText,
    Checkbox, FormControlLabel, Divider, Stack
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import LibraryAddIcon from '@mui/icons-material/LibraryAdd';
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
    return null;
}


const AgentForm = ({ onSubmit, initialData = {}, isSaving = false }) => {
    const [name, setName] = useState(initialData.name || '');
    const [description, setDescription] = useState(initialData.description || '');
    const [agentType, setAgentType] = useState(initialData.agentType || AGENT_TYPES[0]);

    // Model Selection State
    const [selectedProviderId, setSelectedProviderId] = useState(DEFAULT_LITELLM_PROVIDER_ID);
    const [selectedBaseModelId, setSelectedBaseModelId] = useState(DEFAULT_LITELLM_BASE_MODEL_ID);

    // LiteLLM Configuration State (mainly for custom, but also to store final values)
    const [litellmModelString, setLitellmModelString] = useState(initialData.litellm_model_string || `${getLiteLLMProviderConfig(DEFAULT_LITELLM_PROVIDER_ID).prefix}${DEFAULT_LITELLM_BASE_MODEL_ID}`);
    const [litellmApiBase, setLitellmApiBase] = useState(initialData.litellm_api_base || '');
    const [litellmApiKey, setLitellmApiKey] = useState(initialData.litellm_api_key || '');

    const [instruction, setInstruction] = useState(initialData.instruction || '');
    const [selectedTools, setSelectedTools] = useState(initialData.tools || []);
    const [maxLoops, setMaxLoops] = useState(initialData.maxLoops || 3);
    const [enableCodeExecution, setEnableCodeExecution] = useState(initialData.enableCodeExecution || false);
    const [outputKey, setOutputKey] = useState(initialData.outputKey || '');
    const [usedCustomRepoUrls, setUsedCustomRepoUrls] = useState(
        initialData.usedCustomRepoUrls ||
        (initialData.tools?.filter(t => t.type === 'custom_repo' && t.sourceRepoUrl).map(t => t.sourceRepoUrl) || [])
    );

    const [childAgents, setChildAgents] = useState(initialData.childAgents || []);
    const [isChildFormOpen, setIsChildFormOpen] = useState(false);
    const [isExistingAgentSelectorOpen, setIsExistingAgentSelectorOpen] = useState(false);
    const [editingChild, setEditingChild] = useState(null);

    const [availableGofannonTools, setAvailableGofannonTools] = useState([]);
    const [loadingTools, setLoadingTools] = useState(false);
    const [toolError, setToolError] = useState('');
    const [formError, setFormError] = useState('');
    const [nameError, setNameError] = useState('');

    // Derived state for UI
    const currentProviderConfig = getLiteLLMProviderConfig(selectedProviderId);
    const availableBaseModels = currentProviderConfig?.models || [];

    useEffect(() => {
        // When provider changes, update model string and reset base model if new provider has models
        const providerConf = getLiteLLMProviderConfig(selectedProviderId);
        if (providerConf) {
            if (selectedProviderId === 'custom') {
                // For custom, litellmModelString is user-defined
                // Keep existing litellmModelString or set to empty if it was from a provider
                if (!initialData.litellm_model_string?.startsWith(providerConf.prefix || '')) {
                    // If the existing model string doesn't seem like a custom one, clear it.
                    if (!litellmModelString || MODEL_PROVIDERS_LITELLM.some(p => litellmModelString.startsWith(p.prefix || ''))) {
                        setLitellmModelString('');
                    }
                }
                setSelectedBaseModelId(''); // No base model for custom
            } else if (providerConf.models && providerConf.models.length > 0) {
                // Check if current selectedBaseModelId is valid for new provider
                const newDefaultBaseModel = providerConf.models[0].id;
                const currentBaseModelIsValid = providerConf.models.some(m => m.id === selectedBaseModelId);

                let newBaseModelToSet = selectedBaseModelId;
                if (!currentBaseModelIsValid || selectedProviderId !== initialDataParsedProviderIdRef.current) {
                    newBaseModelToSet = newDefaultBaseModel;
                }
                setSelectedBaseModelId(newBaseModelToSet);
                setLitellmModelString(`${providerConf.prefix}${newBaseModelToSet}`);
            } else { // Provider with no predefined models (like potentially Azure if simplified)
                setSelectedBaseModelId('');
                // For Azure, model string might need full user input or a specific format
                if (selectedProviderId === 'azure') {
                    setLitellmModelString(providerConf.prefix || ''); // e.g., "azure/"
                } else {
                    setLitellmModelString(providerConf.prefix || '');
                }
            }
        }
        initialDataParsedProviderIdRef.current = selectedProviderId; // Track initial parse
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedProviderId]);

    // Update litellmModelString when selectedBaseModelId changes for a non-custom provider
    useEffect(() => {
        if (selectedProviderId !== 'custom' && selectedBaseModelId) {
            const providerConf = getLiteLLMProviderConfig(selectedProviderId);
            if (providerConf && providerConf.prefix !== null) {
                setLitellmModelString(`${providerConf.prefix}${selectedBaseModelId}`);
            }
        }
    }, [selectedBaseModelId, selectedProviderId]);


    const initialDataParsedProviderIdRef = useRef(null);

    useEffect(() => {
        setName(initialData.name || '');
        setDescription(initialData.description || '');
        setAgentType(initialData.agentType || AGENT_TYPES[0]);

        // Parse initial provider and model from initialData.litellm_model_string
        let initialProvider = DEFAULT_LITELLM_PROVIDER_ID;
        let initialBaseModel = DEFAULT_LITELLM_BASE_MODEL_ID;
        let initialFullModelString = initialData.litellm_model_string || `${getLiteLLMProviderConfig(DEFAULT_LITELLM_PROVIDER_ID).prefix}${DEFAULT_LITELLM_BASE_MODEL_ID}`;

        if (initialData.litellm_model_string) {
            const foundProvider = MODEL_PROVIDERS_LITELLM.find(
                p => p.prefix && initialData.litellm_model_string.startsWith(p.prefix)
            );
            if (foundProvider) {
                initialProvider = foundProvider.id;
                const modelPart = initialData.litellm_model_string.substring(foundProvider.prefix.length);
                if (foundProvider.models.some(m => m.id === modelPart)) {
                    initialBaseModel = modelPart;
                } else if (foundProvider.id !== 'azure') { // For azure, modelPart might be the deployment name
                    initialBaseModel = ''; // or a signal that it's a custom model within that provider
                }
            } else {
                // Could be a custom model string without a known prefix
                initialProvider = 'custom';
                initialBaseModel = '';
            }
        }

        initialDataParsedProviderIdRef.current = initialProvider;
        setSelectedProviderId(initialProvider);
        setSelectedBaseModelId(initialBaseModel);
        setLitellmModelString(initialFullModelString);

        setLitellmApiBase(initialData.litellm_api_base || '');
        setLitellmApiKey(initialData.litellm_api_key || '');

        setInstruction(initialData.instruction || '');
        const initialEnableCodeExec = initialData.enableCodeExecution || false;
        setEnableCodeExecution(initialEnableCodeExec);

        const initialSelectedTools = initialEnableCodeExec ? [] : (initialData.tools || []);
        setSelectedTools(initialSelectedTools);

        let derivedInitialCustomRepoUrls = [];
        if (initialData.usedCustomRepoUrls && Array.isArray(initialData.usedCustomRepoUrls)) {
            derivedInitialCustomRepoUrls = initialData.usedCustomRepoUrls;
        } else if (initialData.tools && Array.isArray(initialData.tools)) {
            derivedInitialCustomRepoUrls = initialSelectedTools
                .filter(st => st.type === 'custom_repo' && st.sourceRepoUrl)
                .map(st => st.sourceRepoUrl);
        }
        const finalInitialCustomRepos = initialEnableCodeExec ? [] : derivedInitialCustomRepoUrls;
        setUsedCustomRepoUrls(Array.from(new Set(finalInitialCustomRepos)));

        setMaxLoops(initialData.maxLoops || 3);
        setOutputKey(initialData.outputKey || '');
        setChildAgents((initialData.childAgents || []).map(ca => ({ ...ca, id: ca.id || uuidv4() })));
        setFormError('');
        setNameError('');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialData]);


    const handleCodeExecutionChange = (event) => {
        const isChecked = event.target.checked;
        setEnableCodeExecution(isChecked);
        if (isChecked) {
            setSelectedTools([]);
            setUsedCustomRepoUrls([]);
        }
    };

    const handleUsedCustomRepoUrlsChange = (urls) => {
        setUsedCustomRepoUrls(urls);
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
            return;
        }

        if ((agentType === 'SequentialAgent' || agentType === 'ParallelAgent') && childAgents.length === 0) {
            setFormError(`A ${agentType} requires at least one child agent/step.`);
            return;
        }

        let finalLitellmModelString = litellmModelString;
        if (selectedProviderId !== 'custom' && currentProviderConfig?.prefix && selectedBaseModelId) {
            finalLitellmModelString = `${currentProviderConfig.prefix}${selectedBaseModelId}`;
        } else if (selectedProviderId === 'azure' && currentProviderConfig?.prefix && !litellmModelString.startsWith(currentProviderConfig.prefix)) {
            // For Azure, if user typed only deployment name, prefix it.
            finalLitellmModelString = `${currentProviderConfig.prefix}${litellmModelString}`;
        }


        if (!finalLitellmModelString.trim()) {
            setFormError('LiteLLM Model String is required.');
            return;
        }

        const agentDataToSubmit = {
            name, description, agentType,
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
            agentDataToSubmit.outputKey = trimmedOutputKey;
        }

        if (agentType === 'LoopAgent') {
            agentDataToSubmit.maxLoops = Number(maxLoops);
        }
        if (agentType === 'SequentialAgent' || agentType === 'ParallelAgent') {
            agentDataToSubmit.childAgents = childAgents.map(ca => {
                const { id, ...restOfConfig } = ca;
                return restOfConfig;
            });
        }

        if (initialData && initialData.platform) {
            agentDataToSubmit.platform = initialData.platform;
        }

        const adkReadyTools = agentDataToSubmit.tools.map(tool => {
            const { sourceRepoUrl, type, ...adkToolProps } = tool;
            return adkToolProps;
        });
        agentDataToSubmit.tools = adkReadyTools;

        onSubmit(agentDataToSubmit);
    };

    const handleOpenChildFormForNew = () => {
        setEditingChild(null);
        setIsChildFormOpen(true);
    };

    const handleOpenChildFormForEdit = (childToEdit) => {
        setEditingChild(childToEdit);
        setIsChildFormOpen(true);
    };

    const handleCloseChildForm = () => {
        setIsChildFormOpen(false);
        setEditingChild(null);
    };

    const handleDeleteChildAgent = (childId) => {
        if (window.confirm("Are you sure you want to remove this child agent/step?")) {
            setChildAgents(prev => prev.filter(c => c.id !== childId));
        }
    };

    const handleOpenExistingAgentSelector = () => {
        setIsExistingAgentSelectorOpen(true);
    };

    const handleExistingAgentSelected = (selectedAgentFullConfig) => {
        const newChildAgent = {
            ...selectedAgentFullConfig,
            id: uuidv4(),
            agentType: selectedAgentFullConfig.agentType || AGENT_TYPES[0],
        };
        setChildAgents(prev => [...prev, newChildAgent]);
        setIsExistingAgentSelectorOpen(false);
    };

    const handleSaveChildAgent = (childDataFromForm) => {
        if (editingChild && editingChild.id) {
            setChildAgents(prev => prev.map(c => c.id === editingChild.id ? { ...childDataFromForm, id: editingChild.id } : c));
        } else {
            setChildAgents(prev => [...prev, { ...childDataFromForm, id: uuidv4(), agentType: childDataFromForm.agentType || AGENT_TYPES[0] }]);
        }
        setEditingChild(null);
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
                            label="Agent Name" id="name" value={name} onChange={handleNameChange}
                            required fullWidth variant="outlined" error={!!nameError}
                            helperText={nameError || "No spaces. Start with letter or _. Allowed: a-z, A-Z, 0-9, _. Not 'user'."}
                        />
                    </Grid>
                    <Grid item xs={12}>
                        <TextField label="Description" id="description" value={description} onChange={(e) => setDescription(e.target.value)} multiline rows={3} fullWidth variant="outlined" />
                    </Grid>
                    <Grid item xs={12}>
                        <FormControl fullWidth variant="outlined">
                            <InputLabel id="agentType-label">Agent Type</InputLabel>
                            <Select labelId="agentType-label" id="agentType" value={agentType} onChange={(e) => setAgentType(e.target.value)} label="Agent Type">
                                {AGENT_TYPES.map(type => <MenuItem key={type} value={type}>{type}</MenuItem>)}
                            </Select>
                        </FormControl>
                    </Grid>

                    {showParentConfig && (
                        <>
                            <Grid item xs={12} sm={selectedProviderId === 'custom' ? 12 : 6}>
                                <FormControl fullWidth variant="outlined">
                                    <InputLabel id="modelProvider-label">LLM Provider (via LiteLLM)</InputLabel>
                                    <Select
                                        labelId="modelProvider-label"
                                        value={selectedProviderId}
                                        onChange={(e) => setSelectedProviderId(e.target.value)}
                                        label="LLM Provider (via LiteLLM)"
                                    >
                                        {MODEL_PROVIDERS_LITELLM.map(provider => (
                                            <MenuItem key={provider.id} value={provider.id}>{provider.name}</MenuItem>
                                        ))}
                                    </Select>
                                    {currentProviderConfig?.requiresApiKeyInEnv &&
                                        <FormHelperText>
                                            Ensure API Key ({currentProviderConfig.requiresApiKeyInEnv}) is in environment if not providing below.
                                        </FormHelperText>
                                    }
                                </FormControl>
                            </Grid>

                            {selectedProviderId !== 'custom' && availableBaseModels.length > 0 && (
                                <Grid item xs={12} sm={6}>
                                    <FormControl fullWidth variant="outlined">
                                        <InputLabel id="baseModel-label">Base Model</InputLabel>
                                        <Select
                                            labelId="baseModel-label"
                                            value={selectedBaseModelId}
                                            onChange={(e) => setSelectedBaseModelId(e.target.value)}
                                            label="Base Model"
                                        >
                                            {availableBaseModels.map(model => (
                                                <MenuItem key={model.id} value={model.id}>{model.name}</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </Grid>
                            )}

                            {(selectedProviderId === 'custom' || (currentProviderConfig && currentProviderConfig.id ==='azure' /* Azure example */)) && (
                                <Grid item xs={12}>
                                    <TextField
                                        label="LiteLLM Model String"
                                        id="litellmModelString"
                                        value={litellmModelString}
                                        onChange={(e) => setLitellmModelString(e.target.value)}
                                        fullWidth variant="outlined" required
                                        helperText={
                                            selectedProviderId === 'azure'
                                                ? 'For Azure, include prefix, e.g., "azure/your-deployment-name"'
                                                : 'Full model string, e.g., "custom_provider/my-model-id", or from LiteLLM docs.'
                                        }
                                    />
                                </Grid>
                            )}


                            {(selectedProviderId === 'custom' || currentProviderConfig?.allowsCustomBase) && (
                                <Grid item xs={12} sm={(selectedProviderId === 'custom' || currentProviderConfig?.allowsCustomKey) ? 6 : 12}>
                                    <TextField
                                        label="API Base URL (Optional)"
                                        id="litellmApiBase"
                                        value={litellmApiBase}
                                        onChange={(e) => setLitellmApiBase(e.target.value)}
                                        fullWidth variant="outlined"
                                        placeholder="e.g., http://localhost:8000/v1"
                                        helperText="For custom endpoints. Leave blank for standard providers if keys are in env."
                                    />
                                </Grid>
                            )}

                            {(selectedProviderId === 'custom' || currentProviderConfig?.allowsCustomKey) && (
                                <Grid item xs={12} sm={(selectedProviderId === 'custom' || currentProviderConfig?.allowsCustomBase) ? 6 : 12}>
                                    <TextField
                                        label="API Key (Optional)"
                                        id="litellmApiKey"
                                        type="password"
                                        value={litellmApiKey}
                                        onChange={(e) => setLitellmApiKey(e.target.value)}
                                        fullWidth variant="outlined"
                                        helperText="API key for custom endpoint or to override env vars."
                                        autoComplete="new-password"
                                    />
                                </Grid>
                            )}

                            <Grid item xs={12}>
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
                                    required={showParentConfig}
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
                                    (Requires a compatible model. Cannot be used if other tools are selected.)
                                </FormHelperText>
                            </Grid>
                            <Grid item xs={12}>
                                <Typography variant="subtitle1" sx={{mb:1}}>
                                    {agentType === 'LoopAgent' ? "Tools for Looped Agent" : "Tools for Agent"}
                                </Typography>
                                <ToolSelector
                                    selectedTools={selectedTools}
                                    onSelectedToolsChange={handleSelectedToolsChange}
                                    onRefreshGofannon={handleRefreshGofannonTools}
                                    loadingGofannon={loadingTools}
                                    gofannonError={toolError}
                                    isCodeExecutionMode={enableCodeExecution}
                                    onUsedCustomRepoUrlsChange={handleUsedCustomRepoUrlsChange}
                                    availableGofannonTools={availableGofannonTools}
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
                        <>
                            <Grid item xs={12}>
                                <Typography variant="body2" color="text.secondary" sx={{mb:1}}>
                                    For {agentType === 'SequentialAgent' ? 'Sequential Agents, these are executed in order.' : 'Parallel Agents, these are executed concurrently.'} Configuration for Model, Instruction, Tools, etc., are defined within each Child Agent/Step.
                                </Typography>
                                <Divider sx={{ my: 2 }} />
                            </Grid>
                            <Grid item xs={12}>
                                <Typography variant="h6" gutterBottom>{childAgentSectionTitle}</Typography>
                                <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                                    <Button
                                        variant="outlined"
                                        startIcon={<AddCircleOutlineIcon />}
                                        onClick={handleOpenChildFormForNew}
                                    >
                                        {agentType === 'SequentialAgent' ? 'Add New Step' : 'Add New Parallel Task'}
                                    </Button>
                                    <Button
                                        variant="outlined"
                                        color="secondary"
                                        startIcon={<LibraryAddIcon />}
                                        onClick={handleOpenExistingAgentSelector}
                                    >
                                        Add Existing Agent as Step
                                    </Button>
                                </Stack>
                                {childAgents.length > 0 ? (
                                    <List dense sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                                        {childAgents.map((child, index) => (
                                            <ListItem key={child.id || index} divider={index < childAgents.length -1}>
                                                <ListItemText
                                                    primary={`${index + 1}. ${child.name}`}
                                                    secondary={
                                                        `Type: ${child.agentType || 'Agent'} | LiteLLM Model: ${child.litellm_model_string || 'N/A'} | ` +
                                                        `Tools: ${child.tools?.length || 0}${child.tools?.some(t => t.configuration) ? ' (Configured)' : ''} | ` +
                                                        `Code Exec: ${child.enableCodeExecution ? 'Yes' : 'No'} | OutputKey: ${child.outputKey || 'N/A'}`
                                                    }
                                                />
                                                <ListItemSecondaryAction>
                                                    <IconButton edge="end" aria-label="edit" onClick={() => handleOpenChildFormForEdit(child)}>
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
                        </>
                    )}

                    {formError && <Grid item xs={12}><FormHelperText error sx={{fontSize: '1rem', textAlign:'center'}}>{formError}</FormHelperText></Grid>}

                    <Grid item xs={12}>
                        <Button
                            type="submit" variant="contained" color="primary" size="large"
                            disabled={isSaving || !!nameError}
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
            <ExistingAgentSelectorDialog
                open={isExistingAgentSelectorOpen}
                onClose={() => setIsExistingAgentSelectorOpen(false)}
                onAgentSelected={handleExistingAgentSelected}
            />
        </Paper>
    );
};

export default AgentForm;  