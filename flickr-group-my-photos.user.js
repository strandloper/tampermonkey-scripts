// ==UserScript==
// @name         Flickr Group My Photos
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Adds a "My Photos" tab to Flickr group pages
// @author       You
// @match        https://www.flickr.com/groups/*/
// @match        https://www.flickr.com/groups/*/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    function getBaseGroupUrl() {
        // Extract base URL: everything up to and including the group ID/slug segment
        const match = location.pathname.match(/^(\/groups\/[^/]+\/)/);
        return match ? 'https://www.flickr.com' + match[1] : null;
    }

    function updateActiveTab() {
        const pool = document.getElementById('pool');
        const mypool = document.getElementById('mypool');
        if (!pool || !mypool) return;

        const isMyPhotos = location.pathname.includes('/pool/strandloper');

        pool.classList.toggle('selected', !isMyPhotos && pool.classList.contains('selected'));
        mypool.classList.toggle('selected', isMyPhotos);
    }

    function injectTab() {
        if (document.getElementById('mypool')) return;

        const pool = document.getElementById('pool');
        if (!pool) return;

        const baseUrl = getBaseGroupUrl();
        if (!baseUrl) return;

        const mypool = pool.cloneNode(true);
        mypool.setAttribute('id', 'mypool');

        // Remove any active/selected state inherited from the cloned pool tab
        mypool.classList.remove('selected');
        mypool.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));

        const link = mypool.children[0];
        link.setAttribute('href', baseUrl + 'pool/strandloper/');
        link.innerHTML = '<span>My Photos</span>';

        pool.after(mypool);
        updateActiveTab();
    }

    // Run immediately in case the nav is already in the DOM
    injectTab();

    // Re-run whenever Flickr mutates the DOM (SPA tab navigation)
    const observer = new MutationObserver(() => {
        injectTab();
        updateActiveTab();
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();