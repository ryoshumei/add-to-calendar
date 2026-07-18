// LLM prompt configuration for calendar event extraction
// This is the single source of truth for the client-side prompt.
// The backend prompt is in supabase/functions/_shared/llm-prompt.ts
// and should be kept in sync with this file.

const LLM_CONFIG = {
    model: 'gpt-4.1-mini',
    temperature: 0.3,
    top_p: 1,

    /**
     * Build the system prompt with the current date/time injected.
     * @param {string} currentDateTime - Locale-formatted date/time string
     * @returns {string}
     */
    buildSystemPrompt(currentDateTime) {
        return `You are a JSON API that extracts calendar events from text. Return ONLY a raw JSON object with an "events" array containing zero or more event objects:
    {
        "events": [
            {
                "title": "event title",
                "description": "brief description",
                "startTime": "YYYY-MM-DDTHH:mm:ss",
                "endTime": "YYYY-MM-DDTHH:mm:ss",
                "location": "location if mentioned, include online link if available",
                "recurrence": { "frequency": "daily|weekly|monthly|yearly", "interval": 1, "until": "YYYY-MM-DD", "daysOfWeek": ["MO"] }
            }
        ]
    }
    Current time is: ${currentDateTime}
    For relative dates, use the current time as reference.
    Include "recurrence" ONLY when the text clearly describes a repeating event ("every Tuesday", "weekly standup", "monthly meetup", "daily at 9"). Omit it entirely for one-off events. In "recurrence": "interval" defaults to 1 (use 2 for "every other week" etc.); include "until" only when an end date is stated; include "daysOfWeek" (two-letter codes MO TU WE TH FR SA SU) only for weekly recurrence. startTime/endTime must be the FIRST occurrence.
    ANY text containing a date or time has an event to extract. Besides appointments and meetings, this includes dated records such as purchase receipts, card transactions, reservations, deliveries, and deadlines: create an event at the recorded date/time and summarize the record in the title and description (e.g. store name and amount for a receipt).
    Keep the title short and human-readable, in the same language as the text.
    If no specific time is mentioned, assume 10:00 AM. If no duration is implied, use 1 hour.
    If the text contains multiple events or dated records, extract ALL of them as separate objects in the array.
    If only one event is found, still return it inside the events array.
    Return {"events": []} ONLY when the text contains no date or time information at all.
    DO NOT include any markdown formatting, code blocks, or extra text.
    ONLY return the JSON object itself.`;
    },

    /**
     * Build the messages array for the OpenAI chat completions API.
     * @param {string} text - The user-selected text to extract events from
     * @param {string} currentDateTime - Locale-formatted date/time string
     * @returns {Array<{role: string, content: string}>}
     */
    buildMessages(text, currentDateTime) {
        return [
            {
                role: 'system',
                content: this.buildSystemPrompt(currentDateTime)
            },
            {
                role: 'user',
                content: `Time: ${currentDateTime}\nText: ${text}`
            }
        ];
    },

    /**
     * Build the full request body for the OpenAI chat completions API.
     * @param {string} text - The user-selected text to extract events from
     * @param {string} currentDateTime - Locale-formatted date/time string
     * @returns {object}
     */
    buildRequestBody(text, currentDateTime) {
        return {
            model: this.model,
            messages: this.buildMessages(text, currentDateTime),
            temperature: this.temperature,
            top_p: this.top_p,
            response_format: { type: 'json_object' }
        };
    }
};
