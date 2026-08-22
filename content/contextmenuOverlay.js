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

function contextMenuLoadHandler () {
    const prefix = "savedpasswordeditor-";

    const contextshowingHandler = {
      receiveMessage ({ data }) {
        SavedPasswordEditor.updateLoginInfo(data);
        ["ctxmenuseparator", "savelogininfo", "editlogininfo", "deletelogininfo"].forEach(id => {
          document.getElementById(prefix + id).hidden = !data;
        });
      },
    };

    window.messageManager.addMessageListener(
      "SavedPasswordEditor:contextshowing", contextshowingHandler);
    Overlay.addCleanup(() => window.messageManager.removeMessageListener(
      "SavedPasswordEditor:contextshowing", contextshowingHandler));
}

window.addEventListener("load", contextMenuLoadHandler, { once: true });
Overlay.addCleanup(() => window.removeEventListener("load", contextMenuLoadHandler));
