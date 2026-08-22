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

function toolbarLoadHandler () {
    const btnId = "savedpasswordeditor-button";
    const btnPos = {
      "navigator:browser": [["nav-bar", null],],
      "mail:3pane": [["mail-bar3", "button-appmenu"],
                     ["msgToolbar", "throbber-box"],],
      "msgcompose": [["composeToolbar2", null],
                     ["composeToolbar", "throbber-box"],],
    };
    const wtype = document.documentElement.getAttribute("windowtype");

    if (!(wtype in btnPos)) return;

    const prefName = "extensions.savedpasswordeditor.addedButtonTo";
    const prefs =
      Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("");
    const addedButtonTo = prefs.prefHasUserValue(prefName) ? prefs.getCharPref(prefName).split(",") : [];
    if (addedButtonTo.includes(wtype)) return;

    const btn = document.getElementById(btnId);
    if (document.getElementById("PanelUI-menu-button")) {
      /* Australis */

      if (!btn || btn.parentNode.place == "palette") CustomizableUI.addWidgetToArea(btnId, "nav-bar");
    } else {
      /* Old-style toolbar */

      let toolbar, before;
      for (const [tbId, beforeId] of btnPos[wtype]) {
        toolbar = document.getElementById(tbId);
        if (!toolbar) continue;
        before = beforeId ? document.getElementById(beforeId) : null;
        break;
      }

      if (!toolbar) return;

      if (!btn || btn.parentNode.tagName == "toolbarpalette") {
        toolbar.insertItem(btnId, before);
        toolbar.setAttribute("currentset", toolbar.currentSet);
        document.persist(toolbar.id, "currentset");
      }
    }

    addedButtonTo.push(wtype);
    prefs.setCharPref(prefName, addedButtonTo.join(","));
}

window.addEventListener("load", toolbarLoadHandler, { once: true });
Overlay.addCleanup(() => window.removeEventListener("load", toolbarLoadHandler));
