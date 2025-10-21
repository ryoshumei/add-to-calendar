-- Create usage_tracking table for monthly usage limits
CREATE TABLE IF NOT EXISTS public.usage_tracking (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    year_month TEXT NOT NULL, -- Format: 'YYYY-MM' e.g., '2025-10'
    usage_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, year_month)
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_usage_tracking_user_month
ON public.usage_tracking(user_id, year_month);

-- Enable Row Level Security
ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own usage
CREATE POLICY "Users can view their own usage"
ON public.usage_tracking
FOR SELECT
USING (auth.uid() = user_id);

-- RLS Policy: Service role can insert/update usage (for Edge Functions)
CREATE POLICY "Service role can manage usage"
ON public.usage_tracking
FOR ALL
USING (auth.role() = 'service_role');

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_usage_tracking_updated_at
BEFORE UPDATE ON public.usage_tracking
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();