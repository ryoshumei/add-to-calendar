// config.js - Public configuration that can be safely exposed
const CONFIG = {
    // Supabase public keys (designed to be public)
    SUPABASE_URL: 'https://pahcnlwgtghsctbnedhx.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhaGNubHdndGdoc2N0Ym5lZGh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1Njk0NTcsImV4cCI6MjA3MzE0NTQ1N30.PmsrghVvCAvJW3dPFeqRvsDeulzZQyN8-VXn_lRZr14',

    // Edge Functions (backend service endpoints)
    EDGE_FUNCTIONS: {
        PROCESS_TEXT: 'https://pahcnlwgtghsctbnedhx.supabase.co/functions/v1/process-text',
        CREATE_CALENDAR_EVENT: 'https://pahcnlwgtghsctbnedhx.supabase.co/functions/v1/create-calendar-event'
    },

    // Extension settings
    EXTENSION: {
        NAME: 'Calendar Event Creator',
        VERSION: '1.2.0'
    }
};

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
} else if (typeof self !== 'undefined') {
    // Service Worker environment
    self.CONFIG = CONFIG;
} else if (typeof window !== 'undefined') {
    // Browser environment
    window.CONFIG = CONFIG;
} else {
    // Fallback for other environments
    globalThis.CONFIG = CONFIG;
}