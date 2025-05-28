// src/services/analyticsService.js

let gaIdInternal = null;
let consentGrantedForAnalyticsInternal = false;
let gaScriptLoadedInternal = false;
let configCallMade = false; // To ensure gtag('config') is called only once per load after consent

// To be called once config is loaded and consent status is initially checked/determined
export const setupGoogleAnalytics = (trackingId) => {
    if (!trackingId) {
        console.warn("Google Analytics ID not provided. GA setup skipped.");
        return;
    }
    gaIdInternal = trackingId;
    console.log("GA: setupGoogleAnalytics called with ID:", trackingId);

    // Check initial consent from localStorage
    const storedConsent = localStorage.getItem('gdpr-consent-analytics');
    if (storedConsent === 'granted') {
        console.log("GA: Consent previously granted from localStorage.");
        // Directly update consent state with gtag, as defaults might be 'denied'
        window.gtag('consent', 'update', {
            'analytics_storage': 'granted'
        });
        consentGrantedForAnalyticsInternal = true;
        loadGaScriptAndConfigIfNeeded();
    } else if (storedConsent === 'denied') {
        console.log("GA: Consent previously denied from localStorage.");
        consentGrantedForAnalyticsInternal = false;
        // Ensure gtag reflects this, though 'default' should handle it
        window.gtag('consent', 'update', {
            'analytics_storage': 'denied'
        });
    } else {
        console.log("GA: No prior consent found in localStorage. Waiting for user interaction or programmatic grant.");
        // Banner will handle asking for consent, or AppInitializer will grant if feature flag is off. Defaults are 'denied'.
    }
};

// Call this when consent is explicitly given via UI or programmatically
export const grantAnalyticsConsent = () => {
    if (!gaIdInternal) {
        console.warn("GA ID not set up. Cannot process consent grant.");
        return;
    }
    console.log("GA: Analytics consent GRANTED.");
    localStorage.setItem('gdpr-consent-analytics', 'granted');
    window.gtag('consent', 'update', {
        'analytics_storage': 'granted'
    });
    consentGrantedForAnalyticsInternal = true;
    loadGaScriptAndConfigIfNeeded();
};

// Call this when consent is explicitly denied or revoked via UI
export const denyAnalyticsConsent = () => {
    console.log("GA: Analytics consent DENIED.");
    localStorage.setItem('gdpr-consent-analytics', 'denied');
    window.gtag('consent', 'update', {
        'analytics_storage': 'denied'
    });
    consentGrantedForAnalyticsInternal = false;
    // GA will not send data. No need to remove script due to Consent Mode.
};

const loadGaScriptAndConfigIfNeeded = () => {
    if (!gaIdInternal || !consentGrantedForAnalyticsInternal) {
        // console.log("GA: Conditions not met for script load/config (ID or Consent missing).");
        return;
    }

    // Load script if not already loaded
    if (!gaScriptLoadedInternal) {
        if (document.querySelector(`script[src*="googletagmanager.com/gtag/js?id=${gaIdInternal}"]`)) {
            gaScriptLoadedInternal = true;
            console.log('GA: Script tag already present in DOM. Proceeding to config.');
        } else {
            const script = document.createElement('script');
            script.src = `https://www.googletagmanager.com/gtag/js?id=${gaIdInternal}`;
            script.async = true;
            script.onload = () => {
                console.log('GA: Script loaded successfully.');
                // gtag('js', new Date()) is usually handled by the script itself.
                // We need to ensure config is called.
                callGtagConfig();
            };
            script.onerror = () => {
                console.error('GA: Script failed to load.');
            };
            document.head.appendChild(script);
            gaScriptLoadedInternal = true; // Mark as attempting to load
            console.log('GA: Script tag injected.');
        }
    } else {
        // Script was already marked as loaded (or attempt was made), try to call config if not already done
        callGtagConfig();
    }
};

const callGtagConfig = () => {
    if (gaIdInternal && consentGrantedForAnalyticsInternal && !configCallMade) {
        console.log(`GA: Calling gtag('config', '${gaIdInternal}')`);
        window.gtag('config', gaIdInternal);
        configCallMade = true; // Mark config as called
        // Log initial page view after config
        logPageView(window.location.pathname + window.location.search);
    }
}

export const logPageView = (path) => {
    if (!gaIdInternal || !consentGrantedForAnalyticsInternal || !gaScriptLoadedInternal || !configCallMade) {
        // console.log(`GA: Page view for ${path} NOT logged. Conditions: ID=${!!gaIdInternal}, Consent=${consentGrantedForAnalyticsInternal}, ScriptLoaded=${gaScriptLoadedInternal}, ConfigCalled=${configCallMade}`);
        return;
    }
    console.log(`GA: Logging page_view for ${path}`);
    window.gtag('event', 'page_view', {
        page_path: path,
        page_title: document.title, // Send current document title
    });
};

export const logEvent = (category, action, label, value) => {
    if (!gaIdInternal || !consentGrantedForAnalyticsInternal || !gaScriptLoadedInternal || !configCallMade) {
        return;
    }
    console.log(`GA: Logging event: Category=${category}, Action=${action}, Label=${label}`);
    window.gtag('event', action, {
        event_category: category,
        event_label: label,
        value: value,
    });
};  