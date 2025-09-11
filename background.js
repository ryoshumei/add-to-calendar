// background.js
// Create context menu when extension is installed
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "addToCalendar",
        title: "Add to Google Calendar",
        contexts: ["selection"]
    });
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

            // Get API key
            const {apiKey} = await chrome.storage.sync.get("apiKey");

            if (!apiKey) {
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icons/icon128.png',
                    title: 'Calendar Event Creator',
                    message: 'Please set your OpenAI API key in the extension settings'
                });
                return;
            }

            // Process the selected text
            const selectedText = info.selectionText;
            const eventDetails = await processWithOpenAI(selectedText, apiKey);
            const calendarUrl = createGoogleCalendarUrl(eventDetails);

            // Try to send message to content script
            try {
                const response = await chrome.tabs.sendMessage(tab.id, {
                    type: "SHOW_CONFIRMATION",
                    requestId,
                    eventDetails,
                    calendarUrl
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
                        eventDetails,
                        calendarUrl
                    });
                } catch (retryError) {
                    // If it still fails, open calendar directly
                    chrome.tabs.create({url: calendarUrl});
                }
            }
        } catch (error) {
            console.error("Error processing text:", error);
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon128.png',
                title: 'Calendar Event Creator',
                message: 'Error: ' + error.message
            });
        } finally {
            // Clean up the active request
            activeRequests.delete(tab.id);
        }
    }
});

// Process text with OpenAI API
async function processWithOpenAI(text, apiKey) {
    const now = new Date();
    const currentDateTime = now.toLocaleString();

    const systemPrompt = `You are a JSON API that extracts event details from text. Return ONLY a raw JSON object with these properties:
    {
        "title": "event title",
        "description": "brief description",
        "startTime": "YYYY-MM-DDTHH:mm:ss",
        "endTime": "YYYY-MM-DDTHH:mm:ss",
        "location": "location if mentioned, include online link if available"
    }
    Current time is: ${currentDateTime}
    For relative dates, use the current time as reference.
    If no specific time mentioned, assume 10:00 AM for 1 hour.
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
                temperature: 0.3 // Lower temperature for more consistent JSON output
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
            const eventDetails = JSON.parse(data.choices[0].message.content.trim());
            validateEventDetails(eventDetails);
            return eventDetails;
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
// Create Google Calendar URL
function createGoogleCalendarUrl(eventDetails) {
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

        return `${baseUrl}?${params.toString()}`;
    } catch (error) {
        console.error('Error creating calendar URL:', error);
        throw new Error('Failed to create calendar URL: ' + error.message);
    }
}

// Validate event details
function validateEventDetails(details) {
    const required = ['title', 'startTime', 'endTime'];
    const missing = required.filter(field => !details[field]);

    if (missing.length > 0) {
        throw new Error(`Invalid response: Missing required fields: ${missing.join(', ')}`);
    }

    // Validate datetime format
    const dateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
    if (!dateTimeRegex.test(details.startTime) || !dateTimeRegex.test(details.endTime)) {
        throw new Error('Invalid datetime format in response');
    }

    // Ensure start time is before end time
    if (new Date(details.startTime) >= new Date(details.endTime)) {
        throw new Error('Start time must be before end time');
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