// src/components/tools/ToolSelector.js
import React, { useMemo, useState, useEffect } from 'react';
import {
    Typography, Button, Checkbox, FormControlLabel, FormGroup,
    Box, CircularProgress, Alert, Paper, Grid, FormHelperText, IconButton, Tooltip,
    Accordion, AccordionSummary, AccordionDetails, TextField
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SettingsIcon from '@mui/icons-material/Settings';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import LanguageIcon from '@mui/icons-material/Language'; // For MCP

import ToolSetupDialog from './ToolSetupDialog';
import { listMcpServerTools } from '../../services/agentService'; // New service import


// PREDEFINED_ADK_FUNCTION_TOOLS removed

const getRawManifestUrl = (repoUrlWithOptionalRef) => {
    if (!repoUrlWithOptionalRef) return null;
    const trimmedUrl = repoUrlWithOptionalRef.trim();
    if (trimmedUrl.includes('raw.githubusercontent.com') && trimmedUrl.endsWith('tool_manifest.json')) {
        return [trimmedUrl];
    }
    let baseUrl = trimmedUrl;
    let ref = null;
    const atSymbolIndex = trimmedUrl.lastIndexOf('@');
    if (atSymbolIndex > 0) {
        const potentialBase = trimmedUrl.substring(0, atSymbolIndex);
        const potentialRef = trimmedUrl.substring(atSymbolIndex + 1);
        if (potentialBase.includes("github.com/") && potentialRef.length > 0) {
            const repoPathEndMatch = potentialBase.match(/github\.com\/[^/]+\/[^/@]+?(?:\.git)?$/);
            if (repoPathEndMatch) {
                baseUrl = potentialBase;
                ref = potentialRef;
            }
        }
    }
    const githubBaseRegex = /^(?:https?:\/\/)?github\.com\/([^/]+)\/([^/@]+?)(?:\.git)?$/;
    const match = baseUrl.match(githubBaseRegex);
    if (match) {
        const owner = match[1];
        const repo = match[2].replace(/\.git$/, '');
        if (ref) {
            return [`https://raw.githubusercontent.com/${owner}/${repo}/${ref}/tool_manifest.json`];
        } else {
            return [
                `https://raw.githubusercontent.com/${owner}/${repo}/main/tool_manifest.json`,
                `https://raw.githubusercontent.com/${owner}/${repo}/master/tool_manifest.json`
            ];
        }
    }
    console.warn(`getRawManifestUrl: Could not parse GitHub URL or identify ref for manifest: ${repoUrlWithOptionalRef}`);
    return null;
};


const ToolSelector = ({
                          availableGofannonTools,
                          selectedTools,
                          onSelectedToolsChange,
                          onRefreshGofannon,
                          loadingGofannon,
                          gofannonError,
                          // isCodeExecutionMode removed
                          onUsedCustomRepoUrlsChange,
                          onUsedMcpServerUrlsChange // New prop
                      }) => {

    const [isSetupDialogOpen, setIsSetupDialogOpen] = useState(false);
    const [toolForSetup, setToolForSetup] = useState(null);
    const [existingConfigForSetup, setExistingConfigForSetup] = useState(null);
    const [customRepoUrlInput, setCustomRepoUrlInput] = useState('');
    const [loadedCustomRepos, setLoadedCustomRepos] = useState([]);
    const [loadingCustomRepo, setLoadingCustomRepo] = useState(false);

    // New MCP State
    const [mcpServerUrlInput, setMcpServerUrlInput] = useState('');
    const [loadedMcpServers, setLoadedMcpServers] = useState([]); // Array of {url, tools, error, loading}
    const [loadingMcpServerTools, setLoadingMcpServerTools] = useState(false);


    const allDisplayableTools = useMemo(() => {
        const gofannonWithSource = (availableGofannonTools || []).map(t => ({ ...t, sourceRepoUrl: 'gofannon_official', type: 'gofannon' }));
        const customToolsWithSource = loadedCustomRepos.reduce((acc, repo) => {
            if (repo.tools) {
                repo.tools.forEach(t => acc.push({ ...t, sourceRepoUrl: repo.url, type: 'custom_repo' }));
            }
            return acc;
        }, []);
        const mcpToolsWithSource = loadedMcpServers.reduce((acc, server) => { // Add MCP tools
            if (server.tools) {
                server.tools.forEach(t => acc.push({
                    ...t, // name, description from MCP server
                    id: `mcp:${server.url}:${t.name}`, // Create a unique ID for UI selection
                    mcpServerUrl: server.url,
                    mcpToolName: t.name, // Original name for backend filter
                    type: 'mcp'
                }));
            }
            return acc;
        }, []);
        return [...gofannonWithSource, ...customToolsWithSource, ...mcpToolsWithSource];
    }, [availableGofannonTools, loadedCustomRepos, loadedMcpServers]);

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
                    let displayUrl = tool.sourceRepoUrl;
                    if (tool.sourceRepoUrl.startsWith('http')) {
                        const urlObj = new URL(tool.sourceRepoUrl.split('@')[0]);
                        displayUrl = `${urlObj.hostname}${urlObj.pathname.replace(/\.git$/, '')}`;
                    }
                    groupName = `Custom Repo: ${displayUrl}`;
                } catch (e) {
                    groupName = `Custom Repo: ${tool.sourceRepoUrl}`;
                }
            } else if (tool.type === 'mcp') { // Group MCP tools by server URL
                try {
                    const urlObj = new URL(tool.mcpServerUrl);
                    groupName = `MCP Server: ${urlObj.protocol}//${urlObj.hostname}${urlObj.port ? `:${urlObj.port}`:''}${urlObj.pathname === '/' ? '' : urlObj.pathname}`;
                } catch(e) {
                    groupName = `MCP Server: ${tool.mcpServerUrl}`;
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
        const userProvidedUrl = customRepoUrlInput.trim();
        if (loadedCustomRepos.some(repo => repo.url === userProvidedUrl)) {
            alert("This repository URL (including any specified commit/branch) has already been processed.");
            setLoadingCustomRepo(false);
            return;
        }
        const potentialManifestUrls = getRawManifestUrl(userProvidedUrl);
        if (!potentialManifestUrls) {
            setLoadedCustomRepos(prev => [...prev, { url: userProvidedUrl, tools: null, error: "Invalid or unsupported Git repository URL format. Please provide a GitHub HTTPS URL (e.g., https://github.com/user/repo or https://github.com/user/repo.git@commit) or a direct raw manifest URL." }]);
            setLoadingCustomRepo(false);
            return;
        }
        let manifestData = null;
        let fetchError = null;
        let successfulFetchUrl = null;
        for (const url of potentialManifestUrls) {
            try {
                const response = await fetch(url);
                if (response.ok) {
                    const data = await response.json();
                    if (data && Array.isArray(data.tools)) {
                        manifestData = data.tools;
                        fetchError = null;
                        successfulFetchUrl = url;
                        break;
                    } else {
                        fetchError = "Manifest file found, but 'tools' array is missing or not in the expected format.";
                    }
                } else if (response.status === 404) {
                    fetchError = `Manifest file not found at ${url}.`;
                } else {
                    fetchError = `Failed to fetch manifest from ${url}: ${response.status} ${response.statusText}`;
                    break;
                }
            } catch (err) {
                fetchError = `Error fetching or parsing manifest from ${url}: ${err.message}`;
            }
        }
        if (manifestData) {
            setLoadedCustomRepos(prev => [...prev, { url: userProvidedUrl, tools: manifestData, error: null, manifestSource: successfulFetchUrl }]);
            setCustomRepoUrlInput('');
        } else {
            setLoadedCustomRepos(prev => [...prev, { url: userProvidedUrl, tools: null, error: fetchError || "Could not load manifest from the repository." }]);
        }
        setLoadingCustomRepo(false);
    };

    // New: Handle loading tools from MCP Server
    const handleLoadMcpServerTools = async () => {
        if (!mcpServerUrlInput.trim()) return;
        const serverUrl = mcpServerUrlInput.trim();

        // Check if already loaded or loading
        const existingServerEntry = loadedMcpServers.find(s => s.url === serverUrl);
        if (existingServerEntry?.loading || (existingServerEntry && !existingServerEntry.error)) {
            alert(`Tools from ${serverUrl} are already loaded or currently loading.`);
            return;
        }

        setLoadingMcpServerTools(true); // General loading indicator if needed, or manage per-server
        // Update specific server entry to loading: true
        setLoadedMcpServers(prev => {
            const existing = prev.find(s => s.url === serverUrl);
            if (existing) {
                return prev.map(s => s.url === serverUrl ? { ...s, loading: true, error: null } : s);
            }
            return [...prev, { url: serverUrl, tools: [], error: null, loading: true }];
        });

        try {
            const result = await listMcpServerTools(serverUrl); // Call new service
            if (result.success && Array.isArray(result.tools)) {
                setLoadedMcpServers(prev => prev.map(s => s.url === serverUrl ? { ...s, tools: result.tools, error: null, loading: false } : s));
                setMcpServerUrlInput(''); // Clear input on success
            } else {
                const errorMsg = result.message || "Failed to load tools from MCP server.";
                setLoadedMcpServers(prev => prev.map(s => s.url === serverUrl ? { ...s, tools: [], error: errorMsg, loading: false } : s));
            }
        } catch (error) {
            const errorMsg = error.message || "An unexpected error occurred while fetching MCP tools.";
            setLoadedMcpServers(prev => prev.map(s => s.url === serverUrl ? { ...s, tools: [], error: errorMsg, loading: false } : s));
        } finally {
            setLoadingMcpServerTools(false);
        }
    };


    const openSetupDialog = (toolManifestEntry, existingConfig = null) => {
        setToolForSetup(toolManifestEntry);
        setExistingConfigForSetup(existingConfig);
        setIsSetupDialogOpen(true);
    };

    const handleToolToggle = (toolManifestEntry, toolTypeFromManifest) => {
        // isCodeExecutionMode removed
        const isCurrentlySelected = selectedTools.some(st => st.id === toolManifestEntry.id);
        let newSelectedTools;

        if (isCurrentlySelected) {
            newSelectedTools = selectedTools.filter(st => st.id !== toolManifestEntry.id);
        } else {
            let toolBaseData;
            const sourceRepoUrlForBackend = toolManifestEntry.sourceRepoUrl; // For Gofannon/Custom

            if (toolTypeFromManifest === 'gofannon' || toolTypeFromManifest === 'custom_repo') {
                toolBaseData = {
                    id: toolManifestEntry.id,
                    name: toolManifestEntry.name,
                    module_path: toolManifestEntry.module_path,
                    class_name: toolManifestEntry.class_name,
                    type: toolTypeFromManifest,
                    ...(toolTypeFromManifest === 'custom_repo' && { sourceRepoUrl: sourceRepoUrlForBackend })
                };
            } else if (toolTypeFromManifest === 'mcp') { // Handle MCP tools
                toolBaseData = {
                    id: toolManifestEntry.id, // UI unique ID
                    name: toolManifestEntry.name,
                    description: toolManifestEntry.description,
                    type: 'mcp',
                    mcpServerUrl: toolManifestEntry.mcpServerUrl,
                    mcpToolName: toolManifestEntry.mcpToolName // Original name from server
                };
            }
            // ADK built-in tool cases removed
            else {
                return;
            }

            if ((toolTypeFromManifest === 'gofannon' || toolTypeFromManifest === 'custom_repo') && toolManifestEntry.setup_parameters && toolManifestEntry.setup_parameters.length > 0) {
                openSetupDialog(toolManifestEntry, null);
                return;
            } else {
                newSelectedTools = [...selectedTools, toolBaseData];
            }
        }
        onSelectedToolsChange(newSelectedTools);
        const currentCustomRepoUrls = newSelectedTools
            .filter(st => st.type === 'custom_repo' && st.sourceRepoUrl)
            .map(st => st.sourceRepoUrl);
        onUsedCustomRepoUrlsChange(Array.from(new Set(currentCustomRepoUrls)));

        const currentMcpServerUrls = newSelectedTools // Update MCP Server URLs for parent form
            .filter(st => st.type === 'mcp' && st.mcpServerUrl)
            .map(st => st.mcpServerUrl);
        onUsedMcpServerUrlsChange(Array.from(new Set(currentMcpServerUrls)));
    };

    const handleSaveSetup = (toolConfiguration) => {
        if (!toolForSetup) return;
        const sourceRepoUrlForBackend = toolForSetup.sourceRepoUrl;
        const newSelectedToolWithConfig = {
            id: toolForSetup.id,
            name: toolForSetup.name,
            module_path: toolForSetup.module_path,
            class_name: toolForSetup.class_name,
            type: toolForSetup.type,
            configuration: toolConfiguration,
            ...(toolForSetup.type === 'custom_repo' && { sourceRepoUrl: sourceRepoUrlForBackend })
        };
        let finalSelectedTools;
        const isAlreadyListed = selectedTools.some(st => st.id === newSelectedToolWithConfig.id);
        if (isAlreadyListed) {
            finalSelectedTools = selectedTools.map(st => st.id === newSelectedToolWithConfig.id ? newSelectedToolWithConfig : st);
        } else {
            finalSelectedTools = [...selectedTools, newSelectedToolWithConfig];
        }
        onSelectedToolsChange(finalSelectedTools);
        const currentCustomRepoUrls = finalSelectedTools
            .filter(st => st.type === 'custom_repo' && st.sourceRepoUrl)
            .map(st => st.sourceRepoUrl);
        onUsedCustomRepoUrlsChange(Array.from(new Set(currentCustomRepoUrls)));
        // MCP URLs don't change here, they are part of the base tool data
        setIsSetupDialogOpen(false);
        setToolForSetup(null);
        setExistingConfigForSetup(null);
    };

    const handleEditConfiguration = (toolId) => {
        // isCodeExecutionMode removed
        const toolManifestEntry = allDisplayableTools.find(t => t.id === toolId);
        const selectedToolEntry = selectedTools.find(st => st.id === toolId);

        if (toolManifestEntry?.type !== 'mcp' && selectedToolEntry && toolManifestEntry.setup_parameters && toolManifestEntry.setup_parameters.length > 0) {
            openSetupDialog(toolManifestEntry, selectedToolEntry.configuration || {});
        } else if (toolManifestEntry && (!toolManifestEntry.setup_parameters || toolManifestEntry.setup_parameters.length === 0)) {
            alert("This tool does not require additional configuration.");
        }
    };

    const isToolConfigured = (toolId) => {
        const tool = selectedTools.find(st => st.id === toolId);
        return tool && tool.configuration && Object.keys(tool.configuration).length > 0;
    };

    const getToolDisplayName = (tool) => {
        let displayName = tool.name;
        if (tool.type === 'mcp') {
            // Shorten server URL for display if it's too long
            let serverDisplay = tool.mcpServerUrl;
            try {
                const urlObj = new URL(tool.mcpServerUrl);
                serverDisplay = `${urlObj.hostname}${urlObj.port ? `:${urlObj.port}` : ''}`;
            } catch (e) { /* use raw url */ }
            displayName += ` (from ${serverDisplay})`;
        }
        return displayName;
    };


    return (
        <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
            <Accordion defaultExpanded={false} sx={{ '&.MuiAccordion-root:before': { display: 'none' }, boxShadow: 'none', borderBottom: '1px solid', borderColor: 'divider'}}>
                <AccordionSummary
                    expandIcon={<ExpandMoreIcon />}
                    aria-controls="gofannon-tools-content"
                    id="gofannon-tools-header"
                    sx={{ flexDirection: 'row-reverse', '& .MuiAccordionSummary-content': { justifyContent: 'space-between', alignItems: 'center', ml: 1 } }}
                >
                    <Typography variant="h6" component="h3">Gofannon & Custom Repo Tools</Typography>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={(e) => { e.stopPropagation(); onRefreshGofannon(); }}
                        disabled={loadingGofannon} // isCodeExecutionMode removed
                        startIcon={loadingGofannon ? <CircularProgress size={16} /> : <RefreshIcon />}
                        sx={{ order: 2 }}
                    >
                        {loadingGofannon ? 'Refreshing Gofannon...' : 'Refresh Gofannon'}
                    </Button>
                </AccordionSummary>
                <AccordionDetails sx={{pt:0}}>
                    {gofannonError && <Alert severity="error" sx={{ mb: 1 }}>{gofannonError}</Alert>}
                    {loadingGofannon && <Box sx={{display:'flex', justifyContent:'center', my:2}}><CircularProgress size={24} /></Box>}

                    {!loadingGofannon && Object.keys(groupedDisplayableTools).filter(group => !group.startsWith("MCP Server:")).length > 0 ? (
                        Object.entries(groupedDisplayableTools)
                            .filter(([groupName]) => !groupName.startsWith("MCP Server:")) // Filter out MCP groups here
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
                                                                        // disabled={isCodeExecutionMode} // Removed
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
                                                                            // disabled={isCodeExecutionMode} // Removed
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
                        !loadingGofannon && <Typography variant="body2" color="text.secondary">No Gofannon or custom repo tools loaded. Click refresh or add a custom repo.</Typography>
                    )}
                </AccordionDetails>
            </Accordion>

            <Accordion sx={{ '&.MuiAccordion-root:before': { display: 'none' }, boxShadow: 'none', borderBottom: '1px solid', borderColor: 'divider'}}>
                <AccordionSummary
                    expandIcon={<ExpandMoreIcon />}
                    aria-controls="custom-tool-repo-content"
                    id="custom-tool-repo-header"
                >
                    <Typography variant="h6" component="h3">Load Gofannon Tools from Custom Git Repo</Typography>
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
                            placeholder="e.g., https://github.com/user/repo.git or ...@commit_hash"
                            disabled={loadingCustomRepo} // isCodeExecutionMode removed
                        />
                        <Button
                            variant="contained"
                            onClick={handleLoadCustomRepo}
                            disabled={loadingCustomRepo || !customRepoUrlInput.trim()} // isCodeExecutionMode removed
                            startIcon={loadingCustomRepo ? <CircularProgress size={16} /> : <AddCircleOutlineIcon />}
                        >
                            Load Gofannon Tools
                        </Button>
                    </Box>
                    <FormHelperText>
                        Provide the HTTPS URL to a public Git repository (e.g., GitHub). You can specify a commit, branch, or tag using `@` (e.g., `repo.git@main` or `repo.git@abcdef123`). The repository must contain a `tool_manifest.json` file at its root.
                    </FormHelperText>

                    {loadedCustomRepos.filter(repo => repo.error).map(repo => (
                        <Alert severity="error" key={repo.url} sx={{ mt: 1 }}>
                            Failed to load tools from {repo.url}: {repo.error}
                        </Alert>
                    ))}
                </AccordionDetails>
            </Accordion>

            {/* New MCP Tools Section */}
            <Accordion sx={{ '&.MuiAccordion-root:before': { display: 'none' }, boxShadow: 'none', borderBottom: '1px solid', borderColor: 'divider'}}>
                <AccordionSummary
                    expandIcon={<ExpandMoreIcon />}
                    aria-controls="mcp-tools-content"
                    id="mcp-tools-header"
                >
                    <Typography variant="h6" component="h3">Load Tools from MCP Server</Typography>
                </AccordionSummary>
                <AccordionDetails>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 2}}>
                        <TextField
                            fullWidth
                            label="MCP Server URL"
                            variant="outlined"
                            size="small"
                            value={mcpServerUrlInput}
                            onChange={(e) => setMcpServerUrlInput(e.target.value)}
                            placeholder="e.g., http://localhost:8080 or https://mcp.example.com"
                            disabled={loadingMcpServerTools}
                        />
                        <Button
                            variant="contained"
                            onClick={handleLoadMcpServerTools}
                            disabled={loadingMcpServerTools || !mcpServerUrlInput.trim()}
                            startIcon={loadingMcpServerTools ? <CircularProgress size={16} /> : <LanguageIcon />}
                        >
                            Load MCP Tools
                        </Button>
                    </Box>
                    <FormHelperText>
                        Enter the base URL of an MCP-compliant server to discover its available tools.
                    </FormHelperText>
                    {/* Display errors for MCP server loading attempts */}
                    {loadedMcpServers.filter(server => server.error).map(server => (
                        <Alert severity="error" key={server.url} sx={{ mt: 1 }}>
                            Failed to load tools from MCP server {server.url}: {server.error}
                        </Alert>
                    ))}
                    {/* Display loaded MCP tools (similar to Gofannon/Custom) */}
                    {Object.keys(groupedDisplayableTools).filter(group => group.startsWith("MCP Server:")).length > 0 && (
                        Object.entries(groupedDisplayableTools)
                            .filter(([groupName]) => groupName.startsWith("MCP Server:"))
                            .sort(([groupA], [groupB]) => groupA.localeCompare(groupB))
                            .map(([groupName, toolsInGroup]) => (
                                <Box key={groupName} sx={{ mb: 2, mt: 1 }}>
                                    <Typography
                                        variant="subtitle1"
                                        component="h4"
                                        sx={{ mt: 1, mb: 0.5, pb: 0.5, borderBottom: '1px solid', borderColor: 'divider', fontWeight: 'medium' }}
                                    >
                                        {groupName} ({toolsInGroup.filter(t => t.type ==='mcp').length} tools)
                                    </Typography>
                                    <FormGroup sx={{ pl: 1 }}>
                                        <Grid container spacing={0}>
                                            {toolsInGroup
                                                .filter(tool => tool.type === 'mcp') // Ensure only MCP tools are listed here
                                                .sort((a, b) => a.name.localeCompare(b.name))
                                                .map(tool => {
                                                    const isSelected = selectedTools.some(st => st.id === tool.id);
                                                    // MCP tools currently don't have setup_parameters handled in this UI
                                                    // const configured = false; // isToolConfigured(tool.id);
                                                    // const requiresSetup = false; // tool.setup_parameters && tool.setup_parameters.length > 0;
                                                    return (
                                                        <Grid item xs={12} sm={6} key={tool.id} sx={{display: 'flex', alignItems: 'center'}}>
                                                            <FormControlLabel
                                                                control={
                                                                    <Checkbox
                                                                        checked={isSelected}
                                                                        onChange={() => handleToolToggle(tool, tool.type)}
                                                                        name={tool.id}
                                                                        size="small"
                                                                    />
                                                                }
                                                                label={
                                                                    <Typography variant="body2" title={tool.description || tool.name}>
                                                                        {tool.name} {/* MCP tool name from server */}
                                                                    </Typography>
                                                                }
                                                                sx={{ mr: 0, flexGrow:1 }}
                                                            />
                                                            {/* Configuration for MCP tools not implemented via this dialog */}
                                                        </Grid>
                                                    );
                                                })}
                                        </Grid>
                                    </FormGroup>
                                </Box>
                            ))
                    )}
                </AccordionDetails>
            </Accordion>


            {/* ADK Built-in Tools Section Removed */}

            {selectedTools.length > 0 && (
                <Box mt={2}>
                    <Typography variant="subtitle1" component="h4">Selected Tools ({selectedTools.length}):</Typography>
                    <Box component="ul" sx={{ pl: 2, listStyle: 'disc', maxHeight: 100, overflowY: 'auto' }}>
                        {selectedTools.map(st => (
                            <Typography component="li" variant="body2" key={st.id} color="text.secondary">
                                {getToolDisplayName(st)} ({
                                st.type === 'gofannon' ? `Gofannon${st.configuration ? ' (Configured)' : ''}` :
                                    st.type === 'custom_repo' ? `Custom Repo${st.configuration ? ' (Configured)' : ''}` :
                                        st.type === 'mcp' ? 'MCP Tool' :
                                            st.type || 'Unknown'
                            })
                            </Typography>
                        ))}
                    </Box>
                </Box>
            )}

            {/* isCodeExecutionMode Alert Removed */}

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