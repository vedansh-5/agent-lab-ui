// src/components/routing/ProtectedRoute.js
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Box } from '@mui/material';
import LoadingSpinner from '../common/LoadingSpinner';

function ProtectedRoute({ children }) {
    const { currentUser, loading } = useAuth();

    if (loading) {
        return <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh"><LoadingSpinner /></Box>;
    }

    return currentUser ? children : <Navigate to="/" replace />;
}

export default ProtectedRoute;  