// src/components/tools/McpAuthDialog.js
import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    TextField, FormControl, InputLabel, Select, MenuItem, Box, FormHelperText
} from '@mui/material';

const McpAuthDialog = ({ open, onClose, serverUrl, existingAuth, onSave }) => {
    const [authType, setAuthType] = useState('none');
    const [token, setToken] = useState(''); // For Bearer
    const [apiKey, setApiKey] = useState(''); // For API Key
    const [apiKeyName, setApiKeyName] = useState(''); // For API Key header name

    useEffect(() => {
        if (open && existingAuth) {
            setAuthType(existingAuth.type || 'none');
            setToken(existingAuth.type === 'bearer' ? existingAuth.token : '');
            setApiKey(existingAuth.type === 'apiKey' ? existingAuth.key : '');
            setApiKeyName(existingAuth.type === 'apiKey' ? existingAuth.name : '');
        } else if (open) {
            // Reset form when opening for a new config
            setAuthType('none');
            setToken('');
            setApiKey('');
            setApiKeyName('');
        }
    }, [open, existingAuth]);

    const handleSave = () => {
        let authData = null;
        if (authType === 'bearer' && token.trim()) {
            authData = { type: 'bearer', token: token.trim() };
        } else if (authType === 'apiKey' && apiKey.trim() && apiKeyName.trim()) {
            authData = { type: 'apiKey', key: apiKey.trim(), name: apiKeyName.trim(), in: 'header' };
        }
        onSave(serverUrl, authData);
        onClose();
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Authentication for MCP Server</DialogTitle>
            <DialogContent>
                <Box component="form" noValidate sx={{ pt: 1 }}>
                    <TextField
                        fullWidth
                        label="Server URL"
                        value={serverUrl}
                        InputProps={{ readOnly: true }}
                        variant="filled"
                        sx={{ mb: 2 }}
                    />
                    <FormControl fullWidth>
                        <InputLabel id="auth-type-label">Authentication Type</InputLabel>
                        <Select
                            labelId="auth-type-label"
                            value={authType}
                            label="Authentication Type"
                            onChange={(e) => setAuthType(e.target.value)}
                        >
                            <MenuItem value="none">None</MenuItem>
                            <MenuItem value="bearer">Bearer Token</MenuItem>
                            <MenuItem value="apiKey">API Key (in Header)</MenuItem>
                        </Select>
                    </FormControl>

                    {authType === 'bearer' && (
                        <TextField
                            autoFocus
                            margin="dense"
                            id="bearer-token"
                            label="Bearer Token"
                            type="password"
                            fullWidth
                            variant="outlined"
                            value={token}
                            onChange={(e) => setToken(e.target.value)}
                            sx={{ mt: 2 }}
                        />
                    )}

                    {authType === 'apiKey' && (
                        <>
                            <TextField
                                autoFocus
                                margin="dense"
                                id="api-key-name"
                                label="Header Name"
                                fullWidth
                                variant="outlined"
                                value={apiKeyName}
                                onChange={(e) => setApiKeyName(e.target.value)}
                                placeholder="e.g., X-API-Key"
                                sx={{ mt: 2 }}
                            />
                            <TextField
                                margin="dense"
                                id="api-key-value"
                                label="API Key Value"
                                type="password"
                                fullWidth
                                variant="outlined"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                            />
                            <FormHelperText>The API key will be sent in the specified HTTP header.</FormHelperText>
                        </>
                    )}
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={handleSave} variant="contained">Save</Button>
            </DialogActions>
        </Dialog>
    );
};

export default McpAuthDialog;  