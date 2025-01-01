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
`;
document.head.appendChild(style);

// Track processed requests to prevent duplicates
const processedRequests = new Set();

// Event listener for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
    }
});

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