const { classes: Cc, interfaces: Ci } = Components;
const fields = ["hostname", "formSubmitURL", "httpRealm", "username", "password", "usernameField", "passwordField"];
const modes = { new: 0, edit: 1, clone: 2 };

function createLogin(newProps, baseLogin = {}) {
  const login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
  login.init(...fields.map(prop => newProps[prop] === undefined ? baseLogin[prop] : newProps[prop]));
  return login;
}

function mutate(name, ...args) {
  const manager = Services.logins;
  return (manager[name + "Async"] || manager[name]).call(manager, ...args);
}

export const LoginEditor = {
  open(window, { action, logins = [], passwordsShowing = false, onAccept }) {
    const result = { newSignon: null, callback: onAccept, parentWindow: window };
    window.openDialog("chrome://savedpasswordeditor/content/pwdedit.xhtml", "",
      "centerscreen,dependent,dialog,chrome" + (onAccept ? "" : ",modal"),
      logins, modes[action], passwordsShowing, result);
    return result.newSignon;
  },
};

export const LoginOperations = {
  findForForm({ hostname, formSubmitURL }) {
    return Services.logins.searchLoginsAsync({ origin: hostname, formActionOrigin: formSubmitURL, httpRealm: null });
  },
  add(newProps, baseLogin) { return mutate("addLogin", createLogin(newProps, baseLogin)); },
  modify(oldLogin, newProps) {
    return mutate("modifyLogin", oldLogin, newProps.QueryInterface ? newProps : createLogin(newProps, oldLogin));
  },
  remove(login) { return mutate("removeLogin", login); },
};
