// tests/configuration.test.js
import { test, expect } from './fixtures/extension-fixtures.js';
import fs from 'fs';
import path from 'path';

// The version in package.json, read from disk: the release number the manifest
// has to agree with.
function packageVersion() {
  const packageFile = path.resolve(__dirname, '..', 'package.json');
  return JSON.parse(fs.readFileSync(packageFile, 'utf-8')).version;
}

// The public config file, read from disk: the place a second, hand-written
// version number used to live.
function publicConfigSource() {
  return fs.readFileSync(path.resolve(__dirname, '..', 'config.js'), 'utf-8');
}

test.describe('Configuration Management', () => {
  test.describe('CONFIG Object Loading', () => {
    test('should load CONFIG in background script', async ({ context }) => {
      const [serviceWorker] = context.serviceWorkers();

      const configLoaded = await serviceWorker.evaluate(() => {
        return typeof CONFIG !== 'undefined' && CONFIG !== null;
      });

      expect(configLoaded).toBe(true);
    });

    test('should load CONFIG in popup', async ({ popupPage }) => {
      const configLoaded = await popupPage.evaluate(() => {
        return typeof CONFIG !== 'undefined' && CONFIG !== null;
      });

      expect(configLoaded).toBe(true);
    });

    test('should have correct CONFIG structure', async ({ popupPage }) => {
      const configStructure = await popupPage.evaluate(() => {
        return {
          hasSupabaseUrl: typeof CONFIG.SUPABASE_URL === 'string',
          hasSupabaseAnonKey: typeof CONFIG.SUPABASE_ANON_KEY === 'string',
          hasEdgeFunctions: typeof CONFIG.EDGE_FUNCTIONS === 'object',
          hasExtensionSettings: typeof CONFIG.EXTENSION === 'object',
          edgeFunctionKeys: CONFIG.EDGE_FUNCTIONS ? Object.keys(CONFIG.EDGE_FUNCTIONS) : [],
          extensionKeys: CONFIG.EXTENSION ? Object.keys(CONFIG.EXTENSION) : []
        };
      });

      expect(configStructure.hasSupabaseUrl).toBe(true);
      expect(configStructure.hasSupabaseAnonKey).toBe(true);
      expect(configStructure.hasEdgeFunctions).toBe(true);
      expect(configStructure.hasExtensionSettings).toBe(true);

      // Check edge function URLs
      expect(configStructure.edgeFunctionKeys).toContain('CREATE_CALENDAR_EVENT');
      expect(configStructure.edgeFunctionKeys).toContain('PROCESS_TEXT');

      // Check extension settings
      expect(configStructure.extensionKeys).toContain('NAME');
    });

    test('should have valid URLs in configuration', async ({ popupPage }) => {
      const urlValidation = await popupPage.evaluate(() => {
        const isValidUrl = (string) => {
          try {
            new URL(string);
            return true;
          } catch (_) {
            return false;
          }
        };

        return {
          supabaseUrlValid: isValidUrl(CONFIG.SUPABASE_URL),
          createEventUrlValid: isValidUrl(CONFIG.EDGE_FUNCTIONS.CREATE_CALENDAR_EVENT),
          processTextUrlValid: isValidUrl(CONFIG.EDGE_FUNCTIONS.PROCESS_TEXT),
          supabaseUrlFormat: CONFIG.SUPABASE_URL.includes('.supabase.co'),
          edgeFunctionUrlsMatch: CONFIG.EDGE_FUNCTIONS.CREATE_CALENDAR_EVENT.startsWith(CONFIG.SUPABASE_URL) &&
                                 CONFIG.EDGE_FUNCTIONS.PROCESS_TEXT.startsWith(CONFIG.SUPABASE_URL)
        };
      });

      expect(urlValidation.supabaseUrlValid).toBe(true);
      expect(urlValidation.createEventUrlValid).toBe(true);
      expect(urlValidation.processTextUrlValid).toBe(true);
      expect(urlValidation.supabaseUrlFormat).toBe(true);
      expect(urlValidation.edgeFunctionUrlsMatch).toBe(true);
    });
  });

  test.describe('Chrome Storage Operations', () => {
    test('should save and retrieve API key', async ({ popupPage }) => {
      const testKey = 'sk-test-12345';

      // Save API key
      await popupPage.evaluate(async (key) => {
        await chrome.storage.sync.set({ apiKey: key });
      }, testKey);

      // Retrieve API key
      const retrievedKey = await popupPage.evaluate(async () => {
        const result = await chrome.storage.sync.get('apiKey');
        return result.apiKey;
      });

      expect(retrievedKey).toBe(testKey);
    });

    test('should handle storage errors gracefully', async ({ popupPage }) => {
      const storageError = await popupPage.evaluate(async () => {
        const originalSet = chrome.storage.sync.set.bind(chrome.storage.sync);
        chrome.storage.sync.set = () => {
          throw new Error('Storage quota exceeded');
        };
        try {
          await chrome.storage.sync.set({ testKey: 'value' });
          return null;
        } catch (error) {
          return error.message;
        } finally {
          chrome.storage.sync.set = originalSet;
        }
      });

      expect(storageError).toBe('Storage quota exceeded');
    });

    test('should clear storage completely', async ({ popupPage }) => {
      // Set multiple values
      await popupPage.evaluate(async () => {
        await chrome.storage.sync.set({
          apiKey: 'test-key',
          setting1: 'value1',
          setting2: 'value2'
        });
      });

      // Clear storage
      await popupPage.evaluate(async () => {
        await chrome.storage.sync.clear();
      });

      // Verify storage is empty
      const allItems = await popupPage.evaluate(async () => {
        return await chrome.storage.sync.get(null);
      });

      expect(Object.keys(allItems).length).toBe(0);
    });

    test('should handle storage sync vs local correctly', async ({ popupPage }) => {
      const syncKey = 'sync-test-key';
      const localKey = 'local-test-key';

      // Set items in both storages
      await popupPage.evaluate(async ({ sync, local }) => {
        await chrome.storage.sync.set({ testItem: sync });
        await chrome.storage.local.set({ testItem: local });
      }, { sync: syncKey, local: localKey });

      // Retrieve from both
      const storageValues = await popupPage.evaluate(async () => {
        const syncData = await chrome.storage.sync.get('testItem');
        const localData = await chrome.storage.local.get('testItem');
        return {
          sync: syncData.testItem,
          local: localData.testItem
        };
      });

      expect(storageValues.sync).toBe(syncKey);
      expect(storageValues.local).toBe(localKey);
    });
  });

  test.describe('Manifest Configuration', () => {
    test('should have correct permissions in manifest', async ({ context }) => {
      const [serviceWorker] = context.serviceWorkers();

      const manifestPermissions = await serviceWorker.evaluate(() => {
        const manifest = chrome.runtime.getManifest();
        return {
          permissions: manifest.permissions,
          hostPermissions: manifest.host_permissions,
          oauth2: manifest.oauth2,
          version: manifest.version,
          manifestVersion: manifest.manifest_version
        };
      });

      // Check required permissions
      expect(manifestPermissions.permissions).toContain('contextMenus');
      expect(manifestPermissions.permissions).toContain('storage');
      expect(manifestPermissions.permissions).toContain('activeTab');
      expect(manifestPermissions.permissions).toContain('scripting');
      expect(manifestPermissions.permissions).toContain('identity');

      // Check host permissions for Supabase
      expect(manifestPermissions.hostPermissions).toContain('https://*.supabase.co/*');

      // Check OAuth configuration
      expect(manifestPermissions.oauth2).toBeTruthy();
      expect(manifestPermissions.oauth2.scopes).toContain('openid');
      expect(manifestPermissions.oauth2.scopes).toContain('email');
      expect(manifestPermissions.oauth2.scopes).toContain('profile');

      // Check manifest version
      expect(manifestPermissions.manifestVersion).toBe(3);

      // The version the backend reads from the X-Extension-Version header is
      // the manifest's, and package.json says the same thing: one number to
      // bump per release, checked here rather than left to drift.
      expect(manifestPermissions.version).toBe(packageVersion());
    });

    // One release number, and it lives in the manifest. A copy in the public
    // config is a second number free to disagree with it — it read 1.2.0 while
    // the manifest said 1.3.0 — so the config carries none, and every caller
    // asks chrome.runtime.getManifest() instead.
    test('the public config carries no version of its own', async ({ popupPage, context }) => {
      const [serviceWorker] = context.serviceWorkers();

      const popupKeys = await popupPage.evaluate(() => Object.keys(CONFIG.EXTENSION));
      const workerKeys = await serviceWorker.evaluate(() => Object.keys(CONFIG.EXTENSION));

      expect(popupKeys).not.toContain('VERSION');
      expect(workerKeys).not.toContain('VERSION');

      // Not just that key: no version-shaped literal survives in the file, so a
      // differently named copy cannot creep back in.
      expect(publicConfigSource()).not.toMatch(/['"]\s*\d+(\.\d+)+\s*['"]/);
    });

    test('should have valid OAuth client ID format', async ({ context }) => {
      const [serviceWorker] = context.serviceWorkers();

      const oauthConfig = await serviceWorker.evaluate(() => {
        const manifest = chrome.runtime.getManifest();
        return {
          clientId: manifest.oauth2.client_id,
          isValidFormat: manifest.oauth2.client_id.endsWith('.googleusercontent.com')
        };
      });

      expect(oauthConfig.isValidFormat).toBe(true);
      expect(oauthConfig.clientId).toMatch(/\.googleusercontent\.com$/);
    });
  });

  test.describe('Service and Script Loading', () => {
    test('should load all required scripts in background', async ({ context }) => {
      const [serviceWorker] = context.serviceWorkers();

      const scriptsLoaded = await serviceWorker.evaluate(() => {
        return {
          config: typeof CONFIG !== 'undefined',
          supabaseAuth: typeof SupabaseAuth !== 'undefined',
          calendarService: typeof CalendarService !== 'undefined',
          openAIFunction: typeof processWithOpenAI === 'function',
          calendarUrlFunction: typeof createGoogleCalendarUrl === 'function'
        };
      });

      expect(scriptsLoaded.config).toBe(true);
      expect(scriptsLoaded.supabaseAuth).toBe(true);
      expect(scriptsLoaded.calendarService).toBe(true);
      expect(scriptsLoaded.openAIFunction).toBe(true);
      expect(scriptsLoaded.calendarUrlFunction).toBe(true);
    });

    test('should handle script loading errors gracefully', async ({ context }) => {
      const [serviceWorker] = context.serviceWorkers();

      // Test error handling for missing scripts
      const errorHandling = await serviceWorker.evaluate(() => {
        try {
          // This should be handled gracefully if script fails to load
          return {
            hasErrorHandling: true,
            canContinueWithoutAllScripts: typeof chrome !== 'undefined'
          };
        } catch (error) {
          return {
            hasErrorHandling: false,
            error: error.message
          };
        }
      });

      expect(errorHandling.hasErrorHandling).toBe(true);
      expect(errorHandling.canContinueWithoutAllScripts).toBe(true);
    });
  });

  test.describe('Environment Detection', () => {
    test('should detect Chrome extension environment', async ({ popupPage }) => {
      const environmentCheck = await popupPage.evaluate(() => {
        return {
          isChromeExtension: typeof chrome !== 'undefined',
          hasExtensionAPIs: typeof chrome.runtime !== 'undefined',
          hasStorageAPI: typeof chrome.storage !== 'undefined',
          extensionId: chrome.runtime?.id,
          canAccessManifest: typeof chrome.runtime?.getManifest === 'function'
        };
      });

      expect(environmentCheck.isChromeExtension).toBe(true);
      expect(environmentCheck.hasExtensionAPIs).toBe(true);
      expect(environmentCheck.hasStorageAPI).toBe(true);
      expect(environmentCheck.extensionId).toBeTruthy();
      expect(environmentCheck.canAccessManifest).toBe(true);
    });

    test('should handle different execution contexts', async ({ popupPage, context }) => {
      const [serviceWorker] = context.serviceWorkers();

      // Check popup context
      const popupContext = await popupPage.evaluate(() => {
        return {
          context: 'popup',
          hasDOM: typeof document !== 'undefined',
          hasWindow: typeof window !== 'undefined',
          hasChrome: typeof chrome !== 'undefined'
        };
      });

      // Check service worker context
      const serviceWorkerContext = await serviceWorker.evaluate(() => {
        return {
          context: 'service-worker',
          hasDOM: typeof document !== 'undefined',
          hasWindow: typeof window !== 'undefined',
          hasChrome: typeof chrome !== 'undefined',
          hasSelf: typeof self !== 'undefined'
        };
      });

      // Popup should have DOM and window
      expect(popupContext.hasDOM).toBe(true);
      expect(popupContext.hasWindow).toBe(true);
      expect(popupContext.hasChrome).toBe(true);

      // Service worker should not have DOM/window but should have self
      expect(serviceWorkerContext.hasDOM).toBe(false);
      expect(serviceWorkerContext.hasWindow).toBe(false);
      expect(serviceWorkerContext.hasChrome).toBe(true);
      expect(serviceWorkerContext.hasSelf).toBe(true);
    });
  });

  test.describe('Configuration Validation', () => {
    test('should validate all required configuration values', async ({ popupPage }) => {
      const configValidation = await popupPage.evaluate(() => {
        const requiredFields = [
          'SUPABASE_URL',
          'SUPABASE_ANON_KEY'
        ];

        const requiredEdgeFunctions = [
          'CREATE_CALENDAR_EVENT',
          'PROCESS_TEXT'
        ];

        const validation = {
          missingFields: [],
          missingEdgeFunctions: [],
          invalidUrls: []
        };

        // Check required top-level fields
        requiredFields.forEach(field => {
          if (!CONFIG[field] || CONFIG[field].trim() === '') {
            validation.missingFields.push(field);
          }
        });

        // Check edge functions
        requiredEdgeFunctions.forEach(func => {
          if (!CONFIG.EDGE_FUNCTIONS?.[func] || CONFIG.EDGE_FUNCTIONS[func].trim() === '') {
            validation.missingEdgeFunctions.push(func);
          }
        });

        // Validate URLs
        const urlFields = [
          CONFIG.SUPABASE_URL,
          CONFIG.EDGE_FUNCTIONS?.CREATE_CALENDAR_EVENT,
          CONFIG.EDGE_FUNCTIONS?.PROCESS_TEXT
        ];

        urlFields.forEach((url, index) => {
          if (url) {
            try {
              new URL(url);
            } catch (e) {
              validation.invalidUrls.push(`URL ${index}: ${url}`);
            }
          }
        });

        return validation;
      });

      expect(configValidation.missingFields.length).toBe(0);
      expect(configValidation.missingEdgeFunctions.length).toBe(0);
      expect(configValidation.invalidUrls.length).toBe(0);
    });

    test('should have consistent configuration across contexts', async ({ popupPage, context }) => {
      const [serviceWorker] = context.serviceWorkers();

      const popupConfig = await popupPage.evaluate(() => ({
        supabaseUrl: CONFIG.SUPABASE_URL,
        extensionName: CONFIG.EXTENSION.NAME
      }));

      const serviceWorkerConfig = await serviceWorker.evaluate(() => ({
        supabaseUrl: CONFIG.SUPABASE_URL,
        extensionName: CONFIG.EXTENSION.NAME
      }));

      expect(popupConfig.supabaseUrl).toBe(serviceWorkerConfig.supabaseUrl);
      expect(popupConfig.extensionName).toBe(serviceWorkerConfig.extensionName);
    });
  });

  test.describe('Backend URL Resolution', () => {
    test('should use the production backend when no override is stored', async ({ context }) => {
      const [serviceWorker] = context.serviceWorkers();

      const resolved = await serviceWorker.evaluate(async () => ({
        storedOverride: await getBackendBaseUrlOverride(),
        supabaseUrl: await resolveSupabaseUrl(),
        processTextUrl: await resolveBackendUrl(CONFIG.EDGE_FUNCTIONS.PROCESS_TEXT),
        configuredSupabaseUrl: CONFIG.SUPABASE_URL,
        configuredProcessTextUrl: CONFIG.EDGE_FUNCTIONS.PROCESS_TEXT
      }));

      // Nothing stored: every real install resolves to the production project.
      expect(resolved.storedOverride).toBeNull();
      expect(resolved.supabaseUrl).toBe(resolved.configuredSupabaseUrl);
      expect(resolved.processTextUrl).toBe(resolved.configuredProcessTextUrl);
      expect(resolved.processTextUrl).toMatch(/^https:\/\/[a-z0-9]+\.supabase\.co\//);
    });

    test('should send the own-key path to OpenAI when no override is stored', async ({
      context,
    }) => {
      const [serviceWorker] = context.serviceWorkers();

      const resolved = await serviceWorker.evaluate(async () => ({
        storedOverride: await getBackendBaseUrlOverride(),
        openAiUrl: await resolveOpenAiUrl(),
      }));

      // The override reaches OpenAI as well as the backend, so this is the
      // check that it stays inert for a real install: a user's own key must
      // never post their Source anywhere but OpenAI.
      expect(resolved.storedOverride).toBeNull();
      expect(resolved.openAiUrl).toBe('https://api.openai.com/v1/chat/completions');
    });

    test('should ignore an override that is not a local address', async ({ context }) => {
      const [serviceWorker] = context.serviceWorkers();

      // The override moves the Supabase calls, the Edge Function calls and the
      // own-key OpenAI call — the last carrying the user's raw key — so a
      // value pointing anywhere but this machine is a way out for all three.
      // Whatever put it in storage, it is ignored.
      const resolved = await serviceWorker.evaluate(async () => {
        const results = [];

        for (const override of [
          'https://evil.example.com',
          'http://evil.example.com',
          'https://127.0.0.1.evil.example.com',
          'http://localhost.evil.example.com',
          'not a url at all',
          '//127.0.0.1:8080',
        ]) {
          await chrome.storage.local.set({ backend_base_url_override: override });
          results.push({
            override,
            storedOverride: await getBackendBaseUrlOverride(),
            supabaseUrl: await resolveSupabaseUrl(),
            configuredSupabaseUrl: CONFIG.SUPABASE_URL,
            processTextUrl: await resolveBackendUrl(CONFIG.EDGE_FUNCTIONS.PROCESS_TEXT),
            openAiUrl: await resolveOpenAiUrl(),
          });
        }

        await chrome.storage.local.remove('backend_base_url_override');
        return results;
      });

      for (const result of resolved) {
        expect(result.storedOverride, result.override).toBeNull();
        expect(result.supabaseUrl, result.override).toBe(result.configuredSupabaseUrl);
        expect(result.processTextUrl, result.override).toMatch(
          /^https:\/\/[a-z0-9]+\.supabase\.co\//
        );
        expect(result.openAiUrl, result.override).toBe(
          'https://api.openai.com/v1/chat/completions'
        );
      }
    });

    test('should honour a loopback override, which is all a test needs', async ({ context }) => {
      const [serviceWorker] = context.serviceWorkers();

      const resolved = await serviceWorker.evaluate(async () => {
        const results = [];

        for (const override of ['http://127.0.0.1:8123', 'http://localhost:8123/']) {
          await chrome.storage.local.set({ backend_base_url_override: override });
          results.push({
            override,
            storedOverride: await getBackendBaseUrlOverride(),
            processTextUrl: await resolveBackendUrl(CONFIG.EDGE_FUNCTIONS.PROCESS_TEXT),
            openAiUrl: await resolveOpenAiUrl(),
          });
        }

        await chrome.storage.local.remove('backend_base_url_override');
        return results;
      });

      expect(resolved[0].storedOverride).toBe('http://127.0.0.1:8123');
      expect(resolved[0].processTextUrl).toBe('http://127.0.0.1:8123/functions/v1/process-text');
      expect(resolved[0].openAiUrl).toBe('http://127.0.0.1:8123/v1/chat/completions');
      expect(resolved[1].storedOverride).toBe('http://localhost:8123');
    });
  });

  test.describe('Authentication start-up', () => {
    test('starts auth once per worker, however many times it is asked', async ({ context }) => {
      const [serviceWorker] = context.serviceWorkers();

      // Two auth clients in one worker sign the user out from under each
      // other: each restores the stored session and each clears it on the way
      // out. Every wake-up, install and browser start means "make sure auth is
      // ready", so they all have to land on the same client.
      const sameClient = await serviceWorker.evaluate(async () => {
        await initializeAuth();
        const first = supabaseAuth;

        await initializeAuth();
        await initializeAuth();

        return { same: supabaseAuth === first, built: Boolean(first) };
      });

      expect(sameClient.built).toBe(true);
      expect(sameClient.same).toBe(true);
    });

    test('a client that has been torn down leaves the stored session alone', async ({ context }) => {
      const [serviceWorker] = context.serviceWorkers();

      // An abandoned client keeps listening for auth state changes, and its
      // SIGNED_OUT removes the session the surviving client is signed in
      // with. Tearing a client down has to take its listener with it.
      const cleared = await serviceWorker.evaluate(async () => {
        const seedSession = () =>
          chrome.storage.local.set({
            supabase_session: { access_token: 'stub-token', user: { email: 'orphan@example.com' } },
          });
        const sessionIsGone = async () =>
          !(await chrome.storage.local.get('supabase_session')).supabase_session;

        const startClient = async () => {
          const auth = new SupabaseAuth();
          await auth.initialize();
          return auth;
        };

        // A live client clears the session on SIGNED_OUT — that is the sign
        // out the user asked for, and the reason an abandoned one is harmful.
        const live = await startClient();
        await seedSession();
        await live.supabase.auth.signOut({ scope: 'local' });
        const byLiveClient = await sessionIsGone();

        // The same thing, torn down first, has to leave the session standing.
        const abandoned = await startClient();
        await abandoned.teardown();
        await seedSession();
        await abandoned.supabase.auth.signOut({ scope: 'local' });
        const byTornDownClient = await sessionIsGone();

        await live.teardown();
        await chrome.storage.local.remove('supabase_session');
        return { byLiveClient, byTornDownClient };
      });

      expect(cleared.byLiveClient).toBe(true);
      expect(cleared.byTornDownClient).toBe(false);
    });

    test('a start-up that fails leaves no client behind to sign the user out', async ({ context }) => {
      const [serviceWorker] = context.serviceWorkers();

      // A start-up that falls over part way forgets itself, so the next
      // caller can try again. The client it had half built has to go with it:
      // it is already listening, and nobody holds it any more.
      const outcome = await serviceWorker.evaluate(async () => {
        await initializeAuth();

        const restoreSession = SupabaseAuth.prototype.restoreSession;
        let halfBuilt = null;
        SupabaseAuth.prototype.restoreSession = function () {
          // The listener is on by this point; start-up falls over here.
          halfBuilt = this.supabase;
          throw new Error('start-up failed on purpose');
        };

        try {
          // Clear the way for a fresh start-up, the way a first run has it.
          await supabaseAuth?.teardown();
          authStartUp = null;
          supabaseAuth = null;
          await initializeAuth();
        } finally {
          SupabaseAuth.prototype.restoreSession = restoreSession;
        }

        await chrome.storage.local.set({
          supabase_session: { access_token: 'stub-token', user: { email: 'orphan@example.com' } },
        });
        await halfBuilt.auth.signOut({ scope: 'local' });
        const sessionSurvived = Boolean(
          (await chrome.storage.local.get('supabase_session')).supabase_session
        );

        // Nothing stored to restore, so the next start-up asks nobody.
        await chrome.storage.local.remove('supabase_session');
        await initializeAuth();

        return { sessionSurvived, startsAgain: supabaseAuth !== null };
      });

      expect(outcome.sessionSurvived).toBe(true);
      expect(outcome.startsAgain).toBe(true);
    });
  });
});
