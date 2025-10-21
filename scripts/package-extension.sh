#!/bin/bash

# Package Chrome Extension for Chrome Web Store
# This script creates a clean ZIP package excluding development files

# Set script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# Get version from manifest.json
VERSION=$(grep -o '"version": *"[^"]*"' manifest.json | grep -o '"[0-9.]*"' | tr -d '"')
OUTPUT_FILE="calendar-event-creator-v${VERSION}.zip"

echo "📦 Packaging Calendar Event Creator v${VERSION} for Chrome Web Store"
echo "──────────────────────────────────────────────────────────────"

# Remove old package if exists
if [ -f "$OUTPUT_FILE" ]; then
    echo "🗑️  Removing old package: $OUTPUT_FILE"
    rm "$OUTPUT_FILE"
fi

echo "📝 Creating package with required files only..."

# Create ZIP with only necessary extension files
# Include: manifest, scripts, popup, icons, config
# Exclude: development files, tests, backend, docs, git files
zip -r "$OUTPUT_FILE" \
    manifest.json \
    background.js \
    content.js \
    config.js \
    popup/ \
    scripts/supabase-client.js \
    scripts/calendar-service.js \
    scripts/supabase-js.min.js \
    icons/ \
    -x "*.DS_Store" "*.git*" "*/.*" \
    > /dev/null 2>&1

if [ $? -eq 0 ]; then
    FILE_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
    echo "✅ Package created successfully!"
    echo ""
    echo "📄 File: $OUTPUT_FILE"
    echo "💾 Size: $FILE_SIZE"
    echo ""
    echo "📋 Contents:"
    unzip -l "$OUTPUT_FILE" | tail -n +4 | head -n -2
    echo ""
    echo "🚀 Ready to upload to Chrome Web Store!"
    echo "   Dashboard: https://chrome.google.com/webstore/devconsole"
else
    echo "❌ Failed to create package"
    exit 1
fi
