import React from 'react';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';

const LoadingSpinner = ({ small = false, sx }) => {
    const size = small ? 20 : 40;
    return (
        <Box display="flex" justifyContent="center" alignItems="center" sx={{ py: small ? 0 : 2, ...sx }}>
            <CircularProgress size={size} />
        </Box>
    );
};

export default LoadingSpinner;