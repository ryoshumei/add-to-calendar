// scripts/backend-config.js
// Decides which backend the extension talks to.
//
// Production always uses the Supabase project in config.js. A test may store a
// base URL under `backend_base_url_override` in chrome.storage.local to aim
// the backend calls — the auth endpoints and the Edge Functions alike — at a
// local stub instead. With that key absent, which is every real install, these
// helpers hand back the production URLs unchanged.

const BACKEND_BASE_URL_OVERRIDE_KEY = 'backend_base_url_override';

async function getBackendBaseUrlOverride() {
    try {
        const stored = await chrome.storage.local.get(BACKEND_BASE_URL_OVERRIDE_KEY);
        const override = stored?.[BACKEND_BASE_URL_OVERRIDE_KEY];
        return typeof override === 'string' && override.trim() ? override.trim() : null;
    } catch (error) {
        console.warn('Could not read the backend base URL override:', error);
        return null;
    }
}

// Base URL the Supabase client is created with.
async function resolveSupabaseUrl() {
    return (await getBackendBaseUrlOverride()) || CONFIG.SUPABASE_URL;
}

// Endpoint to call for one of the Edge Functions in config.js: the configured
// URL, or the same path on the override's origin.
async function resolveBackendUrl(productionUrl) {
    const override = await getBackendBaseUrlOverride();
    if (!override) return productionUrl;
    return new URL(new URL(productionUrl).pathname, override).toString();
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        BACKEND_BASE_URL_OVERRIDE_KEY,
        getBackendBaseUrlOverride,
        resolveSupabaseUrl,
        resolveBackendUrl
    };
} else if (typeof self !== 'undefined') {
    // Service Worker environment
    self.getBackendBaseUrlOverride = getBackendBaseUrlOverride;
    self.resolveSupabaseUrl = resolveSupabaseUrl;
    self.resolveBackendUrl = resolveBackendUrl;
} else if (typeof window !== 'undefined') {
    // Browser environment
    window.getBackendBaseUrlOverride = getBackendBaseUrlOverride;
    window.resolveSupabaseUrl = resolveSupabaseUrl;
    window.resolveBackendUrl = resolveBackendUrl;
}
