import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import Button from '@mui/material/Button';
import GoogleIcon from '@mui/icons-material/Google'; // Example icon

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
            // TODO: Show error message to user with MUI Alert or Snackbar
        }
    };

    if (currentUser) return null;

    return (
        <Button
            variant="contained"
            color="primary"
            size="large"
            startIcon={<GoogleIcon />}
            onClick={handleLogin}
            sx={{ py: 1.5, px: 4, fontWeight: 'bold' }}
        >
            Login with Google
        </Button>
    );
};

export default LoginButton;  