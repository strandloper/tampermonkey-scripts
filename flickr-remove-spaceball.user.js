// ==UserScript==
// @name         Flickr Remove Spaceball
// @namespace    https://example.local/flickr-remove-spaceball
// @version      1.0
// @description  Removes the transparent "spaceball" overlay Flickr places over the photo on "All Sizes" pages.
// @author       you
// @match        https://www.flickr.com/photos/*/*/sizes/*
// @match        https://flickr.com/photos/*/*/sizes/*
// @grant        none
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    const SELECTOR = '#allsizes-photo .spaceball';

    function removeSpaceballs() {
        document.querySelectorAll(SELECTOR).forEach((el) => el.remove());
    }

    removeSpaceballs();

    // Not every sizes page has a spaceball, and Flickr may insert it after
    // the initial render, so keep watching and strip it whenever it appears.
    new MutationObserver(removeSpaceballs).observe(document.body, {
        childList: true,
        subtree: true,
    });
})();
