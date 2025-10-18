# Backend Implementation Guide

## Current Architecture

✅ **Completed:**
- Google OAuth authentication via Supabase
- User management and session handling
- URL-based Google Calendar event creation
- Extension works for authenticated users (even without OpenAI API key)

## Next Steps: Backend Text Processing Service

### Current Flow for Authenticated Users

**Priority Logic:**
1. **User's OpenAI API Key** (if set) → Use user's key directly
2. **Backend Service** (if no user key) → Use your backend API key
3. **Basic Event** (if backend fails) → Simple fallback

```javascript
// In background.js lines 94-108
if (currentUser && supabaseAuth?.isAuthenticated()) {
    // Priority 1: Check if user has their own OpenAI API key
    const {apiKey} = await chrome.storage.sync.get("apiKey");
    if (apiKey) {
        // Use user's API key (they prefer their own key)
        eventDetails = await processWithOpenAI(selectedText, apiKey);
    } else {
        // Priority 2: Use backend service with your API key
        // ✨ TODO: Replace with backend service
        eventDetails = createBasicEventFromText(selectedText);
    }
}
```

**Important:**
- If user sets their OpenAI key → **Don't use backend** (respect user preference)
- If user has no API key → **Use backend service** (seamless experience)
- This gives users control while providing a great default experience
```

### 1. Backend Service Implementation

Create a Supabase Edge Function to process text with your API key:

**File: `supabase/functions/process-text/index.ts`**

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get user from auth header
    const authHeader = req.headers.get('Authorization')!
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    // Get request body
    const { selectedText } = await req.json()

    // Process with OpenAI using your backend API key
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    const eventDetails = await processWithOpenAI(selectedText, openaiApiKey)

    return new Response(
      JSON.stringify({ eventDetails }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})

async function processWithOpenAI(text: string, apiKey: string) {
  const now = new Date()
  const currentDateTime = now.toLocaleString()

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
          content: `You are a JSON API that extracts event details from text. Return ONLY a raw JSON object with these properties:
          {
            "title": "event title",
            "description": "brief description",
            "startTime": "YYYY-MM-DDTHH:mm:ss",
            "endTime": "YYYY-MM-DDTHH:mm:ss",
            "location": "location if mentioned"
          }
          Current time is: ${currentDateTime}
          For relative dates, use current time as reference.
          If no specific time mentioned, assume 10:00 AM for 1 hour.`
        },
        {
          role: 'user',
          content: `Time: ${currentDateTime}\nText: ${text}`
        }
      ],
      temperature: 0.3
    })
  })

  const data = await response.json()
  return JSON.parse(data.choices[0].message.content.trim())
}
```

### 2. Update Extension Configuration

Add the Edge Function URL to `config.js`:

```javascript
const CONFIG = {
    // ... existing config
    EDGE_FUNCTIONS: {
        PROCESS_TEXT: 'https://pahcnlwgtghsctbnedhx.supabase.co/functions/v1/process-text'
    }
};
```

### 3. Update Background Script

Replace the TODO section in `background.js`:

```javascript
// Replace lines 103-107 in background.js
} else {
    // Use backend service for text processing
    eventDetails = await processWithBackend(selectedText, supabaseAuth.getAccessToken());
}

// Add this function to background.js
async function processWithBackend(text, accessToken) {
    try {
        const response = await fetch(CONFIG.EDGE_FUNCTIONS.PROCESS_TEXT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ selectedText: text })
        });

        if (!response.ok) {
            throw new Error(`Backend processing failed: ${response.status}`);
        }

        const data = await response.json();
        return data.eventDetails;
    } catch (error) {
        console.error('Backend processing error:', error);
        // Fallback to basic event creation
        return createBasicEventFromText(text);
    }
}
```

### 4. Deploy Edge Function

```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref pahcnlwgtghsctbnedhx

# Deploy the function
supabase functions deploy process-text

# Set environment variables
supabase secrets set OPENAI_API_KEY=your_openai_api_key_here
```

### 5. Benefits of This Approach

✅ **No API Key Required**: Users don't need their own OpenAI keys
✅ **Server-Side Processing**: Your API key is secure on the backend
✅ **Better User Experience**: One-click authentication and processing
✅ **Cost Control**: You control API usage and can implement rate limiting
✅ **Fallback Support**: Still works if backend is down (creates basic events)

### 6. Optional Enhancements

- **Rate Limiting**: Implement user-based rate limits
- **Usage Analytics**: Track API usage per user
- **Premium Features**: Different processing levels for different user tiers
- **Caching**: Cache common event patterns to reduce API calls

### 7. Testing

1. Deploy the Edge Function
2. Update the extension code
3. Test with an authenticated user (no API key needed)
4. Verify it creates smart events using your backend OpenAI processing

## Current Status

🟢 **Extension Working**: Authentication + basic event creation
🟡 **Next Step**: Implement backend text processing service
🔴 **Future**: Advanced features and optimizations