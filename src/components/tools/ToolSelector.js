import React from 'react';
import {
    Typography, Button, Checkbox, FormControlLabel, FormGroup,
    Box, CircularProgress, Alert, Paper, Grid
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';

const PREDEFINED_ADK_TOOLS = [
    // ...
];

const ToolSelector = ({
                          availableGofannonTools,
                          selectedTools,
                          setSelectedTools,
                          onRefreshGofannon,
                          loadingGofannon,
                          gofannonError
                      }) => {

    const handleToolToggle = (tool, type = 'gofannon') => {
        const isSelected = selectedTools.some(st => st.id === tool.id);
        if (isSelected) {
            setSelectedTools(selectedTools.filter(st => st.id !== tool.id));
        } else {
            const toolToAdd = type === 'gofannon' ? {
                id: tool.id,
                name: tool.name,
                module_path: tool.module_path,
                class_name: tool.class_name,
                type: 'gofannon'
            } : { ...tool, type: 'adk_prebuilt' };
            setSelectedTools([...selectedTools, toolToAdd]);
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
            {availableGofannonTools.length > 0 ? (
                <FormGroup sx={{ maxHeight: 200, overflowY: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1 }}>
                    <Grid container spacing={1}>
                        {availableGofannonTools.map(tool => (
                            <Grid item xs={12} sm={6} md={4} key={tool.id}>
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={selectedTools.some(st => st.id === tool.id)}
                                            onChange={() => handleToolToggle(tool, 'gofannon')}
                                            name={tool.id}
                                        />
                                    }
                                    label={<Typography variant="body2" title={tool.description}>{tool.name}</Typography>}
                                />
                            </Grid>
                        ))}
                    </Grid>
                </FormGroup>
            ) : (
                !loadingGofannon && <Typography variant="body2" color="text.secondary">No Gofannon tools loaded. Click refresh.</Typography>
            )}

            {/* Placeholder for ADK Predefined Tools */}
            {PREDEFINED_ADK_TOOLS.length > 0 && (
                <Box mt={3}>
                    <Typography variant="h6" component="h3" mb={1}>Select ADK Tools</Typography>
                    <FormGroup sx={{ maxHeight: 150, overflowY: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1 }}>
                        <Grid container spacing={1}>
                            {PREDEFINED_ADK_TOOLS.map(tool => (
                                <Grid item xs={12} sm={6} md={4} key={tool.id}>
                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={selectedTools.some(st => st.id === tool.id)}
                                                onChange={() => handleToolToggle(tool, 'adk')}
                                                name={tool.id}
                                            />
                                        }
                                        label={<Typography variant="body2" title={tool.description}>{tool.name}</Typography>}
                                    />
                                </Grid>
                            ))}
                        </Grid>
                    </FormGroup>
                </Box>
            )}

            {selectedTools.length > 0 && (
                <Box mt={2}>
                    <Typography variant="subtitle1" component="h4">Selected Tools:</Typography>
                    <Box component="ul" sx={{ pl: 2, listStyle: 'disc' }}>
                        {selectedTools.map(st => (
                            <Typography component="li" variant="body2" key={st.id} color="text.secondary">
                                {st.name} ({st.type || 'gofannon'})
                            </Typography>
                        ))}
                    </Box>
                </Box>
            )}
        </Paper>
    );
};

export default ToolSelector;  