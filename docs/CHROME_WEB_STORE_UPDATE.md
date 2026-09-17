# Chrome Web Store Update Guide

## Version 1.3.0 — Screenshot Source

This release adds a second Source: the user draws a Region over the visible tab and the extension extracts Events from that Screenshot through the same paths as a Selection (own OpenAI key, else the backend). **No new manifest permissions**, and the extraction logic is unchanged.

The backend does change: `process-image` now turns away a payload that is over 10 MiB or is not a base64 image data URL, with a 400 and before the request is charged. **Deploy it before publishing this build** — `npm run deploy:backend:all`, or `npm run deploy:backend:image` for that endpoint alone.

### Package
```bash
npm run package        # → calendar-event-creator-v1.3.0.zip
```
Load the unpacked archive in a fresh Chrome profile before uploading and confirm the service worker starts with no errors, the popup shows "Capture screenshot", and a right-click shows "Add screenshot to Google Calendar".

### Manual pre-release checks (cannot run under Playwright)
- On a Retina display, draw a Region and confirm the image that reaches the confirmation modal thumbnail is exactly the drawn Region (device-pixel-ratio crop)
- Start a Screenshot on a browser-internal page (`chrome://extensions`) or the Web Store and confirm the plain "cannot capture this page" error
- The context-menu item appears on a page with nothing selected, and is absent while text is highlighted

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
• The right-click screenshot item steps aside when you have text highlighted, so a selection offers the text action alone

IMPROVEMENTS:
• Timetables and posters in Japanese and English extract one event per session
• Clearer "no events found" state
• The popup shows the month's real usage the moment you open it, instead of the number left over from your last extraction
• Events you have not acted on stay on the page when a later screenshot fails, rather than being replaced by the error
• You stay signed in after an extraction
• Fixed the screenshot setting in the popup, which was drawn as a full-width field instead of a checkbox
```

### Full store description (paste over the whole field)

The description field is replaced wholesale each release rather than patched,
so this is the text as it should read, not a diff against the last one. The
previous release's "what's new" entry is dropped: the field is read by someone
deciding whether to install, and a stack of old entries buries the current one.

```
Calendar Event Creator turns anything on a webpage into a Google Calendar event. Select text, or draw a box over a poster, invite, or screenshot, and AI extracts the details — title, time, location, description — ready to confirm and add.

What's new in v1.3.0
- New: create events from a screenshot. Click "Capture screenshot" in the popup, or right-click and choose "Add screenshot to Google Calendar", then draw a box over the part of the page that holds the event
- Only the box you draw is captured — it's downscaled in your browser, sent for extraction, and discarded, never stored. Press Enter or double-click for the whole visible tab; Esc cancels
- A thumbnail in the confirmation window shows exactly what was read
- The right-click screenshot item steps aside when you have text selected, so a selection offers the text action alone — and it can be turned off entirely in the popup
- Fixed: the usage bar shows your real monthly count as soon as the popup opens, events you haven't added yet survive a failed screenshot, and you stay signed in after an extraction

Key features
- One-click event creation from any webpage text
- Screenshot any part of a page — posters, embedded calendars, chat screenshots, PDFs — and turn it into events
- Multi-event extraction — select text with several events and get them all at once
- Automatic timezone detection using your browser's timezone
- Works with receipts, card transactions, reservations, deliveries, and other dated records
- Event titles match the language of your text (Japanese text → Japanese titles)
- Preview and confirm in a draggable window; each event has its own "Add to Calendar" button
- Visual usage tracker with color-coded progress bar (for signed-in users)

Two ways to use it
- Sign in with Google (recommended): 50 free event creations per month, no API key needed — and failed requests don't count against your limit
- Bring your own OpenAI API key: unlimited client-side processing, for text and screenshots alike

Perfect for creating events from emails, messages, receipts, booking confirmations, posters, or any text or image containing a date.

Also on iPhone: snap a screenshot, get a calendar event — https://apps.apple.com/app/id6772644308

Open Source: https://github.com/ryoshumei/add-to-calendar
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
1. Click the extension icon and "Capture screenshot" (or, with nothing highlighted, right-click → "Add screenshot to Google Calendar")
2. Draw a box over the event details; release to capture (Esc cancels, Enter or double-click sends the whole visible tab)
3. Review the extracted events and the thumbnail of what was read, then add each to Google Calendar
```
Replace the **activeTab** line under PERMISSIONS EXPLAINED:
```
• activeTab - Read the text you selected, and capture the visible tab when you start a screenshot (only the box you draw leaves the browser)
```

### Privacy tab (developer dashboard)

Every field below is replaced whole. The Screenshot Source is the reason: the
old text describes an extension that only ever read selected text, and a
reviewer comparing that against a feature that photographs the tab is the most
likely way this release gets rejected. Each field is under the dashboard's
1,000-character limit.

**Data usage checkboxes — no change.** Personally identifiable information,
Authentication information and Website content stay ticked; a screenshot is
website content ("text, images, sounds, videos, or hyperlinks"), so the new
Source adds no category. All three certifications stay ticked. Remote code
stays "No". The privacy policy URL is unchanged.

#### Single purpose

```
This extension has one purpose: creating Google Calendar events from something the user points at on a webpage.

The user points at it in one of two ways, and both feed the same extraction:
1. Select text, right-click, choose "Add to Google Calendar"
2. Start a screenshot from the popup button or the right-click menu, then drag a box over the part of the page holding the event

Either way, AI reads the title, date, time and location out of what was chosen, shows them in a confirmation window, and the user adds each event to Google Calendar. Nothing is added without that confirmation.

New in v1.3.0 is the screenshot source, for event details that sit inside an image - a poster, an embedded calendar, a chat screenshot - and so cannot be selected as text. It serves the same single purpose through the same extraction and the same confirmation step. Only the way the user points at the content differs.
```

#### contextMenus justification

```
The contextMenus permission puts the extension's two entry points on the right-click menu, which is the main way users reach it.

1. "Add to Google Calendar" appears when the user has selected text, and creates events from that text.
2. "Add screenshot to Google Calendar" appears when no text is selected, and starts the screenshot flow so the user can drag a box over event details that are part of an image rather than selectable text.

The second item is deliberately absent while text is selected, so a selection offers the text action alone. Users who only use the popup button can remove that item entirely from a setting in the popup.

Both items act only when clicked. The extension does not read page content or act on any page until the user chooses one of them.
```

#### storage justification

```
The storage permission is required to:
1. Store OpenAI API key (optional): for users who choose to use their own API key, chrome.storage.sync saves it. The key is used solely for calls to OpenAI for text and image processing.
2. Store authentication session: for users who sign in with Google, Supabase session tokens are kept in chrome.storage.local so the login survives browser restarts.
3. Store usage information: for signed-in users, the current month's count (for example "15/50 requests used") is cached for display in the popup.
4. Store one display setting: whether the "Add screenshot to Google Calendar" right-click item is shown, in chrome.storage.sync so the choice follows the user's Chrome profile.

Screenshots are never stored. All stored data is necessary for the extension's functionality and is accessible only by this extension.
```

#### activeTab justification

```
The activeTab permission is used only when the user explicitly triggers the extension on the tab they are looking at. It allows us to:

1. Read the text the user selected, when they choose "Add to Google Calendar"
2. Capture the visible tab once, when the user starts a screenshot from the popup button or the right-click item. The capture is cropped in the browser to the rectangle the user dragged, and only that region is sent for event extraction. Pressing Enter or double-clicking makes that rectangle the whole visible tab.
3. Show the confirmation window on the page, handle confirm/cancel, and display status or error messages

Capture happens only on that user gesture. The extension never captures a page on its own, never captures anything outside the visible tab, does not store the image, and does not monitor or access tabs in the background.
```

#### scripting justification

```
The scripting permission is required to inject our content script on demand. That script:

1. Draws the selection overlay the user drags to choose the screenshot region, and reports that rectangle plus the page's own viewport size and device pixel ratio so the crop lands exactly where the user drew it
2. Creates and manages the confirmation window showing the extracted event details, including a thumbnail of the region that was read
3. Handles the user's confirm or cancel before anything opens in Google Calendar
4. Displays error messages or setup instructions when needed

The script is injected only when the user triggers the extension, through the right-click menu or the popup button. We do not inject scripts proactively and do not monitor page content.
```

#### Host permission justification

```
Host permissions for https://*.supabase.co/* are required to reach our Supabase backend.

What we use it for:
1. Authentication API (auth/v1): verify Google OAuth tokens and manage sessions
2. Edge Functions: process-text extracts events from selected text; process-image does the same for the screenshot region the user drew; get-usage reads the month's usage for the popup without spending a request
3. Usage limits: check and update the monthly count for free tier users

Why it is necessary: for users who sign in with Google, their text or screenshot is processed on our backend instead of requiring them to supply their own API key.

Security: all calls are authenticated with JWT tokens, and Row Level Security means users reach only their own data.

Note: users who supply their own OpenAI API key bypass our backend entirely.
```

#### identity and notifications — no change

`identity` still describes Google sign-in exactly as it works. `notifications`
still describes the fallback for pages where the content script cannot be
injected, which is what a Screenshot on a browser page relies on; it also sits
at 1,000/1,000 characters, so it has no room and needs none.

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
