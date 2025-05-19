import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const LoginButton = () => {
    const { loginWithGoogle, currentUser } = useAuth();
    const navigate = useNavigate();

    const handleLogin = async () => {
        if (currentUser) {
            navigate('/dashboard');
            return;
        }
        try {
            await loginWithGoogle();
            navigate('/dashboard');
        } catch (error) {
            console.error("Failed to log in with Google", error);
            // TODO: Show error message to user
        }
    };

    if (currentUser) return null; // Don't show if already logged in

    return (
        <button
            onClick={handleLogin}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
        >
            Login with Google
        </button>
    );
};

export default LoginButton;