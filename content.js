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
`;
document.head.appendChild(style);

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

        showConfirmationModal(message.eventDetails, message.calendarUrl);
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

// Display the confirmation modal for event creation
function showConfirmationModal(eventDetails, calendarUrl) {
    // Remove any existing modals first
    const existingModal = document.querySelector('.calendar-modal-overlay');
    if (existingModal) {
        existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.className = 'calendar-modal-overlay';

    // Format date for display
    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleString();
    };

    modal.innerHTML = `
        <div class="calendar-modal">
            <h2>Add to Google Calendar?</h2>
            <div class="event-details">
                <p><strong>Title:</strong> ${eventDetails.title}</p>
                <p><strong>Start:</strong> ${formatDate(eventDetails.startTime)}</p>
                <p><strong>End:</strong> ${formatDate(eventDetails.endTime)}</p>
                ${eventDetails.location ? `<p><strong>Location:</strong> ${eventDetails.location}</p>` : ''}
                ${eventDetails.description ? `<p><strong>Description:</strong> ${eventDetails.description}</p>` : ''}
            </div>
            <div class="calendar-modal-buttons">
                <button class="cancel">Cancel</button>
                <button class="confirm">Add to Calendar</button>
            </div>
        </div>
    `;

    // Function to remove modal and clean up
    const cleanup = () => {
        modal.remove();
    };

    // Single instance of calendar opening
    let calendarOpened = false;
    const openCalendar = () => {
        if (!calendarOpened) {
            calendarOpened = true;
            window.open(calendarUrl, '_blank');
        }
        cleanup();
    };

    document.body.appendChild(modal);

    // Add event listeners
    modal.querySelector('button.cancel').addEventListener('click', cleanup);
    modal.querySelector('button.confirm').addEventListener('click', openCalendar);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            cleanup();
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