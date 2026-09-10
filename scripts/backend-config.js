// scripts/backend-config.js
// Decides which backend the extension talks to.
//
// Production always uses the Supabase project in config.js and OpenAI itself.
// A test may store a base URL under `backend_base_url_override` in
// chrome.storage.local to aim the calls — the auth endpoints, the Edge
// Functions and the own-key path's OpenAI request alike — at a local stub
// instead. With that key absent, which is every real install, these helpers
// hand back the production URLs unchanged.

const BACKEND_BASE_URL_OVERRIDE_KEY = 'backend_base_url_override';

// Where the own-key path sends a Source: the user's key, their request, no
// backend in between.
const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

// The override moves every request the extension makes, the own-key path's
// OpenAI call — which carries the user's raw key and their Source — included,
// so only an address that cannot leave the machine is honoured. Anything else
// stored under that key, however it got there, is ignored in favour of
// production rather than trusted.
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

// The origin of a stored override worth using, or null for every other value:
// a foreign host, https, a relative path, a typo, an object.
function loopbackOrigin(stored) {
    if (typeof stored !== 'string' || !stored.trim()) return null;

    let url;
    try {
        url = new URL(stored.trim());
    } catch (error) {
        return null;
    }

    if (url.protocol !== 'http:') return null;
    if (!LOOPBACK_HOSTS.has(url.hostname)) return null;

    return url.origin;
}

async function getBackendBaseUrlOverride() {
    try {
        const stored = await chrome.storage.local.get(BACKEND_BASE_URL_OVERRIDE_KEY);
        return loopbackOrigin(stored?.[BACKEND_BASE_URL_OVERRIDE_KEY]);
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

    try {
        return new URL(new URL(productionUrl).pathname, override).toString();
    } catch (error) {
        // Whatever went wrong here, the production URL is the one thing that
        // is always right: a throw would surface as a failed Extraction, or
        // worse, as the Selection path's fabricated basic event.
        console.warn('Could not apply the backend base URL override:', error);
        return productionUrl;
    }
}

// Endpoint the own-key path posts to: OpenAI, or — by the same rule, since
// the override swaps origins and keeps paths — the completions path on the
// override's origin, so a test can answer it from a local stub.
async function resolveOpenAiUrl() {
    return resolveBackendUrl(OPENAI_CHAT_COMPLETIONS_URL);
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        BACKEND_BASE_URL_OVERRIDE_KEY,
        OPENAI_CHAT_COMPLETIONS_URL,
        loopbackOrigin,
        getBackendBaseUrlOverride,
        resolveSupabaseUrl,
        resolveBackendUrl,
        resolveOpenAiUrl
    };
} else if (typeof self !== 'undefined') {
    // Service Worker environment
    self.getBackendBaseUrlOverride = getBackendBaseUrlOverride;
    self.resolveSupabaseUrl = resolveSupabaseUrl;
    self.resolveBackendUrl = resolveBackendUrl;
    self.resolveOpenAiUrl = resolveOpenAiUrl;
} else if (typeof window !== 'undefined') {
    // Browser environment
    window.getBackendBaseUrlOverride = getBackendBaseUrlOverride;
    window.resolveSupabaseUrl = resolveSupabaseUrl;
    window.resolveBackendUrl = resolveBackendUrl;
    window.resolveOpenAiUrl = resolveOpenAiUrl;
}
