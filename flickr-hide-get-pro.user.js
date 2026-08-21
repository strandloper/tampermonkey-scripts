// ==UserScript==
// @name         Flickr Hide Get Pro
// @namespace    https://example.local/flickr-hide-get-pro
// @version      1.0
// @description  Hides the "Get Pro" item Flickr adds to the top navigation menu for free accounts.
// @author       you
// @match        https://www.flickr.com/*
// @match        https://flickr.com/*
// @grant        none
// @run-at       document-start
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    const STYLE_ID = 'flickr-hide-get-pro-style';

    // Not scoped to ul.nav-menu: Flickr renders the menu more than once (a
    // wide-viewport list and a narrow-viewport one), so match the item
    // wherever it appears. !important because Flickr's own stylesheet sets
    // display on it.
    const CSS = '.gn-get-pro { display: none !important; }';

    function injectStyle() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = CSS;

        // Runs at document-start so the rule is in place before the nav
        // paints - otherwise "Get Pro" flashes up on every page load. That
        // early, document.head doesn't exist yet, but documentElement does.
        (document.head || document.documentElement).appendChild(style);
    }

    injectStyle();
})();
