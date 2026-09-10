# Chrome Web Store Update Guide

## Version 1.3.0 — Screenshot Source

This release adds a second Source: the user draws a Region over the visible tab and the extension extracts Events from that Screenshot through the same paths as a Selection (own OpenAI key, else the backend). **No new manifest permissions**; the backend is unchanged.

### Package
```bash
npm run package        # → calendar-event-creator-v1.3.0.zip
```
Load the unpacked archive in a fresh Chrome profile before uploading and confirm the service worker starts with no errors, the popup shows "Capture screenshot", and a right-click shows "Add screenshot to Google Calendar".

### Manual pre-release checks (cannot run under Playwright)
- On a Retina display, draw a Region and confirm the image that reaches the confirmation modal thumbnail is exactly the drawn Region (device-pixel-ratio crop)
- Start a Screenshot on a browser-internal page (`chrome://extensions`) or the Web Store and confirm the plain "cannot capture this page" error
- The context-menu item appears on a page with nothing selected

### "What's New" (copy into the store field)
```
Version 1.3.0 - September 2026

NEW: Screenshot Source
• Click "Capture screenshot" in the popup, or right-click and choose "Add screenshot to Google Calendar"
• Draw a box over the part of the page that holds the event (Esc cancels; Enter or double-click sends the whole visible tab)
• Only the box you draw is captured; it is downscaled in your browser, sent for extraction, and discarded
• Works with your own OpenAI key (image goes straight to OpenAI) or with Google sign-in (one request of your monthly allowance, same as text)
• A thumbnail in the confirmation modal shows what was read
• A setting in the popup hides the right-click screenshot item if you only use the popup button

IMPROVEMENTS:
• Timetables and posters in Japanese and English extract one event per session
• Clearer "no events found" state
```

### Store listing additions
The **summary** under the extension's name is `manifest.json`'s `description`,
not a dashboard field: this release ships "Create Google Calendar events from
selected text or a screenshot using OpenAI", so the summary names both Sources
as soon as the package is uploaded. Nothing to type there.

Add to **KEY FEATURES**:
```
• Screenshot any part of a page — posters, embedded calendars, chat screenshots, PDFs — and turn it into events
```
Add to **HOW TO USE**:
```
From a screenshot:
1. Click the extension icon and "Capture screenshot" (or right-click → "Add screenshot to Google Calendar")
2. Draw a box over the event details; release to capture (Esc cancels, Enter or double-click sends the whole visible tab)
3. Review the extracted events and the thumbnail of what was read, then add each to Google Calendar
```
Replace the **activeTab** line under PERMISSIONS EXPLAINED:
```
• activeTab - Read the text you selected, and capture the visible tab when you start a screenshot (only the box you draw leaves the browser)
```

### Privacy practices (developer dashboard)
**Data Collection → Website Content**: "The text you select, or the screenshot Region you draw, sent only when you trigger the extension. Only the Region you draw is captured — pressing Enter or double-clicking makes that Region the whole visible tab — and nothing outside the visible tab is ever captured."

**Data Sharing → OpenAI**: "Text and images (the selected text or the screenshot Region) are sent to OpenAI to extract event details. Not stored by the extension."

**Data Retention**: "Selected text and screenshots are not retained; they are processed and discarded."

**Permission justification — `activeTab`** (replaces the earlier text):
> The extension reads the text the user selected on the active tab, and when the user explicitly starts a screenshot (popup button or context-menu item) it captures the visible tab once, crops it in the browser to the rectangle the user drew, and sends only that region for event extraction. Pressing Enter or double-clicking on the overlay makes that rectangle the whole visible tab. Capture happens only on that user gesture; the extension never captures pages on its own, never captures anything outside the visible tab, and does not store the image.

The privacy policy page (`docs/index.html`, published via GitHub Pages) was updated in the same release: collection ("the Selection or the Screenshot Region you choose to send"), "only the Region you draw is captured — Enter or a double-click makes that Region the whole visible tab, and nothing outside the visible tab is ever captured", retention ("Screenshots are never stored"), and third parties ("OpenAI processes text and images").

### Screenshots to add
1. Region overlay mid-drag over an event poster
2. Confirmation modal with the thumbnail of the captured Region
3. Popup showing "Capture screenshot" and the right-click menu toggle

---

## Version 1.1.0 (historical)

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
# The file list lives in scripts/package-extension.sh — keep this in sync with it
zip -r calendar-event-creator-v$(grep -o '"version": *"[^"]*"' manifest.json | grep -o '[0-9.]*').zip \
    manifest.json \
    background.js \
    content.js \
    config.js \
    popup/ \
    scripts/backend-config.js \
    scripts/supabase-client.js \
    scripts/calendar-service.js \
    scripts/llm-prompt.js \
    scripts/screenshot-pipeline.js \
    scripts/supabase-js.min.js \
    icons/ \
    -x "*.DS_Store" "*.git*" "*/.*"
```

---

## Step 2: Prepare Store Listing

### Update Description (if needed)

**Short Description** (132 characters max):
```
Create Google Calendar events from selected text or a screenshot using AI. Sign in with Google for 50 free events/month!
```

Note: the dashboard's summary field is `manifest.json`'s `description`, not an
editable listing field — keep the two saying the same thing.

**Detailed Description**:
```
Calendar Event Creator helps you quickly add events to Google Calendar from any selected text on the web, or from a screenshot of the part of a page that holds the event.

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
- ✅ Website Content (selected text, or the screenshot Region the user draws, for event parsing)
- ✅ Usage Statistics (monthly event creation count)

**Data Usage:**
- Calendar event creation
- Usage limit enforcement
- Service improvement

**Data Sharing:**
- ❌ Not sold to third parties
- ✅ Shared with OpenAI (text and images, for event extraction only)
- ✅ Shared with Google Calendar (for event creation)

**Data Retention:**
- Sessions: Until user signs out
- Selected text and screenshots: not retained
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
