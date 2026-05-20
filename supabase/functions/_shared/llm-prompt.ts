// LLM prompt configuration for calendar event extraction
// This is the single source of truth for the backend prompt.
// The client-side prompt is in scripts/llm-prompt.js
// and should be kept in sync with this file.

export const LLM_CONFIG = {
  model: 'gpt-4.1-mini',
  temperature: 0.3,
  top_p: 1,

  /**
   * Build the system prompt with the current date/time injected.
   */
  buildSystemPrompt(currentDateTime: string): string {
    return `You are a JSON API that extracts event details from text. Return ONLY a raw JSON object with an "events" array containing one or more event objects:
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
  },

  /**
   * Build the messages array for the OpenAI chat completions API.
   */
  buildMessages(text: string, currentDateTime: string): Array<{ role: string; content: string }> {
    return [
      {
        role: 'system',
        content: this.buildSystemPrompt(currentDateTime),
      },
      {
        role: 'user',
        content: `Time: ${currentDateTime}\nText: ${text}`,
      },
    ];
  },

  /**
   * Build the full request body for the OpenAI chat completions API.
   */
  buildRequestBody(text: string, currentDateTime: string): object {
    return {
      model: this.model,
      messages: this.buildMessages(text, currentDateTime),
      temperature: this.temperature,
      top_p: this.top_p,
      response_format: { type: 'json_object' },
    };
  },
};
