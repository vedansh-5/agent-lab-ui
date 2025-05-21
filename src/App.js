// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link as RouterLink } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { CustomThemeProvider } from './contexts/ThemeContext';

import Navbar from './components/layout/Navbar';
import HomePage from './pages/HomePage';
import DashboardPage from './pages/DashboardPage';
import CreateAgentPage from './pages/CreateAgentPage';
import AgentPage from './pages/AgentPage';
import SettingsPage from './pages/SettingsPage';
import ProtectedRoute from './components/routing/ProtectedRoute'; // Updated import

// MUI Imports for App Layout
import { Box, Container, Typography, Link as MuiLink } from '@mui/material';
// import { useTheme } from '@mui/material/styles'; // No longer directly used here for theme


function AppContent() {
    // eslint-disable-next-line
    // const theme = useTheme(); // No longer needed here

    return (
        <>
            <Navbar />
            <Container
                component="main"
                maxWidth="lg"
                sx={{
                    mt: { xs: '56px', sm: '64px' },
                    py: 3,
                }}
            >
                <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route
                        path="/dashboard"
                        element={<ProtectedRoute><DashboardPage /></ProtectedRoute>}
                    />
                    <Route
                        path="/create-agent"
                        element={<ProtectedRoute><CreateAgentPage /></ProtectedRoute>}
                    />
                    <Route
                        path="/agent/:agentId/edit"
                        element={<ProtectedRoute><CreateAgentPage isEditMode={true} /></ProtectedRoute>}
                    />
                    <Route
                        path="/agent/:agentId"
                        element={<ProtectedRoute><AgentPage /></ProtectedRoute>}
                    />
                    <Route
                        path="/settings"
                        element={<ProtectedRoute><SettingsPage /></ProtectedRoute>}
                    />
                    <Route path="*" element={
                        <Box textAlign="center" py={10}>
                            <Typography variant="h3" component="h1" gutterBottom>
                                404 - Page Not Found
                            </Typography>
                            <MuiLink component={RouterLink} to="/" variant="h6">
                                Go Home
                            </MuiLink>
                        </Box>
                    }
                    />
                </Routes>
            </Container>
        </>
    );
}

function App() {
    return (
        <CustomThemeProvider>
            <AuthProvider>
                <Router>
                    <AppContent />
                </Router>
            </AuthProvider>
        </CustomThemeProvider>
    );
}
export default App;  