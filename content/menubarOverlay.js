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

{
  let shortcutKey, shortcutKeycode, shortcutModifiers;
  const prefs =
    Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService)
    .getBranch("extensions.savedpasswordeditor.");

  const observe = (aSubject, aTopic, aData) => {
    if (aData.startsWith("opensp")) {
      const keyObj = document.getElementById("savedpasswordeditor-key-opensavedpasswords");
      const miObj = document.getElementById("savedpasswordeditor-toolsmenuitem");
      const key = prefs.getCharPref("openspkey");
      const keyMods = prefs.getCharPref("openspkeymodifiers");

      if (key.length <= 1) {
        shortcutKey = key;
        shortcutKeycode = 0;
        keyObj.setAttribute("keycode", "");
        keyObj.setAttribute("key", key);
      } else {
        shortcutKey = "";
        shortcutKeycode = prefs.getIntPref("openspkeycode");
        keyObj.setAttribute("key", "");
        keyObj.setAttribute("keycode", "VK_" + key);
      }
      keyObj.setAttribute("modifiers", keyMods);
      miObj.setAttribute("acceltext", "");
      miObj.removeAttribute("acceltext");

      const keyElemModList = keyMods.replace(" ", ",").split(",");
      shortcutModifiers =
        [["control", "ctrlKey"], ["alt", "altKey"], ["meta", "metaKey"], ["shift", "shiftKey"]]
          .map(([name, property]) => [property, keyElemModList.indexOf(name) != -1]);
    }
  };

  const prefObserver = { observe };
  prefs.addObserver("", prefObserver, false);

  function keypressHandler (evt) {
      if (shortcutKeycode != 0 ?
        evt.keyCode != shortcutKeycode
        : String.fromCharCode(evt.charCode) != shortcutKey)
        return;

      if (!shortcutModifiers.every(e => evt[e[0]] == e[1])) return;
      document.getElementById(
        "savedpasswordeditor-command-opensavedpasswords").doCommand();
  }

  window.addEventListener("keypress", keypressHandler, false);

  function init_menuitemDynamic() {
      function menuitemDynamic (id) {
        const mi = document.getElementById(id);
        const renameTo = prefs.getStringPref("rename_menuitem_to");

        if (renameTo) {
          mi.setAttribute("label", renameTo);
          mi.removeAttribute("tooltiptext");
          mi.removeAttribute("accesskey");
          mi.setAttribute("style", "list-style-image:none;");
        } else {
          mi.setAttribute("label", mi.getAttribute("standardlabel"));
          mi.setAttribute(
            "tooltiptext", mi.getAttribute("standardtooltiptext"));
          mi.setAttribute("accesskey", mi.getAttribute("standardaccesskey"));
          mi.removeAttribute("style");
        }
        mi.hidden = !prefs.getBoolPref("display_menuitem");
      }

      function registerDynamic(popup, id) {
        if (!popup) return;
        const handler = () => menuitemDynamic(id);
        popup.addEventListener("popupshowing", handler, false);
        Overlay.addCleanup(() => popup.removeEventListener("popupshowing", handler, false));
      }

      observe(null, null, "opensp");

      registerDynamic(document.getElementById("menu_ToolsPopup"), "savedpasswordeditor-toolsmenuitem");
      registerDynamic(document.getElementById("taskPopup"), "savedpasswordeditor-toolsmenuitem");
      registerDynamic(document.getElementById("appmenu-popup"), "savedpasswordeditor-appmenuitem");
  }

  window.addEventListener("load", init_menuitemDynamic, { once: true });
  Overlay.addCleanup(() => {
    prefs.removeObserver("", prefObserver);
    window.removeEventListener("keypress", keypressHandler, false);
    window.removeEventListener("load", init_menuitemDynamic);
  });
}
