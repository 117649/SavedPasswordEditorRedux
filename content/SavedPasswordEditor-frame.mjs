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

const htmlNamespaceResolver =
  aPrefix => aPrefix == "xhtml" ? "http://www.w3.org/1999/xhtml" : null;

export function extractLoginForm (form, aWindow = form.ownerDocument.defaultView) {
  const HTMLInputElement = aWindow.HTMLInputElement;
  var passwordField = null;
  for (var i = 0; i < form.elements.length; i++) {
    let element = form.elements[i];
    if (element instanceof HTMLInputElement && element.type.toLowerCase() == "password") {
      passwordField = element;
      break;
    }
  }
  if (!passwordField) return null;

  var usernameField = null;
  for (i = i - 1; i >= 0; i--) {
    let element = form.elements[i];
    if (!(element instanceof HTMLInputElement)) continue;
    let elType = (element.getAttribute("type") || "").toLowerCase();
    if (!elType || elType == "text" || elType == "email" || elType == "url" || elType == "tel" || elType == "number") {
      usernameField = element;
      break;
    }
  }
  if (!usernameField) return null;

  var hostname = `${aWindow.location.protocol}//${aWindow.location.host}`;
  var formAction = form.action;
  var res;
  if (formAction && formAction.startsWith("javascript:")) res = "javascript:";
  else {
    res = formAction ? /^([0-9-_A-Za-z]+:\/\/[^/]+)\//.exec(formAction) : [ null, hostname ];
    if (!res) return null;
    res = res[1];
  }

  return { hostname, formSubmitURL: res, usernameField, passwordField };
}

export var SavedPasswordEditor = {
  getFormData (aElement) {
    const HTMLInputElement =
      aElement.ownerDocument.defaultView.HTMLInputElement;

    if (!(aElement instanceof HTMLInputElement) || !aElement.form) return null;

    const data = extractLoginForm(aElement.form, aElement.ownerDocument.defaultView);
    if (!data) return null;

    return {
      hostname: data.hostname,
      formSubmitURL: data.formSubmitURL,
      username: data.usernameField.value,
      password: data.passwordField.value,
      usernameField: data.usernameField.name,
      passwordField: data.passwordField.name,
    };
  },

  scanForLoginForms ({ target: aMM }) {
    const HTMLDocument = aMM.content.HTMLDocument;

    function walkTree (aWindow) {
      var curDoc = aWindow.document;
      if (!HTMLDocument.isInstance(curDoc)) return [];

      // Locate likely login forms and their fields
      var loginForms = [];
      var forms = curDoc.evaluate(
        "//xhtml:form", curDoc, htmlNamespaceResolver,
        aWindow.XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      for (var i = 0; i < forms.snapshotLength; i++) {
        let data = extractLoginForm(forms.snapshotItem(i), aWindow);
        if (!data) continue;

        loginForms.push({
          hostname: data.hostname, formSubmitURL: data.formSubmitURL,
          username: data.usernameField.value, password: data.passwordField.value,
          usernameField: data.usernameField.getAttribute("name"),
          passwordField: data.passwordField.getAttribute("name"),
        });
      }

      // See if any frame or iframe contains a login form
      var frames = aWindow.frames;
      for (var i = 0; i < frames.length; i++) {
        loginForms.push(...walkTree(frames[i]));
      }

      return loginForms;
    }

    aMM.sendAsyncMessage(
      "SavedPasswordEditor:loginformsresults", walkTree(aMM.content));
  },
};
