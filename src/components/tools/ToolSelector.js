// src/components/tools/ToolSelector.js
import React, { useMemo } from 'react';
import {
    Typography, Button, Checkbox, FormControlLabel, FormGroup,
    Box, CircularProgress, Alert, Paper, Grid, FormHelperText
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';

// Renamed and defined ADK function tools
const PREDEFINED_ADK_FUNCTION_TOOLS = [
    {
        id: 'google_search_adk',
        name: 'Google Search (ADK Built-in)',
        description: 'Enables Google Search via ADK (Requires Gemini 2 model compatible with tool use).',
        type: 'adk_builtin_search' // Specific type for backend to identify
    },
    {
        id: 'vertex_ai_search_adk',
        name: 'Vertex AI Search (ADK Built-in)',
        description: 'Enables Vertex AI Search (Requires Gemini 2 model). Datastore ID configuration is not yet supported in this UI.',
        type: 'adk_builtin_vertex_search',
        requiresConfig: true // To disable or handle differently in UI
    },
];

const ToolSelector = ({
                          availableGofannonTools,
                          selectedTools,
                          setSelectedTools,
                          onRefreshGofannon,
                          loadingGofannon,
                          gofannonError
                      }) => {

    const groupedGofannonTools = useMemo(() => {
        if (!availableGofannonTools || availableGofannonTools.length === 0) {
            return {};
        }
        return availableGofannonTools.reduce((acc, tool) => {
            const modulePath = tool.module_path || '';
            const lastDotIndex = modulePath.lastIndexOf('.');
            let packageName = 'Uncategorized'; // Default group for tools with no/empty module_path

            if (lastDotIndex !== -1) {
                packageName = modulePath.substring(0, lastDotIndex);
            } else if (modulePath) {
                // If no dot but modulePath exists (e.g., "my_module"), group by the module name itself or a generic group
                packageName = `Module: ${modulePath}`; // Or "Root Modules" / "Local Modules"
            }

            if (!acc[packageName]) {
                acc[packageName] = [];
            }
            acc[packageName].push(tool);
            return acc;
        }, {});
    }, [availableGofannonTools]);

    const handleToolToggle = (tool, source) => {
        const isSelected = selectedTools.some(st => st.id === tool.id);
        if (isSelected) {
            setSelectedTools(selectedTools.filter(st => st.id !== tool.id));
        } else {
            let toolToAdd;
            if (source === 'gofannon') {
                toolToAdd = {
                    id: tool.id,
                    name: tool.name,
                    module_path: tool.module_path,
                    class_name: tool.class_name,
                    type: 'gofannon'
                };
            } else if (source === 'adk_builtin') {
                toolToAdd = {
                    id: tool.id,
                    name: tool.name,
                    type: tool.type
                };
            }
            if (toolToAdd) {
                setSelectedTools([...selectedTools, toolToAdd]);
            }
        }
    };

    return (
        <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="h6" component="h3">Select Gofannon Tools</Typography>
                <Button
                    variant="outlined"
                    size="small"
                    onClick={onRefreshGofannon}
                    disabled={loadingGofannon}
                    startIcon={loadingGofannon ? <CircularProgress size={16} /> : <RefreshIcon />}
                >
                    {loadingGofannon ? 'Refreshing...' : 'Refresh'}
                </Button>
            </Box>
            {gofannonError && <Alert severity="error" sx={{ mb: 1 }}>{gofannonError}</Alert>}
            {loadingGofannon && <Box sx={{display:'flex', justifyContent:'center', my:2}}><CircularProgress size={24} /></Box>}

            {!loadingGofannon && Object.keys(groupedGofannonTools).length > 0 ? (
                Object.entries(groupedGofannonTools)
                    .sort(([pkgA], [pkgB]) => pkgA.localeCompare(pkgB)) // Sort packages alphabetically
                    .map(([packageName, toolsInPackage]) => (
                        <Box key={packageName} sx={{ mb: 2 }}>
                            <Typography
                                variant="subtitle1"
                                component="h4"
                                sx={{
                                    mt: 1,
                                    mb: 0.5,
                                    pb: 0.5,
                                    borderBottom: '1px solid',
                                    borderColor: 'divider',
                                    fontWeight: 'medium'
                                }}
                            >
                                {packageName}
                            </Typography>
                            <FormGroup sx={{ pl: 1 }}> {/* Indent tools under package name */}
                                <Grid container spacing={0}> {/* Reduced spacing for tighter packing */}
                                    {toolsInPackage
                                        .sort((a, b) => a.name.localeCompare(b.name)) // Sort tools within package
                                        .map(tool => (
                                            <Grid item xs={12} sm={6} key={tool.id}> {/* Adjusted grid for better layout */}
                                                <FormControlLabel
                                                    control={
                                                        <Checkbox
                                                            checked={selectedTools.some(st => st.id === tool.id)}
                                                            onChange={() => handleToolToggle(tool, 'gofannon')}
                                                            name={tool.id}
                                                            size="small"
                                                        />
                                                    }
                                                    label={
                                                        <Typography variant="body2" title={tool.description || tool.name}>
                                                            {tool.name}
                                                        </Typography>
                                                    }
                                                    sx={{ mr: 0 }} // Remove right margin for better fit
                                                />
                                            </Grid>
                                        ))}
                                </Grid>
                            </FormGroup>
                        </Box>
                    ))
            ) : (
                !loadingGofannon && <Typography variant="body2" color="text.secondary">No Gofannon tools loaded or available. Click refresh.</Typography>
            )}

            {/* ADK Built-in Function Tools Section */}
            {PREDEFINED_ADK_FUNCTION_TOOLS.length > 0 && (
                <Box mt={3}>
                    <Typography variant="h6" component="h3" mb={1}>Select ADK Built-in Tools</Typography>
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
                                                disabled={tool.requiresConfig}
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
                </Box>
            )}

            {selectedTools.length > 0 && (
                <Box mt={2}>
                    <Typography variant="subtitle1" component="h4">Selected Tools ({selectedTools.length}):</Typography>
                    <Box component="ul" sx={{ pl: 2, listStyle: 'disc', maxHeight: 100, overflowY: 'auto' }}>
                        {selectedTools.map(st => (
                            <Typography component="li" variant="body2" key={st.id} color="text.secondary">
                                {st.name} ({
                                st.type === 'adk_builtin_search' ? 'ADK Search' :
                                    st.type === 'adk_builtin_vertex_search' ? 'ADK Vertex Search' :
                                        st.type === 'gofannon' ? 'Gofannon' :
                                            st.type || 'Unknown'
                            })
                            </Typography>
                        ))}
                    </Box>
                </Box>
            )}
        </Paper>
    );
};

export default ToolSelector;  