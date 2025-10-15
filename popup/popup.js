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
});

// Handle Google Sign In
async function handleGoogleSignIn() {
    console.log('🔵 handleGoogleSignIn() called');

    if (!supabaseAuth) {
        console.error('❌ supabaseAuth is null');
        showMessage('Authentication service not available', 'error');
        return;
    }

    console.log('✅ supabaseAuth available, calling signInWithGoogle()');

    try {
        showMessage('Signing in...', 'success');
        const result = await supabaseAuth.signInWithGoogle();

        console.log('✅ Sign in successful:', {
            hasUser: !!result.user,
            email: result.user?.email
        });

        if (result.user) {
            showMessage('Successfully signed in!', 'success');
            
            // Force update the auth UI
            console.log('🔄 Updating UI after sign in...');
            updateAuthUI();

            // Notify background script of successful authentication
            chrome.runtime.sendMessage({
                action: 'userAuthenticated',
                user: result.user,
                session: result.session
            });
        }
    } catch (error) {
        console.error('Google sign in failed:', error);
        showMessage('Sign in failed: ' + error.message, 'error');
    }
}

// Handle Sign Out
async function handleSignOut() {
    console.log('🔵 handleSignOut() called');
    
    if (!supabaseAuth) {
        showMessage('Authentication service not available', 'error');
        return;
    }

    try {
        const success = await supabaseAuth.signOut();
        console.log('✅ Sign out result:', success);
        
        if (success) {
            showMessage('Successfully signed out', 'success');
            
            // Force update the auth UI
            console.log('🔄 Updating UI after sign out...');
            updateAuthUI();

            // Notify background script of sign out
            chrome.runtime.sendMessage({
                action: 'userSignedOut'
            });
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