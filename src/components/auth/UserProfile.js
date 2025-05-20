import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Paper, Typography, Avatar, Box } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person'; // Default icon

const UserProfile = () => {
    const { currentUser } = useAuth();

    if (!currentUser) {
        return <Typography color="text.secondary">Not logged in.</Typography>;
    }

    return (
        <Paper elevation={3} sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar
                src={currentUser.photoURL || undefined} // Use photoURL if available
                alt={currentUser.displayName || currentUser.email}
                sx={{ width: 64, height: 64, bgcolor: 'primary.main' }}
            >
                {!currentUser.photoURL && (currentUser.displayName ? currentUser.displayName.charAt(0).toUpperCase() : <PersonIcon />)}
            </Avatar>
            <Box>
                <Typography variant="h6" component="h2">
                    {currentUser.displayName || 'User Profile'}
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    <strong>Email:</strong> {currentUser.email}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                    <strong>UID:</strong> {currentUser.uid}
                </Typography>
                {/* Add more profile information or settings links here */}
            </Box>
        </Paper>
    );
};

export default UserProfile;