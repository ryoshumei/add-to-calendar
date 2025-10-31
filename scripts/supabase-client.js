// scripts/supabase-client.js
// Supabase client configuration for Chrome extension

// Import configuration
// Note: CONFIG will be available globally when config.js is loaded

// Import Supabase client library
// Note: You'll need to download and include supabase-js library
// Download from: https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/index.js

class SupabaseAuth {
    constructor() {
        // Initialize Supabase client
        // this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        this.supabase = null; // Will be initialized when library is loaded
        this.currentUser = null;
        this.session = null;
    }

    // Initialize the client after library loads
    async initialize() {
        console.log('🔵 SupabaseAuth.initialize() called');
        
        // Check if supabase library is loaded (it exports as 'supabase' globally)
        const createClientFunc = (typeof supabase !== 'undefined' && supabase.createClient) ||
                                (typeof createClient !== 'undefined' && createClient);

        if (createClientFunc && typeof CONFIG !== 'undefined') {
            console.log('✅ Creating Supabase client...');
            this.supabase = createClientFunc(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
            console.log('✅ Supabase client created');
            
            // Set up auth state change listener to automatically persist session updates
            this.setupAuthListener();
            
            // Don't call getSession here - let restoreSession handle it
            // This prevents overwriting the restored session
        } else {
            console.error('❌ Supabase library or CONFIG not loaded');
            throw new Error('Supabase library or CONFIG not loaded');
        }
    }

    // Set up auth state change listener to persist session updates
    setupAuthListener() {
        if (!this.supabase) {
            console.error('❌ Cannot setup auth listener: Supabase not initialized');
            return;
        }

        console.log('🔵 Setting up auth state change listener...');
        
        this.supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('🔔 Auth state changed:', event, {
                hasSession: !!session,
                userEmail: session?.user?.email
            });

            // Update internal state
            this.session = session;
            this.currentUser = session?.user || null;

            // Persist session changes to storage
            // Only update storage for meaningful events, not INITIAL_SESSION
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                if (session) {
                    await chrome.storage.local.set({
                        supabase_session: session
                    });
                    console.log('✅ Session updated in storage');
                }
            } else if (event === 'SIGNED_OUT') {
                // Clear session from storage only on explicit sign out
                await chrome.storage.local.remove(['supabase_session']);
                console.log('🗑️ Session cleared from storage');
            }
            // Ignore INITIAL_SESSION and other events - let restoreSession handle initial state
        });

        console.log('✅ Auth state change listener setup complete');
    }

    // Get current session
    async getSession() {
        console.log('🔵 getSession() called');
        if (!this.supabase) throw new Error('Supabase not initialized');

        const { data: { session }, error } = await this.supabase.auth.getSession();
        if (error) {
            console.error('❌ Error getting session:', error);
            return null;
        }

        console.log('📊 getSession result:', {
            hasSession: !!session,
            userEmail: session?.user?.email
        });

        this.session = session;
        this.currentUser = session?.user || null;
        return session;
    }

    // Sign in with Google using Chrome Identity API
    async signInWithGoogle() {
        console.log('🔵 signInWithGoogle() called');

        if (!this.supabase) {
            console.error('❌ Supabase not initialized');
            throw new Error('Supabase not initialized');
        }

        console.log('✅ Supabase is initialized, starting OAuth flow');

        return new Promise((resolve, reject) => {
            // Note: No keepalive needed when running in background service worker
            // Service workers stay alive during async operations like OAuth

            // Get manifest for OAuth configuration
            const manifest = chrome.runtime.getManifest();

            // Build Google OAuth URL with correct redirect URI
            const url = new URL('https://accounts.google.com/o/oauth2/auth');
            url.searchParams.set('client_id', manifest.oauth2.client_id);
            url.searchParams.set('response_type', 'id_token');
            url.searchParams.set('access_type', 'offline');
            url.searchParams.set('redirect_uri', `https://${chrome.runtime.id}.chromiumapp.org`);
            url.searchParams.set('scope', manifest.oauth2.scopes.join(' '));

            // Launch OAuth flow
            chrome.identity.launchWebAuthFlow(
                {
                    url: url.href,
                    interactive: true,
                },
                async (redirectedTo) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }

                    try {
                        console.log('OAuth redirect URL:', redirectedTo);

                        // Extract ID token from redirect URL
                        const url = new URL(redirectedTo);
                        const params = new URLSearchParams(url.hash.substring(1)); // Remove #
                        const idToken = params.get('id_token');

                        console.log('Extracted ID token:', idToken ? 'Present' : 'Missing');

                        if (!idToken) {
                            throw new Error('No ID token received from OAuth redirect');
                        }

                        // Sign in to Supabase with the ID token
                        console.log('Attempting to sign in to Supabase with ID token...');
                        const { data, error } = await this.supabase.auth.signInWithIdToken({
                            provider: 'google',
                            token: idToken,
                        });

                        console.log('Supabase signInWithIdToken result:', { data, error });

                        if (error) {
                            console.error('Supabase authentication error:', error);
                            throw error;
                        }

                        if (!data.session || !data.user) {
                            throw new Error('No session or user returned from Supabase');
                        }

                        this.session = data.session;
                        this.currentUser = data.user;

                        console.log('Authentication successful:', {
                            userId: data.user.id,
                            email: data.user.email
                        });

                        // Store session in Chrome storage for persistence
                        await chrome.storage.local.set({
                            supabase_session: data.session
                        });

                        resolve({
                            user: data.user,
                            session: data.session
                        });

                    } catch (error) {
                        console.error('Authentication flow error:', error);
                        reject(error);
                    }
                }
            );
        });
    }

    // Sign out
    async signOut() {
        if (!this.supabase) throw new Error('Supabase not initialized');

        const { error } = await this.supabase.auth.signOut();
        if (error) {
            console.error('Error signing out:', error);
            return false;
        }

        this.session = null;
        this.currentUser = null;

        // Clear Chrome storage
        await chrome.storage.local.remove(['supabase_session']);

        return true;
    }

    // Check if user is authenticated
    isAuthenticated() {
        return this.session !== null && this.currentUser !== null;
    }

    // Get access token for API calls
    getAccessToken() {
        return this.session?.access_token || null;
    }

    // Listen for auth state changes
    onAuthStateChange(callback) {
        if (!this.supabase) throw new Error('Supabase not initialized');

        return this.supabase.auth.onAuthStateChange(callback);
    }

    // Restore session from Chrome storage
    async restoreSession() {
        console.log('🔵 restoreSession() called');
        
        try {
            const { supabase_session } = await chrome.storage.local.get(['supabase_session']);
            
            console.log('📊 Chrome storage check:', {
                hasStoredSession: !!supabase_session,
                sessionKeys: supabase_session ? Object.keys(supabase_session) : []
            });

            if (supabase_session) {
                console.log('✅ Found stored session, attempting to restore...');
                const { data, error } = await this.supabase.auth.setSession(supabase_session);

                console.log('📊 setSession result:', {
                    hasData: !!data,
                    hasSession: !!data?.session,
                    hasUser: !!data?.user,
                    error: error
                });

                if (!error && data.session) {
                    this.session = data.session;
                    this.currentUser = data.user;
                    
                    // IMPORTANT: Save the refreshed session back to storage
                    // setSession() may have refreshed the access token, so we need to persist it
                    await chrome.storage.local.set({
                        supabase_session: data.session
                    });
                    
                    console.log('✅ Session restored and updated in storage:', {
                        userEmail: data.user?.email,
                        userId: data.user?.id
                    });
                    return true;
                } else {
                    console.log('❌ Session restore failed:', error);
                    // Clear invalid session from storage
                    await chrome.storage.local.remove(['supabase_session']);
                }
            } else {
                console.log('ℹ️ No stored session found');
            }
        } catch (error) {
            console.error('❌ Error restoring session:', error);
            // Clear potentially corrupted session
            await chrome.storage.local.remove(['supabase_session']);
        }

        return false;
    }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SupabaseAuth;
} else if (typeof self !== 'undefined') {
    // Service Worker environment
    self.SupabaseAuth = SupabaseAuth;
} else if (typeof window !== 'undefined') {
    // Browser environment
    window.SupabaseAuth = SupabaseAuth;
} else {
    // Fallback for other environments
    globalThis.SupabaseAuth = SupabaseAuth;
}