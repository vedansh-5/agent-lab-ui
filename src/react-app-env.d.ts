import '@mui/material/styles';

declare module '@mui/material/styles' {
    interface Theme {
        customBranding?: {
            logoUrl?: string;
            appName?: string;
            welcomeMessage?: string;
            welcomeMessageVariant?: string; // Example from clientATheme
            featureFlags?: { // Example from clientBTheme
                showAdvancedAnalytics?: boolean;
            };
        };
    }
    // allow configuration using `createTheme`
    interface ThemeOptions {
        customBranding?: {
            logoUrl?: string;
            appName?: string;
            welcomeMessage?: string;
            welcomeMessageVariant?: string;
            featureFlags?: {
                showAdvancedAnalytics?: boolean;
            };
        };
    }
}  