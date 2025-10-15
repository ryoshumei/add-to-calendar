// scripts/calendar-service.js
// Calendar service for URL-based Google Calendar integration

class CalendarService {
    constructor(supabaseAuth) {
        this.supabaseAuth = supabaseAuth;
        // No Edge Function URL needed for URL-based approach
    }

    // Fallback: Create Google Calendar URL (existing functionality)
    createGoogleCalendarUrl(eventDetails) {
        const baseUrl = 'https://calendar.google.com/calendar/render';

        const params = new URLSearchParams({
            action: 'TEMPLATE',
            text: eventDetails.title,
            dates: this.formatDateForUrl(eventDetails.startTime, eventDetails.endTime),
            details: eventDetails.description || '',
            location: eventDetails.location || ''
        });

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

    // URL-based event processing (simplified)
    async processEventCreation(eventDetails, selectedText) {
        // Always use URL-based creation regardless of authentication status
        console.log('Creating calendar URL...');

        const calendarUrl = this.createGoogleCalendarUrl(eventDetails);

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