// src/components/agents/PlatformSelectionDialog.js
import React, { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    Select, MenuItem, FormControl, InputLabel, FormHelperText
} from '@mui/material';
import { PLATFORMS } from '../../constants/platformConstants';

const PlatformSelectionDialog = ({ open, onClose, onSelectPlatform }) => {
    const [selectedPlatformId, setSelectedPlatformId] = useState('');
    const [error, setError] = useState('');

    const handlePlatformChange = (event) => {
        setSelectedPlatformId(event.target.value);
        setError('');
    };

    const handleSubmit = () => {
        if (!selectedPlatformId) {
            setError('Please select a platform.');
            return;
        }
        const platform = PLATFORMS.find(p => p.id === selectedPlatformId);
        if (platform) {
            onSelectPlatform(platform);
        }
        handleClose(); // Close dialog after selection or error
    };

    const handleClose = () => {
        // Reset state only if we want to clear selection on every close,
        // otherwise, keep selectedPlatformId if user just clicks outside.
        // For this flow, resetting is fine.
        setSelectedPlatformId('');
        setError('');
        onClose();
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
            <DialogTitle>Select Agent Platform</DialogTitle>
            <DialogContent sx={{ pt: '20px !important' }}> {/* MUI DialogContent can have default top padding */}
                <FormControl fullWidth error={!!error}>
                    <InputLabel id="platform-select-label">Platform</InputLabel>
                    <Select
                        labelId="platform-select-label"
                        id="platform-select"
                        value={selectedPlatformId}
                        label="Platform"
                        onChange={handlePlatformChange}
                    >
                        <MenuItem value="">
                            <em>Select a platform...</em>
                        </MenuItem>
                        {PLATFORMS.map((platform) => (
                            <MenuItem key={platform.id} value={platform.id}>
                                {platform.name}
                            </MenuItem>
                        ))}
                    </Select>
                    {error && <FormHelperText>{error}</FormHelperText>}
                </FormControl>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>Cancel</Button>
                <Button onClick={handleSubmit} variant="contained" disabled={!selectedPlatformId}>
                    Continue
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default PlatformSelectionDialog;  