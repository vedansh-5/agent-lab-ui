import React from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';

const ErrorMessage = ({ message, severity = "error", title }) => {
    if (!message) return null;
    return (
        <Alert severity={severity} sx={{ my: 2 }}>
            {title && <AlertTitle>{title}</AlertTitle>}
            {typeof message === 'object' ? JSON.stringify(message) : message}
        </Alert>
    );
};

export default ErrorMessage;