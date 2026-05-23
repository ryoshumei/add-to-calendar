// Supabase Edge Function: delete-account
// Deletes the caller's account: best-effort Apple token revocation, then
// removes their data (usage_tracking, apple_refresh_tokens) and the auth user.

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

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceRoleKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
    }
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Best-effort Apple token revocation (Google users have no row → skipped).
    const { data: tokenRow } = await admin
      .from("apple_refresh_tokens")
      .select("refresh_token")
      .eq("user_id", user.id)
      .maybeSingle();
    if (tokenRow?.refresh_token) {
      try {
        const clientSecret = await buildAppleClientSecret();
        const res = await fetch("https://appleid.apple.com/auth/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: Deno.env.get("APPLE_CLIENT_ID") ?? "",
            client_secret: clientSecret,
            token: tokenRow.refresh_token,
            token_type_hint: "refresh_token",
          }),
        });
        if (!res.ok) {
          console.error("Apple revoke failed:", res.status, await res.text());
        }
      } catch (revokeErr) {
        console.error("Apple revoke error (continuing):", revokeErr);
      }
    }

    // Delete data + auth user. Deletion always proceeds past the best-effort
    // revoke above. Errors here are surfaced (not swallowed) so we never report
    // success while a refresh token or usage row is left orphaned.
    const { error: tokenDelError } = await admin
      .from("apple_refresh_tokens")
      .delete()
      .eq("user_id", user.id);
    if (tokenDelError) {
      throw new Error(`Failed to delete Apple token: ${tokenDelError.message}`);
    }
    const { error: usageDelError } = await admin
      .from("usage_tracking")
      .delete()
      .eq("user_id", user.id);
    if (usageDelError) {
      throw new Error(`Failed to delete usage rows: ${usageDelError.message}`);
    }
    const { error: delError } = await admin.auth.admin.deleteUser(user.id);
    if (delError) throw new Error(`Failed to delete user: ${delError.message}`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("delete-account error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: error.message === "Unauthorized" ? 401 : 400,
      },
    );
  }
});
