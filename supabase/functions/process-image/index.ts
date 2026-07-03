// Supabase Edge Function: process-image
// Processes an image with OpenAI vision to extract calendar event details

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { LLM_CONFIG } from '../_shared/llm-prompt.ts'
import { checkAndIncrementUsage, refundUsage } from '../_shared/usage-tracking.ts'
import type { UsageInfo, UsageTrackingClient } from '../_shared/usage-tracking.ts'
import { ApiError, mapOpenAIError } from '../_shared/api-error.ts'
import { parseEventResponse } from '../_shared/parse-event-response.ts'
import type { EventResponse } from '../_shared/parse-event-response.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-extension-version',
}

// Minimum supported client version (update when making breaking changes)
const MIN_SUPPORTED_VERSION = '1.0.0'

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Refund bookkeeping: set once usage has been charged, so a later failure
  // can return the request to the user's monthly allowance.
  let admin: UsageTrackingClient | null = null
  let chargedUsage: UsageInfo | null = null
  let chargedUserId: string | null = null

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

    // Check client version for compatibility
    const extensionVersion = req.headers.get('X-Extension-Version') || 'unknown'
    console.log(`Processing image for user: ${user.email}, client version: ${extensionVersion}`)

    if (extensionVersion !== 'unknown' && !isVersionSupported(extensionVersion)) {
      throw new Error(`Client version ${extensionVersion} is no longer supported. Please update to the latest version.`)
    }

    // Check and increment usage - must be done before processing
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!serviceRoleKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
    }

    // Service role client bypasses RLS; also used for refunds on failure
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    ) as unknown as UsageTrackingClient
    admin = adminClient

    const usageInfo = await checkAndIncrementUsage(adminClient, user.id)
    chargedUsage = usageInfo
    chargedUserId = user.id

    // Get request body
    const { image } = await req.json()
    if (!image || typeof image !== 'string') {
      throw new Error('image is required')
    }

    // Get OpenAI API key from environment
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY not configured')
    }

    // Process with OpenAI vision
    const eventDetails = await processImageWithOpenAI(image, openaiApiKey)

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

  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    console.error('Error processing image:', error)

    // The request was charged but produced no result — give it back.
    if (admin && chargedUsage && chargedUserId) {
      await refundUsage(admin, chargedUserId, chargedUsage.yearMonth)
    }

    const status = error instanceof ApiError
      ? error.status
      : error.message === 'Unauthorized' ? 401 : 400

    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
        details: error.toString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status
      }
    )
  }
})

/**
 * Process an image with the OpenAI vision API to extract event details.
 */
async function processImageWithOpenAI(imageDataUrl: string, apiKey: string): Promise<EventResponse> {
  const now = new Date()
  const currentDateTime = now.toLocaleString()

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(LLM_CONFIG.buildImageRequestBody(imageDataUrl, currentDateTime))
    })

    if (!response.ok) {
      const errorData = await response.json()
      // Keep the raw provider error in server logs for the operator
      console.error('OpenAI API error response:', response.status, JSON.stringify(errorData))
      throw mapOpenAIError(response.status, errorData)
    }

    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content
    console.log('Raw GPT response:', content)

    // Empty/null content and an empty events array are valid no-event results
    return parseEventResponse(content)
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    if (error instanceof ApiError) {
      throw error
    }
    console.error('Error calling OpenAI API:', error)
    throw new Error('Failed to process image: ' + error.message)
  }
}

function parseVersion(v: string): number[] {
  return v.split('.').map(n => parseInt(n, 10) || 0)
}

function compareVersions(a: string, b: string): number {
  const vA = parseVersion(a)
  const vB = parseVersion(b)

  for (let i = 0; i < 3; i++) {
    if ((vA[i] || 0) > (vB[i] || 0)) return 1
    if ((vA[i] || 0) < (vB[i] || 0)) return -1
  }
  return 0
}

function isVersionSupported(version: string): boolean {
  return compareVersions(version, MIN_SUPPORTED_VERSION) >= 0
}
