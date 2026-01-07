// background.js

// Import configuration and services
importScripts('config.js');
importScripts('scripts/supabase-js.min.js'); // Supabase JavaScript client library
importScripts('scripts/supabase-client.js');
importScripts('scripts/calendar-service.js');

// Global authentication state
let supabaseAuth = null;
let calendarService = null;
let currentUser = null;

// Initialize immediately when service worker loads
// This ensures auth is ready when messages arrive
console.log('🚀 Service worker starting, initializing auth...');

// Initialize authentication on startup
async function initializeAuth() {
    try {
        console.log('🔄 Initializing authentication...');
        supabaseAuth = new SupabaseAuth();
        await supabaseAuth.initialize();
        await supabaseAuth.restoreSession();

        calendarService = new CalendarService(supabaseAuth);

        if (supabaseAuth.isAuthenticated()) {
            currentUser = supabaseAuth.currentUser;
            console.log('✅ User authenticated:', currentUser?.email);
        } else {
            currentUser = null;
            console.log('ℹ️ No authenticated user');
        }
        console.log('✅ Authentication initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize authentication:', error);
    }
}

// Ensure authentication is initialized (for service worker wake-ups)
async function ensureAuthInitialized() {
    if (!supabaseAuth) {
        console.log('⚠️ Auth not initialized, initializing now...');
        await initializeAuth();
    }
    return supabaseAuth !== null;
}

// Initialize authentication immediately when service worker loads
initializeAuth();

// Create context menu when extension is installed
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "addToCalendar",
        title: "Add to Google Calendar",
        contexts: ["selection"]
    });

    // Initialize authentication
    initializeAuth();
});

// Handle startup
chrome.runtime.onStartup.addListener(() => {
    initializeAuth();
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
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "addToCalendar") {
        // Generate a unique request ID using timestamp
        const requestId = `${tab.id}-${Date.now()}`;

        // Check if there's already an active request for this tab
        if (activeRequests.has(tab.id)) {
            console.log('Request already in progress for this tab');
            return;
        }

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
                    
                    // Show modal with setup instructions instead of notification
                    try {
                        await chrome.tabs.sendMessage(tab.id, {
                            type: "SHOW_SETUP_REQUIRED"
                        });
                        console.log('✅ Setup modal message sent');
                    } catch (error) {
                        console.log('⚠️ Content script not ready, injecting for setup modal...');
                        // Try to inject content script and retry
                        try {
                            await chrome.scripting.executeScript({
                                target: {tabId: tab.id},
                                files: ['content.js']
                            });
                            await new Promise(resolve => setTimeout(resolve, 100));
                            await chrome.tabs.sendMessage(tab.id, {
                                type: "SHOW_SETUP_REQUIRED"
                            });
                            console.log('✅ Setup modal sent after injection');
                        } catch (retryError) {
                            // Fallback to notification if modal fails completely
                            console.log('⚠️ Modal failed completely, using notification fallback');
                            chrome.notifications.create({
                                type: 'basic',
                                iconUrl: 'icons/icon128.png',
                                title: 'Setup Required',
                                message: 'Please sign in with Google or set your OpenAI API key in extension settings'
                            });
                        }
                    }
                    return;
                }

                // Process with OpenAI and create calendar URL
                console.log('✅ Using API key for processing');
                await updateStatusMessage(tab.id, 'Analyzing event details...', 'Using your OpenAI API key');
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
                const response = await chrome.tabs.sendMessage(tab.id, {
                    type: "SHOW_CONFIRMATION",
                    requestId,
                    events: eventDetails.events, // Send events array
                    calendarUrl: result.calendarUrl, // Kept for backward compatibility
                    result: result
                });

                // If we get here, the content script handled the message
                console.log('Content script handled message:', response);
            } catch (error) {
                // If content script isn't ready, inject it
                console.log('Injecting content script...');
                await chrome.scripting.executeScript({
                    target: {tabId: tab.id},
                    files: ['content.js']
                });

                // Try sending the message again after a short delay
                await new Promise(resolve => setTimeout(resolve, 100));

                try {
                    await chrome.tabs.sendMessage(tab.id, {
                        type: "SHOW_CONFIRMATION",
                        requestId,
                        events: eventDetails.events, // Send events array
                        calendarUrl: result.calendarUrl,
                        result: result
                    });
                } catch (retryError) {
                    // If it still fails, open calendar directly for first event
                    if (result.calendarUrl) {
                        chrome.tabs.create({url: result.calendarUrl});
                    } else if (eventDetails.events && eventDetails.events.length > 0) {
                        chrome.tabs.create({url: createGoogleCalendarUrl(eventDetails.events[0])});
                    }
                }
            }
        } catch (error) {
            console.error("Error processing text:", error);
            
            // Hide status modal
            await hideStatusMessage(tab.id);
            
            // Check if it's an auth error
            if (isAuthError(error)) {
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
});

// Helper functions for status messages
async function sendStatusMessage(tabId, message, detail = '') {
    console.log('📤 Sending status message:', message, detail);
    try {
        await chrome.tabs.sendMessage(tabId, {
            type: "SHOW_STATUS",
            message: message,
            detail: detail
        });
        console.log('✅ Status message sent successfully');
    } catch (error) {
        console.log('⚠️ Content script not ready, injecting...', error.message);
        // Inject content script if not loaded
        try {
            await chrome.scripting.executeScript({
                target: {tabId: tabId},
                files: ['content.js']
            });
            console.log('✅ Content script injected');
            await new Promise(resolve => setTimeout(resolve, 100));
            await chrome.tabs.sendMessage(tabId, {
                type: "SHOW_STATUS",
                message: message,
                detail: detail
            });
            console.log('✅ Status message sent after injection');
        } catch (e) {
            console.error('❌ Failed to show status message:', e);
        }
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

// Process text with backend service
async function processWithBackend(text, accessToken) {
    try {
        console.log('Calling backend service...');
        
        // Check if we have a valid access token
        if (!accessToken) {
            throw new Error('Authentication required. Please sign in with Google.');
        }
        
        const response = await fetch(CONFIG.EDGE_FUNCTIONS.PROCESS_TEXT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ selectedText: text })
        });

        // Check for auth errors
        if (response.status === 401) {
            throw new Error('Session expired. Please sign in again with Google.');
        }

        if (!response.ok) {
            const errorData = await response.json();

            // Check if it's a usage limit error
            if (errorData.error && errorData.error.includes('Monthly limit exceeded')) {
                // Don't fall back to basic for limit errors - let user know they need to upgrade or wait
                throw new Error(errorData.error);
            }
            
            // Check for other auth-related errors
            if (errorData.error && (
                errorData.error.includes('authentication') ||
                errorData.error.includes('unauthorized') ||
                errorData.error.includes('session')
            )) {
                throw new Error('Authentication failed. Please sign in again with Google.');
            }

            throw new Error(errorData.error || `Backend processing failed: ${response.status}`);
        }

        const data = await response.json();
        console.log('Backend processing successful:', data.eventDetails);

        // Store usage information if present
        if (data.usage) {
            console.log(`Usage: ${data.usage.usageCount}/${data.usage.limit} for ${data.usage.yearMonth}`);
            await chrome.storage.local.set({ usage_info: data.usage });
        }

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

// Process text with OpenAI API
async function processWithOpenAI(text, apiKey) {
    const now = new Date();
    const currentDateTime = now.toLocaleString();

    const systemPrompt = `You are a JSON API that extracts event details from text. Return ONLY a raw JSON object with an "events" array containing one or more event objects:
    {
        "events": [
            {
                "title": "event title",
                "description": "brief description",
                "startTime": "YYYY-MM-DDTHH:mm:ss",
                "endTime": "YYYY-MM-DDTHH:mm:ss",
                "location": "location if mentioned, include online link if available"
            }
        ]
    }
    Current time is: ${currentDateTime}
    For relative dates, use the current time as reference.
    If no specific time mentioned, assume 10:00 AM for 1 hour.
    If the text contains multiple events, extract ALL of them as separate objects in the array.
    If only one event is found, still return it inside the events array.
    DO NOT include any markdown formatting, code blocks, or extra text.
    ONLY return the JSON object itself.`;

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4.1-mini',
                messages: [
                    {
                        role: 'system',
                        content: systemPrompt
                    },
                    {
                        role: 'user',
                        content: `Time: ${currentDateTime}\nText: ${text}`
                    }
                ],
                temperature: 0.3,
                top_p: 1,
                response_format: { type: 'json_object' }
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'API request failed');
        }

        const data = await response.json();
        // Log the raw response for debugging
        console.log('Raw GPT response:', data.choices[0].message.content);

        try {
            let response = JSON.parse(data.choices[0].message.content.trim());

            // Backward compatibility: wrap single event in events array
            if (!response.events && response.title) {
                response = { events: [response] };
            }

            validateEventResponse(response);
            return response;
        } catch (parseError) {
            console.error('JSON Parse Error:', parseError);
            console.error('Raw content:', data.choices[0].message.content);
            throw new Error('Failed to parse GPT response as JSON');
        }
    } catch (error) {
        console.error('Error calling OpenAI API:', error);
        throw new Error('Failed to process text: ' + error.message);
    }
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
function validateEventResponse(response) {
    if (!response || !Array.isArray(response.events) || response.events.length === 0) {
        throw new Error('Invalid response: Expected object with events array containing at least one event');
    }

    // Validate each event in the array
    response.events.forEach((event, index) => {
        validateSingleEventDetails(event, index);
    });
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