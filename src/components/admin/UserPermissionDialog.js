// src/components/admin/UserPermissionDialog.js
import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    FormGroup, FormControlLabel, Checkbox, Typography, Box, FormHelperText
} from '@mui/material';
import { ALL_PERMISSIONS_LIST, DEFAULT_PERMISSIONS_FOR_NEW_USER_BY_ADMIN, PERMISSION_KEYS } from '../../constants/permissionsConstants';

const UserPermissionDialog = ({ open, onClose, user, onSave }) => {
    const [permissions, setPermissions] = useState({});
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (user) {
            // If user already has permissions, use them. Otherwise, use defaults for a new setup.
            // The scenario here is an admin is setting permissions for a user who *doesn't* have them yet.
            setPermissions(user.permissions || { ...DEFAULT_PERMISSIONS_FOR_NEW_USER_BY_ADMIN });
        } else {
            setPermissions({});
        }
    }, [user, open]);

    const handleChange = (event) => {
        setPermissions({
            ...permissions,
            [event.target.name]: event.target.checked,
        });
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await onSave(user.id, permissions); // Pass userId and the new permissions object
            onClose();
        } catch (error) {
            console.error("Error saving permissions:", error);
            // Handle error display to user if necessary (e.g., Snackbar)
        } finally {
            setIsSaving(false);
        }
    };

    if (!user) return null;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                Set Permissions for <Typography component="span" fontWeight="bold">{user.displayName || user.email}</Typography>
            </DialogTitle>
            <DialogContent>
                <Typography variant="caption" display="block" gutterBottom>User ID: {user.id}</Typography>
                <FormGroup sx={{ mt: 2 }}>
                    {ALL_PERMISSIONS_LIST.map(perm => (
                        <Box key={perm.key}>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={permissions[perm.key] || false}
                                        onChange={handleChange}
                                        name={perm.key}
                                    />
                                }
                                label={perm.label}
                            />
                            {perm.key === PERMISSION_KEYS.IS_AUTHORIZED && !permissions[perm.key] && (
                                <FormHelperText error sx={{ml: 4, mt: -0.5}}>
                                    Warning: If not authorized, user cannot access the application.
                                </FormHelperText>
                            )}
                            {perm.key === PERMISSION_KEYS.IS_ADMIN && permissions[perm.key] && (
                                <FormHelperText sx={{ml: 4, mt: -0.5, color: 'warning.dark'}}>
                                    Granting admin rights gives full control.
                                </FormHelperText>
                            )}
                        </Box>
                    ))}
                </FormGroup>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} color="secondary" disabled={isSaving}>
                    Cancel
                </Button>
                <Button onClick={handleSave} variant="contained" color="primary" disabled={isSaving}>
                    {isSaving ? 'Saving...' : 'Save Permissions'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default UserPermissionDialog;  