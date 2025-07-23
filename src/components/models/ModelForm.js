// src/components/models/ModelForm.js
import React, { useState, useEffect } from 'react';
import {
    TextField, Button, Select, MenuItem, FormControl, InputLabel,
    Paper, Grid, Box, CircularProgress, Typography, FormHelperText, Slider,
    FormControlLabel, Switch
} from '@mui/material';
import ProjectSelector from '../projects/ProjectSelector';
import {
    MODEL_PROVIDERS_LITELLM,
    DEFAULT_LITELLM_PROVIDER_ID,
    DEFAULT_LITELLM_BASE_MODEL_ID,
    getLiteLLMProviderConfig
} from '../../constants/agentConstants';

const ModelForm = ({ onSubmit, initialData = {}, isSaving = false }) => {
    const [name, setName] = useState(initialData.name || '');
    const [description, setDescription] = useState(initialData.description || '');
    const [projectIds, setProjectIds] = useState(initialData.projectIds || []);
    const [isPublic, setIsPublic] = useState(initialData.isPublic || false);

    const [provider, setProvider] = useState(initialData.provider || DEFAULT_LITELLM_PROVIDER_ID);
    const [modelString, setModelString] = useState(initialData.modelString || DEFAULT_LITELLM_BASE_MODEL_ID);
    const [systemInstruction, setSystemInstruction] = useState(initialData.systemInstruction || '');
    const [temperature, setTemperature] = useState(initialData.temperature ?? 0.7);

    const [formError, setFormError] = useState('');

    const currentProviderConfig = getLiteLLMProviderConfig(provider);
    const availableBaseModels = currentProviderConfig?.models || [];

    useEffect(() => {
        // When provider changes, reset the modelString to the first available model
        if (currentProviderConfig && availableBaseModels.length > 0) {
            setModelString(availableBaseModels[0].id);
        } else {
            setModelString(''); // For custom providers
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [provider]);

    const handleSubmit = (e) => {
        e.preventDefault();
        setFormError('');

        if (!name.trim() || !provider || !modelString.trim()) {
            setFormError('Name, Provider, and Model String are required.');
            return;
        }

        const modelData = {
            name,
            description,
            projectIds,
            isPublic,
            provider,
            modelString,
            systemInstruction,
            temperature,
        };

        onSubmit(modelData);
    };

    return (
        <Paper elevation={3} sx={{ p: { xs: 2, md: 4 } }}>
            <Box component="form" onSubmit={handleSubmit} noValidate>
                <Grid container spacing={3}>
                    <Grid item xs={12}>
                        <TextField
                            label="Model Name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            fullWidth
                            variant="outlined"
                        />
                    </Grid>
                    <Grid item xs={12}>
                        <TextField
                            label="Description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            multiline
                            rows={2}
                            fullWidth
                            variant="outlined"
                        />
                    </Grid>
                    <Grid item xs={12}>
                        <ProjectSelector
                            selectedProjectIds={projectIds}
                            onSelectionChange={setProjectIds}
                            helperText="Associate this model with one or more projects."
                        />
                    </Grid>
                    <Grid item xs={12}>
                        <FormControlLabel
                            control={<Switch checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />}
                            label="Public Model (visible to all users)"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <FormControl fullWidth variant="outlined">
                            <InputLabel id="provider-label">LLM Provider</InputLabel>
                            <Select
                                labelId="provider-label"
                                value={provider}
                                onChange={(e) => setProvider(e.target.value)}
                                label="LLM Provider"
                            >
                                {MODEL_PROVIDERS_LITELLM.map(p => (
                                    <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        {availableBaseModels.length > 0 ? (
                            <FormControl fullWidth variant="outlined">
                                <InputLabel id="model-string-label">Base Model</InputLabel>
                                <Select
                                    labelId="model-string-label"
                                    value={modelString}
                                    onChange={(e) => setModelString(e.target.value)}
                                    label="Base Model"
                                >
                                    {availableBaseModels.map(m => (
                                        <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        ) : (
                            <TextField
                                label="Model String"
                                value={modelString}
                                onChange={(e) => setModelString(e.target.value)}
                                required
                                fullWidth
                                variant="outlined"
                                helperText={currentProviderConfig?.customInstruction || "Enter the exact model name."}
                            />
                        )}
                    </Grid>
                    <Grid item xs={12}>
                        <Typography gutterBottom>Temperature: {temperature.toFixed(2)}</Typography>
                        <Slider
                            value={temperature}
                            onChange={(e, newValue) => setTemperature(newValue)}
                            aria-labelledby="temperature-slider"
                            valueLabelDisplay="auto"
                            step={0.05}
                            marks
                            min={0}
                            max={1}
                        />
                        <FormHelperText>Controls randomness. Lower values are more deterministic.</FormHelperText>
                    </Grid>
                    <Grid item xs={12}>
                        <TextField
                            label="System Instruction (System Prompt)"
                            value={systemInstruction}
                            onChange={(e) => setSystemInstruction(e.target.value)}
                            multiline
                            rows={5}
                            fullWidth
                            variant="outlined"
                            placeholder="e.g., You are a helpful AI assistant."
                        />
                    </Grid>

                    {formError && (
                        <Grid item xs={12}>
                            <FormHelperText error sx={{ fontSize: '1rem', textAlign: 'center' }}>{formError}</FormHelperText>
                        </Grid>
                    )}

                    <Grid item xs={12}>
                        <Button
                            type="submit"
                            variant="contained"
                            color="primary"
                            size="large"
                            disabled={isSaving}
                            fullWidth
                            startIcon={isSaving ? <CircularProgress size={20} color="inherit" /> : null}
                        >
                            {isSaving ? 'Saving...' : (initialData.id ? 'Update Model' : 'Create Model')}
                        </Button>
                    </Grid>
                </Grid>
            </Box>
        </Paper>
    );
};

export default ModelForm;