// src/pages/UnauthorizedPage.js
import React from 'react';
import { Typography, Container, Paper, Button, Box } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import ReportProblemIcon from '@mui/icons-material/ReportProblem'; // Example Icon

const UnauthorizedPage = () => {
    return (
        <Container component="main" maxWidth="sm" sx={{ mt: 8 }}>
            <Paper elevation={3} sx={{ p: { xs: 3, md: 5 }, textAlign: 'center' }}>
                <ReportProblemIcon sx={{ fontSize: 60, color: 'warning.main', mb: 2 }} />
                <Typography variant="h4" component="h1" gutterBottom>
                    Access Denied
                </Typography>
                <Typography variant="body1" color="text.secondary" paragraph>
                    You are not authorized to view this page or access the application.
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                    If you believe this is an error, please contact your administrator.
                </Typography>
                <Box mt={4}>
                    <Button
                        variant="contained"
                        color="primary"
                        component={RouterLink}
                        to="/"
                    >
                        Go to Homepage
                    </Button>
                </Box>
            </Paper>
        </Container>
    );
};

export default UnauthorizedPage;  