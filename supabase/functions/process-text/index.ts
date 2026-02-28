// Supabase Edge Function: process-text
// Processes selected text with OpenAI to extract calendar event details

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { LLM_CONFIG } from '../_shared/llm-prompt.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-extension-version',
}

// Minimum supported extension version (update when making breaking changes)
const MIN_SUPPORTED_VERSION = '1.0.0'

interface EventDetails {
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  location?: string;
}

interface EventResponse {
  events: EventDetails[];
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

    // Check extension version for compatibility
    const extensionVersion = req.headers.get('X-Extension-Version') || 'unknown'
    console.log(`Processing text for user: ${user.email}, extension version: ${extensionVersion}`)

    // Version compatibility check (can reject old versions if needed)
    if (extensionVersion !== 'unknown' && !isVersionSupported(extensionVersion)) {
      throw new Error(`Extension version ${extensionVersion} is no longer supported. Please update to the latest version.`)
    }

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
 * Supports extracting multiple events from a single text selection
 */
async function processWithOpenAI(text: string, apiKey: string): Promise<EventResponse> {
  const now = new Date()
  const currentDateTime = now.toLocaleString()

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(LLM_CONFIG.buildRequestBody(text, currentDateTime))
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error?.message || 'OpenAI API request failed')
    }

    const data = await response.json()
    console.log('Raw GPT response:', data.choices[0].message.content)

    try {
      let response = JSON.parse(data.choices[0].message.content.trim())

      // Backward compatibility: wrap single event in events array
      if (!response.events && response.title) {
        response = { events: [response] }
      }

      validateEventResponse(response)
      return response
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
 * Validate event response structure (wrapper with events array)
 */
function validateEventResponse(response: EventResponse) {
  if (!response || !Array.isArray(response.events) || response.events.length === 0) {
    throw new Error('Invalid response: Expected object with events array containing at least one event')
  }

  // Validate each event in the array
  response.events.forEach((event, index) => {
    validateSingleEventDetails(event, index)
  })
}

/**
 * Validate single event details structure and content
 */
function validateSingleEventDetails(details: EventDetails, index: number = 0) {
  const required = ['title', 'startTime', 'endTime']
  const missing = required.filter(field => !details[field as keyof EventDetails])

  if (missing.length > 0) {
    throw new Error(`Event ${index + 1}: Missing required fields: ${missing.join(', ')}`)
  }

  // Validate datetime format
  const dateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/
  if (!dateTimeRegex.test(details.startTime) || !dateTimeRegex.test(details.endTime)) {
    throw new Error(`Event ${index + 1}: Invalid datetime format`)
  }

  // Ensure start time is before end time
  if (new Date(details.startTime) >= new Date(details.endTime)) {
    throw new Error(`Event ${index + 1}: Start time must be before end time`)
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

/**
 * Parse version string into array of numbers
 */
function parseVersion(v: string): number[] {
  return v.split('.').map(n => parseInt(n, 10) || 0)
}

/**
 * Compare two version strings
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
function compareVersions(a: string, b: string): number {
  const vA = parseVersion(a)
  const vB = parseVersion(b)

  for (let i = 0; i < 3; i++) {
    if ((vA[i] || 0) > (vB[i] || 0)) return 1
    if ((vA[i] || 0) < (vB[i] || 0)) return -1
  }
  return 0
}

/**
 * Check if extension version is supported
 * Returns true if version >= MIN_SUPPORTED_VERSION
 */
function isVersionSupported(version: string): boolean {
  return compareVersions(version, MIN_SUPPORTED_VERSION) >= 0
}
