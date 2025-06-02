// src/components/tools/ToolSelector.js
import React, { useMemo, useState } from 'react';
import {
    Typography, Button, Checkbox, FormControlLabel, FormGroup,
    Box, CircularProgress, Alert, Paper, Grid, FormHelperText, IconButton, Tooltip,
    Accordion, AccordionSummary, AccordionDetails, TextField // Added TextField
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SettingsIcon from '@mui/icons-material/Settings';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'; // For custom repo load button

import ToolSetupDialog from './ToolSetupDialog';

const PREDEFINED_ADK_FUNCTION_TOOLS = [
    {
        id: 'google_search_adk',
        name: 'Google Search (ADK Built-in)',
        description: 'Enables Google Search via ADK (Requires Gemini 2 model compatible with tool use).',
        type: 'adk_builtin_search'
    },
    {
        id: 'vertex_ai_search_adk',
        name: 'Vertex AI Search (ADK Built-in)',
        description: 'Enables Vertex AI Search (Requires Gemini 2 model). Datastore ID configuration is not yet supported in this UI.',
        type: 'adk_builtin_vertex_search',
        requiresConfig: true // This flag is informational, actual setup UI not implemented for this built-in
    },
];

// Helper to transform Git URL to raw manifest URL (basic GitHub for now)
const getRawManifestUrl = (repoUrl) => {
    if (!repoUrl) return null;
    // Basic GitHub HTTPS URL to raw content URL transformation
    // Assumes manifest is at root and default branch is main/master
    // e.g., https://github.com/user/repo -> https://raw.githubusercontent.com/user/repo/main/tool_manifest.json
    // e.g., https://github.com/user/repo.git -> https://raw.githubusercontent.com/user/repo/main/tool_manifest.json
    const githubRegex = /^(?:https?:\/\/)?github\.com\/([^/]+)\/([^/.]+)(?:\.git)?$/;
    const match = repoUrl.match(githubRegex);
    if (match) {
        const owner = match[1];
        const repo = match[2];
        // Try 'main' first, then 'master' as a fallback for default branch
        // A more robust solution would involve GitHub API to find default branch, but this is simpler for now.
        return [`https://raw.githubusercontent.com/${owner}/${repo}/main/tool_manifest.json`, `https://raw.githubusercontent.com/${owner}/${repo}/master/tool_manifest.json`];
    }
    // If user provides a direct raw URL, use it
    if (repoUrl.includes('raw.githubusercontent.com') && repoUrl.endsWith('tool_manifest.json')) {
        return [repoUrl];
    }
    // Add more transformations for GitLab, Bitbucket etc. if needed
    return null; // Indicate unsupported URL format or pattern
};


const ToolSelector = ({
                          availableGofannonTools,
                          selectedTools,
                          onSelectedToolsChange,
                          onRefreshGofannon,
                          loadingGofannon,
                          gofannonError,
                          isCodeExecutionMode,
                          onUsedCustomRepoUrlsChange // New prop to inform parent of used repo URLs
                      }) => {

    const [isSetupDialogOpen, setIsSetupDialogOpen] = useState(false);
    const [toolForSetup, setToolForSetup] = useState(null);
    const [existingConfigForSetup, setExistingConfigForSetup] = useState(null);

    // State for custom tool repositories
    const [customRepoUrlInput, setCustomRepoUrlInput] = useState('');
    const [loadedCustomRepos, setLoadedCustomRepos] = useState([]); // [{url: string, tools: [], error: string | null}]
    const [loadingCustomRepo, setLoadingCustomRepo] = useState(false);


    // Combine all available tools (Gofannon + Custom) for display grouping
    const allDisplayableTools = useMemo(() => {
        const gofannonWithSource = (availableGofannonTools || []).map(t => ({ ...t, sourceRepoUrl: 'gofannon_official', type: 'gofannon' }));
        const customToolsWithSource = loadedCustomRepos.reduce((acc, repo) => {
            if (repo.tools) {
                repo.tools.forEach(t => acc.push({ ...t, sourceRepoUrl: repo.url, type: 'custom_repo' }));
            }
            return acc;
        }, []);
        return [...gofannonWithSource, ...customToolsWithSource];
    }, [availableGofannonTools, loadedCustomRepos]);


    const groupedDisplayableTools = useMemo(() => {
        if (!allDisplayableTools || allDisplayableTools.length === 0) {
            return {};
        }
        return allDisplayableTools.reduce((acc, tool) => {
            let groupName = 'Uncategorized';
            if (tool.type === 'gofannon') {
                const modulePath = tool.module_path || '';
                const lastDotIndex = modulePath.lastIndexOf('.');
                if (lastDotIndex !== -1) {
                    groupName = `Gofannon: ${modulePath.substring(0, lastDotIndex)}`;
                } else if (modulePath) {
                    groupName = `Gofannon Module: ${modulePath}`;
                } else {
                    groupName = 'Gofannon: Other';
                }
            } else if (tool.type === 'custom_repo') {
                try {
                    const urlObj = new URL(tool.sourceRepoUrl);
                    groupName = `Custom: ${urlObj.hostname}${urlObj.pathname.replace(/\.git$/, '')}`;
                } catch (e) {
                    groupName = `Custom: ${tool.sourceRepoUrl}`;
                }
            }

            if (!acc[groupName]) {
                acc[groupName] = [];
            }
            acc[groupName].push(tool);
            return acc;
        }, {});
    }, [allDisplayableTools]);


    const handleLoadCustomRepo = async () => {
        if (!customRepoUrlInput.trim()) return;
        setLoadingCustomRepo(true);

        // Avoid re-adding if URL already processed (successfully or with error)
        if (loadedCustomRepos.some(repo => repo.url === customRepoUrlInput)) {
            alert("This repository URL has already been processed.");
            setLoadingCustomRepo(false);
            return;
        }

        const potentialManifestUrls = getRawManifestUrl(customRepoUrlInput);
        if (!potentialManifestUrls) {
            setLoadedCustomRepos(prev => [...prev, { url: customRepoUrlInput, tools: null, error: "Invalid or unsupported Git repository URL format. Please provide a GitHub HTTPS URL (e.g., https://github.com/user/repo) or a direct raw manifest URL." }]);
            setLoadingCustomRepo(false);
            return;
        }

        let manifestData = null;
        let fetchError = null;

        for (const url of potentialManifestUrls) {
            try {
                const response = await fetch(url);
                if (response.ok) {
                    const data = await response.json();
                    if (data && Array.isArray(data.tools)) { // Assuming manifest structure { "tools": [...] }
                        manifestData = data.tools;
                        fetchError = null; // Clear previous error if a subsequent URL succeeds
                        break; // Success
                    } else {
                        fetchError = "Manifest file found, but 'tools' array is missing or not in the expected format.";
                    }
                } else if (response.status === 404) {
                    fetchError = `Manifest file not found at ${url}.`; // Keep trying next URL if 404
                }
                else {
                    fetchError = `Failed to fetch manifest from ${url}: ${response.status} ${response.statusText}`;
                    break; // Non-404 error, stop trying
                }
            } catch (err) {
                fetchError = `Error fetching or parsing manifest from ${url}: ${err.message}`;
            }
        }


        if (manifestData) {
            setLoadedCustomRepos(prev => [...prev, { url: customRepoUrlInput, tools: manifestData, error: null }]);
            setCustomRepoUrlInput(''); // Clear input on success
        } else {
            setLoadedCustomRepos(prev => [...prev, { url: customRepoUrlInput, tools: null, error: fetchError || "Could not load manifest from the repository." }]);
        }
        setLoadingCustomRepo(false);
    };


    const openSetupDialog = (toolManifestEntry, existingConfig = null) => {
        setToolForSetup(toolManifestEntry);
        setExistingConfigForSetup(existingConfig);
        setIsSetupDialogOpen(true);
    };

    const handleToolToggle = (toolManifestEntry, toolTypeFromManifest) => {
        if (isCodeExecutionMode) return;

        const isCurrentlySelected = selectedTools.some(st => st.id === toolManifestEntry.id);
        let newSelectedTools;

        if (isCurrentlySelected) {
            newSelectedTools = selectedTools.filter(st => st.id !== toolManifestEntry.id);
        } else {
            let toolBaseData;
            if (toolTypeFromManifest === 'gofannon' || toolTypeFromManifest === 'custom_repo') {
                toolBaseData = {
                    id: toolManifestEntry.id,
                    name: toolManifestEntry.name,
                    module_path: toolManifestEntry.module_path,
                    class_name: toolManifestEntry.class_name,
                    type: toolTypeFromManifest, // 'gofannon' or 'custom_repo'
                    // For custom_repo, sourceRepoUrl comes from toolManifestEntry.sourceRepoUrl
                    ...(toolTypeFromManifest === 'custom_repo' && { sourceRepoUrl: toolManifestEntry.sourceRepoUrl })
                };
            } else if (toolTypeFromManifest === 'adk_builtin_search' || toolTypeFromManifest === 'adk_builtin_vertex_search') {
                toolBaseData = {
                    id: toolManifestEntry.id,
                    name: toolManifestEntry.name,
                    type: toolTypeFromManifest // e.g. 'adk_builtin_search'
                };
            }
            else {
                return;
            }

            if ((toolTypeFromManifest === 'gofannon' || toolTypeFromManifest === 'custom_repo') && toolManifestEntry.setup_parameters && toolManifestEntry.setup_parameters.length > 0) {
                openSetupDialog(toolManifestEntry, null);
                // Actual addition to selectedTools happens in handleSaveSetup
                return; // Exit early as selection is deferred to dialog save
            } else {
                newSelectedTools = [...selectedTools, toolBaseData];
            }
        }
        onSelectedToolsChange(newSelectedTools);
        // Update used custom repo URLs based on the new selection
        const currentCustomRepoUrls = newSelectedTools
            .filter(st => st.type === 'custom_repo' && st.sourceRepoUrl)
            .map(st => st.sourceRepoUrl);
        onUsedCustomRepoUrlsChange(Array.from(new Set(currentCustomRepoUrls)));
    };

    const handleSaveSetup = (toolConfiguration) => {
        if (!toolForSetup) return;

        const newSelectedToolWithConfig = {
            id: toolForSetup.id,
            name: toolForSetup.name,
            module_path: toolForSetup.module_path,
            class_name: toolForSetup.class_name,
            type: toolForSetup.type, // This should be 'gofannon' or 'custom_repo'
            configuration: toolConfiguration,
            ...(toolForSetup.type === 'custom_repo' && { sourceRepoUrl: toolForSetup.sourceRepoUrl })
        };

        let finalSelectedTools;
        const isAlreadyListed = selectedTools.some(st => st.id === newSelectedToolWithConfig.id);
        if (isAlreadyListed) { // If it's an edit, replace
            finalSelectedTools = selectedTools.map(st => st.id === newSelectedToolWithConfig.id ? newSelectedToolWithConfig : st);
        } else { // If it's new (selected, then setup dialog opened for the first time)
            finalSelectedTools = [...selectedTools, newSelectedToolWithConfig];
        }

        onSelectedToolsChange(finalSelectedTools);
        const currentCustomRepoUrls = finalSelectedTools
            .filter(st => st.type === 'custom_repo' && st.sourceRepoUrl)
            .map(st => st.sourceRepoUrl);
        onUsedCustomRepoUrlsChange(Array.from(new Set(currentCustomRepoUrls)));


        setIsSetupDialogOpen(false);
        setToolForSetup(null);
        setExistingConfigForSetup(null);
    };

    const handleEditConfiguration = (toolId) => {
        if (isCodeExecutionMode) return;
        // Find from allDisplayableTools as it has the full manifest entry including setup_parameters
        const toolManifestEntry = allDisplayableTools.find(t => t.id === toolId);
        const selectedToolEntry = selectedTools.find(st => st.id === toolId);

        if (toolManifestEntry && selectedToolEntry && toolManifestEntry.setup_parameters && toolManifestEntry.setup_parameters.length > 0) {
            openSetupDialog(toolManifestEntry, selectedToolEntry.configuration || {});
        } else if (toolManifestEntry && (!toolManifestEntry.setup_parameters || toolManifestEntry.setup_parameters.length === 0)) {
            alert("This tool does not require additional configuration.");
        }
    };


    const isToolConfigured = (toolId) => {
        const tool = selectedTools.find(st => st.id === toolId);
        return tool && tool.configuration && Object.keys(tool.configuration).length > 0;
    };

    return (
        <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
            {/* Gofannon Tools Accordion */}
            <Accordion defaultExpanded={false} sx={{ '&.MuiAccordion-root:before': { display: 'none' }, boxShadow: 'none', borderBottom: '1px solid', borderColor: 'divider'}}>
                <AccordionSummary
                    expandIcon={<ExpandMoreIcon />}
                    aria-controls="gofannon-tools-content"
                    id="gofannon-tools-header"
                    sx={{ flexDirection: 'row-reverse', '& .MuiAccordionSummary-content': { justifyContent: 'space-between', alignItems: 'center', ml: 1 } }}
                >
                    <Typography variant="h6" component="h3">Gofannon & Custom Tools</Typography>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={(e) => { e.stopPropagation(); onRefreshGofannon(); }}
                        disabled={loadingGofannon || isCodeExecutionMode}
                        startIcon={loadingGofannon ? <CircularProgress size={16} /> : <RefreshIcon />}
                        sx={{ order: 2 }}
                    >
                        {loadingGofannon ? 'Refreshing Gofannon...' : 'Refresh Gofannon'}
                    </Button>
                </AccordionSummary>
                <AccordionDetails sx={{pt:0}}>
                    {gofannonError && <Alert severity="error" sx={{ mb: 1 }}>{gofannonError}</Alert>}
                    {loadingGofannon && <Box sx={{display:'flex', justifyContent:'center', my:2}}><CircularProgress size={24} /></Box>}

                    {!loadingGofannon && Object.keys(groupedDisplayableTools).length > 0 ? (
                        Object.entries(groupedDisplayableTools)
                            .sort(([groupA], [groupB]) => groupA.localeCompare(groupB))
                            .map(([groupName, toolsInGroup]) => (
                                <Box key={groupName} sx={{ mb: 2 }}>
                                    <Typography
                                        variant="subtitle1"
                                        component="h4"
                                        sx={{ mt: 1, mb: 0.5, pb: 0.5, borderBottom: '1px solid', borderColor: 'divider', fontWeight: 'medium' }}
                                    >
                                        {groupName}
                                    </Typography>
                                    <FormGroup sx={{ pl: 1 }}>
                                        <Grid container spacing={0}>
                                            {toolsInGroup
                                                .sort((a, b) => a.name.localeCompare(b.name))
                                                .map(tool => {
                                                    const isSelected = selectedTools.some(st => st.id === tool.id);
                                                    const configured = isToolConfigured(tool.id);
                                                    const requiresSetup = tool.setup_parameters && tool.setup_parameters.length > 0;

                                                    return (
                                                        <Grid item xs={12} sm={6} key={tool.id} sx={{display: 'flex', alignItems: 'center'}}>
                                                            <FormControlLabel
                                                                control={
                                                                    <Checkbox
                                                                        checked={isSelected}
                                                                        onChange={() => handleToolToggle(tool, tool.type)}
                                                                        name={tool.id}
                                                                        size="small"
                                                                        disabled={isCodeExecutionMode}
                                                                    />
                                                                }
                                                                label={
                                                                    <Typography variant="body2" title={tool.description || tool.name}>
                                                                        {tool.name}
                                                                    </Typography>
                                                                }
                                                                sx={{ mr: 0, flexGrow:1 }}
                                                            />
                                                            {isSelected && requiresSetup && (
                                                                <Tooltip title={configured ? "Edit Configuration" : "Setup Tool"}>
                                                                    <span>
                                                                        <IconButton
                                                                            onClick={() => handleEditConfiguration(tool.id)}
                                                                            size="small"
                                                                            disabled={isCodeExecutionMode}
                                                                        >
                                                                            {configured ? <CheckCircleIcon color="success" fontSize="small" /> : <SettingsIcon color="warning" fontSize="small" />}
                                                                        </IconButton>
                                                                    </span>
                                                                </Tooltip>
                                                            )}
                                                        </Grid>
                                                    );
                                                })}
                                        </Grid>
                                    </FormGroup>
                                </Box>
                            ))
                    ) : (
                        !loadingGofannon && <Typography variant="body2" color="text.secondary">No Gofannon or custom tools loaded. Click refresh or add a custom repo.</Typography>
                    )}
                </AccordionDetails>
            </Accordion>

            {/* Custom Tool Repo Loader Accordion */}
            <Accordion sx={{ '&.MuiAccordion-root:before': { display: 'none' }, boxShadow: 'none', borderBottom: '1px solid', borderColor: 'divider'}}>
                <AccordionSummary
                    expandIcon={<ExpandMoreIcon />}
                    aria-controls="custom-tool-repo-content"
                    id="custom-tool-repo-header"
                >
                    <Typography variant="h6" component="h3">Load Tools from Custom Git Repo</Typography>
                </AccordionSummary>
                <AccordionDetails>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 2}}>
                        <TextField
                            fullWidth
                            label="Git Repository URL (HTTPS)"
                            variant="outlined"
                            size="small"
                            value={customRepoUrlInput}
                            onChange={(e) => setCustomRepoUrlInput(e.target.value)}
                            placeholder="e.g., https://github.com/your-org/your-tool-repo"
                            disabled={loadingCustomRepo || isCodeExecutionMode}
                        />
                        <Button
                            variant="contained"
                            onClick={handleLoadCustomRepo}
                            disabled={loadingCustomRepo || !customRepoUrlInput.trim() || isCodeExecutionMode}
                            startIcon={loadingCustomRepo ? <CircularProgress size={16} /> : <AddCircleOutlineIcon />}
                        >
                            Load Tools
                        </Button>
                    </Box>
                    <FormHelperText>
                        Provide the HTTPS URL to a public Git repository (e.g., GitHub). The repository must contain a `tool_manifest.json` file at its root, structured like Gofannon&apos;s manifest (`{'{'}"tools": [...] {'}'}`).
                    </FormHelperText>

                    {loadedCustomRepos.filter(repo => repo.error).map(repo => (
                        <Alert severity="error" key={repo.url} sx={{ mt: 1 }}>
                            Failed to load tools from {repo.url}: {repo.error}
                        </Alert>
                    ))}
                </AccordionDetails>
            </Accordion>


            {/* ADK Built-in Tools Accordion */}
            {PREDEFINED_ADK_FUNCTION_TOOLS.length > 0 && (
                <Accordion defaultExpanded={false} sx={{ '&.MuiAccordion-root:before': { display: 'none' }, boxShadow: 'none', mt:0, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <AccordionSummary
                        expandIcon={<ExpandMoreIcon />}
                        aria-controls="adk-tools-content"
                        id="adk-tools-header"
                    >
                        <Typography variant="h6" component="h3">Select ADK Built-in Tools</Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{pt:0}}>
                        <FormGroup sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1 }}>
                            <Grid container spacing={1}>
                                {PREDEFINED_ADK_FUNCTION_TOOLS.map(tool => (
                                    <Grid item xs={12} sm={6} key={tool.id}>
                                        <FormControlLabel
                                            control={
                                                <Checkbox
                                                    checked={selectedTools.some(st => st.id === tool.id)}
                                                    onChange={() => handleToolToggle(tool, tool.type)}
                                                    name={tool.id}
                                                    disabled={tool.requiresConfig || isCodeExecutionMode}
                                                    size="small"
                                                />
                                            }
                                            label={<Typography variant="body2" title={tool.description}>{tool.name}</Typography>}
                                        />
                                        {tool.requiresConfig && <FormHelperText sx={{ml:3.5, mt:-0.5}}>Setup via UI pending for this built-in tool</FormHelperText>}
                                    </Grid>
                                ))}
                            </Grid>
                        </FormGroup>
                    </AccordionDetails>
                </Accordion>
            )}

            {selectedTools.length > 0 && !isCodeExecutionMode && (
                <Box mt={2}>
                    <Typography variant="subtitle1" component="h4">Selected Tools ({selectedTools.length}):</Typography>
                    <Box component="ul" sx={{ pl: 2, listStyle: 'disc', maxHeight: 100, overflowY: 'auto' }}>
                        {selectedTools.map(st => (
                            <Typography component="li" variant="body2" key={st.id} color="text.secondary">
                                {st.name} ({
                                st.type === 'adk_builtin_search' ? 'ADK Search' :
                                    st.type === 'adk_builtin_vertex_search' ? 'ADK Vertex Search' :
                                        st.type === 'gofannon' ? `Gofannon${st.configuration ? ' (Configured)' : ''}` :
                                            st.type === 'custom_repo' ? `Custom Repo${st.configuration ? ' (Configured)' : ''}` :
                                                st.type || 'Unknown'
                            })
                            </Typography>
                        ))}
                    </Box>
                </Box>
            )}

            {isCodeExecutionMode && (
                <Alert severity="info" sx={{mt:2}}>
                    Built-in Code Execution is enabled. Other tools are disabled.
                </Alert>
            )}


            {toolForSetup && (
                <ToolSetupDialog
                    open={isSetupDialogOpen}
                    onClose={() => {
                        setIsSetupDialogOpen(false);
                        setToolForSetup(null);
                        setExistingConfigForSetup(null);
                    }}
                    tool={toolForSetup}
                    onSave={handleSaveSetup}
                    existingConfiguration={existingConfigForSetup}
                />
            )}
        </Paper>
    );
};

export default ToolSelector;  