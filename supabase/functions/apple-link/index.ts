// Supabase Edge Function: apple-link
// Exchanges an Apple Sign In authorizationCode for a refresh token and stores
// it (per user) so the account can be revoked at deletion time.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildAppleClientSecret } from "../_shared/apple-client-secret.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-extension-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const { authorizationCode } = await req.json();
    if (!authorizationCode || typeof authorizationCode !== "string") {
      throw new Error("authorizationCode is required");
    }

    // Exchange the code for a refresh token with Apple.
    const clientSecret = await buildAppleClientSecret();
    const tokenRes = await fetch("https://appleid.apple.com/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("APPLE_CLIENT_ID") ?? "",
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code: authorizationCode,
      }),
    });
    if (!tokenRes.ok) {
      throw new Error(
        `Apple token exchange failed: ${tokenRes.status} ${await tokenRes
          .text()}`,
      );
    }
    const { refresh_token } = await tokenRes.json();
    if (!refresh_token) throw new Error("Apple did not return a refresh_token");

    // Store it (service role bypasses RLS).
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { error: upsertError } = await admin
      .from("apple_refresh_tokens")
      .upsert({
        user_id: user.id,
        refresh_token,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    if (upsertError) {
      throw new Error(`Failed to store token: ${upsertError.message}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("apple-link error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: error.message === "Unauthorized" ? 401 : 400,
      },
    );
  }
});
