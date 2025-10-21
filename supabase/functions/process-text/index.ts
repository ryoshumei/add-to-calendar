// Supabase Edge Function: process-text
// Processes selected text with OpenAI to extract calendar event details

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EventDetails {
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  location?: string;
}

interface UsageInfo {
  usageCount: number;
  limit: number;
  yearMonth: string;
}

const MONTHLY_LIMIT = 50;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get user from auth header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing authorization header')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw new Error('Unauthorized')
    }

    console.log(`Processing text for user: ${user.email}`)

    // Check and increment usage - must be done before processing
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!serviceRoleKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
    }

    const usageInfo = await checkAndIncrementUsage(user.id, serviceRoleKey)

    // Get request body
    const { selectedText } = await req.json()
    if (!selectedText) {
      throw new Error('selectedText is required')
    }

    // Get OpenAI API key from environment
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY not configured')
    }

    // Process with OpenAI
    const eventDetails = await processWithOpenAI(selectedText, openaiApiKey)

    return new Response(
      JSON.stringify({
        eventDetails,
        usage: usageInfo
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('Error processing text:', error)

    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
        details: error.toString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: error.message === 'Unauthorized' ? 401 : 400
      }
    )
  }
})

/**
 * Process text with OpenAI API to extract event details
 * Logic matches the client-side implementation in background.js
 */
async function processWithOpenAI(text: string, apiKey: string): Promise<EventDetails> {
  const now = new Date()
  const currentDateTime = now.toLocaleString()

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
    ONLY return the JSON object itself.`

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
        temperature: 0.3 // Lower temperature for consistent JSON output
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error?.message || 'OpenAI API request failed')
    }

    const data = await response.json()
    console.log('Raw GPT response:', data.choices[0].message.content)

    try {
      const eventDetails = JSON.parse(data.choices[0].message.content.trim())
      validateEventDetails(eventDetails)
      return eventDetails
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError)
      console.error('Raw content:', data.choices[0].message.content)
      throw new Error('Failed to parse GPT response as JSON')
    }
  } catch (error) {
    console.error('Error calling OpenAI API:', error)
    throw new Error('Failed to process text: ' + error.message)
  }
}

/**
 * Validate event details structure and content
 * Matches validation logic in background.js
 */
function validateEventDetails(details: EventDetails) {
  const required = ['title', 'startTime', 'endTime']
  const missing = required.filter(field => !details[field as keyof EventDetails])

  if (missing.length > 0) {
    throw new Error(`Invalid response: Missing required fields: ${missing.join(', ')}`)
  }

  // Validate datetime format
  const dateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/
  if (!dateTimeRegex.test(details.startTime) || !dateTimeRegex.test(details.endTime)) {
    throw new Error('Invalid datetime format in response')
  }

  // Ensure start time is before end time
  if (new Date(details.startTime) >= new Date(details.endTime)) {
    throw new Error('Start time must be before end time')
  }
}

/**
 * Check and increment usage for a user
 * Returns current usage info and throws if limit exceeded
 */
async function checkAndIncrementUsage(userId: string, serviceRoleKey: string): Promise<UsageInfo> {
  // Create service role client to bypass RLS
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )

  // Get current year-month (e.g., "2025-10")
  const now = new Date()
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // Get current usage for this user and month
  const { data: existingUsage, error: fetchError } = await supabaseAdmin
    .from('usage_tracking')
    .select('usage_count')
    .eq('user_id', userId)
    .eq('year_month', yearMonth)
    .single()

  if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = not found
    console.error('Error fetching usage:', fetchError)
    throw new Error('Failed to check usage limit')
  }

  const currentUsage = existingUsage?.usage_count || 0

  // Check if limit exceeded
  if (currentUsage >= MONTHLY_LIMIT) {
    const usageInfo: UsageInfo = {
      usageCount: currentUsage,
      limit: MONTHLY_LIMIT,
      yearMonth
    }
    throw new Error(`Monthly limit exceeded. You have used ${currentUsage}/${MONTHLY_LIMIT} requests this month.`)
  }

  // Increment usage (upsert: insert if not exists, update if exists)
  const newCount = currentUsage + 1

  console.log(`Attempting to upsert usage for user ${userId}: ${currentUsage} -> ${newCount}`)

  const { data: upsertedData, error: upsertError } = await supabaseAdmin
    .from('usage_tracking')
    .upsert({
      user_id: userId,
      year_month: yearMonth,
      usage_count: newCount,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,year_month'
    })
    .select()
    .single()

  if (upsertError) {
    console.error('Error updating usage:', upsertError)
    throw new Error('Failed to update usage tracking: ' + upsertError.message)
  }

  console.log(`✅ Usage updated successfully for user ${userId}:`, {
    oldCount: currentUsage,
    newCount: newCount,
    dbRecord: upsertedData
  })

  return {
    usageCount: newCount,
    limit: MONTHLY_LIMIT,
    yearMonth
  }
}
