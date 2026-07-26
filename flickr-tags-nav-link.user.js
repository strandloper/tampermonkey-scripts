// ==UserScript==
// @name         Flickr Tags Nav Link
// @namespace    https://example.local/flickr-tags-nav-link
// @version      1.0.0
// @description  Adds a "Tags" link to the end of a Flickr profile's subnav menu (About | Photostream | Albums | Faves | Galleries | Groups).
// @author       you
// @match        https://www.flickr.com/people/*/
// @match        https://www.flickr.com/photos/*/
// @match        https://www.flickr.com/photos/*/albums
// @match        https://www.flickr.com/photos/*/favorites
// @match        https://www.flickr.com/photos/*/galleries
// @match        https://www.flickr.com/people/*/groups/
// @exclude      https://www.flickr.com/photos/*/tags
// @exclude      https://www.flickr.com/photos/*/tags/
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    function getUserSlug() {
        const match = location.pathname.match(/^\/(?:people|photos)\/([^/]+)/);
        return match ? match[1] : null;
    }

    function injectTagsLink() {
        const linksList = document.querySelector('.subnav-items-container ul.links');
        if (!linksList) return;

        const slug = getUserSlug();
        if (!slug) return;

        const tagsHref = 'https://www.flickr.com/photos/' + slug + '/tags/';

        const existing = document.getElementById('tags');
        if (existing) {
            const link = existing.querySelector('a');
            if (link) link.setAttribute('href', tagsHref);
            return;
        }

        const li = document.createElement('li');
        li.id = 'tags';
        li.className = 'link';
        li.setAttribute('role', 'menuitem');

        const a = document.createElement('a');
        a.setAttribute('href', tagsHref);

        const span = document.createElement('span');
        span.textContent = 'Tags';

        a.appendChild(span);
        li.appendChild(a);

        const overflowButton = linksList.querySelector('li.overflow-menu-button');
        if (overflowButton) {
            overflowButton.before(li);
        } else {
            linksList.appendChild(li);
        }
    }

    // Run immediately in case the subnav is already in the DOM
    injectTagsLink();

    // Re-run whenever Flickr mutates the DOM (SPA tab navigation)
    const observer = new MutationObserver(() => {
        injectTagsLink();
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
