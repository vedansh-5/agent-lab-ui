import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link as RouterLink } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { CustomThemeProvider } from './contexts/ThemeContext'; // Import CustomThemeProvider

import Navbar from './components/layout/Navbar';
import HomePage from './pages/HomePage';
import DashboardPage from './pages/DashboardPage';
import CreateAgentPage from './pages/CreateAgentPage';
import AgentPage from './pages/AgentPage';
import SettingsPage from './pages/SettingsPage';
import LoadingSpinner from './components/common/LoadingSpinner'; // We'll refactor this too

// MUI Imports for App Layout
import { Box, Container, Typography, Link as MuiLink } from '@mui/material';
import { useTheme } from '@mui/material/styles';


function ProtectedRoute({ children }) {
    const { currentUser, loading } = useAuth();

    if (loading) {
        // Ensure LoadingSpinner is also MUI or styled consistently
        return <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh"><LoadingSpinner /></Box>;
    }

    return currentUser ? children : <Navigate to="/" replace />;
}

function AppContent() {
    // eslint-disable-next-line
    const theme = useTheme(); // Access the current theme

    // Get AppBar height for content offset. MUI themes provide mixins for standard heights.
    // theme.mixins.toolbar provides CSS for a spacer, or you can get the height.
    // A common way is to add a Toolbar component as a spacer if the AppBar is fixed.
    // Or, dynamically get AppBar height if it's variable.
    // For simplicity, we use a common pattern: an empty Toolbar for spacing.
    // Or more directly, use theme.spacing for margins.
    // The AppBar itself will define its height. The content below needs to account for it.
    // Let's use padding on the main container. A common AppBar height is 64px on desktop, 56px on mobile.
    // theme.mixins.toolbar.minHeight can be used if set consistently.

    return (
        <>
            <Navbar />
            {/* The main content area */}
            <Container
                component="main"
                maxWidth="lg" // Adjust as needed
                sx={{
                    mt: { xs: '56px', sm: '64px' }, // Standard AppBar heights for mobile/desktop
                    py: 3, // Padding top and bottom
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
                        path="/agent/:agentId/edit" // For editing
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
        <CustomThemeProvider> {/* Wrap with CustomThemeProvider */}
            <AuthProvider>
                <Router>
                    <AppContent />
                </Router>
            </AuthProvider>
        </CustomThemeProvider>
    );
}
export default App;  