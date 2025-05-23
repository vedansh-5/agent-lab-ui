import React from 'react';
import LoginButton from '../components/auth/LoginButton';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Box, Typography, Container } from '@mui/material';
import { useTheme } from '@mui/material/styles'; // To access custom theme properties

const HomePage = () => {
    const { currentUser } = useAuth();
    const theme = useTheme(); // Access the current theme

    if (currentUser) {
        return <Navigate to="/dashboard" replace />;
    }

    // Example of using a custom property from the theme
    const welcomeMessage = theme.customBranding?.welcomeMessage || "Rapidly prototype and deploy AI agents with Google ADK and Gofannon.";
    const appName = theme.customBranding?.appName || "AgentLabUI";


    return (
        <Container component="main" maxWidth="md">
            <Box
                sx={{
                    minHeight: 'calc(100vh - 64px - 48px)', // Full height minus navbar and footer (if any)
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    py: { xs: 4, md: 8 },
                }}
            >
                <Typography variant="h2" component="h1" gutterBottom sx={{ fontWeight: 700, mb: 3 }}>
                    Welcome to {appName}
                </Typography>
                <Typography variant="h5" color="text.secondary" paragraph sx={{ mb: 6 }}>
                    {welcomeMessage}
                </Typography>
                <LoginButton />
            </Box>
        </Container>
    );
};

export default HomePage;  