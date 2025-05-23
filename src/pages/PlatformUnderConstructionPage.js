// src/pages/PlatformUnderConstructionPage.js
import React from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { Container, Typography, Paper, Button, Link as MuiLink } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { getPlatformById } from '../constants/platformConstants';

const PlatformUnderConstructionPage = () => {
    const { platformId } = useParams();
    const platform = getPlatformById(platformId);

    if (!platform) {
        return (
            <Container maxWidth="sm">
                <Paper sx={{ p: 3, mt: 5, textAlign: 'center' }}>
                    <Typography variant="h5" gutterBottom>
                        Platform Not Recognized
                    </Typography>
                    <Typography color="text.secondary" sx={{ mb: 3 }}>
                        The platform ID provided is not valid.
                    </Typography>
                    <Button
                        variant="contained"
                        component={RouterLink}
                        to="/dashboard"
                        startIcon={<ArrowBackIcon />}
                    >
                        Go to Dashboard
                    </Button>
                </Paper>
            </Container>
        );
    }

    return (
        <Container maxWidth="sm">
            <Paper sx={{ p: {xs: 2, md: 4}, mt: 5, textAlign: 'center' }}>
                <Typography variant="h4" component="h1" gutterBottom>
                    🚧 {platform.name} Integration 🚧
                </Typography>
                <Typography variant="h6" color="text.secondary" sx={{ mt: 2, mb: 3 }}>
                    Integration for <strong>{platform.name}</strong> is currently under construction.
                </Typography>
                {platform.moreInfoUrl && (
                    <Typography sx={{ mb: 3 }}>
                        For more information, to track progress, or to contribute, please visit:
                        <br />
                        <MuiLink href={platform.moreInfoUrl} target="_blank" rel="noopener noreferrer">
                            {platform.moreInfoUrl}
                        </MuiLink>
                    </Typography>
                )}
                <Button
                    variant="contained"
                    component={RouterLink}
                    to="/dashboard"
                    startIcon={<ArrowBackIcon />}
                >
                    Back to Dashboard
                </Button>
            </Paper>
        </Container>
    );
};

export default PlatformUnderConstructionPage;