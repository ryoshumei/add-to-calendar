// content.js

// Send a message to background script to confirm content script is loaded
chrome.runtime.sendMessage({ type: "CONTENT_SCRIPT_LOADED" });

// Create and inject CSS for the modal
const style = document.createElement('style');
style.textContent = `
.calendar-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 999999;
}

.calendar-modal {
    background: white;
    padding: 20px;
    border-radius: 8px;
    width: 400px;
    max-width: 90%;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.calendar-modal h2 {
    margin-top: 0;
    color: #202124;
}

.event-details {
    margin: 15px 0;
    padding: 10px;
    background-color: #f8f9fa;
    border-radius: 4px;
}

.event-details p {
    margin: 8px 0;
    color: #202124;
}

.calendar-modal-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 20px;
}

.calendar-modal-buttons button {
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
}

.calendar-modal-buttons .confirm {
    background-color: #4285f4;
    color: white;
}

.calendar-modal-buttons .cancel {
    background-color: #e0e0e0;
    color: #202124;
}

/* iOS app cross-promo strip (shown under the extracted events) */
.gc-ios-promo {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 18px 0 0;
    padding: 11px 14px;
    border-radius: 12px;
    text-decoration: none;
    color: #fff;
    box-sizing: border-box;
    background:
        radial-gradient(120% 160% at 100% 0%, rgba(99, 102, 241, .5), transparent 55%),
        radial-gradient(120% 160% at 0% 100%, rgba(10, 132, 255, .42), transparent 50%),
        linear-gradient(150deg, #1b1840, #25224d 55%, #1a1736);
    box-shadow: 0 6px 16px -8px rgba(20, 18, 55, .7), inset 0 0 0 1px rgba(255, 255, 255, .09);
    transition: transform .2s ease, box-shadow .2s ease;
}
.gc-ios-promo:hover {
    transform: translateY(-1px);
    box-shadow: 0 10px 22px -10px rgba(20, 18, 55, .85), inset 0 0 0 1px rgba(255, 255, 255, .13);
}
.gc-ios-promo__icon {
    flex: 0 0 auto;
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border-radius: 9px;
    background: linear-gradient(150deg, #6d5efc, #0a84ff 92%);
    box-shadow: 0 3px 8px -2px rgba(10, 132, 255, .5), inset 0 1px 0 rgba(255, 255, 255, .4);
}
.gc-ios-promo__copy {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 1;
    min-width: 0;
}
.gc-ios-promo__eyebrow {
    font: 700 9px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    letter-spacing: .14em;
    text-transform: uppercase;
    color: #a5b4fc;
}
.gc-ios-promo__title {
    font: 600 13px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.gc-ios-promo__badge {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px;
    border-radius: 7px;
    background: #fff;
    color: #15152b;
    font: 600 11px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    box-shadow: 0 2px 6px -2px rgba(0, 0, 0, .35);
}
.gc-ios-promo__badge svg { color: #15152b; }
.gc-ios-promo__chev {
    flex: 0 0 auto;
    color: rgba(255, 255, 255, .5);
    font-size: 18px;
    line-height: 1;
    transition: transform .2s ease, color .2s ease;
}
.gc-ios-promo:hover .gc-ios-promo__chev {
    transform: translateX(3px);
    color: rgba(255, 255, 255, .85);
}

/* Status modal styles */
.status-modal {
    background: white;
    padding: 30px;
    border-radius: 8px;
    width: 350px;
    max-width: 90%;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    text-align: center;
}

.status-modal .spinner {
    border: 3px solid #f3f3f3;
    border-top: 3px solid #4285f4;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    animation: spin 1s linear infinite;
    margin: 0 auto 20px;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

.status-modal .status-message {
    color: #202124;
    font-size: 16px;
    margin: 10px 0;
}

.status-modal .status-detail {
    color: #5f6368;
    font-size: 14px;
    margin-top: 10px;
}

.status-modal.error {
    padding: 25px;
}

.status-modal.error h3 {
    color: #d93025;
    margin: 0 0 15px 0;
    font-size: 18px;
}

.status-modal.error .error-message {
    color: #202124;
    font-size: 14px;
    line-height: 1.5;
    margin-bottom: 20px;
}

.status-modal.error .relogin-instructions {
    background: #f8f9fa;
    padding: 15px;
    border-radius: 4px;
    margin: 15px 0;
    text-align: left;
}

.status-modal.error .relogin-instructions ol {
    margin: 10px 0;
    padding-left: 20px;
}

.status-modal.error .relogin-instructions li {
    margin: 8px 0;
    color: #5f6368;
}

.status-modal.error button {
    padding: 10px 20px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    background-color: #4285f4;
    color: white;
    margin: 5px;
}

.status-modal.error button.secondary {
    background-color: #e0e0e0;
    color: #202124;
}

/* Multi-event modal styles */
.events-list {
    max-height: 400px;
    overflow-y: auto;
}

.no-events-message {
    padding: 24px 16px;
    text-align: center;
    color: #5f6368;
    font-size: 14px;
}

.event-card {
    margin: 12px 0;
    padding: 15px;
    background-color: #f8f9fa;
    border-radius: 8px;
    border-left: 4px solid #4285f4;
}

.event-card:hover {
    background-color: #e8f0fe;
}

.event-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
}

.event-info {
    flex: 1;
    min-width: 0;
}

.event-title {
    font-weight: 600;
    color: #202124;
    font-size: 15px;
    margin: 0 0 8px 0;
}

.event-time {
    color: #5f6368;
    font-size: 13px;
    margin: 4px 0;
}

.event-location {
    color: #5f6368;
    font-size: 13px;
    margin: 4px 0;
    word-break: break-word;
}

.event-description {
    color: #5f6368;
    font-size: 13px;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid #e0e0e0;
}

.event-add-button {
    padding: 8px 14px;
    background-color: #4285f4;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    white-space: nowrap;
    flex-shrink: 0;
}

.event-add-button:hover {
    background-color: #3367d6;
}

.event-add-button.added {
    background-color: #0f9d58;
    cursor: default;
}

.event-add-button:disabled {
    opacity: 0.7;
    cursor: default;
}

.events-header {
    display: flex;
    align-items: center;
    margin-bottom: 15px;
    padding-bottom: 10px;
    border-bottom: 1px solid #e0e0e0;
    cursor: move;
    user-select: none;
    border-radius: 8px 8px 0 0;
    margin: -20px -20px 15px -20px;
    padding: 12px 20px;
    background: linear-gradient(to bottom, #f8f9fa, #fff);
    transition: background 0.2s ease;
}

.events-header:hover {
    background: linear-gradient(to bottom, #e8f0fe, #f8f9fa);
}

.events-header:active {
    background: #e8f0fe;
}

.drag-handle {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-right: 10px;
    opacity: 0.4;
    transition: opacity 0.2s ease;
}

.events-header:hover .drag-handle {
    opacity: 0.7;
}

.drag-handle span {
    display: block;
    width: 16px;
    height: 2px;
    background-color: #5f6368;
    border-radius: 1px;
}

.header-title {
    flex: 1;
}

.events-header h2 {
    margin: 0;
    cursor: move;
}

.events-count {
    color: #5f6368;
    font-size: 14px;
    background-color: #e8f0fe;
    padding: 4px 10px;
    border-radius: 12px;
    margin-left: auto;
}

/* Draggable modal styles */
.calendar-modal.draggable {
    position: fixed;
    cursor: default;
}

.calendar-modal.dragging {
    opacity: 0.9;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}
`;
document.head.appendChild(style);

// Get browser timezone (silent auto-detection)
function getBrowserTimezone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (e) {
        console.warn('Could not detect timezone:', e);
        return null;
    }
}

// Browser timezone - detected once on load
const browserTimezone = getBrowserTimezone();

// Create Google Calendar URL with timezone support
function createGoogleCalendarUrlForContent(eventDetails) {
    const baseUrl = 'https://calendar.google.com/calendar/render';
    const formatDateTime = (isoString) => isoString.replace(/[-:]/g, '');

    const params = new URLSearchParams();
    params.append('action', 'TEMPLATE');

    if (eventDetails.title) {
        params.append('text', eventDetails.title);
    }

    if (eventDetails.description) {
        params.append('details', eventDetails.description.substring(0, 1000));
    }

    if (eventDetails.location) {
        params.append('location', eventDetails.location);
    }

    const startTime = formatDateTime(eventDetails.startTime);
    const endTime = formatDateTime(eventDetails.endTime);
    params.append('dates', `${startTime}/${endTime}`);

    // Add timezone parameter (silent auto-detection)
    if (browserTimezone) {
        params.append('ctz', browserTimezone);
    }

    return `${baseUrl}?${params.toString()}`;
}

// Track processed requests to prevent duplicates
const processedRequests = new Set();

// Event listener for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('📨 Content script received message:', message.type);
    
    // Immediately send response to prevent multiple message handling
    sendResponse({ received: true });

    if (message.type === "SHOW_CONFIRMATION") {
        // Check if we've already processed this request
        if (processedRequests.has(message.requestId)) {
            console.log('Request already processed:', message.requestId);
            return;
        }

        // Mark this request as processed
        processedRequests.add(message.requestId);

        // Clean up old request IDs after 5 seconds
        setTimeout(() => {
            processedRequests.delete(message.requestId);
        }, 5000);

        // Handle both old format (eventDetails) and new format (events array)
        let events;
        if (message.events && Array.isArray(message.events)) {
            events = message.events;
        } else if (message.eventDetails?.events) {
            events = message.eventDetails.events;
        } else if (message.eventDetails) {
            // Backward compatibility: single event object
            events = [message.eventDetails];
        } else {
            console.error('No events found in message');
            return;
        }

        showConfirmationModal(events, message.calendarUrl);
    } else if (message.type === "ERROR") {
        showError(message.message);
    } else if (message.type === "SHOW_STATUS") {
        showStatusModal(message.message, message.detail);
    } else if (message.type === "UPDATE_STATUS") {
        updateStatusModal(message.message, message.detail);
    } else if (message.type === "HIDE_STATUS") {
        hideStatusModal();
    } else if (message.type === "SHOW_AUTH_ERROR") {
        showAuthErrorModal(message.message);
    } else if (message.type === "SHOW_SETUP_REQUIRED") {
        showSetupRequiredModal();
    }
});

// Display a status/loading modal
function showStatusModal(message, detail = '') {
    // Remove any existing modals first
    hideStatusModal();
    
    const modal = document.createElement('div');
    modal.className = 'calendar-modal-overlay status-overlay';
    modal.id = 'calendar-status-modal';
    
    modal.innerHTML = `
        <div class="status-modal">
            <div class="spinner"></div>
            <div class="status-message">${message}</div>
            ${detail ? `<div class="status-detail">${detail}</div>` : ''}
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Update existing status modal
function updateStatusModal(message, detail = '') {
    const modal = document.getElementById('calendar-status-modal');
    if (modal) {
        const statusMessage = modal.querySelector('.status-message');
        const statusDetail = modal.querySelector('.status-detail');
        
        if (statusMessage) {
            statusMessage.textContent = message;
        }
        
        if (detail) {
            if (statusDetail) {
                statusDetail.textContent = detail;
            } else {
                const detailDiv = document.createElement('div');
                detailDiv.className = 'status-detail';
                detailDiv.textContent = detail;
                modal.querySelector('.status-modal').appendChild(detailDiv);
            }
        }
    }
}

// Hide status modal
function hideStatusModal() {
    const existingModal = document.getElementById('calendar-status-modal');
    if (existingModal) {
        existingModal.remove();
    }
}

// Show auth error modal with relogin guidance
function showAuthErrorModal(errorMessage = 'Authentication failed') {
    // Remove any existing modals
    hideStatusModal();
    const existingModal = document.querySelector('.calendar-modal-overlay');
    if (existingModal) {
        existingModal.remove();
    }
    
    const modal = document.createElement('div');
    modal.className = 'calendar-modal-overlay';
    
    modal.innerHTML = `
        <div class="status-modal error">
            <h3>⚠️ Authentication Failed</h3>
            <div class="error-message">${errorMessage}</div>
            <div class="relogin-instructions">
                <strong>To fix this issue:</strong>
                <ol>
                    <li>Click the "Sign in with Google" button below</li>
                    <li>Complete the sign-in process in the popup window</li>
                    <li>Try adding the event again</li>
                </ol>
            </div>
            <div style="margin-top: 15px;">
                <button class="signin-button" style="background-color: #4285f4; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; margin-right: 10px;">
                    Sign in with Google
                </button>
                <button class="secondary">Close</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add event listeners
    const signInButton = modal.querySelector('.signin-button');
    const closeButton = modal.querySelector('.secondary');
    
    signInButton.addEventListener('click', async () => {
        console.log('🔵 User clicked Sign in with Google from auth error modal');
        signInButton.disabled = true;
        signInButton.textContent = 'Signing in...';
        
        try {
            const response = await chrome.runtime.sendMessage({ action: 'signInWithGoogle' });
            console.log('Sign-in response:', response);
            
            if (response.success) {
                console.log('✅ Sign-in successful!');
                signInButton.textContent = '✓ Signed in!';
                signInButton.style.backgroundColor = '#0f9d58';
                
                // Close modal after short delay
                setTimeout(() => {
                    modal.remove();
                }, 1500);
            } else {
                console.error('❌ Sign-in failed:', response.error);
                signInButton.textContent = 'Sign-in failed';
                signInButton.style.backgroundColor = '#d93025';
                
                // Show error message
                const errorDiv = document.createElement('div');
                errorDiv.style.cssText = 'color: #d93025; margin-top: 10px; font-size: 13px;';
                errorDiv.textContent = response.error || 'Sign-in failed. Please try again.';
                signInButton.parentElement.appendChild(errorDiv);
                
                // Re-enable after 2 seconds
                setTimeout(() => {
                    signInButton.disabled = false;
                    signInButton.textContent = 'Try Again';
                    signInButton.style.backgroundColor = '#4285f4';
                }, 2000);
            }
        } catch (error) {
            console.error('❌ Error during sign-in:', error);
            signInButton.disabled = false;
            signInButton.textContent = 'Error - Try Again';
            signInButton.style.backgroundColor = '#d93025';
        }
    });
    
    closeButton.addEventListener('click', () => {
        modal.remove();
    });
    
    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
    
    // Auto-remove after 20 seconds
    setTimeout(() => {
        if (modal.parentElement) {
            modal.remove();
        }
    }, 20000);
}

// Show setup required modal when user has neither auth nor API key
function showSetupRequiredModal() {
    console.log('🔧 Showing setup required modal');
    
    // Remove any existing modals
    hideStatusModal();
    const existingModal = document.querySelector('.calendar-modal-overlay');
    if (existingModal) {
        existingModal.remove();
    }
    
    const modal = document.createElement('div');
    modal.className = 'calendar-modal-overlay';
    
    modal.innerHTML = `
        <div class="status-modal error">
            <h3>🔧 Setup Required</h3>
            <div class="error-message">To use this extension, you need to either sign in with Google or provide your OpenAI API key.</div>
            <div class="relogin-instructions">
                <strong>Option 1: Sign in with Google (Recommended)</strong>
                <ol>
                    <li>Click the "Sign in with Google" button below</li>
                    <li>Complete the sign-in process in the popup window</li>
                    <li>Try adding the event again</li>
                </ol>
                <br>
                <strong>Option 2: Use your own OpenAI API key</strong>
                <ol>
                    <li>Click the extension icon in your browser toolbar</li>
                    <li>Paste your OpenAI API key in the settings</li>
                    <li>Click "Save API Key"</li>
                </ol>
            </div>
            <div style="margin-top: 15px;">
                <button class="signin-button" style="background-color: #4285f4; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; margin-right: 10px;">
                    Sign in with Google
                </button>
                <button class="secondary">Close</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    console.log('✅ Setup required modal added to page');
    
    // Add event listeners
    const signInButton = modal.querySelector('.signin-button');
    const closeButton = modal.querySelector('.secondary');
    
    signInButton.addEventListener('click', async () => {
        console.log('🔵 User clicked Sign in with Google from modal');
        signInButton.disabled = true;
        signInButton.textContent = 'Signing in...';
        
        try {
            const response = await chrome.runtime.sendMessage({ action: 'signInWithGoogle' });
            console.log('Sign-in response:', response);
            
            if (response.success) {
                console.log('✅ Sign-in successful!');
                signInButton.textContent = '✓ Signed in!';
                signInButton.style.backgroundColor = '#0f9d58';
                
                // Close modal after short delay
                setTimeout(() => {
                    modal.remove();
                }, 1500);
            } else {
                console.error('❌ Sign-in failed:', response.error);
                signInButton.textContent = 'Sign-in failed';
                signInButton.style.backgroundColor = '#d93025';
                
                // Show error message
                const errorDiv = document.createElement('div');
                errorDiv.style.cssText = 'color: #d93025; margin-top: 10px; font-size: 13px;';
                errorDiv.textContent = response.error || 'Sign-in failed. Please try again.';
                signInButton.parentElement.appendChild(errorDiv);
                
                // Re-enable after 2 seconds
                setTimeout(() => {
                    signInButton.disabled = false;
                    signInButton.textContent = 'Try Again';
                    signInButton.style.backgroundColor = '#4285f4';
                }, 2000);
            }
        } catch (error) {
            console.error('❌ Error during sign-in:', error);
            signInButton.disabled = false;
            signInButton.textContent = 'Error - Try Again';
            signInButton.style.backgroundColor = '#d93025';
        }
    });
    
    closeButton.addEventListener('click', () => {
        modal.remove();
    });
    
    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
    
    // Auto-remove after 30 seconds (longer to allow sign-in)
    setTimeout(() => {
        if (modal.parentElement) {
            modal.remove();
            console.log('🗑️ Setup modal auto-removed');
        }
    }, 30000);
}

// Display the confirmation modal for event creation (supports multiple events)
function showConfirmationModal(events, fallbackCalendarUrl) {
    // Remove any existing modals first
    const existingModal = document.querySelector('.calendar-modal-overlay');
    if (existingModal) {
        existingModal.remove();
    }

    // Ensure events is an array
    if (!Array.isArray(events)) {
        events = [events];
    }

    const modal = document.createElement('div');
    modal.className = 'calendar-modal-overlay';

    // Format date for display
    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleString();
    };

    // Generate event cards HTML (empty state when no events were found)
    const eventsHtml = events.length === 0
        ? '<div class="no-events-message">No events were found in the selected text.</div>'
        : events.map((event, index) => {
        const calendarUrl = createGoogleCalendarUrlForContent(event);
        return `
            <div class="event-card" data-index="${index}">
                <div class="event-header">
                    <div class="event-info">
                        <h4 class="event-title">${event.title}</h4>
                        <div class="event-time">
                            📅 ${formatDate(event.startTime)} - ${formatDate(event.endTime)}
                        </div>
                        ${event.location ? `<div class="event-location">📍 ${event.location}</div>` : ''}
                    </div>
                    <button class="event-add-button" data-url="${calendarUrl}">
                        Add to Calendar
                    </button>
                </div>
                ${event.description ? `<div class="event-description">${event.description}</div>` : ''}
            </div>
        `;
    }).join('');

    modal.innerHTML = `
        <div class="calendar-modal draggable" style="width: 500px;">
            <div class="events-header">
                <div class="drag-handle" title="Drag to move">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
                <div class="header-title">
                    <h2>Add to Google Calendar</h2>
                </div>
                <span class="events-count">${events.length} event${events.length !== 1 ? 's' : ''}</span>
            </div>
            <div class="events-list">
                ${eventsHtml}
            </div>
            <a class="gc-ios-promo" href="https://apps.apple.com/app/id6772644308" target="_blank" rel="noopener" aria-label="Get Add to Calendar: AI Events on the App Store">
                <span class="gc-ios-promo__icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
                        <rect x="3.2" y="4.6" width="17.6" height="16" rx="4.4" fill="#fff" fill-opacity=".18"/>
                        <path d="M3.2 9.2h17.6" stroke="#fff" stroke-opacity=".5" stroke-width="1.3"/>
                        <path d="M8 3.2v3M16 3.2v3" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/>
                        <path d="M15.7 12.6l.74 1.62 1.62.74-1.62.74-.74 1.62-.74-1.62-1.62-.74 1.62-.74.74-1.62Z" fill="#fff"/>
                    </svg>
                </span>
                <span class="gc-ios-promo__copy">
                    <span class="gc-ios-promo__eyebrow">Now on iPhone</span>
                    <span class="gc-ios-promo__title">Snap a screenshot → calendar event</span>
                </span>
                <span class="gc-ios-promo__badge">
                    <svg viewBox="0 0 14 17" width="11" height="13" aria-hidden="true"><path fill="currentColor" d="M11.57 9.02c-.02-1.9 1.55-2.81 1.62-2.86-.88-1.3-2.26-1.48-2.75-1.5-1.17-.12-2.28.69-2.87.69-.59 0-1.5-.67-2.47-.66-1.27.02-2.44.74-3.09 1.88-1.32 2.29-.34 5.68.95 7.54.63.91 1.38 1.93 2.36 1.9.95-.04 1.31-.61 2.46-.61 1.14 0 1.47.61 2.47.59 1.02-.02 1.67-.93 2.29-1.84.72-1.05 1.02-2.07 1.04-2.12-.02-.01-2-.77-2.02-3.04zM9.67 3.5c.52-.63.87-1.51.78-2.39-.75.03-1.66.5-2.2 1.13-.48.55-.9 1.44-.79 2.3.84.06 1.69-.42 2.21-1.04z"/></svg>
                    App Store
                </span>
                <span class="gc-ios-promo__chev" aria-hidden="true">›</span>
            </a>
            <div class="calendar-modal-buttons">
                <button class="cancel">Close</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Make modal draggable
    const modalContent = modal.querySelector('.calendar-modal');
    const dragHandle = modal.querySelector('.events-header');
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    dragHandle.addEventListener('mousedown', (e) => {
        // Don't drag if clicking on buttons or interactive elements
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;

        isDragging = true;
        modalContent.classList.add('dragging');

        const rect = modalContent.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;

        // Prevent text selection while dragging
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        const x = e.clientX - offsetX;
        const y = e.clientY - offsetY;

        // Keep modal within viewport bounds
        const maxX = window.innerWidth - modalContent.offsetWidth;
        const maxY = window.innerHeight - modalContent.offsetHeight;

        modalContent.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
        modalContent.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
        modalContent.style.transform = 'none'; // Remove centering transform
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            modalContent.classList.remove('dragging');
        }
    });

    // Add event listeners for individual add buttons
    modal.querySelectorAll('.event-add-button').forEach(button => {
        button.addEventListener('click', (e) => {
            const url = e.target.dataset.url;
            window.open(url, '_blank');
            e.target.textContent = '✓ Added';
            e.target.classList.add('added');
            e.target.disabled = true;
        });
    });

    // Close button
    modal.querySelector('button.cancel').addEventListener('click', () => {
        modal.remove();
    });

    // Close on overlay click (but not when dragging)
    modal.addEventListener('click', (e) => {
        if (e.target === modal && !isDragging) {
            modal.remove();
        }
    });
}

// Display error message overlay
function showError(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #f8d7da;
        color: #721c24;
        padding: 12px 20px;
        border-radius: 4px;
        z-index: 999999;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    notification.textContent = message;
    document.body.appendChild(notification);

    // Auto-remove notification after 5 seconds
    setTimeout(() => {
        notification.remove();
    }, 5000);
}