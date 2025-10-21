# Release Notes - Version 1.1.0

## Calendar Event Creator - Chrome Extension Update

**Release Date**: October 21, 2025
**Version**: 1.1.0
**Previous Version**: 1.0

---

## 🎉 What's New

### Google Account Integration
- **Sign in with Google**: Authenticate with your Google account for seamless calendar access
- **No API Key Required**: Signed-in users can create calendar events without providing an OpenAI API key
- **Persistent Sessions**: Stay signed in across browser restarts

### Backend Service
- **Server-Side Processing**: Authenticated users get text processing through our secure backend
- **No Key Exposure**: OpenAI API keys are never exposed to the client for authenticated users
- **Smart Priority Logic**:
  1. Your own OpenAI API key (if provided) → client-side processing
  2. Backend service (if signed in) → server-side processing
  3. Basic fallback (if needed)

### Usage Limits & Tracking
- **Monthly Limits**: 50 free calendar event creations per month for signed-in users
- **Visual Progress Bar**: See your usage with color-coded progress indicator
  - Green (0-50%): Light usage
  - Yellow (50-75%): Moderate usage
  - Orange (75-90%): High usage
  - Red (90-100%): Near limit
- **Real-time Updates**: Usage count updates automatically after each request
- **Monthly Reset**: Usage automatically resets at the start of each month

### Improved UI
- **User Profile Display**: Shows your Google profile picture, name, and email when signed in
- **Usage Stats**: Always visible usage counter showing "X / 50 requests used this month"
- **Better Error Messages**: Clear feedback when limits are reached
- **Responsive Design**: Enhanced popup interface with better visual hierarchy

---

## 🔧 Technical Improvements

### Architecture
- **Supabase Integration**: Secure authentication and session management
- **Edge Functions**: Serverless backend for text processing
- **Database Tracking**: PostgreSQL-based usage tracking with RLS policies
- **Service Worker Optimization**: Improved background script lifecycle management

### Security
- **OAuth 2.0**: Secure Google authentication via Chrome Identity API
- **JWT Tokens**: Session tokens for authenticated API requests
- **Row Level Security**: Database policies ensure users can only view their own data
- **Service Role Isolation**: Admin operations use separate credentials

### Error Handling
- **Graceful Fallbacks**: Automatic fallback to basic event creation on backend errors
- **Session Recovery**: Automatic session restoration on extension startup
- **Better Validation**: Enhanced error messages for usage limits and auth failures

---

## 📝 Permissions Update

### New Permissions
- **`identity`**: Required for Google OAuth authentication
- **`host_permissions` for `*.supabase.co`**: Required for backend API access

### Existing Permissions (Unchanged)
- `contextMenus`: Right-click menu integration
- `storage`: Save API keys and session data
- `activeTab`: Access selected text on current tab
- `scripting`: Inject modal display scripts

---

## 🐛 Bug Fixes

- Fixed popup closure during OAuth flow (moved OAuth to background service worker)
- Fixed sign-out failures due to service worker restarts (added lazy initialization)
- Resolved connection errors during sign-in (removed keepalive port mechanism)
- Improved content script injection retry logic

---

## 📊 Breaking Changes

**None** - Version 1.1.0 is fully backward compatible with 1.0. Existing users can continue using their own OpenAI API keys without signing in.

---

## 🔄 Migration Guide

### For Existing Users

**No action required!** The extension will continue to work exactly as before if you have your OpenAI API key configured.

**Optional upgrade path:**
1. Click the extension icon to open settings
2. Click "Sign in with Google"
3. Authorize the extension
4. Remove your OpenAI API key (optional) - you now get 50 free requests/month via our backend

### For New Users

1. Install/update the extension
2. Click extension icon → "Sign in with Google"
3. Start creating calendar events - no API key needed!

**Alternative:** Provide your own OpenAI API key in Advanced settings for unlimited client-side processing

---

## 📚 Documentation Updates

- Added `CLAUDE.md` with comprehensive project documentation
- Updated architecture diagrams and workflow descriptions
- Added usage limits section to user documentation
- Documented backend service integration patterns

---

## 🙏 Acknowledgments

Built with:
- Chrome Extensions Manifest V3
- Supabase (Auth + Database + Edge Functions)
- OpenAI GPT-4.1-mini
- Google Calendar URL API

---

## 🔗 Resources

- **Chrome Web Store**: [Extension Link]
- **Support**: Create an issue on GitHub
- **Privacy Policy**: [Link to your privacy policy]
- **Terms of Service**: [Link to your ToS]

---

## 📅 Roadmap

Coming in future versions:
- Direct Google Calendar API integration (create events without opening new tab)
- Customizable usage limits for premium users
- Event template management
- Bulk event creation
- Recurring event support
