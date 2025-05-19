import React from 'react';
import LoginButton from '../components/auth/LoginButton';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';

const HomePage = () => {
    const { currentUser } = useAuth();

    if (currentUser) {
        return <Navigate to="/dashboard" replace />;
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen py-2">
            <main className="flex flex-col items-center justify-center w-full flex-1 px-20 text-center">
                <h1 className="text-4xl font-bold mb-6">
                    Welcome to AgentWebUI
                </h1>
                <p className="mb-8 text-lg">
                    Rapidly prototype and deploy AI agents with Google ADK and Gofannon.
                </p>
                <LoginButton />
            </main>
        </div>
    );
};

export default HomePage;