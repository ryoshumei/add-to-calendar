#!/bin/bash

# Deploy script for Calendar Event Creator
# Ensures both Supabase function and Chrome extension are in sync

set -e

echo "🚀 Starting deployment..."
echo ""

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

# Deploy Supabase function. deploy-function.sh resolves the project ref from
# supabase/config.toml and checks credentials, so this stays one line.
#
# Only process-text: the Screenshot endpoint is `npm run deploy:backend:image`
# and the usage endpoint `npm run deploy:backend:usage`, or all of them with
# `npm run deploy:backend:all`.
echo ""
./scripts/deploy-function.sh process-text

echo ""
echo "✅ Supabase function deployed!"
echo ""
echo "📋 Next steps for Chrome Extension:"
echo "   1. Update version in manifest.json if needed"
echo "   2. Run: npm run package"
echo "   3. Upload to Chrome Web Store Developer Dashboard"
echo ""
echo "🎉 Backend deployment complete!"
