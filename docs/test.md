# OAuth Fix Testing Guide

## Issue Fixed
**Problem**: Google login only worked when DevTools (inspect window) was open. When DevTools was closed, the popup would close as soon as the OAuth window opened, breaking the authentication flow.

**Root Cause**: Chrome extension popups automatically close when a new window (like OAuth) opens. DevTools kept the popup alive, masking this issue.

**Solution**: Moved OAuth flow from popup to background service worker, which persists even when popup closes.

---

## How to Test

### 1. Reload Extension
```
1. Go to chrome://extensions/
2. Find "Calendar Event Creator" extension
3. Click the reload button (🔄)
```

### 2. Test WITHOUT DevTools

**Important**: Make sure NO inspect windows are open for the extension!

#### Test A: Sign In
1. **Close all DevTools windows**
2. Click the extension icon to open popup
3. Click "Sign in with Google"
4. **Observe**: OAuth window opens
5. Complete Google sign-in
6. **OAuth window closes automatically**
7. **Reopen the extension popup** (click extension icon again)
8. **Expected**: Should show your signed-in state with name, email, and avatar

#### Test B: Use the Extension
1. Go to any webpage
2. Select text: "Team meeting tomorrow at 2pm"
3. Right-click → "Add to Google Calendar"
4. **Expected**: Modal appears with event details
5. Click "Add to Calendar"
6. **Expected**: Google Calendar opens with the event

#### Test C: Check Logs
1. Go to chrome://extensions/
2. Click "service worker" link (for background.js logs)
3. Look for these log messages:
   ```
   🔵 Received signInWithGoogle request from popup
   🔌 Created keepalive connection for OAuth flow
   🔌 Keepalive connection established for OAuth
   ✅ Background OAuth successful: [your email]
   🔌 Disconnected keepalive connection
   ```

#### Test D: Sign Out
1. Open extension popup
2. Click "Sign out"
3. **Expected**: Popup immediately shows "Sign in with Google" button
4. Reopen popup to verify signed-out state persists

---

## What Changed

### Files Modified

**1. background.js**
- Added message handlers for `signInWithGoogle`, `signOut`, and `getAuthState`
- OAuth now runs in background service worker (persists even when popup closes)
- Session stored in `chrome.storage.local` for persistence

**2. popup/popup.js**
- Changed `handleGoogleSignIn()` to send message to background instead of calling OAuth directly
- Changed `handleSignOut()` to delegate to background
- Added `chrome.storage.onChanged` listener to update UI when session changes
- Popup now automatically updates when reopened after OAuth completes

**3. scripts/supabase-client.js** (from previous fix)
- Added keepalive port to prevent service worker termination during OAuth
- Proper cleanup of keepalive connection

---

## Expected Behavior

### Normal Flow (Without DevTools)
1. **User clicks "Sign in with Google"**
   - Popup sends message to background
   - Background starts OAuth flow
   - Popup closes (normal Chrome behavior)

2. **OAuth window opens**
   - User signs in with Google
   - OAuth completes
   - Background stores session in chrome.storage

3. **User reopens popup**
   - Popup reads session from chrome.storage
   - UI shows signed-in state
   - Everything works!

### With DevTools Open (Optional)
- Same flow, but popup stays open during OAuth
- UI updates immediately after OAuth completes
- Both ways work correctly now!

---

## Troubleshooting

### Issue: Popup doesn't show signed-in state after OAuth
**Solution**:
1. Check background.js logs for OAuth success message
2. Check chrome.storage.local for `supabase_session`
3. Try reopening the popup
4. Check popup console for session restore logs

### Issue: OAuth window doesn't open
**Check**:
1. Extension permissions in manifest.json
2. Background service worker is running (should see it in chrome://extensions/)
3. Console logs in background for error messages

### Issue: "Sign in failed" error
**Check**:
1. Google OAuth client ID is correct in manifest.json
2. Supabase project is configured properly
3. Network tab for API errors
4. Background.js console for detailed error

---

## Success Criteria

✅ Google login works WITHOUT DevTools open
✅ Popup closes during OAuth (expected behavior)
✅ User can reopen popup and see signed-in state
✅ Session persists across browser restarts
✅ Extension functionality works for authenticated users
✅ Backend service processes text correctly

---

## Next Steps After Testing

If all tests pass:
1. Test event creation with backend service
2. Verify backend logs in Supabase dashboard
3. Test with different Google accounts
4. Test sign out and re-sign in
5. Ready for production! 🎉
