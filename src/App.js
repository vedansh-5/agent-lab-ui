// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link as RouterLink} from 'react-router-dom'; // Added Navigate
import { AuthProvider } from './contexts/AuthContext'; // Added useAuth
import { CustomThemeProvider } from './contexts/ThemeContext';

import Navbar from './components/layout/Navbar';
import HomePage from './pages/HomePage';
import DashboardPage from './pages/DashboardPage';
import CreateAgentPage from './pages/CreateAgentPage';
import AgentPage from './pages/AgentPage';
import SettingsPage from './pages/SettingsPage';
import ProtectedRoute from './components/routing/ProtectedRoute';
import AdminPage from './pages/AdminPage'; // New
import UnauthorizedPage from './pages/UnauthorizedPage'; // New

// MUI Imports for App Layout
import { Box, Container, Typography, Link as MuiLink } from '@mui/material';


// AdminRoute component (can be defined here or in a separate file)
// Using the enhanced ProtectedRoute instead.
// function AdminRoute({ children }) {
//     const { currentUser, loading } = useAuth();

//     if (loading) {
//         return <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh"><LoadingSpinner /></Box>;
//     }
//     // ProtectedRoute will handle !currentUser and !isAuthorized
//     // We just need to check for isAdmin here, assuming ProtectedRoute already granted basic access
//     if (!currentUser?.permissions?.isAdmin) {
//         return <Navigate to="/dashboard" replace />; // Or /unauthorized
//     }
//     return children;
// }


function AppContent() {
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
                    <Route path="/unauthorized" element={<UnauthorizedPage />} />

                    {/* Protected Routes */}
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
                    <Route
                        path="/admin"
                        element={
                            <ProtectedRoute requireAdmin={true}>
                                <AdminPage />
                            </ProtectedRoute>
                        }
                    />

                    {/* 404 Not Found */}
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