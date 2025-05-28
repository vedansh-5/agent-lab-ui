// src/App.js
import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link as RouterLink, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ConfigProvider, useConfig } from './contexts/ConfigContext';
import { CustomThemeProvider } from './contexts/ThemeContext';
import { Helmet } from 'react-helmet-async';

import Navbar from './components/layout/Navbar';
import HomePage from './pages/HomePage';
import DashboardPage from './pages/DashboardPage';
import CreateAgentPage from './pages/CreateAgentPage';
import AgentPage from './pages/AgentPage';
import SettingsPage from './pages/SettingsPage';
import ProtectedRoute from './components/routing/ProtectedRoute';
import AdminPage from './pages/AdminPage';
import UnauthorizedPage from './pages/UnauthorizedPage';
import LoadingSpinner from './components/common/LoadingSpinner';
import CookieConsentBanner from './components/common/CookieConsentBanner';
import * as analyticsService from './services/analyticsService';

// MUI Imports for App Layout
import { Box, Container, Typography, Link as MuiLink } from '@mui/material';
import PlatformUnderConstructionPage from "./pages/PlatformUnderConstructionPage";


function AppInitializer() {
    const { config, loadingConfig, configError } = useConfig();
    const location = useLocation();

    // Effect for GA setup (runs once config is loaded)
    useEffect(() => {
        if (!loadingConfig && config) {
            if (config.googleAnalyticsId) {
                analyticsService.setupGoogleAnalytics(config.googleAnalyticsId);

                // If GDPR consent feature is off, but GA ID exists, grant consent programmatically
                // This assumes that if the feature flag is off, consent is implied or handled externally.
                // Ensure this logic aligns with your privacy policy and regional regulations.
                if (!config.features?.gdprCookieConsent) {
                    console.warn("GA: GDPR consent feature is off, but GA ID is present. Automatically granting analytics consent. Ensure compliance.");
                    // Only grant if no prior decision (e.g. denial) was stored.
                    if (localStorage.getItem('gdpr-consent-analytics') !== 'denied') {
                        analyticsService.grantAnalyticsConsent();
                    }
                }
            }
            if (configError) {
                console.error("App Configuration Error:", configError);
                // You could set a global error state here to display a message to the user
            }
        }
    }, [config, loadingConfig, configError]);

    // Effect for tracking page views on route changes
    useEffect(() => {
        if (!loadingConfig && config && config.googleAnalyticsId) {
            // Wait for title to potentially update from Helmet before logging page view
            const timer = setTimeout(() => {
                analyticsService.logPageView(location.pathname + location.search);
            }, 100); // Small delay to allow Helmet to update document.title
            return () => clearTimeout(timer);
        }
    }, [location, config, loadingConfig]);

    if (loadingConfig) {
        return <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh"><LoadingSpinner /></Box>;
    }

    if (configError) {
        return (
            <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" minHeight="100vh" textAlign="center" p={3}>
                <Typography variant="h5" color="error" gutterBottom>Application Configuration Error</Typography>
                <Typography>Could not load application settings. Please try refreshing the page or contact support.</Typography>
                <Typography variant="caption" color="textSecondary" sx={{mt: 1}}>Details: {configError}</Typography>
            </Box>
        );
    }

    return (
        <>
            <Helmet
                title={config?.appTitle || "AgentLabUI"} // Default title
                defaultTitle="AgentLabUI" // Fallback if no title prop is set on a page
                titleTemplate={`%s | ${config?.appTitle || "Platform"}`} // Template for page-specific titles
            >
                <meta name="description" content={config?.appDescription || "Build & Deploy AI Agents"} />
            </Helmet>
            <AppContent />
            {config?.features?.gdprCookieConsent && <CookieConsentBanner />}
        </>
    );
}


function AppContent() {
    return (
        <>
            <Navbar />
            <Container
                component="main"
                maxWidth="lg"
                sx={{
                    mt: { xs: '56px', sm: '64px' }, // Standard Navbar height
                    pb: 3, // Padding at the bottom
                    minHeight: 'calc(100vh - (64px + 24px))' // Adjust if you have a footer
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
                        path="/platform-under-construction/:platformId"
                        element={<ProtectedRoute><PlatformUnderConstructionPage /></ProtectedRoute>}
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
        <ConfigProvider>
            <CustomThemeProvider>
                <AuthProvider>
                    <Router>
                        <AppInitializer />
                    </Router>
                </AuthProvider>
            </CustomThemeProvider>
        </ConfigProvider>
    );
}
export default App;  