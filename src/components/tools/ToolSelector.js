// src/components/tools/ToolSelector.js
import React, { useMemo, useState } from 'react';
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

import VpnKeyIcon from '@mui/icons-material/VpnKey';

import ToolSetupDialog from './ToolSetupDialog';
import McpAuthDialog from './McpAuthDialog'; // New Auth Dialog
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

    // --- New/Modified MCP State ---
    const [mcpServerUrlInput, setMcpServerUrlInput] = useState('');
    // State now includes auth config for each server
    const [loadedMcpServers, setLoadedMcpServers] = useState([]); // Array of {url, tools, error, loading, auth}
    const [loadingMcpServerUrl, setLoadingMcpServerUrl] = useState(null); // Track which server is loading
    const [isMcpAuthDialogOpen, setIsMcpAuthDialogOpen] = useState(false);
    const [serverForAuthSetup, setServerForAuthSetup] = useState(null);


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
                    type: 'mcp',
                    auth: server.auth // *** Attach the server's auth config to the tool ***
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

    // --- New/Modified MCP Handlers ---
    const handleAddMcpServer = () => {
        if (!mcpServerUrlInput.trim()) return;
        const serverUrl = mcpServerUrlInput.trim();
        if (loadedMcpServers.some(s => s.url === serverUrl)) {
            alert("This MCP server URL has already been added.");
            return;
        }
        setLoadedMcpServers(prev => [...prev, { url: serverUrl, tools: null, error: null, loading: false, auth: null }]);
        setMcpServerUrlInput('');
    };

    const handleLoadMcpServerTools = async (serverUrl) => {
        const serverIndex = loadedMcpServers.findIndex(s => s.url === serverUrl);
        if (serverIndex === -1) return;

        setLoadingMcpServerUrl(serverUrl);
        // Reset previous tools/error for a fresh load
        setLoadedMcpServers(prev => prev.map((s, i) => i === serverIndex ? { ...s, loading: true, error: null, tools: null } : s));

        try {
            const serverToLoad = loadedMcpServers[serverIndex];
            const result = await listMcpServerTools(serverUrl, serverToLoad.auth); // Pass auth config
            if (result.success && Array.isArray(result.tools)) {
                setLoadedMcpServers(prev => prev.map((s, i) => i === serverIndex ? { ...s, tools: result.tools, error: null, loading: false } : s));
            } else {
                setLoadedMcpServers(prev => prev.map((s, i) => i === serverIndex ? { ...s, tools: null, error: result.message || "Failed to load tools.", loading: false } : s));
            }
        } catch (error) {
            setLoadedMcpServers(prev => prev.map((s, i) => i === serverIndex ? { ...s, tools: null, error: error.message || "An unexpected error occurred.", loading: false } : s));
        } finally {
            setLoadingMcpServerUrl(null);
        }
    };

    const openMcpAuthDialog = (server) => {
        setServerForAuthSetup(server);
        setIsMcpAuthDialogOpen(true);
    };

    const handleSaveMcpAuth = (serverUrl, authData) => {
        setLoadedMcpServers(prev =>
            prev.map(s => s.url === serverUrl ? { ...s, auth: authData } : s)
        );
        // After saving, you might want to automatically re-fetch tools
        handleLoadMcpServerTools(serverUrl);
    };


    const openSetupDialog = (toolManifestEntry, existingConfig = null) => {
        setToolForSetup(toolManifestEntry);
        setExistingConfigForSetup(existingConfig);
        setIsSetupDialogOpen(true);
    };

    const handleToolToggle = (toolManifestEntry, toolTypeFromManifest) => {
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
                    mcpToolName: toolManifestEntry.mcpToolName,
                    auth: toolManifestEntry.auth // *** IMPORTANT: Persist auth config ***
                };
            }
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
        setIsSetupDialogOpen(false);
        setToolForSetup(null);
        setExistingConfigForSetup(null);
    };

    const handleEditConfiguration = (toolId) => {
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
                        disabled={loadingGofannon}
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
                            .filter(([groupName]) => !groupName.startsWith("MCP Server:"))
                            .sort(([groupA], [groupB]) => groupA.localeCompare(groupB))
                            .map(([groupName, toolsInGroup]) => (
                                <Box key={groupName} sx={{ mb: 2 }}>
                                    <Typography
                                        variant="subtitle1" component="h4"
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
                                                                    <Checkbox checked={isSelected} onChange={() => handleToolToggle(tool, tool.type)} name={tool.id} size="small" />
                                                                }
                                                                label={
                                                                    <Typography variant="body2" title={tool.description || tool.name}>{tool.name}</Typography>
                                                                }
                                                                sx={{ mr: 0, flexGrow:1 }}
                                                            />
                                                            {isSelected && requiresSetup && (
                                                                <Tooltip title={configured ? "Edit Configuration" : "Setup Tool"}>
                                                                    <span>
                                                                        <IconButton onClick={() => handleEditConfiguration(tool.id)} size="small">
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
                <AccordionSummary expandIcon={<ExpandMoreIcon />} aria-controls="custom-tool-repo-content" id="custom-tool-repo-header" >
                    <Typography variant="h6" component="h3">Load Gofannon Tools from Custom Git Repo</Typography>
                </AccordionSummary>
                <AccordionDetails>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 2}}>
                        <TextField fullWidth label="Git Repository URL (HTTPS)" variant="outlined" size="small" value={customRepoUrlInput} onChange={(e) => setCustomRepoUrlInput(e.target.value)} placeholder="e.g., https://github.com/user/repo.git or ...@commit_hash" disabled={loadingCustomRepo}/>
                        <Button variant="contained" onClick={handleLoadCustomRepo} disabled={loadingCustomRepo || !customRepoUrlInput.trim()} startIcon={loadingCustomRepo ? <CircularProgress size={16} /> : <AddCircleOutlineIcon />} >
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

            {/* --- New/Modified MCP Tools Section --- */}
            <Accordion defaultExpanded sx={{ '&.MuiAccordion-root:before': { display: 'none' }, boxShadow: 'none', borderBottom: '1px solid', borderColor: 'divider'}}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />} aria-controls="mcp-tools-content" id="mcp-tools-header">
                    <Typography variant="h6" component="h3">Load Tools from MCP Server</Typography>
                </AccordionSummary>
                <AccordionDetails>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 2}}>
                        <TextField fullWidth label="MCP Server URL" variant="outlined" size="small" value={mcpServerUrlInput} onChange={(e) => setMcpServerUrlInput(e.target.value)} placeholder="e.g., http://localhost:8080 or https://mcp.example.com"/>
                        <Button variant="contained" onClick={handleAddMcpServer} startIcon={<AddCircleOutlineIcon />}>Add Server</Button>
                    </Box>
                    <FormHelperText>Add an MCP-compliant server URL to discover its tools. Configure authentication for private servers.</FormHelperText>

                    {loadedMcpServers.map((server, index) => (
                        <Paper key={server.url} variant="outlined" sx={{ p: 1.5, mt: 2 }}>
                            <Box sx={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1}}>
                                <Typography sx={{wordBreak: 'break-all'}}>{server.url}</Typography>
                                <Box>
                                    <Tooltip title="Configure Authentication">
                                        <IconButton onClick={() => openMcpAuthDialog(server)} size="small" color={server.auth ? "success" : "default"}>
                                            <VpnKeyIcon />
                                        </IconButton>
                                    </Tooltip>
                                    <Button size="small" variant="text" onClick={() => handleLoadMcpServerTools(server.url)} disabled={loadingMcpServerUrl === server.url} startIcon={loadingMcpServerUrl === server.url ? <CircularProgress size={16}/> : <RefreshIcon/>}>
                                        {server.tools ? "Reload" : "Load"}
                                    </Button>
                                </Box>
                            </Box>
                            {server.error && <Alert severity="error" sx={{fontSize: '0.8rem'}}>{server.error}</Alert>}
                            {server.tools && (
                                <FormGroup sx={{ pl: 1, mt: 1 }}>
                                    <Grid container spacing={0}>
                                        {server.tools.map(tool => {
                                            const toolId = `mcp:${server.url}:${tool.name}`;
                                            const isSelected = selectedTools.some(st => st.id === toolId);
                                            return (
                                                <Grid item xs={12} sm={6} key={toolId}>
                                                    <FormControlLabel
                                                        control={<Checkbox checked={isSelected} onChange={() => handleToolToggle({ ...tool, id: toolId, mcpServerUrl: server.url, mcpToolName: tool.name, type: 'mcp', auth: server.auth }, 'mcp')} name={toolId} size="small"/>}
                                                        label={<Typography variant="body2" title={tool.description || tool.name}>{tool.name}</Typography>}
                                                    />
                                                </Grid>
                                            );
                                        })}
                                    </Grid>
                                </FormGroup>
                            )}
                        </Paper>
                    ))}
                </AccordionDetails>
            </Accordion>


            {selectedTools.length > 0 && (
                <Box mt={2}>
                    <Typography variant="subtitle1" component="h4">Selected Tools ({selectedTools.length}):</Typography>
                    <Box component="ul" sx={{ pl: 2, listStyle: 'disc', maxHeight: 100, overflowY: 'auto' }}>
                        {selectedTools.map(st => (
                            <Typography component="li" variant="body2" key={st.id} color="text.secondary">
                                {getToolDisplayName(st)} ({
                                st.type === 'gofannon' ? `Gofannon${st.configuration ? ' (Configured)' : ''}` :
                                    st.type === 'custom_repo' ? `Custom Repo${st.configuration ? ' (Configured)' : ''}` :
                                        st.type === 'mcp' ? `MCP${st.auth ? ' (Authenticated)' : ''}` :
                                            st.type || 'Unknown'
                            })
                            </Typography>
                        ))}
                    </Box>
                </Box>
            )}


            {toolForSetup && (
                <ToolSetupDialog open={isSetupDialogOpen} onClose={() => { setIsSetupDialogOpen(false); setToolForSetup(null); setExistingConfigForSetup(null);}} tool={toolForSetup} onSave={handleSaveSetup} existingConfiguration={existingConfigForSetup} />
            )}

            {isMcpAuthDialogOpen && serverForAuthSetup && (
                <McpAuthDialog open={isMcpAuthDialogOpen} onClose={() => setIsMcpAuthDialogOpen(false)} serverUrl={serverForAuthSetup.url} existingAuth={serverForAuthSetup.auth} onSave={handleSaveMcpAuth} />
            )}
        </Paper>
    );
};

export default ToolSelector;  