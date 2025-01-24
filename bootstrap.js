/* eslint no-var: 2, prefer-const: 2 */
/* exported install uninstall startup shutdown */
"use strict";

const { classes: Cc, interfaces: Ci, utils: Cu } = Components;
const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");

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
  const { DefaultPreferencesLoader } = ChromeUtils.importESModule("chrome://savedpasswordeditor/content/defaultPreferencesLoader.mjs");
  try {
    var loader = new DefaultPreferencesLoader();
    loader.parseUri(
      "chrome://_savedpasswordeditor/content/defaults/preferences/prefs.js");
  } catch (ex) { }

  const { ChromeManifest } = ChromeUtils.importESModule("chrome://savedpasswordeditor/content/ChromeManifest.mjs");
  const { Overlays } = ChromeUtils.importESModule("chrome://savedpasswordeditor/content/Overlays.mjs");

  const window = Services.wm.getMostRecentWindow('navigator:browser');
  if (reason === ADDON_UPGRADE || reason === ADDON_DOWNGRADE) {
    showRestartNotification("upgraded", window);
    return;
  }
  
  const chromeManifest = new ChromeManifest(() => {
    return man;
  }, options);
  await chromeManifest.parse();

  if (reason === ADDON_INSTALL || (reason === ADDON_ENABLE && !window.document.getElementById('savedpasswordeditor-command-opensavedpasswords'))) {
    const enumerator = Services.wm.getEnumerator(null);
    while (enumerator.hasMoreElements()) {
      const win = enumerator.getNext();
      if (win.document.createXULElement) {
        Overlays.load(chromeManifest, win.document.defaultView);
      }
    }
  }

  const documentObserver = {
    observe(document) {
      if (document.createXULElement) {
        Overlays.load(chromeManifest, document.defaultView);
      }
    }
  };
  Services.obs.addObserver(documentObserver, "chrome-document-loaded");

  AddonManager.getAddonByID(data.id).then(addon => {
    Services.prefs.getBoolPref("extensions.savedpasswordeditor.hide_warning") ?
      addon.__AddonInternal__.signedState = AddonManager.SIGNEDSTATE_NOT_REQUIRED
      : addon.__AddonInternal__.signedState = AddonManager.SIGNEDSTATE_MISSING;
    }
  );
}

function shutdown(data, reason) {
  const window = Services.wm.getMostRecentWindow('navigator:browser');
  if (reason === ADDON_DISABLE) {
    showRestartNotification("disabled", window);
  } else if (reason === ADDON_UNINSTALL) {
    showRestartNotification("uninstalled", window);
  }
}
