# Chrome Web Store Update Guide - Version 1.1.0

## Pre-Deployment Checklist

### ✅ Code Quality
- [x] All tests passing (`npm test`)
- [x] No console errors in production build
- [x] Manifest version updated to 1.1.0
- [x] All features tested manually
- [x] OAuth flow tested (sign in/sign out)
- [x] Usage limits tested
- [x] Popup UI tested

### ✅ Documentation
- [x] Release notes prepared (RELEASE_NOTES_1.1.0.md)
- [x] CLAUDE.md updated with latest features
- [x] README.md reflects current functionality

### ✅ Compliance
- [x] Permissions justified and documented
- [x] Privacy policy updated (if needed)
- [x] No unnecessary permissions requested
- [x] All user data handling transparent

---

## Step 1: Create Package

### Option A: Using Package Script (Recommended)
```bash
# Make script executable
chmod +x scripts/package-extension.sh

# Run packaging script
./scripts/package-extension.sh
```

This creates: `calendar-event-creator-v1.1.0.zip`

### Option B: Manual ZIP Creation
```bash
# Create ZIP with only necessary files
zip -r calendar-event-creator-v1.1.0.zip \
    manifest.json \
    background.js \
    content.js \
    config.js \
    popup/ \
    scripts/supabase-client.js \
    scripts/calendar-service.js \
    scripts/supabase-js.min.js \
    icons/ \
    -x "*.DS_Store" "*.git*" "*/.*"
```

---

## Step 2: Prepare Store Listing

### Update Description (if needed)

**Short Description** (132 characters max):
```
Create Google Calendar events from selected text using AI. Sign in with Google for 50 free events/month!
```

**Detailed Description**:
```
Calendar Event Creator helps you quickly add events to Google Calendar from any selected text on the web.

🎯 KEY FEATURES:
• Create calendar events from natural language text
• Sign in with Google for 50 free events per month
• No OpenAI API key required for authenticated users
• Smart AI-powered event parsing
• One-click calendar creation
• Usage tracking with visual progress bar

🔐 TWO USAGE MODES:
1. Sign in with Google - Get 50 free event creations/month
2. Use your own OpenAI API key - Unlimited client-side processing

✨ NEW IN VERSION 1.1.0:
• Google OAuth authentication
• Server-side text processing for signed-in users
• Monthly usage limits with visual tracking
• Improved UI with user profile display
• Better error handling and session management

🚀 HOW TO USE:
1. Select text containing event details (e.g., "Team meeting tomorrow at 2pm")
2. Right-click and choose "Add to Google Calendar"
3. Review the parsed event details in the modal
4. Click confirm to open Google Calendar with pre-filled event

📊 USAGE LIMITS:
Signed-in users get 50 free calendar event creations per month. Usage automatically resets monthly. You can always use your own OpenAI API key for unlimited usage.

🔒 PRIVACY & SECURITY:
• Google OAuth for secure authentication
• Your data is never sold or shared
• OpenAI API keys stored locally (encrypted by Chrome)
• Sessions managed securely via Supabase
• Open source - inspect the code yourself

💡 PERFECT FOR:
• Busy professionals managing multiple calendars
• Students tracking assignments and deadlines
• Event planners coordinating schedules
• Anyone who wants to save time creating calendar events

📝 REQUIREMENTS:
• Chrome browser (Manifest V3)
• Google account (for free tier) or OpenAI API key (for unlimited usage)

🆘 SUPPORT:
Having issues? Contact us via [support email/GitHub issues]

🔐 PERMISSIONS EXPLAINED:
• contextMenus - Add right-click menu option
• storage - Save your API key and session securely
• activeTab - Read selected text from current page
• scripting - Display confirmation modal
• identity - Google OAuth sign-in
• supabase.co - Backend API for authenticated users
```

### Screenshots Needed

Prepare 5 screenshots (1280x800 or 640x400):
1. **Right-click context menu** - Showing "Add to Google Calendar" option
2. **Event confirmation modal** - Showing parsed event details
3. **Extension popup - Signed in** - Showing user profile and usage stats
4. **Extension popup - Sign in screen** - Showing Google sign-in button
5. **Usage tracking** - Showing progress bar at different usage levels

### Promotional Images (Optional)

- **Small tile**: 440x280
- **Marquee**: 1400x560

---

## Step 3: Upload to Chrome Web Store

### A. Navigate to Developer Dashboard
1. Go to: https://chrome.google.com/webstore/devconsole
2. Sign in with your Google Developer account
3. Locate "Calendar Event Creator" extension

### B. Upload New Version
1. Click on the extension name
2. Click "Package" tab in left sidebar
3. Click "Upload new package"
4. Select `calendar-event-creator-v1.1.0.zip`
5. Wait for upload to complete

### C. Review Package Status
Chrome will show:
- ✅ Upload successful
- ⚠️ Any warnings (review and address if needed)
- 📋 List of files included

### D. Update Store Listing (if changes needed)
1. Click "Store listing" tab
2. Update description (if improved)
3. Add new screenshots showcasing v1.1.0 features
4. Update "What's New" section with release highlights

---

## Step 4: Update "What's New" Section

Copy this into the "What's New" field in Chrome Web Store:

```
Version 1.1.0 - October 2025

NEW FEATURES:
• Google Sign-In: Authenticate with your Google account
• 50 Free Events/Month: No OpenAI API key required for signed-in users
• Usage Tracking: Visual progress bar shows monthly usage
• User Profile: See your Google profile in extension popup

IMPROVEMENTS:
• Better error messages
• Improved session management
• Enhanced popup UI
• Automatic session restoration

BUG FIXES:
• Fixed OAuth popup closure issue
• Fixed sign-out failures
• Resolved connection errors
```

---

## Step 5: Privacy & Permissions

### Update Privacy Practices (if prompted)

**Data Collection:**
- ✅ Authentication Information (Google OAuth tokens, email)
- ✅ Website Content (selected text for event parsing)
- ✅ Usage Statistics (monthly event creation count)

**Data Usage:**
- Calendar event creation
- Usage limit enforcement
- Service improvement

**Data Sharing:**
- ❌ Not sold to third parties
- ✅ Shared with OpenAI (for text processing only)
- ✅ Shared with Google Calendar (for event creation)

**Data Retention:**
- Sessions: Until user signs out
- Usage stats: Stored for billing cycle (1 month)
- API keys: Stored locally only

### Justifications for Permissions

**If asked to justify new permissions:**

**`identity` permission:**
- Purpose: Enable Google OAuth authentication
- Justification: Allows users to sign in with their Google account to access free monthly event creations
- User benefit: No OpenAI API key required

**`host_permissions` for `*.supabase.co`:**
- Purpose: Backend API communication
- Justification: Enables authenticated users to process events server-side
- User benefit: Free event processing for signed-in users

---

## Step 6: Submit for Review

### Before Submitting
- [ ] Review all changes in preview mode
- [ ] Test package locally (load unpacked in Chrome)
- [ ] Verify all screenshots are correct
- [ ] Double-check version number (1.1.0)
- [ ] Review privacy disclosures

### Submit
1. Click "Submit for review" button
2. Confirm submission in dialog
3. Review submission summary
4. Click "Confirm"

### Expected Timeline
- **Review time**: 1-3 business days (typically)
- **Status updates**: Via email and dashboard
- **Possible outcomes**:
  - ✅ Approved & Published
  - ⚠️ Pending - Needs more information
  - ❌ Rejected - Policy violation (rare if following guidelines)

---

## Step 7: Post-Submission

### Monitor Review Status
1. Check email for updates from Chrome Web Store team
2. Monitor dashboard: https://chrome.google.com/webstore/devconsole
3. Status states:
   - "Pending review" - Waiting for Google to review
   - "In review" - Currently being reviewed
   - "Pending developer action" - Needs your response
   - "Published" - Live on Chrome Web Store

### If Rejected or Needs Changes
1. Read feedback carefully
2. Address all concerns
3. Update package if code changes needed
4. Resubmit with explanation

### After Approval
1. ✅ Verify extension is live on Chrome Web Store
2. 📢 Announce update to users
3. 📊 Monitor user reviews and ratings
4. 🐛 Watch for bug reports
5. 📈 Track analytics (if enabled)

---

## Step 8: Communication

### Notify Users

**Via Extension Update Notification** (automatic):
- Chrome will auto-update installed extensions
- Users see "Extension updated" notification

**Via Social Media / Website**:
```
🎉 Calendar Event Creator v1.1.0 is now live!

NEW: Sign in with Google and get 50 free calendar events per month!

✨ Features:
• Google OAuth authentication
• No OpenAI API key required
• Usage tracking with visual progress bar
• Improved UI and error handling

Update now or install: [Chrome Web Store Link]
```

### Update README.md
Add version 1.1.0 to changelog:
```markdown
## Changelog

### v1.1.0 (October 21, 2025)
- Added Google Sign-In authentication
- Implemented backend service for authenticated users
- Added usage limits (50 requests/month for signed-in users)
- Improved popup UI with user profile display
- Enhanced error handling and session management
```

---

## Troubleshooting

### Common Issues

**"Package upload failed"**
- Check ZIP file size (must be < 100MB)
- Ensure manifest.json is at root of ZIP
- Verify no syntax errors in manifest.json
- Remove any disallowed files (.git, node_modules)

**"Permission warnings for users"**
- Justify new permissions in privacy section
- Provide clear explanations for `identity` and `host_permissions`
- Consider adding permission justifications in extension description

**"Review taking longer than expected"**
- Normal for first update with new permissions
- May take up to 7 days for complex reviews
- Be patient, don't resubmit unless requested

**"Extension rejected for policy violation"**
- Review Chrome Web Store Developer Program Policies
- Address specific violation mentioned
- Update code/listing as needed
- Resubmit with clear explanation of changes

---

## Rollback Plan

If critical bug is discovered after publishing:

### Option 1: Quick Fix
1. Fix bug immediately
2. Create v1.1.1 with bug fix
3. Submit emergency update
4. Request expedited review (if available)

### Option 2: Rollback
1. Go to Developer Dashboard
2. Package tab → Previous versions
3. Select v1.0 package
4. Click "Revert to this version"
5. Submit for review

---

## Post-Launch Checklist

### Week 1
- [ ] Monitor crash reports
- [ ] Read user reviews
- [ ] Check usage analytics
- [ ] Verify backend metrics (Supabase dashboard)
- [ ] Test on different Chrome versions

### Week 2-4
- [ ] Collect user feedback
- [ ] Identify patterns in bug reports
- [ ] Plan next iteration (v1.2.0)
- [ ] Update roadmap based on feedback

---

## Resources

- **Chrome Web Store Developer Console**: https://chrome.google.com/webstore/devconsole
- **Developer Program Policies**: https://developer.chrome.com/docs/webstore/program-policies
- **Extension Publishing Guide**: https://developer.chrome.com/docs/webstore/publish
- **Manifest V3 Documentation**: https://developer.chrome.com/docs/extensions/mv3
- **Community Forum**: https://groups.google.com/a/chromium.org/g/chromium-extensions

---

## Contacts

- **Developer Dashboard Support**: Via dashboard help button
- **Policy Questions**: chrome-webstore-support@google.com
- **Technical Issues**: Chromium Extensions Google Group
