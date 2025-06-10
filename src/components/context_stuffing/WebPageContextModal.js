// src/components/context_stuffing/WebPageContextModal.js
import React, { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Box } from '@mui/material';

const WebPageContextModal = ({ open, onClose, onSubmit }) => {
    const [url, setUrl] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = () => {
        if (!url.trim()) {
            setError('URL is required.');
            return;
        }
        try {
            new URL(url); // Basic URL validation
        } catch (_) {
            setError('Invalid URL format.');
            return;
        }
        setError('');
        onSubmit({ type: 'webpage', url });
        handleClose();
    };

    const handleClose = () => {
        setUrl('');
        setError('');
        onClose();
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
            <DialogTitle>Stuff Web Page Content</DialogTitle>
            <DialogContent>
                <Box component="form" noValidate autoComplete="off" sx={{ pt: 1 }}>
                    <TextField
                        autoFocus
                        margin="dense"
                        id="webpage-url"
                        label="Web Page URL"
                        type="url"
                        fullWidth
                        variant="outlined"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        error={!!error}
                        helperText={error || "Enter the full URL of the web page."}
                    />
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>Cancel</Button>
                <Button onClick={handleSubmit} variant="contained">Fetch & Add</Button>
            </DialogActions>
        </Dialog>
    );
};

export default WebPageContextModal;  