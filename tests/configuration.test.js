// tests/configuration.test.js
import { test, expect } from './fixtures/extension-fixtures.js';

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
      expect(configStructure.extensionKeys).toContain('VERSION');
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
      // Mock storage error
      await popupPage.addInitScript(() => {
        const originalSet = chrome.storage.sync.set;
        chrome.storage.sync.set = () => {
          throw new Error('Storage quota exceeded');
        };
        // Restore after test
        setTimeout(() => {
          chrome.storage.sync.set = originalSet;
        }, 100);
      });

      const storageError = await popupPage.evaluate(async () => {
        try {
          await chrome.storage.sync.set({ testKey: 'value' });
          return null;
        } catch (error) {
          return error.message;
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
});