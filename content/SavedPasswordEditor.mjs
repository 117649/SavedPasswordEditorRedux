/*
    Saved Password Editor, extension for Gecko applications
    Copyright (C) 2016  Daniel Dawson <danielcdawson@gmail.com>

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

"use strict";

const Cc = Components.classes,
      Ci = Components.interfaces,
      Cu = Components.utils;
var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

const lazy = {};
ChromeUtils.defineLazyGetter(
  lazy, "prefs", () =>
    Cc["@mozilla.org/preferences-service;1"].
      getService(Ci.nsIPrefService).
      getBranch("extensions.savedpasswordeditor."));
XPCOMUtils.defineLazyServiceGetter(
  lazy, "pwdSvc",
  "@mozilla.org/login-manager;1", Ci.nsILoginManager);
XPCOMUtils.defineLazyServiceGetter(
  lazy, "stringSvc",
  "@mozilla.org/intl/stringbundle;1", Ci.nsIStringBundleService);
XPCOMUtils.defineLazyServiceGetter(
  lazy, "alertsSvc",
  "@mozilla.org/alerts-service;1", Ci.nsIAlertsService);
XPCOMUtils.defineLazyServiceGetter(
  lazy, "promptSvc",
  "@mozilla.org/embedcomp/prompt-service;1", Ci.nsIPromptService);
ChromeUtils.defineLazyGetter(
  lazy, "genStrBundle", () =>
    lazy.stringSvc.createBundle(
      "chrome://savedpasswordeditor/locale/spe.properties"));
ChromeUtils.defineLazyGetter(
  lazy, "pmoStrBundle", () =>
    lazy.stringSvc.createBundle(
      "chrome://savedpasswordeditor/locale/pwdmgrOverlay.properties"));

const el = (aWindow, aId) => aWindow.document.getElementById(aId);

function showAlert (aMsg) {
  lazy.alertsSvc.showAlertNotification(
    "chrome://savedpasswordeditor/skin/key32.png",
    lazy.genStrBundle.GetStringFromName("savedpasswordeditor"), aMsg);
}

export var SavedPasswordEditor = {
  _deleting: false,
  _signonMap: {},

  openSavedPasswords: function () {
    var spWin = Cc["@mozilla.org/appshell/window-mediator;1"].
                  getService(Ci.nsIWindowMediator).
                  getMostRecentWindow("Toolkit:PasswordManager");
    if (spWin)
      spWin.focus();
    else
      Cc["@mozilla.org/embedcomp/window-watcher;1"].
        getService(Ci.nsIWindowWatcher).
        openWindow(
          null, "chrome://savedpasswordeditor/content/passwordmgr/passwordManager.xhtml", "",
          "chrome,titlebar,toolbar,centerscreen,resizable", null);
  },

  updateLoginInfo (aLoginInfo) {
    this.curInfo = aLoginInfo;
  },

  saveLoginInfo: function (aWindow, aEvt) {
    function _finish (aNewSignon) {
      if (!aNewSignon) return;
      try {
        let newSignon = Cc["@mozilla.org/login-manager/loginInfo;1"].
                        createInstance(Ci.nsILoginInfo);
        newSignon.init(aNewSignon.hostname, aNewSignon.formSubmitURL,
                       aNewSignon.httpRealm, aNewSignon.username,
                       aNewSignon.password, aNewSignon.usernameField,
                       aNewSignon.passwordField);
        lazy.pwdSvc.addLogin(newSignon);
        showAlert(lazy.genStrBundle.GetStringFromName("logininfosaved"));
      } catch (e) {
        lazy.promptSvc.alert(
          aWindow,
          lazy.genStrBundle.GetStringFromName("error"),
          lazy.pmoStrBundle.formatStringFromName("badnewentry", [e.message], 1));
      }
    }

    var ret = { newSignon: null, callback: _finish, parentWindow: null };
    aWindow.openDialog(
      "chrome://savedpasswordeditor/content/pwdedit.xhtml", "",
      "centerscreen,dependent,dialog,chrome",
      [this.curInfo], 0, false, ret);
    this.curInfo = null;
  },

  _finishEdit: function (aNewSignon, aParentWindow) {
    if (!aNewSignon) return;

    var newSignon = Cc["@mozilla.org/login-manager/loginInfo;1"].
                    createInstance(Ci.nsILoginInfo);
    newSignon.init(aNewSignon.hostname, aNewSignon.formSubmitURL,
                   aNewSignon.httpRealm, aNewSignon.username,
                   aNewSignon.password, aNewSignon.usernameField,
                   aNewSignon.passwordField);
    try {
      lazy.pwdSvc.modifyLogin(SavedPasswordEditor.oldSignon, newSignon);
      showAlert(lazy.genStrBundle.GetStringFromName("logininfochanged"));
    } catch (e) {
      lazy.promptSvc.alert(
        aParentWindow,
        lazy.genStrBundle.GetStringFromName("error"),
        lazy.genStrBundle.formatStringFromName("failed", [e.message], 1));
    }
  },

  _handleDisambigSelection: function (aEvt) {
    var spe = SavedPasswordEditor, target = aEvt.target,
        window = target.ownerDocument.defaultView,
        dp = el(window, "savedpasswordeditor-disambig-popup");

    if (spe._deleting) {
      try {
        lazy.pwdSvc.removeLogin(spe._signonMap[target.label]);
        showAlert(lazy.genStrBundle.GetStringFromName("logininfodeleted"));
      } catch (e) {
        lazy.promptSvc.alert(
          window,
          lazy.genStrBundle.GetStringFromName("error"),
          lazy.genStrBundle.formatStringFromName("failed", [e.message], 1));
      }
    } else {
      SavedPasswordEditor.oldSignon = spe._signonMap[target.label];
      window.openDialog(
        "chrome://savedpasswordeditor/content/pwdedit.xhtml", "",
        "centerscreen,dependent,dialog,chrome",
        [SavedPasswordEditor.oldSignon], 1, false,
        { newSignon: null, callback: spe._finishEdit, parentWindow: window });
    }

    spe._deleting = false;
  },

  _showDisambig: function (aWindow, aSignons) {
    var dp = el(aWindow, "savedpasswordeditor-disambig-popup");
    while (dp.hasChildNodes()) dp.removeChild(dp.firstChild);

    this._signonMap = {};
    for (let signon of aSignons) {
      this._signonMap[signon.username] = signon;
      let mi = aWindow.document.createElement("menuitem");
      mi.setAttribute("label", signon.username);
      dp.appendChild(mi);
    }

    dp.addEventListener("command", this._handleDisambigSelection, false);
    var spe = this;
    dp.addEventListener(
      "popuphidden",
      function _phHandler () {
        dp.removeEventListener("command", spe._handleDisambigSelection, false);
        dp.removeEventListener("popuphidden", _phHandler, false);
      },
      false);

    var bo = el(aWindow, "contentAreaContextMenu").boxObject,
        x = bo.x, y = bo.y;
    aWindow.setTimeout(
      function () { dp.openPopup(null, null, x, y, true, false, null); }, 1);
  },

  editLoginInfo: function (aWindow) {
    var signons = lazy.pwdSvc.findLogins({}, this.curInfo.hostname,
                                    this.curInfo.formSubmitURL, null);
    this.curInfo = null;
    this._deleting = false;

    if (signons.length == 0) {
      lazy.promptSvc.alert(
        aWindow,
        lazy.genStrBundle.GetStringFromName("error"),
        lazy.genStrBundle.GetStringFromName("nologinstoedit"));
    } else if (signons.length == 1) {
      SavedPasswordEditor.oldSignon = signons[0];
      aWindow.openDialog(
        "chrome://savedpasswordeditor/content/pwdedit.xhtml", "",
        "centerscreen,dependent,dialog,chrome",
        [signons[0]], 1, false,
        { newSignon: null, callback: this._finishEdit,
          parentWindow: aWindow });
    } else
      this._showDisambig(aWindow, signons);
  },

  deleteLoginInfo: function (aWindow) {
    var signons = lazy.pwdSvc.findLogins({}, this.curInfo.hostname,
                                    this.curInfo.formSubmitURL, null);
    this.curInfo = null;
    this._deleting = true;

    if (signons.length == 0) {
      lazy.promptSvc.alert(
        aWindow,
        lazy.genStrBundle.GetStringFromName("error"),
        lazy.genStrBundle.GetStringFromName("nologinstodelete"));
    } else if (signons.length == 1) {
      try {
        let res;
        if (prefs.getBoolPref("confirm_ctxmenu_delete")) {
          let cs = { value: false };
          res = lazy.promptSvc.confirmEx(
            aWindow, lazy.genStrBundle.GetStringFromName("deletinglogininfo"),
            lazy.genStrBundle.GetStringFromName("deletingareyousure"),
            lazy.promptSvc.STD_YES_NO_BUTTONS | lazy.promptSvc.BUTTON_POS_1_DEFAULT
            | lazy.promptSvc.BUTTON_DELAY_ENABLE, null, null, null,
            lazy.genStrBundle.GetStringFromName("deletingdontask"), cs);
          if (res == 0 && cs.value)
            lazy.prefs.setBoolPref("confirm_ctxmenu_delete", false);
        } else
          res = 0;

        if (res == 0) {
          lazy.pwdSvc.removeLogin(signons[0]);
          showAlert(lazy.genStrBundle.GetStringFromName("logininfodeleted"));
        }
      } catch (e) {
        lazy.promptSvc.alert(
          aWindow,
          lazy.genStrBundle.GetStringFromName("error"),
          lazy.genStrBundle.formatStringFromName("failed", [e.message], 1));
      }
    } else
      this._showDisambig(aWindow, signons);
  },
};
