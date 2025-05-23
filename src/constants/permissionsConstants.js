// src/constants/permissionsConstants.js
export const PERMISSION_KEYS = {
    IS_ADMIN: 'isAdmin',
    CAN_CREATE_AGENT: 'canCreateAgent',
    CAN_RUN_AGENT: 'canRunAgent',
    // CAN_VIEW_APP: 'canView', // This seems covered by IS_AUTHORIZED for general app access
    IS_AUTHORIZED: 'isAuthorized', // Master switch for app access
};

export const ALL_PERMISSIONS_LIST = [
    { key: PERMISSION_KEYS.IS_ADMIN, label: 'Is Admin (Can access Admin Panel)' },
    { key: PERMISSION_KEYS.CAN_CREATE_AGENT, label: 'Can Create Agents' },
    { key: PERMISSION_KEYS.CAN_RUN_AGENT, label: 'Can Run Agents' },
    { key: PERMISSION_KEYS.IS_AUTHORIZED, label: 'Is Authorized (Can Access App)' },
];

export const DEFAULT_PERMISSIONS_FOR_NEW_USER_BY_ADMIN = {
    [PERMISSION_KEYS.IS_ADMIN]: false,
    [PERMISSION_KEYS.CAN_CREATE_AGENT]: true,
    [PERMISSION_KEYS.CAN_RUN_AGENT]: true,
    [PERMISSION_KEYS.IS_AUTHORIZED]: true, // Typically, if an admin approves, they become authorized.
};  