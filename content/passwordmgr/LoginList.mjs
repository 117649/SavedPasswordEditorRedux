export class LoginList {
  constructor() {
    this.logins = [];
    this.filtered = [];
    this.filtering = false;
    this.selectedRanges = [];
    this.sortColumn = "origin";
    this.sortAscending = true;
  }

  get visible() { return this.filtering ? this.filtered : this.logins; }

  replace(logins) { this.logins = logins; }

  filter(value, showingPasswords, selectedRanges) {
    if (!this.filtering) { this.selectedRanges = selectedRanges.map(range => ({ ...range })); }
    this.filtering = true;
    value = value.toLowerCase();
    this.filtered = this.logins.filter(login =>
      login.origin.toLowerCase().includes(value) ||
      login.username && login.username.toLowerCase().includes(value) ||
      login.httpRealm && login.httpRealm.toLowerCase().includes(value) ||
      showingPasswords && login.password && login.password.toLowerCase().includes(value)
    );
    return this.filtered;
  }

  clearFilter(singleSelection) {
    let selectedRanges = singleSelection ? this.selectedRanges : [];
    this.filtered = [];
    this.filtering = false;
    this.selectedRanges = [];
    return selectedRanges;
  }

  sort(column, ascending) {
    this.sortColumn = column;
    this.sortAscending = ascending;
    this.visible.sort((a, b) => {
      let valA, valB;
      switch (column) {
        case "origin":
          valA = a.origin.toLowerCase() + (a.httpRealm || "").toLowerCase();
          valB = b.origin.toLowerCase() + (b.httpRealm || "").toLowerCase();
          break;
        case "username":
        case "password":
          valA = a[column].toLowerCase();
          valB = b[column].toLowerCase();
          break;
        default:
          valA = a[column];
          valB = b[column];
      }
      return valA < valB ? -1 : valA > valB ? 1 : 0;
    });
    if (!ascending) { this.visible.reverse(); }
  }

  deleteSelected(indexes) {
    let table = this.visible;
    let deleted = [];
    for (let i = indexes.length - 1; i >= 0; i--) { deleted.push(table[indexes[i]]); }

    let rowChanges = [];
    for (let i = 0, removed = 0; i < indexes.length;) {
      let start = indexes[i];
      let count = 1;
      while (i + count < indexes.length && indexes[i + count] == start + count) { count++; }
      table.splice(start - removed, count);
      rowChanges.push({ index: start - removed, count });
      removed += count;
      i += count;
    }

    return {
      deleted,
      nextSelection: table.length ? Math.min(indexes[0], table.length - 1) : -1,
      rowChanges,
      syncNeeded: this.filtering,
    };
  }

  deleteAllVisible() {
    let table = this.visible;
    let result = { deleted: [...table], syncNeeded: this.filtering, };
    table.length = 0;
    return result;
  }

  edit(row, field, value, now = Date.now()) {
    let login = this.visible[row];
    if (value == login[field] || field == "password" && !value) { return null; }
    let oldLogin = login.clone();
    login[field] = value;
    login.timePasswordChanged = now;
    return { oldLogin, login };
  }
}
