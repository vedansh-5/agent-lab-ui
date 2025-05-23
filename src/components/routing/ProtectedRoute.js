// src/components/routing/ProtectedRoute.js
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Box } from '@mui/material';
import LoadingSpinner from '../common/LoadingSpinner';

function ProtectedRoute({ children, requireAdmin = false }) { // Added requireAdmin prop
    const { currentUser, loading } = useAuth();

    if (loading) {
        return <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh"><LoadingSpinner /></Box>;
    }

    if (!currentUser) {
        // Not logged in, redirect to login page
        return <Navigate to="/" replace />;
    }

    // Check for authorization.
    // If permissions field doesn't exist OR isAuthorized is explicitly false.
    if (!currentUser.permissions || currentUser.permissions.isAuthorized === false) {
        // Logged in but not authorized to use the app
        return <Navigate to="/unauthorized" replace />;
    }

    // If the route requires admin privileges
    if (requireAdmin) {
        if (!currentUser.permissions.isAdmin) {
            // Authorized to use the app, but not an admin for this specific route
            // Redirect to dashboard or a "not enough privileges" page (could be unauthorized again)
            return <Navigate to="/dashboard" replace />; // Or /unauthorized if preferred
        }
    }

    return children;
}

export default ProtectedRoute;  