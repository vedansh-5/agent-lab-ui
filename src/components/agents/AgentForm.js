import React, { useState, useEffect } from 'react';
import ToolSelector from '../tools/ToolSelector'; // Will also need MUI refactor
import { fetchGofannonTools } from '../../services/agentService';

import {
    TextField, Button, Select, MenuItem, FormControl, InputLabel,
    Paper, Grid, Box, CircularProgress
} from '@mui/material';

const AGENT_TYPES = ["Agent", "SequentialAgent", "LoopAgent", "ParallelAgent"];
const GEMINI_MODELS = [
    "gemini-1.5-flash-001",
    "gemini-1.5-pro-001",
    "gemini-1.0-pro",
];

const AgentForm = ({ onSubmit, initialData = {}, isSaving = false }) => {
    const [name, setName] = useState(initialData.name || '');
    const [description, setDescription] = useState(initialData.description || '');
    const [agentType, setAgentType] = useState(initialData.agentType || AGENT_TYPES[0]);
    const [model, setModel] = useState(initialData.model || GEMINI_MODELS[0]);
    const [instruction, setInstruction] = useState(initialData.instruction || '');
    const [selectedTools, setSelectedTools] = useState(initialData.tools || []);

    const [availableGofannonTools, setAvailableGofannonTools] = useState([]);
    const [loadingTools, setLoadingTools] = useState(false);
    const [toolError, setToolError] = useState('');

    const handleRefreshGofannonTools = async () => {
        setLoadingTools(true);
        setToolError('');
        try {
            const result = await fetchGofannonTools();
            if (result.success && result.manifest && result.manifest.tools) {
                setAvailableGofannonTools(result.manifest.tools);
            } else {
                setToolError("Could not load Gofannon tools from manifest.");
            }
        } catch (error) {
            console.error("Error fetching Gofannon tools:", error);
            setToolError(`Failed to fetch Gofannon tools: ${error.message}`);
        } finally {
            setLoadingTools(false);
        }
    };

    useEffect(() => {
        handleRefreshGofannonTools();
    }, []);

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({ name, description, agentType, model, instruction, tools: selectedTools });
    };

    return (
        <Paper elevation={3} sx={{ p: { xs: 2, md: 4 } }}>
            <Box component="form" onSubmit={handleSubmit} noValidate>
                <Grid container spacing={3}>
                    <Grid item xs={12}>
                        <TextField
                            label="Agent Name"
                            id="name"
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
                            id="description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            multiline
                            rows={3}
                            fullWidth
                            variant="outlined"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <FormControl fullWidth variant="outlined">
                            <InputLabel id="agentType-label">Agent Type</InputLabel>
                            <Select
                                labelId="agentType-label"
                                id="agentType"
                                value={agentType}
                                onChange={(e) => setAgentType(e.target.value)}
                                label="Agent Type"
                            >
                                {AGENT_TYPES.map(type => <MenuItem key={type} value={type}>{type}</MenuItem>)}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <FormControl fullWidth variant="outlined">
                            <InputLabel id="model-label">Model</InputLabel>
                            <Select
                                labelId="model-label"
                                id="model"
                                value={model}
                                onChange={(e) => setModel(e.target.value)}
                                label="Model"
                            >
                                {GEMINI_MODELS.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12}>
                        <TextField
                            label="Instruction (System Prompt)"
                            id="instruction"
                            value={instruction}
                            onChange={(e) => setInstruction(e.target.value)}
                            multiline
                            rows={5}
                            placeholder="e.g., You are a helpful assistant that specializes in space exploration."
                            fullWidth
                            variant="outlined"
                        />
                    </Grid>
                    <Grid item xs={12}>
                        <ToolSelector // This component also needs MUI refactoring
                            availableGofannonTools={availableGofannonTools}
                            selectedTools={selectedTools}
                            setSelectedTools={setSelectedTools}
                            onRefreshGofannon={handleRefreshGofannonTools}
                            loadingGofannon={loadingTools}
                            gofannonError={toolError}
                        />
                    </Grid>
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
                            {isSaving ? 'Saving...' : (initialData.id ? 'Update Agent' : 'Create Agent')}
                        </Button>
                    </Grid>
                </Grid>
            </Box>
        </Paper>
    );
};

export default AgentForm;  