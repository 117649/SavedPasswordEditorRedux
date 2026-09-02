/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/** * =================== SAVED SIGNONS CODE =================== ***/
/* eslint-disable-next-line no-var */
var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
var { LoginList } = ChromeUtils.importESModule("chrome://savedpasswordeditor/content/passwordmgr/LoginList.mjs");
var { LoginOperations } = ChromeUtils.importESModule("chrome://savedpasswordeditor/content/LoginEditing.mjs");
/* eslint-disable-next-line no-var */

ChromeUtils.defineESModuleGetters(
  this,
  {DeferredTask:
  "resource://gre/modules/DeferredTask.sys.mjs",
  PlacesUtils:
  "resource://gre/modules/PlacesUtils.sys.mjs"}
);

let showingPasswords = false;
let signonState = new LoginList();

// Elements that would be used frequently
let filterField;
let togglePasswordsButton;
let signonsIntro;
let removeButton;
let removeAllButton;
let signonsTree;

let signonReloadDisplay = {
  async observe(subject, topic, data) {
    if (topic == "passwordmgr-storage-changed") {
      switch (data) {
        case "addLogin":
        case "modifyLogin":
        case "removeLogin":
        case "removeAllLogins":
          if (!signonsTree) {
            return;
          }
          signonState.replace([]);
          await LoadSignons();
          // apply the filter if needed
          if (filterField && filterField.value != "") {
            await FilterPasswords();
          }
          signonsTree.ensureRowIsVisible(
            signonsTree.view.selection.currentIndex
          );
          break;
      }
      Services.obs.notifyObservers(null, "passwordmgr-dialog-updated");
    }
  },
};

window.addEventListener("load", Startup, false);
window.addEventListener("unload", Shutdown, false);

// Formatter for localization.
let dateFormatter = new Services.intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
});
let dateAndTimeFormatter = new Services.intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

async function Startup() {
  // be prepared to reload the display if anything changes
  Services.obs.addObserver(signonReloadDisplay, "passwordmgr-storage-changed");

  signonsTree = document.getElementById("signonsTree");
  filterField = document.getElementById("filter");
  togglePasswordsButton = document.getElementById("togglePasswords");
  signonsIntro = document.getElementById("signonsIntro");
  removeButton = document.getElementById("removeSignon");
  removeAllButton = document.getElementById("removeAllSignons");

  togglePasswordsButton.label = "Show Passwords";
  togglePasswordsButton.accessKey = "P";
  signonsIntro.textContent = "Logins for the following sites are stored on your computer";
  removeAllButton.label = "Remove All";
  removeAllButton.accessKey = "A";

  if (Services.policies && !Services.policies.isAllowed("passwordReveal")) {
    togglePasswordsButton.hidden = true;
  }

  filterField.addEventListener("input", FilterPasswords, false);
  signonsTree.addEventListener("keypress", HandleSignonKeyPress, false);
  signonsTree.addEventListener("select", SignonSelected, false);

  removeButton.addEventListener("command", DeleteSignon, false);
  removeAllButton.addEventListener("command", DeleteAllSignons, false);
  togglePasswordsButton.addEventListener("command", TogglePasswordVisible, false);
  
  document.querySelector('key[keycode="VK_ESCAPE"]').addEventListener("command", escapeKeyHandler, false);
  document.querySelector('key[key="w"]').addEventListener("command", escapeKeyHandler, false);
  document.querySelector('key[key="f"]').addEventListener("command", FocusFilterBox, false);
  document.querySelector('key[key="k"]').addEventListener("command", FocusFilterBox, false);

  document.getElementById("signonsTreeContextMenu").addEventListener("popupshowing", UpdateContextMenu, false);
  document.getElementById("context-copysiteurl").addEventListener("command", CopySiteUrl, false);
  document.getElementById("context-launchsiteurl").addEventListener("command", LaunchSiteUrl, false);
  document.getElementById("context-copyusername").addEventListener("command", CopyUsername, false);
  document.getElementById("context-copypassword").addEventListener("command", CopyPassword, false);
  document.getElementById("context-editusername").addEventListener("command", _ => EditCellInSelectedRow("username"), false);
  document.getElementById("context-editpassword").addEventListener("command", _ => EditCellInSelectedRow("password"), false);

  document.getElementById("edit_signon").addEventListener("command", _ => spEditor.editSignon(), false);
  document.getElementById("clone_signon").addEventListener("command", _ => spEditor.cloneSignon(), false);
  document.getElementById("new_signon").addEventListener("command", _ => spEditor.newSignon(), false);
  document.getElementById("visit_site").addEventListener("command", _ => spEditor.visitSite(), false);

  document.getElementById("speMenuBtn_editSignon").addEventListener("command", event => spEditor.menuBtnSel(event, event.currentTarget), false);
  document.getElementById("speMenuBtn_cloneSignon").addEventListener("command", event => spEditor.menuBtnSel(event, event.currentTarget), false);
  document.getElementById("speMenuBtn_newSignon").addEventListener("command", event => spEditor.menuBtnSel(event, event.currentTarget), false);
  document.querySelector('button[label="Import"]').addEventListener("command", OpenMigrator, false);
  document.querySelector('button[label="Close"]').addEventListener("command", _ => window.close(), false);

  document
    .getElementsByTagName("treecols")[0]
    .addEventListener("click", event => {
      let { target, button } = event;
      let sortField = target.getAttribute("data-field-name");

      if (target.nodeName != "treecol" || button != 0 || !sortField) {
        return;
      }

      SignonColumnSort(sortField);
    });

  await LoadSignons();

  // filter the table if requested by caller
  if (
    window.arguments &&
    window.arguments[0] &&
    window.arguments[0].filterString
  ) {
    await setFilter(window.arguments[0].filterString);
  }

  FocusFilterBox();
}

function Shutdown() {
  Services.obs.removeObserver(
    signonReloadDisplay,
    "passwordmgr-storage-changed"
  );
}

async function setFilter(aFilterString) {
  filterField.value = aFilterString;
  await FilterPasswords();
}

let signonsTreeView = {
  selection: null,

  rowCount: 0,
  setTree(tree) { },
  getImageSrc(row, column) {
    if (column.element.getAttribute("id") !== "siteCol") {
      return "";
    }

    const signon = GetVisibleLogins()[row];
    if(!signon) return;

    return PlacesUtils.urlWithSizeRef(window, "page-icon:" + signon.origin, 16);
  },
  getCellValue(row, column) { },
  getCellText(row, column) {
    let time;
    let signon = GetVisibleLogins()[row];
    if(!signon) return;
    switch (column.id) {
      case "siteCol":
        return signon.httpRealm
          ? signon.origin + " (" + signon.httpRealm + ")"
          : signon.origin;
      case "userCol":
        return signon.username || "";
      case "passwordCol":
        return signon.password || "";
      case "timeCreatedCol":
        time = new Date(signon.timeCreated);
        return dateFormatter.format(time);
      case "timeLastUsedCol":
        time = new Date(signon.timeLastUsed);
        return dateAndTimeFormatter.format(time);
      case "timePasswordChangedCol":
        time = new Date(signon.timePasswordChanged);
        return dateFormatter.format(time);
      case "timesUsedCol":
        return signon.timesUsed;
      default:
        return "";
    }
  },
  isEditable(row, col) {
    if (col.id == "userCol" || col.id == "passwordCol") {
      return true;
    }
    return false;
  },
  isSeparator(index) {
    return false;
  },
  isSorted() {
    return false;
  },
  isContainer(index) {
    return false;
  },
  cycleHeader(column) { },
  getRowProperties(row) {
    return "";
  },
  getColumnProperties(column) {
    return "";
  },
  getCellProperties(row, column) {
    if (column.element.getAttribute("id") == "siteCol") {
      return "ltr";
    }

    return "";
  },
  async setCellText(row, col, value) {
    if (col.id != "userCol" && col.id != "passwordCol") { return; }
    let field = col.id == "userCol" ? "username" : "password";
    let edit = signonState.edit(row, field, value);
    if (edit) {
      try {
        await LoginOperations.modify(edit.oldLogin, edit.login);
      } catch (e) {
        edit.login[field] = edit.oldLogin[field];
        edit.login.timePasswordChanged = edit.oldLogin.timePasswordChanged;
        spEditor._showEntryError(e);
      }
      signonsTree.invalidateRow(row);
    }
  },
};

function SortTree(column, ascending) {
  signonState.sort(column, ascending);
  signonsTree.invalidate();
}

async function LoadSignons() {
  // loads signons into table
  try { signonState.replace(await Services.logins.getAllLogins()); } catch (e) { signonState.replace([]); }
  signonState.logins.forEach(login => login.QueryInterface(Ci.nsILoginMetaInfo));
  signonsTreeView.rowCount = signonState.logins.length;

  // sort and display the table
  signonsTree.view = null;
  signonsTree.view = signonsTree._view = signonsTreeView;
  SortTree(signonState.sortColumn, signonState.sortAscending);

  // disable "remove all signons" button if there are no signons
  if (!signonState.logins.length) {
    removeAllButton.setAttribute("disabled", "true");
    togglePasswordsButton.setAttribute("disabled", "true");
  } else {
    removeAllButton.removeAttribute("disabled");
    togglePasswordsButton.removeAttribute("disabled");
  }

  return true;
}

function GetVisibleLogins() { return signonState.visible; }

function GetTreeSelections() {
  let selections = [];
  let select = signonsTree.view.selection;
  if (select) {
    let count = select.getRangeCount();
    let min = {};
    let max = {};
    for (let i = 0; i < count; i++) {
      select.getRangeAt(i, min, max);
      for (let k = min.value; k <= max.value; k++) {
        if (k != -1) {
          selections[selections.length] = k;
        }
      }
    }
  }
  return selections;
}

function SignonSelected() {
  let selections = GetTreeSelections();
  if (selections.length) {
    removeButton.removeAttribute("disabled");
  } else {
    removeButton.setAttribute("disabled", true);
  }
}

async function DeleteSignon() {
  let tree = signonsTree;
  let view = signonsTreeView;

  // Turn off tree selection notifications during the deletion
  tree.view.selection.selectEventsSuppressed = true;
  let result = signonState.deleteSelected(GetTreeSelections());
  for (let change of result.rowChanges) {
    view.rowCount -= change.count;
    tree.rowCountChanged(change.index, -change.count);
  }

  // update selection and/or buttons
  if (result.nextSelection >= 0) { tree.view.selection.select(result.nextSelection); } else {
    // disable buttons
    removeButton.setAttribute("disabled", "true");
    removeAllButton.setAttribute("disabled", "true");
  }
  tree.view.selection.selectEventsSuppressed = false;
  try { await FinalizeSignonDeletions(result.deleted, result.syncNeeded); } catch (e) { console.error(e); }
}

async function DeleteAllSignons() {
  // Confirm the user wants to remove all passwords
  let dummy = { value: false };
  if (
    Services.prompt.confirmEx(
      window,
      "Remove all passwords",
      "Are you sure you wish to remove all passwords?",
      Services.prompt.STD_YES_NO_BUTTONS + Services.prompt.BUTTON_POS_1_DEFAULT,
      null,
      null,
      null,
      null,
      dummy
    ) == 1
  ) {
    // 1 == "No" button
    return;
  }

  let view = signonsTreeView;
  let result = signonState.deleteAllVisible();

  // clear out selections
  view.selection.select(-1);

  // update the tree view and notify the tree
  view.rowCount = 0;

  signonsTree.rowCountChanged(0, -result.deleted.length);
  signonsTree.invalidate();

  // disable buttons
  removeButton.setAttribute("disabled", "true");
  removeAllButton.setAttribute("disabled", "true");
  try { await FinalizeSignonDeletions(result.deleted, result.syncNeeded); } catch (e) { console.error(e); }
  Services.obs.notifyObservers(
    null,
    "weave:telemetry:histogram",
    "PWMGR_MANAGE_DELETED_ALL"
  );
}

async function TogglePasswordVisible() {
  if (showingPasswords || (await masterPasswordLogin(AskUserShowPasswords))) {
    showingPasswords = !showingPasswords;
    togglePasswordsButton.label = showingPasswords ? "Hide Passwords" : "Show Passwords";
    togglePasswordsButton.accessKey = "P";
    document.getElementById("passwordCol").hidden = !showingPasswords;
    await FilterPasswords();
  }

  // Notify observers that the password visibility toggling is
  // completed.  (Mostly useful for tests)
  Services.obs.notifyObservers(null, "passwordmgr-password-toggle-complete");
  Services.obs.notifyObservers(
    null,
    "weave:telemetry:histogram",
    "PWMGR_MANAGE_VISIBILITY_TOGGLED"
  );
}

async function AskUserShowPasswords() {
  let dummy = { value: false };

  // Confirm the user wants to display passwords
  return (
    Services.prompt.confirmEx(
      window,
      null,
      "Are you sure you wish to show your passwords?",
      Services.prompt.STD_YES_NO_BUTTONS,
      null,
      null,
      null,
      null,
      dummy
    ) == 0
  ); // 0=="Yes" button
}

async function FinalizeSignonDeletions(deleted, syncNeeded) {
  for (let signon of deleted) {
    if(!signon) continue;
    try { await LoginOperations.remove(signon); } catch (e) {
      await LoadSignons();
      if (filterField.value) await FilterPasswords();
      throw e;
    }
    Services.obs.notifyObservers(
      null,
      "weave:telemetry:histogram",
      "PWMGR_MANAGE_DELETED"
    );
  }
  // If the deletion has been performed in a filtered view, reflect the deletion in the unfiltered table.
  // See bug 405389.
  if (syncNeeded) { try { signonState.replace(await Services.logins.getAllLogins()); } catch (e) { signonState.replace([]); } }
}

async function HandleSignonKeyPress(e) {
  // If editing is currently performed, don't do anything.
  if (signonsTree.getAttribute("editing")) {
    return;
  }
  if (
    e.keyCode == KeyboardEvent.DOM_VK_DELETE ||
    (AppConstants.platform == "macosx" &&
      e.keyCode == KeyboardEvent.DOM_VK_BACK_SPACE)
  ) {
    await DeleteSignon();
    e.preventDefault();
  }
}

function getColumnByName(column) {
  switch (column) {
    case "origin":
      return document.getElementById("siteCol");
    case "username":
      return document.getElementById("userCol");
    case "password":
      return document.getElementById("passwordCol");
    case "timeCreated":
      return document.getElementById("timeCreatedCol");
    case "timeLastUsed":
      return document.getElementById("timeLastUsedCol");
    case "timePasswordChanged":
      return document.getElementById("timePasswordChangedCol");
    case "timesUsed":
      return document.getElementById("timesUsedCol");
  }
  return undefined;
}

function SignonColumnSort(column) {
  let sortedCol = getColumnByName(column);
  let lastSortedCol = getColumnByName(signonState.sortColumn);

  // clear out the sortDirection attribute on the old column
  lastSortedCol.removeAttribute("sortDirection");

  SortTree(column, column == signonState.sortColumn ? !signonState.sortAscending : true);

  // set the sortDirection attribute to get the styling going
  // first we need to get the right element
  sortedCol.setAttribute("sortDirection", signonState.sortAscending ? "ascending" : "descending");
}

async function SignonClearFilter() {
  let singleSelection = signonsTreeView.selection?.count == 1;

  // Clear the Tree Display
  signonsTreeView.rowCount = 0;
  signonsTree.rowCountChanged(0, -signonState.filtered.length);
  let selectedRanges = signonState.clearFilter(singleSelection);

  // Just reload the list to make sure deletions are respected
  await LoadSignons();

  // Restore selection
  if (singleSelection) {
    signonsTreeView.selection.clearSelection();
    for (let range of selectedRanges) { signonsTreeView.selection.rangedSelect(range.min, range.max, true); }
  } else {
    signonsTreeView.selection.select(-1);
  }
  signonsIntro.textContent = "Logins for the following sites are stored on your computer";
  removeAllButton.label = "Remove All";
  removeAllButton.accessKey = "A";
}

function FocusFilterBox() {
  if (filterField.getAttribute("focused") != "true") {
    filterField.select();
  }
}

async function FilterPasswords() {
  if (filterField.value == "") {
    await SignonClearFilter();
    return;
  }

  let selectedRanges = [];
  if (!signonState.filtering) {
    // Save Display Info for the Non-Filtered mode when we first
    // enter Filtered mode.
    let selection = signonsTreeView.selection;
    for (let i = 0; i < selection.getRangeCount(); ++i) {
      let min = {};
      let max = {};
      selection.getRangeAt(i, min, max);
      selectedRanges.push({ min: min.value, max: max.value });
    }
  }
  let newFilterSet = signonState.filter(filterField.value, showingPasswords, selectedRanges);

  // Clear the display
  let oldRowCount = signonsTreeView.rowCount;
  signonsTreeView.rowCount = 0;
  signonsTree.rowCountChanged(0, -oldRowCount);
  // Set up the filtered display
  signonsTreeView.rowCount = newFilterSet.length;
  signonsTree.rowCountChanged(0, signonsTreeView.rowCount);

  // if the view is not empty then select the first item
  if (signonsTreeView.rowCount > 0) {
    signonsTreeView.selection.select(0);
  }

  signonsIntro.textContent = "The following logins match your search:";
  removeAllButton.label = "Remove All Shown";
  removeAllButton.accessKey = "A";
}

function CopyCurrentCell(column) {
  let clipboard = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper);
  clipboard.copyString(signonsTreeView.getCellText(signonsTree.currentIndex, { id: column }));
}

function CopySiteUrl() { CopyCurrentCell("siteCol"); }

async function CopyPassword() {
  // Don't copy passwords if we aren't already showing the passwords & a master
  // password hasn't been entered.
  if (!showingPasswords && !(await masterPasswordLogin())) {
    return;
  }
  CopyCurrentCell("passwordCol");
  Services.obs.notifyObservers(
    null,
    "weave:telemetry:histogram",
    "PWMGR_MANAGE_COPIED_PASSWORD"
  );
}

function CopyUsername() {
  CopyCurrentCell("userCol");
  Services.obs.notifyObservers(
    null,
    "weave:telemetry:histogram",
    "PWMGR_MANAGE_COPIED_USERNAME"
  );
}

function EditCellInSelectedRow(columnName) {
  let row = signonsTree.currentIndex;
  let columnElement = getColumnByName(columnName);
  signonsTree.startEditing(
    row,
    signonsTree.columns.getColumnFor(columnElement)
  );
}

function LaunchSiteUrl() {
  let row = signonsTree.currentIndex;
  let url = signonsTreeView.getCellText(row, { id: "siteCol" });
  window.openWebLinkIn(url, "tab");
}

function UpdateContextMenu() {
  let singleSelection = signonsTreeView.selection.count == 1;
  let menuItems = new Map();
  let menupopup = document.getElementById("signonsTreeContextMenu");
  for (let menuItem of menupopup.querySelectorAll("menuitem")) {
    menuItems.set(menuItem.id, menuItem);
  }

  if (!singleSelection) {
    for (let menuItem of menuItems.values()) {
      menuItem.setAttribute("disabled", "true");
    }
    return;
  }

  let selectedRow = signonsTree.currentIndex;

  // Don't display "Launch Site URL" if we're not a browser.
  if (window.openWebLinkIn) {
    menuItems.get("context-launchsiteurl").removeAttribute("disabled");
  } else {
    menuItems.get("context-launchsiteurl").setAttribute("disabled", "true");
    menuItems.get("context-launchsiteurl").setAttribute("hidden", "true");
  }

  // Disable "Copy Username" if the username is empty.
  if (signonsTreeView.getCellText(selectedRow, { id: "userCol" }) != "") {
    menuItems.get("context-copyusername").removeAttribute("disabled");
  } else {
    menuItems.get("context-copyusername").setAttribute("disabled", "true");
  }

  menuItems.get("context-copysiteurl").removeAttribute("disabled");
  menuItems.get("context-editusername").removeAttribute("disabled");
  menuItems.get("context-copypassword").removeAttribute("disabled");

  // Disable "Edit Password" if the password column isn't showing.
  if (!document.getElementById("passwordCol").hidden) {
    menuItems.get("context-editpassword").removeAttribute("disabled");
  } else {
    menuItems.get("context-editpassword").setAttribute("disabled", "true");
  }
}

async function masterPasswordLogin(noPasswordCallback) {
  // This does no harm if master password isn't set.
  const modern = "@mozilla.org/security/internalkeytoken;1" in Cc;
  let token;
  if (modern)
    token = Cc["@mozilla.org/security/internalkeytoken;1"].createInstance(Ci.nsIPKCS11Token);
  else
    token = Cc["@mozilla.org/security/pk11tokendb;1"].createInstance(Ci.nsIPK11TokenDB).getInternalKeyToken();

  // If there is no master password, still give the user a chance to opt-out of displaying passwords
  if (!token.hasPassword) {
    return noPasswordCallback ? noPasswordCallback() : true;
  }

  try {
    // Relogin and ask for the master password.
    if (modern) await token.login();
    else token.login(true);
  } catch (e) {
    // An exception will be thrown if the user cancels the login prompt dialog.
    // User is also logged out of Software Security Device.
  }

  return modern ? token.isLoggedIn : token.isLoggedIn();
}

function escapeKeyHandler() {
  // If editing is currently performed, don't do anything.
  if (signonsTree.getAttribute("editing")) {
    return;
  }
  window.close();
}

function OpenMigrator() {
  const { MigrationUtils } = ChromeUtils.importESModule(
    "resource:///modules/MigrationUtils.sys.mjs"
  );
  // We pass in the type of source we're using for use in telemetry:
  MigrationUtils.showMigrationWizard(window, [
    MigrationUtils.MIGRATION_ENTRYPOINT_PASSWORDS,
  ]);
}
