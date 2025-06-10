// src/components/context_stuffing/PdfContextModal.js
import React, { useState, useRef } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Box, Typography, Input } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

const PdfContextModal = ({ open, onClose, onSubmit }) => {
    const [pdfUrl, setPdfUrl] = useState('');
    const [uploadedFile, setUploadedFile] = useState(null);
    const [fileName, setFileName] = useState('');
    const [error, setError] = useState('');
    const fileInputRef = useRef(null);

    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (file) {
            if (file.type !== 'application/pdf') {
                setError('Invalid file type. Please upload a PDF.');
                setUploadedFile(null);
                setFileName('');
                return;
            }
            if (file.size > 10 * 1024 * 1024) { // 10MB limit
                setError('File is too large. Maximum size is 10MB.');
                setUploadedFile(null);
                setFileName('');
                return;
            }
            setUploadedFile(file);
            setFileName(file.name);
            setPdfUrl(''); // Clear URL if file is chosen
            setError('');
        }
    };

    const handleSubmit = async () => {
        if (!pdfUrl.trim() && !uploadedFile) {
            setError('Please provide a PDF URL or upload a file.');
            return;
        }
        if (pdfUrl.trim()) {
            try {
                new URL(pdfUrl); // Basic URL validation
            } catch (_) {
                setError('Invalid PDF URL format.');
                return;
            }
        }
        setError('');

        let submissionData = { type: 'pdf' };
        if (uploadedFile) {
            const reader = new FileReader();
            reader.readAsDataURL(uploadedFile);
            reader.onload = () => {
                submissionData.fileData = reader.result.split(',')[1]; // Base64 data
                submissionData.fileName = uploadedFile.name;
                onSubmit(submissionData);
                handleClose();
            };
            reader.onerror = () => {
                setError('Error reading file.');
            };
        } else {
            submissionData.url = pdfUrl;
            onSubmit(submissionData);
            handleClose();
        }
    };

    const handleClose = () => {
        setPdfUrl('');
        setUploadedFile(null);
        setFileName('');
        setError('');
        if(fileInputRef.current) fileInputRef.current.value = ""; // Reset file input
        onClose();
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
            <DialogTitle>Stuff PDF Content</DialogTitle>
            <DialogContent>
                <Box component="form" noValidate autoComplete="off" sx={{ pt: 1 }}>
                    <TextField
                        autoFocus
                        margin="dense"
                        id="pdf-url"
                        label="PDF URL (Option 1)"
                        type="url"
                        fullWidth
                        variant="outlined"
                        value={pdfUrl}
                        onChange={(e) => { setPdfUrl(e.target.value); setUploadedFile(null); setFileName(''); setError(''); }}
                        helperText="Enter the full URL of the PDF."
                        disabled={!!uploadedFile}
                    />
                    <Typography variant="subtitle1" align="center" sx={{ my: 2 }}>OR</Typography>
                    <Button
                        variant="outlined"
                        component="label"
                        fullWidth
                        startIcon={<CloudUploadIcon />}
                        disabled={!!pdfUrl.trim()}
                    >
                        Upload PDF (Option 2)
                        <Input
                            type="file"
                            hidden
                            inputRef={fileInputRef}
                            onChange={handleFileChange}
                            accept="application/pdf"
                        />
                    </Button>
                    {fileName && <Typography variant="body2" sx={{ mt: 1 }}>Selected file: {fileName}</Typography>}
                    {error && <Typography color="error" sx={{ mt: 1 }}>{error}</Typography>}
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>Cancel</Button>
                <Button onClick={handleSubmit} variant="contained">Fetch & Add</Button>
            </DialogActions>
        </Dialog>
    );
};

export default PdfContextModal;  