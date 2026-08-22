/* eslint no-var: 2, prefer-const: 2 */
/* exported install uninstall startup shutdown */
"use strict";

const { classes: Cc, interfaces: Ci, utils: Cu } = Components;
const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
const cacheToken = Math.random();

const appinfo = Services.appinfo;
const options = {
  application: appinfo.ID,
  appversion: appinfo.version,
  platformversion: appinfo.platformVersion,
  os: appinfo.OS,
  osversion: Services.sysinfo.getProperty("version"),
  abi: appinfo.XPCOMABI
};

const man = `
# What goes where
## Firefox browser windows
overlay chrome://browser/content/browser.xhtml chrome://savedpasswordeditor/content/browserMenubarOverlay.xhtml
overlay chrome://browser/content/browser.xhtml chrome://savedpasswordeditor/content/toolbarOverlay.xhtml
overlay chrome://browser/content/browser.xhtml chrome://savedpasswordeditor/content/contextmenuOverlay.xhtml

# Additional styles
## Toolbar button
style chrome://browser/content/browser.xhtml chrome://savedpasswordeditor/skin/overlay.css
`;

const sandboxes = Services.wm.getMostRecentWindow('navigator:browser')?.UC.sandboxes ?? new WeakMap();
const overlays = new Map();
let chromeManifest, Overlays, SavedPasswordEditor, frameScript, observing;

async function loadWindow(window) {
  const location = window.location.href;
  if (!window.document.createXULElement || overlays.has(window) ||
      (!chromeManifest.overlay.has(location) && !chromeManifest.style.has(location))) return;

  window.SavedPasswordEditorRuntime = cacheToken;
  const overlay = Overlays.load(chromeManifest, window);
  window.Overlay = overlay;
  window.SavedPasswordEditor = SavedPasswordEditor;
  overlays.set(window, overlay);
  overlay.addCleanup(() => {
    overlays.delete(window);
    if (window.Overlay == overlay) delete window.Overlay;
    if (window.SavedPasswordEditor == SavedPasswordEditor) delete window.SavedPasswordEditor;
    if (window.SavedPasswordEditorRuntime == cacheToken) { delete window.SavedPasswordEditorRuntime; }
  });
  try { await overlay.ready; } catch (ex) {
    overlay.unload();
    throw ex;
  }
}

const documentObserver = { observe(document) { loadWindow(document.defaultView).catch(Cu.reportError); } };

function showRestartNotification(verb, window) {
  window.PopupNotifications._currentNotifications.shift();
  window.PopupNotifications.show(
    window.gBrowser.selectedBrowser,
    'addon-install-restart',
    'Saved Password Editor Redux' + verb + ', but a restart is required to ' + (verb == 'upgraded' || verb == 're-enabled' ? 'enable' : 'remove') + ' add-on functionality.',
    'addons-notification-icon',
    {
      label: 'Restart Now',
      accessKey: 'R',
      callback() {
        let cancelQuit = Cc['@mozilla.org/supports-PRBool;1'].createInstance(Ci.nsISupportsPRBool);
        Services.obs.notifyObservers(cancelQuit, 'quit-application-requested', 'restart');

        if (cancelQuit.data)
          return;

        if (Services.appinfo.inSafeMode)
          Services.startup.restartInSafeMode(Ci.nsIAppStartup.eAttemptQuit);
        else
          Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit | Ci.nsIAppStartup.eRestart);
      }
    },
    [{
      label: 'Not Now',
      accessKey: 'N',
      callback: () => { },
    }],
    {
      popupIconURL: 'chrome://savedpasswordeditor/skin/addon-install-restart.svg',
      persistent: false,
      hideClose: true,
      timeout: Date.now() + 30000,
      removeOnDismissal: true
    }
  );
}

function install(data, reason) {

}

function uninstall() { }

async function startup(data, reason) {
  const updating = reason === ADDON_UPGRADE || reason === ADDON_DOWNGRADE;
  if (reason !== APP_STARTUP) {
    for (const browserWindow of Services.wm.getEnumerator('navigator:browser')) {
      const command = browserWindow.document.getElementById('savedpasswordeditor-command-opensavedpasswords');
      if (
        updating ? command && !browserWindow.SavedPasswordEditorRuntime : command || browserWindow.SavedPasswordEditorRuntime
      ) {
        showRestartNotification(
          updating ? "upgraded" : "re-enabled",
          Services.wm.getMostRecentWindow('navigator:browser') || browserWindow);
        return;
      }
    }
  }

  try {
    const { DefaultPreferencesLoader } =
      ChromeUtils.importESModule("chrome://savedpasswordeditor/content/defaultPreferencesLoader.mjs");
    try {
      const loader = new DefaultPreferencesLoader();
      loader.parseUri("chrome://_savedpasswordeditor/content/defaults/preferences/prefs.js");
    } catch (ex) { }

    const { ChromeManifest } = ChromeUtils.importESModule("chrome://savedpasswordeditor/content/ChromeManifest.mjs");
    ({ Overlays } = ChromeUtils.importESModule("chrome://savedpasswordeditor/content/Overlays.mjs"));
    const updatedOverlays =
      ChromeUtils.importESModule(`chrome://savedpasswordeditor/content/Overlays.mjs?${cacheToken}`).Overlays;
    Overlays.prototype.sandboxes = sandboxes;
    updatedOverlays.prototype.sandboxes = sandboxes;
    Overlays.load = updatedOverlays.load;
    ({ SavedPasswordEditor } =
      ChromeUtils.importESModule(`chrome://savedpasswordeditor/content/SavedPasswordEditor.mjs?${cacheToken}`));

    chromeManifest = new ChromeManifest(() => man, options);
    await chromeManifest.parse();

    frameScript = "data:application/javascript," + encodeURIComponent(`
{
const uri = "chrome://savedpasswordeditor/content/SavedPasswordEditor-frame.mjs";
Object.assign(
  ChromeUtils.importESModule(uri).SavedPasswordEditor,
  ChromeUtils.importESModule(uri + "?${cacheToken}").SavedPasswordEditor);
Services.scriptloader.loadSubScript("chrome://savedpasswordeditor/content/frame-script.js", this);
}
`);
    Services.mm.loadFrameScript(frameScript, true);

    Services.obs.addObserver(documentObserver, "chrome-document-loaded");
    observing = true;

    if (reason !== APP_STARTUP) { await Promise.all([...Services.wm.getEnumerator('navigator:browser')].map(loadWindow)); }

    AddonManager.getAddonByID(data.id).then(addon => {
      addon.__AddonInternal__.signedState =
        Services.prefs.getBoolPref("extensions.savedpasswordeditor.hide_warning")
          ? AddonManager.SIGNEDSTATE_NOT_REQUIRED
          : AddonManager.SIGNEDSTATE_MISSING;
    });
  } catch (ex) {
    await shutdown(data, ADDON_UPGRADE);
    throw ex;
  }
}

async function shutdown(data, reason) {
  if (reason === ADDON_UPGRADE || reason === ADDON_DOWNGRADE) {
    if (observing) {
      Services.obs.removeObserver(documentObserver, "chrome-document-loaded");
      observing = false;
    }
    if (frameScript) {
      Services.mm.removeDelayedFrameScript(frameScript);
      Services.mm.broadcastAsyncMessage("SavedPasswordEditor:shutdown");
      frameScript = null;
    }
    await Promise.all([...overlays.values()].map(overlay => {
      overlay.unload();
      return overlay.ready.catch(() => {});
    }));
    for (const win of Services.wm.getEnumerator(null)) {
      if (win.location?.href.startsWith("chrome://savedpasswordeditor/")) win.close();
    }
    return;
  }

  const window = Services.wm.getMostRecentWindow('navigator:browser');
  if (reason === ADDON_DISABLE) {
    showRestartNotification("disabled", window);
  } else if (reason === ADDON_UNINSTALL) {
    showRestartNotification("uninstalled", window);
  }
}
