/* This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// This is loaded into all XUL windows. Wrap in a block to prevent
// leaking to window scope.
{

    class MozQtextbox extends HTMLInputElement {
        constructor() {
            super();

            this.addEventListener("change", (event) => {
                if (this.value == "" && this.autoreindef)
                    this.indefinite = true;
                else if (this.value != "")
                    this.indefinite = false;
            });

        }

        set indefinite(val) {
            return this.setAttribute("indefinite", val ? "true" : "false");
        }

        get indefinite() {
            return this.getAttribute('indefinite') == 'true';
        }

        set autoreindef(val) {
            return this.setAttribute("autoreindef", val ? "true" : "false");
        }

        get autoreindef() {
            return this.getAttribute('autoreindef') == 'true';
        }

        get qvalue() {
            return this.indefinite ? undefined : this.value;
        }
    }

    customElements.define("q-textbox", MozQtextbox, { extends: 'input' });

}
