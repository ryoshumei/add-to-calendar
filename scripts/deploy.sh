#!/bin/bash

# Deploy script for Calendar Event Creator
# Ensures both Supabase function and Chrome extension are in sync

set -e

echo "🚀 Starting deployment..."
echo ""

# Check if SUPABASE_ACCESS_TOKEN is set
if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
    echo "❌ Error: SUPABASE_ACCESS_TOKEN environment variable is not set"
    echo "   Set it with: export SUPABASE_ACCESS_TOKEN=your-token"
    echo "   Or get a token at: https://supabase.com/dashboard/account/tokens"
    exit 1
fi

# Warning about version compatibility
echo "⚠️  VERSION COMPATIBILITY CHECKLIST"
echo "──────────────────────────────────────────────────────────────"
echo "Before deploying, ensure the backend supports BOTH:"
echo "  • Old extension versions (currently in users' browsers)"
echo "  • New extension version (you're about to publish)"
echo ""
echo "Use X-Extension-Version header to handle different versions."
echo ""
read -p "Does this backend support both old AND new extension versions? (y/n): " confirmed
if [[ "$confirmed" != "y" && "$confirmed" != "Y" ]]; then
    echo ""
    echo "❌ Deployment cancelled."
    echo "   Update backend to support both versions first."
    exit 1
fi

# Deploy Supabase function
echo ""
echo "📦 Deploying Supabase Edge Function..."
npx supabase functions deploy process-text

echo ""
echo "✅ Supabase function deployed!"
echo ""
echo "📋 Next steps for Chrome Extension:"
echo "   1. Update version in manifest.json if needed"
echo "   2. Run: npm run package"
echo "   3. Upload to Chrome Web Store Developer Dashboard"
echo ""
echo "🎉 Backend deployment complete!"
