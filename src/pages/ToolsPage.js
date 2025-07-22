// src/pages/ToolsPage.js
import React from 'react';
import { Container, Typography, Paper, Box, Link as MuiLink } from '@mui/material';

const ToolsPage = () => {
    return (
        <Container maxWidth="md" sx={{ py: 4 }}>
            <Paper elevation={3} sx={{ p: { xs: 2, md: 4 }, textAlign: 'center' }}>
                <Typography variant="h4" component="h1" gutterBottom>
                    Tools
                </Typography>
                <Typography variant="h6" color="text.secondary" sx={{ mt: 2, mb: 3 }}>
                    Coming Soon
                </Typography>
                <Box>
                    <Typography>
                        In the meantime, be sure to check out{" "}
                        <MuiLink href="https://github.com/IBM/mcp-context-forge" target="_blank" rel="noopener noreferrer">
                            MCP Context Forge
                        </MuiLink>!
                    </Typography>
                </Box>
            </Paper>
        </Container>
    );
};

export default ToolsPage;