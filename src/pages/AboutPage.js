// src/pages/AboutPage.js
import React, { useState, useEffect } from 'react';
import { Container, Typography, Paper, Box, CircularProgress, Alert, Link as MuiLink } from '@mui/material';
import { useConfig } from '../contexts/ConfigContext';
import { useTheme } from '@mui/material/styles';

const AboutPage = () => {
    const [versionInfo, setVersionInfo] = useState(null);
    const [loadingVersion, setLoadingVersion] = useState(true);
    const [errorVersion, setErrorVersion] = useState(null);
    const { config, loadingConfig } = useConfig();
    const theme = useTheme();

    useEffect(() => {
        const fetchVersion = async () => {
            try {
                setLoadingVersion(true);
                const response = await fetch(`${process.env.PUBLIC_URL}/version.json`);
                if (!response.ok) {
                    throw new Error(`Failed to fetch version.json: ${response.status} ${response.statusText}`);
                }
                const data = await response.json();
                setVersionInfo(data);
                setErrorVersion(null);
            } catch (err) {
                console.error("Error fetching version information:", err);
                setErrorVersion(err.message || "Could not load version information.");
                setVersionInfo(null);
            } finally {
                setLoadingVersion(false);
            }
        };

        fetchVersion();
    }, []);

    const appName = config?.appTitle || theme.customBranding?.appName || "AgentLabUI";
    const appDescription = config?.appDescription || "This platform enables users to build, deploy, and manage advanced AI agents with ease.";


    return (
        <Container maxWidth="sm" sx={{ py: 4 }}>
            <Paper elevation={3} sx={{ p: { xs: 2, md: 4 } }}>
                <Typography variant="h4" component="h1" gutterBottom textAlign="center">
                    About {appName}
                </Typography>

                {(loadingVersion || loadingConfig) ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', my: 3 }}>
                        <CircularProgress />
                    </Box>
                ) : errorVersion ? (
                    <Alert severity="error" sx={{ my: 2 }}>{errorVersion}</Alert>
                ) : versionInfo ? (
                    <Box sx={{ my: 2, textAlign: 'center' }}>
                        <Typography variant="h6" component="p">
                            Version: {versionInfo.version || "Not specified"}
                        </Typography>
                        {versionInfo.buildDate && (
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                Build Date: {versionInfo.buildDate}
                            </Typography>
                        )}
                    </Box>
                ) : (
                    <Typography textAlign="center" color="text.secondary">
                        Version information not available.
                    </Typography>
                )}

                <Typography variant="body1" sx={{ mt: 3, textAlign: 'center' }}>
                    {appDescription}
                </Typography>

                <Box sx={{ mt: 4, textAlign: 'center' }}>
                    <MuiLink href="https://github.com/The-AI-Alliance/agent-lab-ui" target="_blank" rel="noopener noreferrer" variant="button">
                        Project on GitHub
                    </MuiLink>
                </Box>
            </Paper>
        </Container>
    );
};

export default AboutPage;