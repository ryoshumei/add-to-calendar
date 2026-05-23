-- Stores the Apple refresh token per user so account deletion can revoke it
-- via Apple's /auth/revoke. Service-role only (Edge Functions bypass RLS).
create table if not exists public.apple_refresh_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

alter table public.apple_refresh_tokens enable row level security;
-- Intentionally no policies: only the service role (Edge Functions) may access.