// popup/popup.js

// Global variables for authentication
let supabaseAuth = null;

// Whether the right-click item for a Screenshot is on the menu. Sync storage,
// next to the API key, so the choice follows the user's Chrome profile. The
// service worker reads the same key when it builds the menu.
const SCREENSHOT_MENU_ITEM_SETTING = 'showScreenshotMenuItem';

document.addEventListener('DOMContentLoaded', async () => {
    // DOM elements
    const apiKeyInput = document.getElementById('apiKey');
    const saveButton = document.getElementById('saveButton');
    const deleteButton = document.getElementById('deleteButton');
    const messageDiv = document.getElementById('message');
    const togglePasswordButton = document.getElementById('togglePassword');

    // Screenshot capture
    const captureScreenshotBtn = document.getElementById('captureScreenshotBtn');
    const screenshotMenuToggle = document.getElementById('screenshotMenuToggle');

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

    // Screenshot capture event listener
    if (captureScreenshotBtn) {
        captureScreenshotBtn.addEventListener('click', handleCaptureScreenshot);
    }

    // The right-click item is optional; the service worker rebuilds its menu
    // when this lands in storage, so nothing here has to ask it to.
    if (screenshotMenuToggle) {
        loadScreenshotMenuSetting(screenshotMenuToggle);
        screenshotMenuToggle.addEventListener('change', async () => {
            try {
                await chrome.storage.sync.set({
                    [SCREENSHOT_MENU_ITEM_SETTING]: screenshotMenuToggle.checked
                });
            } catch (error) {
                // The menu is built from storage, so a checkbox left showing
                // the change describes a menu the user does not have: it goes
                // back to what was actually saved.
                await loadScreenshotMenuSetting(screenshotMenuToggle);
                showMessage('Could not save that setting: ' + error.message, 'error');
            }
        });
    }

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

    // Listen for storage changes to update UI when session or usage changes
    // This handles the case where popup was closed during OAuth or usage updated from background
    chrome.storage.onChanged.addListener(async (changes, namespace) => {
        if (namespace === 'local') {
            if (changes.supabase_session) {
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

            if (changes.usage_info) {
                console.log('🔄 Usage info changed in storage, updating UI');
                updateUsageDisplay();
            }
        }
    });
});

// Ask the service worker for a Screenshot of the visible tab and the
// Extraction that follows. Only a failure the page cannot report — the tab was
// never captured, so no modal can be shown on it — comes back for the popup to
// show; anything after the capture appears in the page's own modal.
async function handleCaptureScreenshot() {
    console.log('📸 Capture screenshot requested from popup');

    try {
        const response = await chrome.runtime.sendMessage({ action: 'captureScreenshot' });
        console.log('📸 Capture response:', response);

        if (response && response.success) {
            // The popup floats over the page the overlay just opened on, so it
            // has to go: left up, the user's first mousedown would dismiss the
            // popup instead of starting the drag.
            window.close();
            return;
        }

        if (response && !response.success && response.showInPopup) {
            showMessage(response.error, 'error');
        }
    } catch (error) {
        console.error('Screenshot capture failed:', error);
        showMessage('Screenshot failed: ' + error.message, 'error');
    }
}

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

        // Update usage stats for authenticated users
        updateUsageDisplay();
    } else {
        console.log('❌ User is not authenticated, showing login section');

        // Show login section, hide user section
        loginSection.style.display = 'block';
        userSection.style.display = 'none';
    }
}

// Show the toggle what the setting currently is. On by default, so a user who
// has never touched it sees the item they have on their menu.
async function loadScreenshotMenuSetting(toggle) {
    try {
        const stored = await chrome.storage.sync.get({
            [SCREENSHOT_MENU_ITEM_SETTING]: true
        });
        toggle.checked = stored[SCREENSHOT_MENU_ITEM_SETTING] !== false;
    } catch (error) {
        console.error('Could not read the right-click menu setting:', error);
    } finally {
        toggle.disabled = false;
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

// Update usage display
async function updateUsageDisplay() {
    const usageStats = document.getElementById('usageStats');
    const usageBar = document.getElementById('usageBar');
    const usageText = document.getElementById('usageText');

    try {
        // Get usage info from storage
        const { usage_info } = await chrome.storage.local.get('usage_info');

        // Always show usage stats for authenticated users
        usageStats.style.display = 'block';

        // Default to 0/50 if no usage info yet
        const usageCount = usage_info?.usageCount ?? 0;
        const limit = usage_info?.limit ?? 50;

        // Calculate percentage
        const percentage = (usageCount / limit) * 100;

        // Update bar width
        usageBar.style.width = `${percentage}%`;

        // Set bar color based on usage level
        let usageLevel;
        if (percentage < 50) {
            usageLevel = 'low';
        } else if (percentage < 75) {
            usageLevel = 'medium';
        } else if (percentage < 90) {
            usageLevel = 'high';
        } else {
            usageLevel = 'critical';
        }
        usageBar.setAttribute('data-usage', usageLevel);

        // Update text
        usageText.textContent = `${usageCount} / ${limit} requests used this month`;

        console.log('📊 Usage display updated:', {
            count: usageCount,
            limit: limit,
            percentage: percentage.toFixed(1) + '%',
            level: usageLevel
        });
    } catch (error) {
        console.error('Failed to update usage display:', error);
        // Even on error, show default 0/50
        usageStats.style.display = 'block';
        usageBar.style.width = '0%';
        usageBar.setAttribute('data-usage', 'low');
        usageText.textContent = '0 / 50 requests used this month';
    }
}