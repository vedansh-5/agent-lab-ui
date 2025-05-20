import React from 'react';
import UserProfile from '../components/auth/UserProfile'; // Already MUI-fied
import { useThemeSwitcher, availableThemes } from '../contexts/ThemeContext';

import { Container,
    Typography,
    Box,
    Paper,
    Grid,
    Select,
    MenuItem,
    FormControl,
    InputLabel } from '@mui/material';
import { useTheme } from '@mui/material/styles'; // To get current theme for display


const SettingsPage = () => {
    const { selectTheme, currentThemeKey } = useThemeSwitcher();
    const muiTheme = useTheme(); // To access current theme properties like customBranding

    const handleThemeChange = (event) => {
        selectTheme(event.target.value);
    };

    return (
        <Container maxWidth="md">
            <Typography variant="h4" component="h1" gutterBottom sx={{ mb: 3 }}>
                Settings
            </Typography>

            <Grid container spacing={3}>
                <Grid item xs={12}>
                    <UserProfile />
                </Grid>

                <Grid item xs={12}>
                    <Paper elevation={3} sx={{ p: 3 }}>
                        <Typography variant="h6" component="h3" gutterBottom>
                            Appearance
                        </Typography>
                        <FormControl fullWidth margin="normal">
                            <InputLabel id="theme-select-label">Select Theme</InputLabel>
                            <Select
                                labelId="theme-select-label"
                                id="theme-select"
                                value={currentThemeKey}
                                label="Select Theme"
                                onChange={handleThemeChange}
                            >
                                {Object.keys(availableThemes).map(key => (
                                    <MenuItem key={key} value={key}>
                                        {key.charAt(0).toUpperCase() + key.slice(1)}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        {muiTheme.customBranding?.logoUrl && (
                            <Box mt={2}>
                                <Typography variant="caption">Current Theme Logo (Example):</Typography>
                                <img src={muiTheme.customBranding.logoUrl} alt="Theme Logo" style={{maxWidth: '150px', maxHeight: '50px', display:'block', marginTop: '4px', filter: muiTheme.palette.mode === 'dark' ? 'invert(1)':'none' }}/>
                            </Box>
                        )}
                    </Paper>
                </Grid>

                <Grid item xs={12}>
                    <Paper elevation={3} sx={{ p: 3 }}>
                        <Typography variant="h6" component="h3" gutterBottom>
                            Application Preferences (Future)
                        </Typography>
                        <Typography color="text.secondary">
                            User-specific settings and key management will be available here.
                        </Typography>
                        {/* Example structure for a future setting
                        <FormControl fullWidth margin="normal">
                            <TextField label="External API Key" type="password" variant="outlined" />
                            <Button variant="contained" sx={{mt:1, alignSelf: 'flex-start'}}>Save Key</Button>
                        </FormControl>
                        */}
                    </Paper>
                </Grid>

                <Grid item xs={12}>
                    <Paper elevation={3} sx={{ p: 3 }}>
                        <Typography variant="h6" component="h3" gutterBottom>
                            Agent Sharing (Future)
                        </Typography>
                        <Typography color="text.secondary" paragraph>
                            Control how your agents can be accessed:
                        </Typography>
                        <Box component="ul" sx={{ pl: 2, listStyle: 'disc', color: 'text.secondary' }}>
                            <Typography component="li"><strong>Private:</strong> Only you can access.</Typography>
                            <Typography component="li"><strong>Semi-Private:</strong> Share with specific users.</Typography>
                            <Typography component="li"><strong>Public:</strong> Anyone with the link (BYOK).</Typography>
                        </Box>
                        <Typography variant="caption" display="block" sx={{mt:2}}>
                            This feature is planned for a future update.
                        </Typography>
                    </Paper>
                </Grid>
            </Grid>
        </Container>
    );
};

export default SettingsPage;  