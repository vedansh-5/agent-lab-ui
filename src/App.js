import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Navbar from './components/layout/Navbar';
import HomePage from './pages/HomePage';
import DashboardPage from './pages/DashboardPage';
import CreateAgentPage from './pages/CreateAgentPage';
import AgentPage from './pages/AgentPage';
import SettingsPage from './pages/SettingsPage'; // Example for future use
import LoadingSpinner from './components/common/LoadingSpinner';

function ProtectedRoute({ children }) {
    const { currentUser, loading } = useAuth();

    if (loading) {
        return <LoadingSpinner />;
    }

    return currentUser ? children : <Navigate to="/" replace />;
}

function AppContent() {
    return (
        <>
            <Navbar />
            <div className="container mx-auto p-4 mt-16"> {/* Added mt-16 for navbar height */}
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
                    <Route path="*" element={ // Catch-all for 404
                        <div className="text-center py-10">
                            <h1 className="text-3xl font-bold">404 - Page Not Found</h1>
                            <Link to="/" className="text-blue-500 hover:underline">Go Home</Link>
                        </div>
                    }
                    />
                </Routes>
            </div>
        </>
    );
}

function App() {
    return (
        <AuthProvider>
            <Router>
                <AppContent />
            </Router>
        </AuthProvider>
    );
}
export default App;  