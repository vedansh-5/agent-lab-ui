// src/components/agents/AgentForm.js
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
    Divider, Stack, Alert // Removed Checkbox, FormControlLabel (no longer for code exec)
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

    const [selectedProviderId, setSelectedProviderId] = useState(initialData.selectedProviderId || DEFAULT_LITELLM_PROVIDER_ID);
    const [selectedBaseModelId, setSelectedBaseModelId] = useState(initialData.litellm_model_string || DEFAULT_LITELLM_BASE_MODEL_ID);
    const [inputtedModelString, setInputtedModelString] = useState(initialData.litellm_model_string || DEFAULT_LITELLM_BASE_MODEL_ID);
    const [litellmApiBase, setLitellmApiBase] = useState(initialData.litellm_api_base || '');
    const [litellmApiKey, setLitellmApiKey] = useState(initialData.litellm_api_key || '');

    const [instruction, setInstruction] = useState(initialData.instruction || '');
    const [selectedTools, setSelectedTools] = useState(initialData.tools || []);
    const [maxLoops, setMaxLoops] = useState(initialData.maxLoops || 3);
    // enableCodeExecution state and related logic removed
    const [outputKey, setOutputKey] = useState(initialData.outputKey || '');
    // usedCustomRepoUrls now needs to be managed based on selectedTools types
    const [usedCustomRepoUrls, setUsedCustomRepoUrls] = useState(
        initialData.usedCustomRepoUrls ||
        (initialData.tools?.filter(t => t.type === 'custom_repo' && t.sourceRepoUrl).map(t => t.sourceRepoUrl) || [])
    );
    const [usedMcpServerUrls, setUsedMcpServerUrls] = useState( // New state for MCP Server URLs
        initialData.usedMcpServerUrls ||
        (initialData.tools?.filter(t => t.type === 'mcp' && t.mcpServerUrl).map(t => t.mcpServerUrl) || [])
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

    const initialDataProcessedRef = useRef(false);

    const currentProviderConfig = getLiteLLMProviderConfig(selectedProviderId);
    const availableBaseModels = currentProviderConfig?.models || [];

    useEffect(() => {
        if (initialData && !initialDataProcessedRef.current) {
            setName(initialData.name || '');
            setDescription(initialData.description || '');
            setAgentType(initialData.agentType || AGENT_TYPES[0]);

            let initialSelectedProvider = initialData.selectedProviderId || DEFAULT_LITELLM_PROVIDER_ID;
            let initialBaseModelName = initialData.litellm_model_string || DEFAULT_LITELLM_BASE_MODEL_ID;

            if (!initialData.selectedProviderId && initialData.litellm_model_string) {
                const fullModelStr = initialData.litellm_model_string;
                let foundProvider = MODEL_PROVIDERS_LITELLM.find(
                    p => p.liteLlmModelPrefix && fullModelStr.startsWith(p.liteLlmModelPrefix + "/")
                );

                if (foundProvider) {
                    initialSelectedProvider = foundProvider.id;
                    initialBaseModelName = fullModelStr.substring(foundProvider.liteLlmModelPrefix.length + 1);
                } else {
                    if (fullModelStr.startsWith("azure/")) {
                        foundProvider = getLiteLLMProviderConfig("azure");
                        initialSelectedProvider = "azure";
                        initialBaseModelName = fullModelStr.substring("azure/".length);
                    }
                    else if (initialSelectedProvider !== "custom" && !MODEL_PROVIDERS_LITELLM.some(p => p.id === initialSelectedProvider)) {
                        initialSelectedProvider = 'custom';
                        initialBaseModelName = fullModelStr;
                    }
                }
            }
            setSelectedProviderId(initialSelectedProvider);

            const providerConf = getLiteLLMProviderConfig(initialSelectedProvider);
            if (providerConf?.id === 'custom' || providerConf?.id === 'openai_compatible') {
                setSelectedBaseModelId('');
                setInputtedModelString(initialBaseModelName);
            } else if (providerConf?.models.some(m => m.id === initialBaseModelName)) {
                setSelectedBaseModelId(initialBaseModelName);
                setInputtedModelString(initialBaseModelName);
            } else {
                const firstModelOfProvider = providerConf?.models[0]?.id || '';
                setSelectedBaseModelId(firstModelOfProvider);
                setInputtedModelString(firstModelOfProvider);
            }

            setLitellmApiBase(initialData.litellm_api_base || '');
            setLitellmApiKey(initialData.litellm_api_key || '');
            setInstruction(initialData.instruction || '');
            // enableCodeExecution removed
            setSelectedTools(initialData.tools || []);
            setUsedCustomRepoUrls(
                initialData.usedCustomRepoUrls ||
                (initialData.tools?.filter(t => t.type === 'custom_repo' && t.sourceRepoUrl).map(t => t.sourceRepoUrl) || [])
            );
            setUsedMcpServerUrls( // Initialize MCP URLs
                initialData.usedMcpServerUrls ||
                (initialData.tools?.filter(t => t.type === 'mcp' && t.mcpServerUrl).map(t => t.mcpServerUrl) || [])
            );
            setMaxLoops(initialData.maxLoops || 3);
            setOutputKey(initialData.outputKey || '');
            setChildAgents((initialData.childAgents || []).map(ca => ({ ...ca, id: ca.id || uuidv4() })));
            setFormError('');
            setNameError('');
            initialDataProcessedRef.current = true;
        }
    }, [initialData]);

    useEffect(() => {
        if (!initialDataProcessedRef.current && Object.keys(initialData).length > 0) return;

        const providerConf = getLiteLLMProviderConfig(selectedProviderId);
        if (providerConf) {
            if (providerConf.id === 'custom' || providerConf.id === 'openai_compatible') {
                setSelectedBaseModelId('');
                if (initialData?.selectedProviderId !== 'custom' && initialData?.selectedProviderId !== 'openai_compatible') {
                    setInputtedModelString('');
                } else {
                    setInputtedModelString(initialData.litellm_model_string || '');
                }

            } else if (providerConf.models && providerConf.models.length > 0) {
                const firstModelId = providerConf.models[0].id;
                const currentBaseIsValidForNewProvider = providerConf.models.some(m => m.id === selectedBaseModelId);
                const newBaseModel = currentBaseIsValidForNewProvider ? selectedBaseModelId : firstModelId;
                setSelectedBaseModelId(newBaseModel);
                setInputtedModelString(newBaseModel);
            } else {
                setSelectedBaseModelId('');
                setInputtedModelString('');
            }
            setLitellmApiBase(providerConf.allowsCustomBase ? (litellmApiBase || '') : (providerConf.apiBase || ''));
            setLitellmApiKey('');
        }
    }, [selectedProviderId, initialData, litellmApiBase, selectedBaseModelId]);

    useEffect(() => {
        if (!initialDataProcessedRef.current && Object.keys(initialData).length > 0) return;
        if (selectedProviderId !== 'custom' && selectedProviderId !== 'openai_compatible' && selectedBaseModelId) {
            setInputtedModelString(selectedBaseModelId);
        }
    }, [selectedBaseModelId, selectedProviderId, initialData]);

    // Removed handleCodeExecutionChange

    const handleUsedCustomRepoUrlsChange = (urls) => { // Keep this for custom Gofannon tools
        setUsedCustomRepoUrls(urls);
    };
    const handleUsedMcpServerUrlsChange = (urls) => { // New handler for MCP servers
        setUsedMcpServerUrls(urls);
    };


    const handleSelectedToolsChange = (newTools) => {
        setSelectedTools(newTools);
        // enableCodeExecution logic removed
        const currentCustomRepoUrls = newTools
            .filter(st => st.type === 'custom_repo' && st.sourceRepoUrl)
            .map(st => st.sourceRepoUrl);
        setUsedCustomRepoUrls(Array.from(new Set(currentCustomRepoUrls)));

        const currentMcpServerUrls = newTools // Update MCP Server URLs
            .filter(st => st.type === 'mcp' && st.mcpServerUrl)
            .map(st => st.mcpServerUrl);
        setUsedMcpServerUrls(Array.from(new Set(currentMcpServerUrls)));
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

        let finalModelStringForSubmit;
        if (selectedProviderId === 'custom' || selectedProviderId === 'openai_compatible') {
            finalModelStringForSubmit = inputtedModelString.trim();
        } else {
            finalModelStringForSubmit = selectedBaseModelId;
        }

        if (!finalModelStringForSubmit && (agentType === 'Agent' || agentType === 'LoopAgent') ) {
            setFormError('Model String is required.');
            return;
        }

        const agentDataToSubmit = {
            name, description, agentType,
            instruction,
            tools: selectedTools, // enableCodeExecution removed
            // enableCodeExecution removed
            usedCustomRepoUrls: usedCustomRepoUrls, // Keep for Gofannon custom
            usedMcpServerUrls: usedMcpServerUrls, // Add MCP Server URLs

            selectedProviderId: selectedProviderId,
            litellm_model_string: finalModelStringForSubmit,
            litellm_api_base: (currentProviderConfig?.allowsCustomBase && litellmApiBase.trim())
                ? litellmApiBase.trim()
                : (currentProviderConfig?.apiBase || null),
            litellm_api_key: (currentProviderConfig?.allowsCustomKey && litellmApiKey.trim())
                ? litellmApiKey.trim()
                : null,
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

                let childFinalModelString;
                if (ca.selectedProviderId === 'custom' || ca.selectedProviderId === 'openai_compatible') {
                    childFinalModelString = ca.litellm_model_string;
                } else {
                    childFinalModelString = ca.litellm_model_string;
                }

                return {
                    ...restOfConfig,
                    selectedProviderId: ca.selectedProviderId || DEFAULT_LITELLM_PROVIDER_ID,
                    litellm_model_string: childFinalModelString || DEFAULT_LITELLM_BASE_MODEL_ID,
                    // enableCodeExecution removed from child agents as well
                    tools: ca.tools || [],
                    usedCustomRepoUrls: ca.usedCustomRepoUrls || [],
                    usedMcpServerUrls: ca.usedMcpServerUrls || [], // Add for child agents
                };
            });
        }


        if (initialData && initialData.platform) {
            agentDataToSubmit.platform = initialData.platform;
        }

        const adkReadyTools = (agentDataToSubmit.tools || []).map(tool => {
            if (tool.type === 'gofannon' || tool.type === 'custom_repo') {
                const { sourceRepoUrl, type, ...adkToolProps } = tool;
                return adkToolProps;
            }
            // For MCP tools, pass them as they are; backend will create MCPToolset
            if (tool.type === 'mcp') {
                // Ensure essential fields for backend MCPToolset creation are present
                // The backend will use mcpServerUrl and mcpToolName
                return tool;
            }
            // ADK built-in tools removed
            return tool;
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
            selectedProviderId: selectedAgentFullConfig.selectedProviderId || DEFAULT_LITELLM_PROVIDER_ID,
            litellm_model_string: selectedAgentFullConfig.litellm_model_string || DEFAULT_LITELLM_BASE_MODEL_ID,
            litellm_api_base: selectedAgentFullConfig.litellm_api_base || null,
            litellm_api_key: selectedAgentFullConfig.litellm_api_key || null,
            instruction: selectedAgentFullConfig.instruction || '',
            tools: selectedAgentFullConfig.tools || [],
            // enableCodeExecution removed
            usedCustomRepoUrls: selectedAgentFullConfig.usedCustomRepoUrls || [],
            usedMcpServerUrls: selectedAgentFullConfig.usedMcpServerUrls || [], // Add for child
            outputKey: selectedAgentFullConfig.outputKey || '',
            maxLoops: selectedAgentFullConfig.maxLoops || 3,
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

    // const codeExecutionDisabledByToolSelection = selectedTools.length > 0; // No longer needed

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
                            <Grid item xs={12}>
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
                                    {currentProviderConfig?.customInstruction && (
                                        <Alert severity="info" sx={{mt:1, fontSize:'0.8rem'}}>{currentProviderConfig.customInstruction}</Alert>
                                    )}
                                </FormControl>
                            </Grid>

                            {selectedProviderId !== 'custom' && selectedProviderId !== 'openai_compatible' && availableBaseModels.length > 0 && (
                                <Grid item xs={12}>
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
                            {(selectedProviderId === 'custom' || selectedProviderId === 'openai_compatible' || (currentProviderConfig && availableBaseModels.length === 0)) && (
                                <Grid item xs={12}>
                                    <TextField
                                        label="Model String"
                                        id="inputtedModelString"
                                        value={inputtedModelString}
                                        onChange={(e) => setInputtedModelString(e.target.value)}
                                        fullWidth variant="outlined" required
                                        helperText={
                                            currentProviderConfig?.id === 'custom'
                                                ? "Enter the full LiteLLM model string (e.g., 'ollama/mistral', 'groq/mixtral-8x7b-32768')."
                                                : currentProviderConfig?.id === 'openai_compatible'
                                                    ? "Enter the model name expected by your OpenAI-compatible endpoint."
                                                    : `No predefined models for ${currentProviderConfig?.name}. Enter model string.`
                                        }
                                        error={formError.includes('Model String')}
                                    />
                                </Grid>
                            )}


                            {currentProviderConfig?.allowsCustomBase && (
                                <Grid item xs={12} sm={currentProviderConfig?.allowsCustomKey ? 6 : 12}>
                                    <TextField
                                        label="API Base URL (Override)"
                                        id="litellmApiBase"
                                        value={litellmApiBase}
                                        onChange={(e) => setLitellmApiBase(e.target.value)}
                                        fullWidth variant="outlined"
                                        placeholder={currentProviderConfig?.apiBase || (currentProviderConfig?.id === 'custom' || currentProviderConfig?.id === 'openai_compatible' || currentProviderConfig?.id === 'azure' ? 'Required if not in backend env' : 'Provider default will be used')}
                                        helperText={
                                            (currentProviderConfig?.id === 'custom' || currentProviderConfig?.id === 'openai_compatible' || currentProviderConfig?.id === 'azure')
                                                ? "Required if not set in backend environment variables."
                                                : "Optional. Overrides provider default if set in backend env."
                                        }
                                    />
                                </Grid>
                            )}

                            {currentProviderConfig?.allowsCustomKey && (
                                <Grid item xs={12} sm={currentProviderConfig?.allowsCustomBase ? 6 : 12}>
                                    <TextField
                                        label="API Key (Override)"
                                        id="litellmApiKey"
                                        type="password"
                                        value={litellmApiKey}
                                        onChange={(e) => setLitellmApiKey(e.target.value)}
                                        fullWidth variant="outlined"
                                        helperText={
                                            currentProviderConfig?.requiresApiKeyInEnv
                                                ? `Optional. Overrides API key from backend env var (${currentProviderConfig.requiresApiKeyInEnv}).`
                                                : "Optional. Provide if your custom endpoint needs an API key and it's not in backend env."
                                        }
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
                            {/* Code Execution Checkbox Removed */}
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
                                    // isCodeExecutionMode removed
                                    onUsedCustomRepoUrlsChange={handleUsedCustomRepoUrlsChange}
                                    onUsedMcpServerUrlsChange={handleUsedMcpServerUrlsChange} // New prop
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
                                                        `Type: ${child.agentType || 'Agent'} | Model: ${child.litellm_model_string || 'N/A'} | ` +
                                                        `Tools: ${child.tools?.length || 0}${child.tools?.some(t => t.configuration) ? ' (Configured)' : ''} | ` +
                                                        // `Code Exec: ${child.enableCodeExecution ? 'Yes' : 'No'} | ` + // Removed Code Exec
                                                        `OutputKey: ${child.outputKey || 'N/A'}`
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