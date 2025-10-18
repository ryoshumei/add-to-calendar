# Deployment Guide

This guide covers deploying both the backend (Supabase Edge Functions) and the Chrome extension.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Backend Deployment (Supabase Edge Functions)](#backend-deployment)
- [Extension Deployment (Chrome Web Store)](#extension-deployment)
- [GitHub Actions Setup](#github-actions-setup)
- [Environment Variables](#environment-variables)
- [Testing Deployments](#testing-deployments)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Tools

- **Supabase CLI**: `npm install -g supabase`
- **Node.js**: v18 or higher
- **Git**: For version control

### Required Accounts

- **Supabase Account**: https://supabase.com
- **Google Cloud Console**: For OAuth credentials
- **Chrome Web Store Developer Account**: $5 one-time fee
- **OpenAI Account**: For API key

## Backend Deployment

### 1. Install Supabase CLI

```bash
npm install -g supabase
```

### 2. Login to Supabase

```bash
supabase login
```

This will open a browser window for authentication.

### 3. Link Your Project

```bash
supabase link --project-ref pahcnlwgtghsctbnedhx
```

Replace `pahcnlwgtghsctbnedhx` with your actual Supabase project reference ID.

### 4. Deploy Edge Function

```bash
cd /path/to/add-to-calendar
supabase functions deploy process-text
```

### 5. Set Environment Variables

```bash
supabase secrets set OPENAI_API_KEY=your_openai_api_key_here
```

### 6. Verify Deployment

Test the Edge Function:

```bash
curl -i --location --request POST \
  'https://pahcnlwgtghsctbnedhx.supabase.co/functions/v1/process-text' \
  --header 'Authorization: Bearer YOUR_SUPABASE_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"selectedText":"Team meeting tomorrow at 2pm"}'
```

Expected response:
```json
{
  "eventDetails": {
    "title": "Team meeting",
    "description": "Team meeting",
    "startTime": "2025-01-XX14:00:00",
    "endTime": "2025-01-XX15:00:00",
    "location": ""
  }
}
```

## Extension Deployment

### Manual Packaging

1. **Create distribution package**:

```bash
# Create zip excluding development files
zip -r extension.zip . \
  -x "*.git*" \
  -x "*node_modules*" \
  -x "*tests*" \
  -x "*test-results*" \
  -x "*playwright-report*" \
  -x "*.serena*" \
  -x "*supabase*" \
  -x "*shared*" \
  -x "*docs*" \
  -x "*local-docs*" \
  -x "*.env*" \
  -x "*.idea*" \
  -x "playwright.config.js" \
  -x "package*.json"
```

2. **Upload to Chrome Web Store**:
   - Go to https://chrome.google.com/webstore/devconsole
   - Click "New Item" or select existing extension
   - Upload the `extension.zip` file
   - Fill in required metadata (description, screenshots, etc.)
   - Submit for review

### Automated Packaging via GitHub Actions

Push a version tag:

```bash
git tag v1.2.0
git push origin v1.2.0
```

This triggers the `package-extension.yml` workflow, which:
- Creates a clean extension package
- Uploads as GitHub artifact
- Creates a GitHub release with the zip file

## GitHub Actions Setup

### Required Secrets

Configure these in GitHub repository settings (Settings → Secrets and variables → Actions):

| Secret Name | Description | Example |
|------------|-------------|---------|
| `SUPABASE_ACCESS_TOKEN` | Supabase personal access token | `sbp_xxx...` |
| `SUPABASE_PROJECT_ID` | Supabase project reference ID | `pahcnlwgtghsctbnedhx` |
| `OPENAI_API_KEY` | OpenAI API key for backend | `sk-proj-xxx...` |

### Getting Supabase Access Token

1. Go to https://supabase.com/dashboard/account/tokens
2. Click "Generate new token"
3. Give it a name (e.g., "GitHub Actions")
4. Copy the token (starts with `sbp_`)
5. Add to GitHub secrets as `SUPABASE_ACCESS_TOKEN`

### Workflows

#### Backend Deployment (`deploy-backend.yml`)

**Triggers**:
- Push to `main`/`master` branch with changes in `supabase/` directory
- Manual workflow dispatch

**Actions**:
- Links Supabase project
- Deploys Edge Functions
- Sets environment secrets

#### Extension Testing (`test-extension.yml`)

**Triggers**:
- Push to any branch
- Pull requests to `main`/`master`
- Manual workflow dispatch

**Actions**:
- Runs Playwright tests
- Uploads test reports and artifacts

#### Extension Packaging (`package-extension.yml`)

**Triggers**:
- Push tags matching `v*` pattern
- Manual workflow dispatch

**Actions**:
- Creates clean extension package
- Uploads artifact
- Creates GitHub release (for tags)

## Environment Variables

### Backend (Edge Function)

Set via Supabase CLI:

```bash
supabase secrets set OPENAI_API_KEY=your_key
```

Or via Supabase dashboard:
1. Go to Project Settings → Edge Functions
2. Click "Manage secrets"
3. Add `OPENAI_API_KEY`

### Extension Configuration

Edit `config.js`:

```javascript
const CONFIG = {
    SUPABASE_URL: 'https://your-project.supabase.co',
    SUPABASE_ANON_KEY: 'your_anon_key',
    EDGE_FUNCTIONS: {
        PROCESS_TEXT: 'https://your-project.supabase.co/functions/v1/process-text'
    }
};
```

## Testing Deployments

### Backend Testing

```bash
# Test with curl
curl -X POST https://pahcnlwgtghsctbnedhx.supabase.co/functions/v1/process-text \
  -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"selectedText":"Meeting next Friday at 3pm"}'
```

### Extension Testing

1. **Load unpacked extension**:
   - Chrome → chrome://extensions/
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the extension directory

2. **Test functionality**:
   - Sign in with Google
   - Select text on any webpage
   - Right-click → "Add to Google Calendar"
   - Verify event creation

3. **Run automated tests**:
```bash
npm test
```

## Troubleshooting

### Backend Issues

**Error: "Unauthorized"**
- Check that user is authenticated
- Verify `Authorization` header contains valid JWT token
- Check Supabase user authentication status

**Error: "OPENAI_API_KEY not configured"**
- Set the secret: `supabase secrets set OPENAI_API_KEY=your_key`
- Verify in Supabase dashboard under Edge Functions → Secrets

**Error: "Failed to parse GPT response"**
- Check OpenAI API key is valid
- Verify OpenAI account has sufficient credits
- Review Edge Function logs in Supabase dashboard

### Extension Issues

**Context menu not appearing**
- Reload extension in chrome://extensions/
- Check background.js logs (click "service worker" link)
- Verify manifest.json permissions

**Authentication not working**
- Check OAuth client ID in manifest.json
- Verify redirect URIs in Google Cloud Console
- Check Supabase authentication settings

**Backend not being called**
- Check config.js has correct Edge Function URL
- Verify user is authenticated (check chrome.storage.local)
- Review background.js console logs

### GitHub Actions Issues

**Deployment workflow failing**
- Check `SUPABASE_ACCESS_TOKEN` is valid
- Verify `SUPABASE_PROJECT_ID` matches your project
- Review workflow logs in Actions tab

**Test workflow failing**
- Check Playwright browsers are installed
- Verify test configuration in playwright.config.js
- Review test artifacts uploaded by workflow

## Deployment Checklist

### Before Deploying Backend

- [ ] Supabase CLI installed and logged in
- [ ] Project linked (`supabase link`)
- [ ] OpenAI API key ready
- [ ] Edge Function tested locally

### Before Deploying Extension

- [ ] Backend deployed and tested
- [ ] config.js updated with correct URLs
- [ ] OAuth credentials configured
- [ ] Extension tested locally
- [ ] Screenshots and descriptions prepared

### After Deployment

- [ ] Backend Edge Function accessible
- [ ] Extension works with backend
- [ ] Authentication flow tested
- [ ] Event creation tested (with and without user API key)
- [ ] GitHub Actions workflows configured
- [ ] Documentation updated

## Rollback Procedure

### Backend Rollback

```bash
# List recent deployments
supabase functions list

# Deploy specific version (if versioned)
# Currently, Edge Functions don't support version rollback
# Best practice: Keep previous version in git and redeploy
```

### Extension Rollback

1. Go to Chrome Web Store Developer Console
2. Select your extension
3. Click "Package" tab
4. Upload previous version's zip file
5. Submit for review

## Support

- **Supabase Docs**: https://supabase.com/docs/guides/functions
- **Chrome Extension Docs**: https://developer.chrome.com/docs/extensions/
- **OpenAI API Docs**: https://platform.openai.com/docs/
- **Project Issues**: https://github.com/your-repo/issues
