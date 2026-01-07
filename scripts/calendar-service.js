// scripts/calendar-service.js
// Calendar service for URL-based Google Calendar integration

class CalendarService {
    constructor(supabaseAuth) {
        this.supabaseAuth = supabaseAuth;
        // No Edge Function URL needed for URL-based approach
    }

    // Create Google Calendar URL with optional timezone support
    createGoogleCalendarUrl(eventDetails, timezone = null) {
        const baseUrl = 'https://calendar.google.com/calendar/render';

        const params = new URLSearchParams({
            action: 'TEMPLATE',
            text: eventDetails.title,
            dates: this.formatDateForUrl(eventDetails.startTime, eventDetails.endTime),
            details: eventDetails.description || '',
            location: eventDetails.location || ''
        });

        // Add timezone parameter if provided
        if (timezone) {
            params.append('ctz', timezone);
        }

        return `${baseUrl}?${params.toString()}`;
    }

    // Format dates for Google Calendar URL
    formatDateForUrl(startTime, endTime) {
        // Convert to Google Calendar format: YYYYMMDDTHHMMSSZ
        const formatDate = (dateStr) => {
            const date = new Date(dateStr);
            return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
        };

        const start = formatDate(startTime);
        const end = formatDate(endTime);

        return `${start}/${end}`;
    }

    // URL-based event processing (supports multiple events)
    async processEventCreation(eventDetails, selectedText) {
        // Always use URL-based creation regardless of authentication status
        console.log('Creating calendar URL...');

        // Handle both single event (backward compat) and events array
        let calendarUrl;
        if (eventDetails.events && eventDetails.events.length > 0) {
            // New format: use first event for calendarUrl (fallback)
            calendarUrl = this.createGoogleCalendarUrl(eventDetails.events[0]);
        } else {
            // Old format: single event object
            calendarUrl = this.createGoogleCalendarUrl(eventDetails);
        }

        return {
            success: true,
            method: 'url',
            calendarUrl: calendarUrl,
            message: this.supabaseAuth?.isAuthenticated() ?
                'Click to add event to your Google Calendar' :
                'Click to add event to your Google Calendar'
        };
    }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CalendarService;
} else if (typeof self !== 'undefined') {
    // Service Worker environment
    self.CalendarService = CalendarService;
} else if (typeof window !== 'undefined') {
    // Browser environment
    window.CalendarService = CalendarService;
} else {
    // Fallback for other environments
    globalThis.CalendarService = CalendarService;
}