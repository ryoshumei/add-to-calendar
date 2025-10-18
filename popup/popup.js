// popup/popup.js

// Global variables for authentication
let supabaseAuth = null;

document.addEventListener('DOMContentLoaded', async () => {
    // DOM elements
    const apiKeyInput = document.getElementById('apiKey');
    const saveButton = document.getElementById('saveButton');
    const deleteButton = document.getElementById('deleteButton');
    const messageDiv = document.getElementById('message');
    const togglePasswordButton = document.getElementById('togglePassword');

    // Authentication elements
    const googleSignInBtn = document.getElementById('googleSignInBtn');
    const signOutBtn = document.getElementById('signOutBtn');
    const loginSection = document.getElementById('loginSection');
    const userSection = document.getElementById('userSection');
    const userName = document.getElementById('userName');
    const userEmail = document.getElementById('userEmail');
    const userAvatar = document.getElementById('userAvatar');

    // Initialize Supabase authentication
    try {
        if (typeof SupabaseAuth !== 'undefined') {
            console.log('🔵 Initializing Supabase authentication...');
            supabaseAuth = new SupabaseAuth();
            await supabaseAuth.initialize();
            console.log('✅ Supabase initialized');

            // Try to restore existing session
            const restored = await supabaseAuth.restoreSession();
            console.log('🔄 Session restore result:', restored);
            console.log('🔍 Auth state after restore:', {
                isAuthenticated: supabaseAuth.isAuthenticated(),
                hasUser: !!supabaseAuth.currentUser,
                userEmail: supabaseAuth.currentUser?.email
            });
            
            updateAuthUI();
        } else {
            console.warn('Supabase authentication not available - falling back to API key only');
        }
    } catch (error) {
        console.error('Failed to initialize Supabase auth:', error);
        showMessage('Authentication service unavailable', 'error');
    }

    // Load saved API key
    loadApiKey();

    // Authentication event listeners
    if (googleSignInBtn) {
        googleSignInBtn.addEventListener('click', handleGoogleSignIn);
    }

    if (signOutBtn) {
        signOutBtn.addEventListener('click', handleSignOut);
    }

    // Toggle password visibility
    togglePasswordButton.addEventListener('click', () => {
        const type = apiKeyInput.type === 'password' ? 'text' : 'password';
        apiKeyInput.type = type;
        togglePasswordButton.textContent = type === 'password' ? '👁️' : '👁️‍🗨️';
    });

    // Save API key
    saveButton.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();

        if (!apiKey) {
            showMessage('Please enter an API Key', 'error');
            return;
        }

        try {
            await chrome.storage.sync.set({ apiKey });
            showMessage('API Key saved successfully!', 'success');
        } catch (error) {
            showMessage('Save failed: ' + error.message, 'error');
        }
    });

    // Delete API key
    deleteButton.addEventListener('click', async () => {
        try {
            await chrome.storage.sync.remove('apiKey');
            apiKeyInput.value = '';
            showMessage('API Key deleted', 'success');
        } catch (error) {
            showMessage('Delete failed: ' + error.message, 'error');
        }
    });

    // Listen for storage changes to update UI when session changes
    // This handles the case where popup was closed during OAuth
    chrome.storage.onChanged.addListener(async (changes, namespace) => {
        if (namespace === 'local' && changes.supabase_session) {
            console.log('🔄 Session changed in storage, updating UI');

            if (changes.supabase_session.newValue) {
                // Session was added/updated - restore it
                if (supabaseAuth) {
                    const restored = await supabaseAuth.restoreSession();
                    if (restored) {
                        console.log('✅ Session restored from storage change');
                        updateAuthUI();
                    }
                }
            } else {
                // Session was removed - update UI to show logged out state
                console.log('🔄 Session removed from storage');
                if (supabaseAuth) {
                    supabaseAuth.session = null;
                    supabaseAuth.currentUser = null;
                }
                updateAuthUI();
            }
        }
    });
});

// Handle Google Sign In
async function handleGoogleSignIn() {
    console.log('🔵 handleGoogleSignIn() called in popup');

    try {
        showMessage('Signing in...', 'success');

        // Send message to background script to handle OAuth
        // This way OAuth continues even if popup closes
        const response = await chrome.runtime.sendMessage({
            action: 'signInWithGoogle'
        });

        console.log('✅ Background response:', response);

        if (response.success) {
            console.log('✅ Sign in successful:', response.user?.email);
            showMessage('Successfully signed in!', 'success');

            // Update local state
            if (supabaseAuth && response.user && response.session) {
                supabaseAuth.session = response.session;
                supabaseAuth.currentUser = response.user;
            }

            // Update UI
            updateAuthUI();
        } else {
            throw new Error(response.error || 'Sign in failed');
        }
    } catch (error) {
        console.error('Google sign in failed:', error);
        showMessage('Sign in failed: ' + error.message, 'error');
    }
}

// Handle Sign Out
async function handleSignOut() {
    console.log('🔵 handleSignOut() called in popup');

    try {
        // Send message to background script to handle sign out
        const response = await chrome.runtime.sendMessage({
            action: 'signOut'
        });

        console.log('✅ Background sign out response:', response);

        if (response.success) {
            console.log('✅ Sign out successful');
            showMessage('Successfully signed out', 'success');

            // Update local state
            if (supabaseAuth) {
                supabaseAuth.session = null;
                supabaseAuth.currentUser = null;
            }

            // Update UI
            updateAuthUI();
        } else {
            throw new Error(response.error || 'Sign out failed');
        }
    } catch (error) {
        console.error('Sign out failed:', error);
        showMessage('Sign out failed: ' + error.message, 'error');
    }
}

// Update authentication UI based on current state
function updateAuthUI() {
    console.log('🔄 updateAuthUI() called');
    
    const loginSection = document.getElementById('loginSection');
    const userSection = document.getElementById('userSection');
    const userName = document.getElementById('userName');
    const userEmail = document.getElementById('userEmail');
    const userAvatar = document.getElementById('userAvatar');

    // Check authentication state
    const isAuthenticated = supabaseAuth && supabaseAuth.isAuthenticated();
    console.log('🔍 Authentication state:', {
        hasSupabaseAuth: !!supabaseAuth,
        isAuthenticated: isAuthenticated,
        currentUser: supabaseAuth?.currentUser?.email || 'none'
    });

    if (isAuthenticated) {
        console.log('✅ User is authenticated, showing user section');
        
        // Show user section, hide login section
        loginSection.style.display = 'none';
        userSection.style.display = 'block';

        // Update user information
        const user = supabaseAuth.currentUser;
        if (user) {
            console.log('👤 User data:', {
                email: user.email,
                name: user.user_metadata?.full_name,
                avatar: user.user_metadata?.avatar_url || user.user_metadata?.picture
            });
            
            userName.textContent = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
            userEmail.textContent = user.email || '';

            // Set user avatar
            const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture;
            if (avatarUrl) {
                userAvatar.src = avatarUrl;
                userAvatar.style.display = 'block';
            } else {
                // Use default avatar with user's initials
                userAvatar.style.display = 'none';
            }
        }
    } else {
        console.log('❌ User is not authenticated, showing login section');
        
        // Show login section, hide user section
        loginSection.style.display = 'block';
        userSection.style.display = 'none';
    }
}

// Load saved API key
async function loadApiKey() {
    const apiKeyInput = document.getElementById('apiKey');
    try {
        const { apiKey } = await chrome.storage.sync.get('apiKey');
        if (apiKey) {
            apiKeyInput.value = apiKey;
        }
    } catch (error) {
        showMessage('Failed to load API Key: ' + error.message, 'error');
    }
}

// Show message with auto-hide
function showMessage(text, type) {
    const messageDiv = document.getElementById('message');
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';

    // Auto hide after 3 seconds
    setTimeout(() => {
        messageDiv.style.display = 'none';
    }, 3000);
}