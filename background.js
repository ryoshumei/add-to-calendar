// background.js

// Import configuration and services
importScripts('config.js');
importScripts('scripts/backend-config.js');
importScripts('scripts/supabase-js.min.js'); // Supabase JavaScript client library
importScripts('scripts/supabase-client.js');
importScripts('scripts/calendar-service.js');
importScripts('scripts/llm-prompt.js');
importScripts('scripts/screenshot-pipeline.js');

// Global authentication state
let supabaseAuth = null;
let calendarService = null;
let currentUser = null;

// Initialize immediately when service worker loads
// This ensures auth is ready when messages arrive
console.log('🚀 Service worker starting, initializing auth...');

// The worker's one and only start-up. Two auth clients in one worker is a
// real bug rather than waste: each one listens for auth state changes and each
// one restores the stored session, and whichever loses that race clears the
// session out of storage on its way out — signing the user out from under the
// client that won. The worker's own start-up, onInstalled, onStartup and every
// wake-up all mean "make sure auth is ready", so they share this one.
let authStartUp = null;

// Initialize authentication on startup
function initializeAuth() {
    if (!authStartUp) {
        authStartUp = startAuth();
    }
    return authStartUp;
}

async function startAuth() {
    try {
        console.log('🔄 Initializing authentication...');
        const auth = new SupabaseAuth();
        await auth.initialize();
        supabaseAuth = auth;
        await auth.restoreSession();

        calendarService = new CalendarService(auth);

        if (auth.isAuthenticated()) {
            currentUser = auth.currentUser;
            console.log('✅ User authenticated:', currentUser?.email);
        } else {
            currentUser = null;
            console.log('ℹ️ No authenticated user');
        }
        console.log('✅ Authentication initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize authentication:', error);
        // A failure is not remembered: the next caller starts auth again
        // rather than leaving the worker without it for the rest of its life.
        // The half-built client goes with it, so that caller builds one
        // instead of inheriting a client that never finished starting.
        authStartUp = null;
        supabaseAuth = null;
        calendarService = null;
        currentUser = null;
    }
}

// Ensure authentication is initialized (for service worker wake-ups)
async function ensureAuthInitialized() {
    await initializeAuth();
    return supabaseAuth !== null;
}

// Initialize authentication immediately when service worker loads
initializeAuth();

// The right-click item for a Screenshot is optional: a user who only ever
// starts a capture from the popup can take it off the menu. Sync storage, next
// to the API key, so the choice follows them across their Chrome profile.
const SCREENSHOT_MENU_ITEM_SETTING = 'showScreenshotMenuItem';

// Registering is remove-then-create rather than an incremental edit, so the
// menu always ends up as the setting describes however it got here — install,
// browser start, or the setting being flipped. Serialised, because two
// registrations interleaving would try to create an id that already exists.
let menuRegistration = Promise.resolve();

function registerContextMenus() {
    menuRegistration = menuRegistration
        .then(applyContextMenus)
        .catch(error => {
            console.error('❌ Could not build the context menu:', error);
        });
    return menuRegistration;
}

async function applyContextMenus() {
    const { [SCREENSHOT_MENU_ITEM_SETTING]: showScreenshotItem } =
        await chrome.storage.sync.get({ [SCREENSHOT_MENU_ITEM_SETTING]: true });

    await chrome.contextMenus.removeAll();

    chrome.contextMenus.create({
        id: "addToCalendar",
        title: "Add to Google Calendar",
        contexts: ["selection"]
    });

    if (showScreenshotItem) {
        // Every context, not just "page": a Screenshot is of the visible tab,
        // so what the pointer happens to be over makes no difference to it.
        chrome.contextMenus.create({
            id: "addScreenshotToCalendar",
            title: "Add screenshot to Google Calendar",
            contexts: ["all"]
        });
    }
}

// Create context menu when extension is installed
chrome.runtime.onInstalled.addListener(() => {
    registerContextMenus();

    // Initialize authentication
    initializeAuth();
});

// Handle startup
chrome.runtime.onStartup.addListener(() => {
    registerContextMenus();
    initializeAuth();
});

// The popup writes the setting; the menu it describes is the worker's to
// build, so it is rebuilt here rather than on the next browser start.
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes[SCREENSHOT_MENU_ITEM_SETTING]) {
        registerContextMenus();
    }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'signInWithGoogle') {
        // Handle Google sign in from popup
        console.log('🔵 Received signInWithGoogle request from popup');

        // Ensure auth is initialized before processing
        ensureAuthInitialized()
            .then(initialized => {
                if (!initialized || !supabaseAuth) {
                    sendResponse({ success: false, error: 'Authentication service not available' });
                    return;
                }

                // Perform OAuth in background (keeps running even if popup closes)
                return supabaseAuth.signInWithGoogle();
            })
            .then(result => {
                if (!result) return; // Error was already sent

                console.log('✅ Background OAuth successful:', result.user?.email);
                currentUser = result.user;

                // Reinitialize calendar service with authenticated user
                calendarService = new CalendarService(supabaseAuth);

                sendResponse({
                    success: true,
                    user: result.user,
                    session: result.session
                });
            })
            .catch(error => {
                console.error('❌ Background OAuth failed:', error);
                sendResponse({
                    success: false,
                    error: error.message
                });
            });

        return true; // Keep channel open for async response
    } else if (request.action === 'signOut') {
        // Handle sign out from popup
        console.log('🔵 Received signOut request from popup');

        // Ensure auth is initialized before processing
        ensureAuthInitialized()
            .then(initialized => {
                if (!initialized || !supabaseAuth) {
                    sendResponse({ success: false, error: 'Authentication service not available' });
                    return Promise.resolve(false);
                }

                return supabaseAuth.signOut();
            })
            .then(success => {
                if (success === false) return; // Error was already sent

                if (success) {
                    currentUser = null;
                    console.log('✅ User signed out');
                    sendResponse({ success: true });
                } else {
                    sendResponse({ success: false, error: 'Sign out failed' });
                }
            })
            .catch(error => {
                console.error('❌ Sign out error:', error);
                sendResponse({ success: false, error: error.message });
            });

        return true; // Keep channel open for async response
    } else if (request.action === 'getAuthState') {
        // Return current authentication state
        console.log('🔍 Popup requesting auth state');

        // Ensure auth is initialized before checking state
        ensureAuthInitialized()
            .then(() => {
                sendResponse({
                    isAuthenticated: supabaseAuth?.isAuthenticated() || false,
                    user: currentUser
                });
            })
            .catch(error => {
                console.error('❌ Error getting auth state:', error);
                sendResponse({
                    isAuthenticated: false,
                    user: null
                });
            });

        return true; // Keep the message channel open for async response
    } else if (request.action === 'captureScreenshot') {
        // Screenshot trigger from the popup. The popup is not a tab, so the
        // active tab of the last focused window is the page the user is
        // looking at. The trigger only opens the Region overlay; the capture
        // happens once the user has drawn a Region there.
        console.log('📸 Received captureScreenshot request from popup');

        ensureAuthInitialized()
            .then(async () => {
                const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
                return startRegionCapture(tab);
            })
            .then(result => sendResponse(result))
            .catch(error => {
                console.error('❌ Could not start a Screenshot:', error);
                sendResponse({ success: false, error: error.message, showInPopup: true });
            });

        return true; // Keep channel open for async response
    } else if (request.action === 'regionDrawn') {
        // The page reports the Region the user drew — null for the whole
        // visible tab — and the device pixel ratio the capture will be in.
        console.log('📸 Region drawn, capturing the tab');

        ensureAuthInitialized()
            .then(() => handleScreenshotCapture(
                sender.tab,
                request.region,
                request.devicePixelRatio
            ))
            .then(result => sendResponse(result))
            .catch(error => {
                console.error('❌ Screenshot capture failed:', error);
                sendResponse({ success: false, error: error.message });
            });

        return true; // Keep channel open for async response
    } else if (request.action === 'userAuthenticated') {
        currentUser = request.user;
        console.log('User authenticated via popup:', currentUser?.email);

        // Reinitialize calendar service with authenticated user
        if (supabaseAuth) {
            calendarService = new CalendarService(supabaseAuth);
        }

        sendResponse({ success: true });
    } else if (request.action === 'userSignedOut') {
        currentUser = null;
        console.log('User signed out');
        sendResponse({ success: true });
    }
    return true; // Keep the message channel open for async response
});

// Store active requests to prevent duplicates
let activeRequests = new Set();

// Handle context menu click events
chrome.contextMenus.onClicked.addListener((info, tab) => handleContextMenuClick(info, tab));

async function handleContextMenuClick(info, tab) {
    if (info.menuItemId === "addScreenshotToCalendar") {
        // A Screenshot is one Source on its own: whatever the user had
        // highlighted when they right-clicked plays no part in it.
        await ensureAuthInitialized();
        const result = await startRegionCapture(tab);

        // No popup is open on this trigger, and the page that could not run
        // the overlay cannot show a modal either, so this is the one surface
        // left for saying why nothing happened — unless the page has already
        // said it, which is what reportedOnPage means.
        if (result && !result.success && result.error && !result.reportedOnPage) {
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon128.png',
                title: 'Calendar Event Creator',
                message: result.error
            });
        }
        return;
    }

    if (info.menuItemId === "addToCalendar") {
        // Generate a unique request ID using timestamp
        const requestId = `${tab.id}-${Date.now()}`;

        // Check if there's already an active request for this tab
        if (activeRequests.has(tab.id)) {
            console.log('Request already in progress for this tab');
            return;
        }

        // Whether this Extraction ran on the user's own OpenAI key, which
        // decides how a failure is read in the catch below: a key path never
        // touched Supabase, so nothing it fails with is a session problem.
        let usedOwnKey = false;

        try {
            // Mark this tab as having an active request
            activeRequests.add(tab.id);

            const selectedText = info.selectionText;
            let eventDetails;
            let result;

            // Log current auth state for debugging
            console.log('📊 Auth state check:', {
                hasCurrentUser: !!currentUser,
                currentUserEmail: currentUser?.email,
                isAuthenticated: supabaseAuth?.isAuthenticated(),
                hasSupabaseAuth: !!supabaseAuth
            });

            // Show initial status
            await sendStatusMessage(tab.id, 'Processing your text...', 'This may take a few seconds');

            // Check if user is authenticated
            if (currentUser && supabaseAuth?.isAuthenticated()) {
                console.log('✅ User authenticated, checking processing method...');

                // Priority 1: Check if user has their own OpenAI API key
                const {apiKey} = await chrome.storage.sync.get("apiKey");
                if (apiKey) {
                    // Use user's API key (they prefer their own key)
                    console.log('Using user\'s OpenAI API key');
                    await updateStatusMessage(tab.id, 'Analyzing event details...', 'Using your OpenAI API key');
                    usedOwnKey = true;
                    eventDetails = await processWithOpenAI(selectedText, apiKey);
                } else {
                    // Priority 2: Use backend service with our API key
                    console.log('Using backend service');
                    await updateStatusMessage(tab.id, 'Processing with backend...', 'Analyzing event details');
                    
                    try {
                        eventDetails = await processWithBackend(selectedText, supabaseAuth.getAccessToken());
                    } catch (error) {
                        // Check if it's an auth error
                        if (isAuthError(error)) {
                            console.error('Authentication error detected:', error);
                            await showAuthError(tab.id, error.message);
                            return;
                        }
                        throw error;
                    }
                }

                // Use calendar service for authenticated event creation
                await updateStatusMessage(tab.id, 'Creating calendar event...', 'Almost done');
                result = await calendarService.processEventCreation(eventDetails, selectedText);
                console.log('Calendar service result:', result);

            } else {
                console.log('ℹ️ User not authenticated, using API key fallback...');

                // Get API key for fallback processing
                const {apiKey} = await chrome.storage.sync.get("apiKey");
                
                console.log('📊 API key check:', {
                    hasApiKey: !!apiKey,
                    apiKeyLength: apiKey?.length || 0
                });

                if (!apiKey) {
                    console.log('❌ No API key found - showing setup guidance');
                    await hideStatusMessage(tab.id);
                    await showSetupRequired(tab.id);
                    return;
                }

                // Process with OpenAI and create calendar URL
                console.log('✅ Using API key for processing');
                await updateStatusMessage(tab.id, 'Analyzing event details...', 'Using your OpenAI API key');
                usedOwnKey = true;
                eventDetails = await processWithOpenAI(selectedText, apiKey);
                
                await updateStatusMessage(tab.id, 'Creating calendar event...', 'Almost done');
                // Create URL for first event (fallback for direct opening)
                result = {
                    method: 'url',
                    calendarUrl: eventDetails.events?.length > 0
                        ? createGoogleCalendarUrl(eventDetails.events[0])
                        : null,
                    message: 'Click to add event to your Google Calendar'
                };
            }

            // Hide status modal before showing confirmation
            await hideStatusMessage(tab.id);

            // Try to send message to content script
            // eventDetails now contains { events: [...] } array structure
            try {
                const response = await sendToContentScript(tab.id, {
                    type: "SHOW_CONFIRMATION",
                    requestId,
                    events: eventDetails.events, // Send events array
                    calendarUrl: result.calendarUrl, // Kept for backward compatibility
                    result: result
                });

                // If we get here, the content script handled the message
                console.log('Content script handled message:', response);
            } catch (error) {
                // The page cannot show the modal at all, so the first Event
                // opens in Google Calendar directly instead.
                if (result.calendarUrl) {
                    chrome.tabs.create({url: result.calendarUrl});
                } else if (eventDetails.events && eventDetails.events.length > 0) {
                    chrome.tabs.create({url: createGoogleCalendarUrl(eventDetails.events[0])});
                }
            }
        } catch (error) {
            console.error("Error processing text:", error);

            // Hide status modal
            await hideStatusMessage(tab.id);

            // Check if it's an auth error. Not on the key path: OpenAI
            // refusing a key is not a Google session that expired, and the
            // sign-in modal would send the user somewhere that cannot fix it.
            if (!usedOwnKey && isAuthError(error)) {
                await showAuthError(tab.id, error.message);
            } else {
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icons/icon128.png',
                    title: 'Calendar Event Creator',
                    message: 'Error: ' + error.message
                });
            }
        } finally {
            // Clean up the active request
            activeRequests.delete(tab.id);
        }
    }
}

// Chrome refuses to capture browser-internal pages (chrome://, the Web Store)
// and any page the extension was not invoked on.
const CANNOT_CAPTURE_MESSAGE =
    'This page cannot be captured. Chrome does not allow screenshots of browser pages such as chrome:// or the Web Store.';

// The two ways a Screenshot is refused before anything is captured, shared by
// the trigger that opens the Region overlay and the capture that follows it:
// a page there is no capturing, and — the same per-tab guard the Selection
// flow uses — a tab already in the middle of an Extraction, whose second
// trigger is ignored rather than charged. Null means carry on.
function screenshotRefusal(tab) {
    if (!tab) {
        return { success: false, error: CANNOT_CAPTURE_MESSAGE, showInPopup: true };
    }

    if (activeRequests.has(tab.id)) {
        console.log('Request already in progress for this tab');
        return { success: false, ignored: true };
    }

    return null;
}

// Capture the visible area of the tab. Split out because Chrome only grants
// the activeTab permission this needs on a real user gesture, which a test
// browser cannot produce — a test stands in for this one call.
async function captureVisibleTab(tab) {
    return chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
}

// chrome.tabs.captureVisibleTab takes a window, not a tab: it photographs
// whichever tab that window is showing. The Region belongs to the tab the user
// drew it on, and everything between the drag and the capture — the runtime
// hop, auth start-up, a storage read — is time for them to switch tabs. So the
// tab is asked whether it is still the one in front; if it is not, nothing is
// captured, because the Screenshot would be of a page they never pointed at.
async function isStillInFront(tab) {
    try {
        const current = await chrome.tabs.get(tab.id);
        return Boolean(current?.active) && current.windowId === tab.windowId;
    } catch (error) {
        // The tab has been closed since the Region was drawn.
        console.error('Could not check whether the tab is still in front:', error);
        return false;
    }
}

// What a Screenshot can be extracted with: the user's own OpenAI key, or a
// Google session that spends one of their monthly requests. With neither,
// there is nothing to send a Screenshot to.
async function hasAWayToExtract() {
    const { apiKey } = await chrome.storage.sync.get('apiKey');
    return Boolean(apiKey) || Boolean(currentUser && supabaseAuth?.isAuthenticated());
}

// Open the Region overlay on the page and leave it there: the user draws a
// Region, and the page reports it back for the capture. A page that cannot run
// the overlay is a page Chrome would refuse to capture anyway, so that is
// reported to the popup while it is still open to show it.
async function startRegionCapture(tab) {
    const refusal = screenshotRefusal(tab);
    if (refusal) return refusal;

    // Asked before the overlay opens, not after the Region is drawn: a user
    // with neither a key nor a session gets the setup guidance instead of a
    // drag that was never going to send anything.
    if (!(await hasAWayToExtract())) {
        console.log('ℹ️ No key and no session for a Screenshot — showing setup guidance');
        await showSetupRequired(tab.id);
        return {
            success: false,
            error: 'Sign in with Google or set your OpenAI API key to send a Screenshot.',
            // The page is already saying so; the popup and the notification
            // would only be saying it twice.
            reportedOnPage: true
        };
    }

    try {
        await sendToContentScript(tab.id, { type: 'SHOW_REGION_OVERLAY' });
        return { success: true };
    } catch (error) {
        console.error('Could not open the Region overlay:', error);
        return { success: false, error: CANNOT_CAPTURE_MESSAGE, showInPopup: true };
    }
}

// Turn the Region of the visible tab into a Screenshot and run one Extraction
// on it. The Region is in CSS pixels, or null for the whole visible tab; the
// device pixel ratio is what the capture is measured in.
async function handleScreenshotCapture(tab, region = null, devicePixelRatio = 1) {
    const refusal = screenshotRefusal(tab);
    if (refusal) return refusal;

    activeRequests.add(tab.id);

    try {
        // Priority identical to a Selection: the user's own OpenAI key first,
        // the shared backend second. Having one of the two was settled before
        // the overlay opened, in startRegionCapture.
        const { apiKey } = await chrome.storage.sync.get('apiKey');

        if (!(await isStillInFront(tab))) {
            console.log('The tab the Region was drawn on is no longer in front');
            await showExtractionError(tab.id, CANNOT_CAPTURE_MESSAGE);
            return { success: false, error: CANNOT_CAPTURE_MESSAGE };
        }

        let capture;
        try {
            // Captured before any status modal is shown: whatever the
            // extension draws on the page would otherwise be in the Screenshot.
            capture = await captureVisibleTab(tab);
        } catch (error) {
            // By now the popup the user triggered from has closed, so this is
            // reported where they are looking: the page.
            console.error('Could not capture the visible tab:', error);
            await showExtractionError(tab.id, CANNOT_CAPTURE_MESSAGE);
            return { success: false, error: CANNOT_CAPTURE_MESSAGE };
        }

        await sendStatusMessage(
            tab.id,
            'Reading this page...',
            apiKey ? 'Using your OpenAI API key' : 'This may take a few seconds'
        );

        try {
            const screenshot = await SCREENSHOT_PIPELINE.buildScreenshotDataUrl(
                capture,
                region,
                devicePixelRatio
            );

            const eventDetails = apiKey
                ? await processScreenshotWithOpenAI(screenshot, apiKey)
                // Optional chaining because signing out between the trigger
                // and the drag leaves no client: that reads as the sign-in
                // error it is, rather than a TypeError.
                : await processImageWithBackend(screenshot, supabaseAuth?.getAccessToken());

            await hideStatusMessage(tab.id);
            await sendToContentScript(tab.id, {
                type: 'SHOW_CONFIRMATION',
                requestId: `${tab.id}-${Date.now()}`,
                events: eventDetails.events,
                screenshot
            });

            return { success: true };
        } catch (error) {
            // A Screenshot has no basic fallback: a failed Extraction is an
            // error the user sees, not an invented event.
            console.error('Error extracting from the Screenshot:', error);
            await hideStatusMessage(tab.id);

            // Only the backend path can hit a Google session problem. On the
            // key path the Extraction never went near Supabase, so an OpenAI
            // error that happens to say "unauthorized" is about their key —
            // asking them to sign in again would send them nowhere useful.
            if (!apiKey && isAuthError(error)) {
                await showAuthError(tab.id, error.message);
            } else {
                await showExtractionError(tab.id, error.message);
            }

            return { success: false, error: error.message };
        }
    } finally {
        // The Screenshot lives only for this Extraction; nothing is stored.
        activeRequests.delete(tab.id);
    }
}

// Send a message to the page, injecting the content script once if it has not
// loaded yet — the same retry the status modal uses.
async function sendToContentScript(tabId, message) {
    try {
        return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
        console.log('⚠️ Content script not ready, injecting...', error.message);
        await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
        await new Promise(resolve => setTimeout(resolve, 100));
        return await chrome.tabs.sendMessage(tabId, message);
    }
}

// Helper functions for status messages
async function sendStatusMessage(tabId, message, detail = '') {
    console.log('📤 Sending status message:', message, detail);
    try {
        await sendToContentScript(tabId, {
            type: "SHOW_STATUS",
            message: message,
            detail: detail
        });
        console.log('✅ Status message sent successfully');
    } catch (error) {
        // A page that cannot show progress can still show the result, so this
        // is as far as it goes.
        console.error('❌ Failed to show status message:', error);
    }
}

async function updateStatusMessage(tabId, message, detail = '') {
    try {
        await chrome.tabs.sendMessage(tabId, {
            type: "UPDATE_STATUS",
            message: message,
            detail: detail
        });
    } catch (error) {
        console.log('Failed to update status message:', error);
    }
}

async function hideStatusMessage(tabId) {
    try {
        await chrome.tabs.sendMessage(tabId, {
            type: "HIDE_STATUS"
        });
    } catch (error) {
        console.log('Failed to hide status message:', error);
    }
}

async function showAuthError(tabId, errorMessage) {
    try {
        await chrome.tabs.sendMessage(tabId, {
            type: "SHOW_AUTH_ERROR",
            message: errorMessage
        });
    } catch (error) {
        // Fallback to notification
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'Authentication Required',
            message: 'Please sign in with Google via the extension popup.'
        });
    }
}

// Show a failed Extraction in the page, with the same message the Selection
// flow would report.
async function showExtractionError(tabId, errorMessage) {
    try {
        await sendToContentScript(tabId, {
            type: "SHOW_EXTRACTION_ERROR",
            message: errorMessage
        });
    } catch (error) {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'Calendar Event Creator',
            message: 'Error: ' + errorMessage
        });
    }
}

// Show the setup guidance modal for a user with neither a session nor a key.
async function showSetupRequired(tabId) {
    try {
        await sendToContentScript(tabId, { type: "SHOW_SETUP_REQUIRED" });
    } catch (error) {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'Setup Required',
            message: 'Please sign in with Google or set your OpenAI API key in extension settings'
        });
    }
}

// Check if error is an authentication error
function isAuthError(error) {
    if (!error) return false;
    
    const errorMessage = error.message || '';
    const authErrorPatterns = [
        'authentication failed',
        'not authenticated',
        'session expired',
        'invalid token',
        'unauthorized',
        'sign in required',
        '401',
        'access denied'
    ];
    
    return authErrorPatterns.some(pattern => 
        errorMessage.toLowerCase().includes(pattern.toLowerCase())
    );
}

// Turn a failed Edge Function response into the error the user sees. Shared by
// the Selection and Screenshot paths so both report a session expiry or a
// monthly limit in the same words.
async function backendResponseError(response) {
    if (response.status === 401) {
        return new Error('Session expired. Please sign in again with Google.');
    }

    let errorData = {};
    try {
        errorData = await response.json();
    } catch (error) {
        // A body that is not JSON tells us nothing beyond the status.
    }

    if (errorData.error && errorData.error.includes('Monthly limit exceeded')) {
        return new Error(errorData.error);
    }

    if (errorData.error && (
        errorData.error.includes('authentication') ||
        errorData.error.includes('unauthorized') ||
        errorData.error.includes('session')
    )) {
        return new Error('Authentication failed. Please sign in again with Google.');
    }

    return new Error(errorData.error || `Backend processing failed: ${response.status}`);
}

// Remember what the backend said this Extraction cost, so the popup's usage
// bar shows it.
async function storeUsageInfo(usage) {
    if (!usage) return;

    console.log(`Usage: ${usage.usageCount}/${usage.limit} for ${usage.yearMonth}`);
    await chrome.storage.local.set({ usage_info: usage });
}

// Send a Screenshot to the backend for Extraction. Unlike the Selection path
// there is no basic fallback: an Extraction that fails is reported as an error.
async function processImageWithBackend(imageDataUrl, accessToken) {
    if (!accessToken) {
        throw new Error('Authentication required. Please sign in with Google.');
    }

    const manifest = chrome.runtime.getManifest();
    const endpoint = await resolveBackendUrl(CONFIG.EDGE_FUNCTIONS.PROCESS_IMAGE);

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'X-Extension-Version': manifest.version,
        },
        // currentDateTime: the browser's local time (with timezone) so
        // relative dates ("tomorrow") resolve against the user's clock,
        // not the Edge Function's UTC clock.
        body: JSON.stringify({ image: imageDataUrl, currentDateTime: new Date().toString() })
    });

    if (!response.ok) {
        throw await backendResponseError(response);
    }

    const data = await response.json();
    await storeUsageInfo(data.usage);

    return data.eventDetails;
}

// Process text with backend service
async function processWithBackend(text, accessToken) {
    try {
        console.log('Calling backend service...');
        
        // Check if we have a valid access token
        if (!accessToken) {
            throw new Error('Authentication required. Please sign in with Google.');
        }
        
        // Get extension version from manifest
        const manifest = chrome.runtime.getManifest();

        const endpoint = await resolveBackendUrl(CONFIG.EDGE_FUNCTIONS.PROCESS_TEXT);

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
                'X-Extension-Version': manifest.version,
            },
            // currentDateTime: the browser's local time (with timezone) so
            // relative dates ("tomorrow") resolve against the user's clock,
            // not the Edge Function's UTC clock.
            body: JSON.stringify({ selectedText: text, currentDateTime: new Date().toString() })
        });

        // A 401 or a usage limit is reported in the same words as on the
        // Screenshot path, and neither falls back to basic event creation.
        if (!response.ok) {
            throw await backendResponseError(response);
        }

        const data = await response.json();
        console.log('Backend processing successful:', data.eventDetails);

        await storeUsageInfo(data.usage);

        return data.eventDetails;
    } catch (error) {
        console.error('Backend processing error:', error);

        // Don't fall back for usage limit errors - propagate them
        if (error.message && error.message.includes('Monthly limit exceeded')) {
            throw error;
        }
        
        // Don't fall back for auth errors - propagate them
        if (isAuthError(error)) {
            throw error;
        }

        // For other errors, fallback to basic event creation
        console.log('Falling back to basic event creation...');
        return createBasicEventFromText(text);
    }
}

// Run one Extraction against OpenAI with the user's own key and hand back the
// Events, whatever shape the model answered in. Shared by the Selection and
// the Screenshot key paths so both normalise and validate the same way.
async function extractWithOpenAI(requestBody, apiKey) {
    const endpoint = await resolveOpenAiUrl();

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'API request failed');
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    // Log the raw response for debugging
    console.log('Raw GPT response:', content);

    // Mirrors supabase/functions/_shared/parse-event-response.ts —
    // empty/null content and an empty events array are valid no-event results.
    if (!content || !content.trim()) {
        return { events: [] };
    }

    const cleaned = content
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '');

    let parsed;
    try {
        parsed = JSON.parse(cleaned);
    } catch (parseError) {
        console.error('JSON Parse Error:', parseError);
        console.error('Raw content:', content);
        throw new Error('Failed to parse GPT response as JSON');
    }

    // Backward compatibility: wrap single event in events array
    if (!Array.isArray(parsed.events) && parsed.title) {
        parsed = { events: [parsed] };
    }
    if (!Array.isArray(parsed.events)) {
        parsed = { events: [] };
    }

    validateEventResponse(parsed);
    return parsed;
}

// Process text with OpenAI API
async function processWithOpenAI(text, apiKey) {
    const now = new Date();
    const currentDateTime = now.toLocaleString();

    try {
        return await extractWithOpenAI(LLM_CONFIG.buildRequestBody(text, currentDateTime), apiKey);
    } catch (error) {
        console.error('Error calling OpenAI API:', error);
        throw new Error('Failed to process text: ' + error.message);
    }
}

// Send a Screenshot straight to OpenAI with the user's own key: their Region
// never reaches the shared backend, which is what a saved key buys them on the
// Selection path too. The error is reported as it came, so a key problem does
// not read as a session problem.
async function processScreenshotWithOpenAI(screenshotDataUrl, apiKey) {
    const currentDateTime = new Date().toLocaleString();

    return extractWithOpenAI(
        LLM_CONFIG.buildImageRequestBody(screenshotDataUrl, currentDateTime),
        apiKey
    );
}

// Create Google Calendar URL with optional timezone support
function createGoogleCalendarUrl(eventDetails, timezone = null) {
    const baseUrl = 'https://calendar.google.com/calendar/render';

    try {
        const formatDateTime = (isoString) => {
            return isoString.replace(/[-:]/g, '');
        };

        const params = new URLSearchParams();
        params.append('action', 'TEMPLATE');

        if (eventDetails.title) {
            params.append('text', eventDetails.title);
        }

        if (eventDetails.description) {
            // Limit description length to avoid URL length issues
            params.append('details', eventDetails.description.substring(0, 1000));
        }

        if (eventDetails.location) {
            params.append('location', eventDetails.location);
        }

        const startTime = formatDateTime(eventDetails.startTime);
        const endTime = formatDateTime(eventDetails.endTime);
        params.append('dates', `${startTime}/${endTime}`);

        // Add timezone parameter if provided
        if (timezone) {
            params.append('ctz', timezone);
        }

        return `${baseUrl}?${params.toString()}`;
    } catch (error) {
        console.error('Error creating calendar URL:', error);
        throw new Error('Failed to create calendar URL: ' + error.message);
    }
}

// Create basic event from text (fallback when no API key available)
function createBasicEventFromText(text) {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Set default time to 10:00 AM tomorrow for 1 hour
    const startTime = new Date(tomorrow);
    startTime.setHours(10, 0, 0, 0);

    const endTime = new Date(startTime);
    endTime.setHours(11, 0, 0, 0);

    // Return in new events array format
    return {
        events: [{
            title: text.substring(0, 100) + (text.length > 100 ? '...' : ''), // Truncate long text
            description: `Event created from selected text: "${text}"`,
            startTime: startTime.toISOString().slice(0, 19), // Format: YYYY-MM-DDTHH:mm:ss
            endTime: endTime.toISOString().slice(0, 19),
            location: ''
        }]
    };
}

// Validate event response structure (wrapper with events array)
// An empty array is valid — the modal surfaces it as "no events found".
function validateEventResponse(response) {
    if (!response || !Array.isArray(response.events)) {
        throw new Error('Invalid response: expected an events array');
    }

    // Validate each event in the array
    response.events.forEach((event, index) => {
        validateSingleEventDetails(event, index);
    });
}

// Repair model output where endTime is not after startTime — mirrors
// supabase/functions/_shared/parse-event-response.ts. The common cause is
// an event crossing midnight (a 23:12 receipt + default 1h duration →
// 00:12 emitted on the SAME date). Rolling endTime forward one day
// restores the intended duration; anything still nonsensical falls back
// to a 1-hour event. Wall-clock math is anchored in UTC ("Z") so the
// browser timezone and DST can never skew it.
function normalizeEventTimes(details) {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const HOUR_MS = 60 * 60 * 1000;
    const start = new Date(`${details.startTime}Z`).getTime();
    const end = new Date(`${details.endTime}Z`).getTime();
    if (end > start) return;

    // Midnight crossing needs a strictly earlier end — an EQUAL end is a
    // zero-length event, which becomes 1 hour, not 24.
    const endNextDay = end + DAY_MS;
    const repaired = end < start && endNextDay > start ? endNextDay : start + HOUR_MS;
    details.endTime = new Date(repaired).toISOString().slice(0, 19);
}

// Validate single event details
function validateSingleEventDetails(details, index = 0) {
    const required = ['title', 'startTime', 'endTime'];
    const missing = required.filter(field => !details[field]);

    if (missing.length > 0) {
        throw new Error(`Event ${index + 1}: Missing required fields: ${missing.join(', ')}`);
    }

    // Validate datetime format
    const dateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
    if (!dateTimeRegex.test(details.startTime) || !dateTimeRegex.test(details.endTime)) {
        throw new Error(`Event ${index + 1}: Invalid datetime format`);
    }

    // Auto-repair midnight-crossing/zero-length events before rejecting
    normalizeEventTimes(details);

    // Ensure start time is before end time
    if (new Date(details.startTime) >= new Date(details.endTime)) {
        throw new Error(`Event ${index + 1}: Start time must be before end time`);
    }
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'testAPI') {
        processWithOpenAI(request.text, request.apiKey)
            .then(result => {
                console.log('Test result:', result);
                sendResponse({success: true, result});
            })
            .catch(error => {
                console.error('Test error:', error);
                sendResponse({success: false, error: error.message});
            });
        return true;
    } else if (request.action === 'testCalendarUrl') {
        testCalendarUrl();
        sendResponse({success: true});
        return true;
    }
});