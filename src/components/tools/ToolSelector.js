// src/components/tools/ToolSelector.js
import React, { useMemo, useState } from 'react';
import {
    Typography, Button, Checkbox, FormControlLabel, FormGroup,
    Box, CircularProgress, Alert, Paper, Grid, FormHelperText, IconButton, Tooltip,
    Accordion, AccordionSummary, AccordionDetails
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SettingsIcon from '@mui/icons-material/Settings';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

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
        requiresConfig: true
    },
];

const ToolSelector = ({
                          availableGofannonTools,
                          selectedTools,
                          // setSelectedTools, // Changed to onSelectedToolsChange
                          onSelectedToolsChange,
                          onRefreshGofannon,
                          loadingGofannon,
                          gofannonError,
                          isCodeExecutionMode // New prop
                      }) => {

    const [isSetupDialogOpen, setIsSetupDialogOpen] = useState(false);
    const [toolForSetup, setToolForSetup] = useState(null);
    const [existingConfigForSetup, setExistingConfigForSetup] = useState(null);

    const groupedGofannonTools = useMemo(() => {
        if (!availableGofannonTools || availableGofannonTools.length === 0) {
            return {};
        }
        return availableGofannonTools.reduce((acc, tool) => {
            const modulePath = tool.module_path || '';
            const lastDotIndex = modulePath.lastIndexOf('.');
            let packageName = 'Uncategorized';

            if (lastDotIndex !== -1) {
                packageName = modulePath.substring(0, lastDotIndex);
            } else if (modulePath) {
                packageName = `Module: ${modulePath}`;
            }

            if (!acc[packageName]) {
                acc[packageName] = [];
            }
            acc[packageName].push(tool);
            return acc;
        }, {});
    }, [availableGofannonTools]);

    const openSetupDialog = (toolManifestEntry, existingConfig = null) => {
        setToolForSetup(toolManifestEntry);
        setExistingConfigForSetup(existingConfig);
        setIsSetupDialogOpen(true);
    };

    const handleToolToggle = (toolManifestEntry, source) => {
        if (isCodeExecutionMode) return; // Don't allow changes if code execution is primary

        const isCurrentlySelected = selectedTools.some(st => st.id === toolManifestEntry.id);
        let newSelectedTools;

        if (isCurrentlySelected) {
            newSelectedTools = selectedTools.filter(st => st.id !== toolManifestEntry.id);
            onSelectedToolsChange(newSelectedTools); // Update parent immediately
        } else {
            let toolBaseData;
            if (source === 'gofannon') {
                toolBaseData = {
                    id: toolManifestEntry.id,
                    name: toolManifestEntry.name,
                    module_path: toolManifestEntry.module_path,
                    class_name: toolManifestEntry.class_name,
                    type: 'gofannon'
                };
            } else if (source === 'adk_builtin') {
                toolBaseData = {
                    id: toolManifestEntry.id,
                    name: toolManifestEntry.name,
                    type: toolManifestEntry.type
                };
            } else {
                return;
            }

            if (source === 'gofannon' && toolManifestEntry.setup_parameters && toolManifestEntry.setup_parameters.length > 0) {
                openSetupDialog(toolManifestEntry, null);
                // Note: actual addition to selectedTools happens in handleSaveSetup, then calls onSelectedToolsChange
            } else {
                newSelectedTools = [...selectedTools, toolBaseData];
                onSelectedToolsChange(newSelectedTools); // Update parent immediately
            }
        }
    };

    const handleSaveSetup = (toolConfiguration) => {
        if (!toolForSetup) return;

        const newSelectedToolWithConfig = {
            id: toolForSetup.id,
            name: toolForSetup.name,
            module_path: toolForSetup.module_path,
            class_name: toolForSetup.class_name,
            type: 'gofannon',
            configuration: toolConfiguration,
        };

        const existingToolIndex = selectedTools.findIndex(st => st.id === toolForSetup.id);
        let finalSelectedTools;
        if (existingToolIndex > -1) {
            finalSelectedTools = [...selectedTools];
            finalSelectedTools[existingToolIndex] = newSelectedToolWithConfig;
        } else {
            // This case implies the tool was selected, then setup dialog opened.
            // It should already be in selectedTools if setup was for an *existing* selection.
            // If it's for a *new* selection that needed setup, add it.
            const isAlreadyListed = selectedTools.some(st => st.id === newSelectedToolWithConfig.id);
            if (isAlreadyListed) { // If it's an edit, replace
                finalSelectedTools = selectedTools.map(st => st.id === newSelectedToolWithConfig.id ? newSelectedToolWithConfig : st);
            } else { // If it's new (selected, then setup dialog opened for the first time)
                finalSelectedTools = [...selectedTools, newSelectedToolWithConfig];
            }
        }
        onSelectedToolsChange(finalSelectedTools);

        setIsSetupDialogOpen(false);
        setToolForSetup(null);
        setExistingConfigForSetup(null);
    };

    const handleEditConfiguration = (toolId) => {
        if (isCodeExecutionMode) return;
        const toolManifestEntry = availableGofannonTools.find(t => t.id === toolId);
        const selectedToolEntry = selectedTools.find(st => st.id === toolId);
        if (toolManifestEntry && selectedToolEntry) {
            openSetupDialog(toolManifestEntry, selectedToolEntry.configuration || {});
        }
    };

    const isToolConfigured = (toolId) => {
        const tool = selectedTools.find(st => st.id === toolId);
        return tool && tool.configuration && Object.keys(tool.configuration).length > 0;
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
                    <Typography variant="h6" component="h3">Select Gofannon Tools</Typography>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={(e) => { e.stopPropagation(); onRefreshGofannon(); }}
                        disabled={loadingGofannon || isCodeExecutionMode}
                        startIcon={loadingGofannon ? <CircularProgress size={16} /> : <RefreshIcon />}
                        sx={{ order: 2 }}
                    >
                        {loadingGofannon ? 'Refreshing...' : 'Refresh'}
                    </Button>
                </AccordionSummary>
                <AccordionDetails sx={{pt:0}}>
                    {gofannonError && <Alert severity="error" sx={{ mb: 1 }}>{gofannonError}</Alert>}
                    {loadingGofannon && <Box sx={{display:'flex', justifyContent:'center', my:2}}><CircularProgress size={24} /></Box>}

                    {!loadingGofannon && Object.keys(groupedGofannonTools).length > 0 ? (
                        Object.entries(groupedGofannonTools)
                            .sort(([pkgA], [pkgB]) => pkgA.localeCompare(pkgB))
                            .map(([packageName, toolsInPackage]) => (
                                <Box key={packageName} sx={{ mb: 2 }}>
                                    <Typography
                                        variant="subtitle1"
                                        component="h4"
                                        sx={{ mt: 1, mb: 0.5, pb: 0.5, borderBottom: '1px solid', borderColor: 'divider', fontWeight: 'medium' }}
                                    >
                                        {packageName}
                                    </Typography>
                                    <FormGroup sx={{ pl: 1 }}>
                                        <Grid container spacing={0}>
                                            {toolsInPackage
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
                                                                        onChange={() => handleToolToggle(tool, 'gofannon')}
                                                                        name={tool.id}
                                                                        size="small"
                                                                        disabled={isCodeExecutionMode} // Disable if code execution is primary
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
                                                                    <span> {/* Span for disabled IconButton tooltip */}
                                                                        <IconButton
                                                                            onClick={() => handleEditConfiguration(tool.id)}
                                                                            size="small"
                                                                            disabled={isCodeExecutionMode} // Disable if code execution is primary
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
                        !loadingGofannon && <Typography variant="body2" color="text.secondary">No Gofannon tools loaded or available. Click refresh.</Typography>
                    )}
                </AccordionDetails>
            </Accordion>

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
                                                    onChange={() => handleToolToggle(tool, 'adk_builtin')}
                                                    name={tool.id}
                                                    disabled={tool.requiresConfig || isCodeExecutionMode} // Disable if code exec is primary
                                                    size="small"
                                                />
                                            }
                                            label={<Typography variant="body2" title={tool.description}>{tool.name}</Typography>}
                                        />
                                        {tool.requiresConfig && <FormHelperText sx={{ml:3.5, mt:-0.5}}>Setup via UI pending</FormHelperText>}
                                    </Grid>
                                ))}
                            </Grid>
                        </FormGroup>
                    </AccordionDetails>
                </Accordion>
            )}

            {selectedTools.length > 0 && !isCodeExecutionMode && ( // Only show selected if not in code exec mode
                <Box mt={2}>
                    <Typography variant="subtitle1" component="h4">Selected Tools ({selectedTools.length}):</Typography>
                    <Box component="ul" sx={{ pl: 2, listStyle: 'disc', maxHeight: 100, overflowY: 'auto' }}>
                        {selectedTools.map(st => (
                            <Typography component="li" variant="body2" key={st.id} color="text.secondary">
                                {st.name} ({
                                st.type === 'adk_builtin_search' ? 'ADK Search' :
                                    st.type === 'adk_builtin_vertex_search' ? 'ADK Vertex Search' :
                                        st.type === 'gofannon' ? `Gofannon${st.configuration ? ' (Configured)' : ''}` :
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