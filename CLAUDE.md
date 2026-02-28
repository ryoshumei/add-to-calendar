# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome extension that creates Google Calendar events from selected text using OpenAI's natural language processing. The extension supports two authentication modes:
- **Authenticated users**: Sign in with Google via Supabase → backend processes events (no API key needed)
- **Unauthenticated users**: Provide OpenAI API key → client-side processing

## Architecture

### Core Components
- **background.js**: Service worker managing context menus, OpenAI API calls, authentication, and message routing
- **content.js**: Content script for modal display and user interaction
- **popup/**: Extension settings popup for API key management and Google sign-in
- **config.js**: Public configuration (Supabase URL, Google OAuth client ID)
- **scripts/supabase-client.js**: Authentication service using Supabase + Chrome Identity API
- **scripts/calendar-service.js**: Google Calendar URL generation and event creation
- **scripts/llm-prompt.js**: LLM prompt template and OpenAI request configuration (client-side)
- **supabase/functions/_shared/llm-prompt.ts**: LLM prompt template (backend, kept in sync with client)

### Authentication Flow
1. User clicks "Sign in with Google" → Chrome Identity API launches OAuth flow
2. OAuth returns ID token → Supabase verifies and creates session
3. Session stored in chrome.storage.local for persistence across restarts
4. SupabaseAuth class manages session state and provides access tokens

### Event Creation Flow
**Authenticated users:**
1. User selects text → right-clicks → "Add to Google Calendar"
2. background.js checks authentication status and API key availability
3. **Priority logic**: User's OpenAI key > Backend service > Basic fallback
4. CalendarService creates Google Calendar URL with event details
5. content.js displays modal → user confirms → opens Google Calendar

**Unauthenticated users:**
1. Same flow but requires OpenAI API key in extension settings
2. Client-side processing only (no backend service access)

### Key Patterns
- **Manifest V3 Service Worker**: background.js is not persistent, uses importScripts for dependencies
- **Message Passing**: background.js ↔ content.js communication via chrome.runtime/chrome.tabs messaging
- **Request Deduplication**: Tab-based tracking prevents duplicate API calls during processing
- **Content Script Injection**: Dynamic injection with retry when script not initially loaded
- **Session Persistence**: Supabase sessions stored and restored from chrome.storage.local

## Deployment

### Publishing a New Version (IMPORTANT)
**Always deploy both the backend AND extension together:**

```bash
# 1. Set Supabase token (get from https://supabase.com/dashboard/account/tokens)
export SUPABASE_ACCESS_TOKEN=your-token

# 2. Deploy backend function FIRST
npm run deploy:backend

# 3. Then publish Chrome extension to Web Store
```

Or use the combined deploy script:
```bash
npm run deploy
```

### Deployment Checklist
- [ ] Deploy Supabase Edge Function: `npm run deploy:backend`
- [ ] Update version in manifest.json
- [ ] Package extension: `npm run package`
- [ ] Upload to Chrome Web Store Developer Dashboard
- [ ] Test the published extension

### Files That Require Backend Redeployment
If you modify these files, you MUST redeploy the Supabase function:
- `supabase/functions/process-text/index.ts` - Main backend logic
- `supabase/functions/_shared/llm-prompt.ts` - Backend LLM prompt configuration
- Any changes to the OpenAI prompt or model in the backend

### Version Compatibility (IMPORTANT)
Chrome extension review takes time. To avoid breaking users:

**Safe deployment order for ANY changes:**
1. Deploy backend that supports BOTH old AND new extension versions
2. Submit new extension to Chrome Web Store
3. Wait for approval + users to update (1-2 weeks)
4. (Optional) Remove old version support from backend

**Example: Changing request/response format**
```typescript
// Backend supports both versions
const version = req.headers.get('X-Extension-Version') || '1.0.0'
if (compareVersions(version, '1.3.0') >= 0) {
  // New format for v1.3.0+
  return { events: [...] }
} else {
  // Old format for v1.2.x and below
  return { event: {...} }
}
```

**Version tracking:**
- Extension sends `X-Extension-Version` header to backend
- Backend logs version and can handle different formats per version
- Update `MIN_SUPPORTED_VERSION` in `index.ts` after old versions are phased out

## Development Commands

### Extension Development
```bash
# No build step required - load directly into Chrome
# Chrome → chrome://extensions/ → Enable Developer mode → Load unpacked (select project directory)
# After changes: Click reload button in chrome://extensions/
```

### Testing with Playwright
```bash
npm test                    # Run all tests in parallel
npm run test:headed        # Run tests with visible browser
npm run test:debug         # Run tests with Playwright debugger
npm run test:ui            # Open Playwright UI mode
npm install:browsers       # Install Playwright browsers
npm install:deps          # Install browser system dependencies
```

### Test Organization
- `tests/*.test.js`: Test suites (extension-loading, popup-ui, context-menu, calendar-integration, etc.)
- `tests/fixtures/`: Reusable test fixtures (extension-fixtures.js provides context, extensionId, popupPage, testPage)
- `tests/utils/`: Test helper utilities
- **Configuration**: playwright.config.js defines test settings, reporters (HTML, JSON, list)

### Debugging
- **Background script**: chrome://extensions/ → Extension details → "service worker" link
- **Content script**: F12 on any webpage → Console tab (content.js logs appear here)
- **Popup**: Right-click extension icon → Inspect popup → Console tab
- **Storage**: chrome://extensions/ → Extension details → "Storage" tab shows API keys and sessions
- **Test reports**: playwright-report/ directory contains HTML test reports

## Important Implementation Details

### Current Development Status
✅ **Completed**: Google OAuth authentication, session management, URL-based calendar event creation, backend text processing service with usage limits
⚠️ **TODO**: None - core functionality complete

### Usage Limits
**Monthly request limits for authenticated users:**
- Limit: 50 requests per month per user
- Tracking: Automatic via Supabase `usage_tracking` table
- Enforcement: Backend Edge Function checks and increments usage before processing
- UI Display: Popup shows visual progress bar and usage count (e.g., "15 / 50 requests used this month")
- Reset: Automatically resets at start of each calendar month (tracked by `year_month` field)

**Usage limit behavior:**
- When limit reached: Returns clear error message, no fallback to basic processing
- Usage info: Stored in `chrome.storage.local` and updated after each backend request
- Visual indicator: Color-coded progress bar (green → yellow → orange → red as usage increases)

### Backend Service Integration
**Implemented** (background.js:processWithBackend):
```javascript
// Priority logic for authenticated users:
if (currentUser && supabaseAuth?.isAuthenticated()) {
    const {apiKey} = await chrome.storage.sync.get("apiKey");
    if (apiKey) {
        // Use user's API key (client-side)
        eventDetails = await processWithOpenAI(selectedText, apiKey);
    } else {
        // Use backend service (includes usage tracking)
        eventDetails = await processWithBackend(selectedText, supabaseAuth.getAccessToken());
    }
}
```

**Backend service:**
- Supabase Edge Function at `/functions/v1/process-text`
- Authenticates users via JWT (Supabase session token)
- Checks and increments monthly usage limit before processing
- Processes text using backend OpenAI API key (user's key never exposed)
- Returns structured event details + usage information
- Throws error if monthly limit exceeded

### OpenAI Integration
- Model: gpt-4.1-mini (configurable in background.js:219)
- System prompt enforces JSON-only responses with specific schema
- Temperature: 0.3 for consistent JSON output
- Current time passed as reference for relative date parsing
- Response validation: required fields (title, startTime, endTime), datetime format validation

### Security & Privacy
- **API Keys**: User's OpenAI key stored in chrome.storage.sync (encrypted by Chrome)
- **Sessions**: Supabase sessions stored in chrome.storage.local, auto-restored on startup
- **OAuth**: Client ID in manifest.json is public (designed for OAuth), redirect URI locked to extension ID
- **Data Flow**: All processing client-side except backend service (when implemented)
- **Supabase Keys**: Public anon key in config.js is safe to expose (designed for client-side use)

### Extension Permissions
- `contextMenus`: Right-click menu integration
- `storage`: API key and session persistence
- `activeTab`: Access selected text on active tab
- `scripting`: Dynamic content script injection
- `identity`: Chrome Identity API for Google OAuth
- `host_permissions`: Supabase API access (https://*.supabase.co/*)

### Common Modifications
- **LLM Prompt / Model**: Edit `scripts/llm-prompt.js` (client-side) and `supabase/functions/_shared/llm-prompt.ts` (backend) — these must be kept in sync
- **UI Styling**: Edit CSS in content.js:8-72 for modal appearance
- **Supabase Config**: Update SUPABASE_URL and SUPABASE_ANON_KEY in config.js
- **OAuth Client**: Update oauth2.client_id in manifest.json (requires new Google Cloud OAuth app)

### Error Recovery
- **Content script injection**: 100ms retry delay if initial message fails
- **Fallback calendar opening**: Direct URL opening if modal fails to display
- **Request deduplication**: Tab-based tracking prevents concurrent API calls
- **Session restoration**: Automatic session recovery on extension startup
- **Backend fallback**: Basic event creation if backend service unavailable

### Testing Patterns
- **Extension fixtures**: Custom Playwright fixtures provide pre-configured browser context with extension loaded
- **Service worker access**: Extension ID extracted from service worker URL
- **Popup testing**: Direct navigation to chrome-extension://{extensionId}/popup/popup.html
- **Content testing**: Test pages with predefined selectable event text
- **Auth mocking**: Mock fixtures for testing authentication flows without real OAuth