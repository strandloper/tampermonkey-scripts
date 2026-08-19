// ==UserScript==
// @name         Flickr Safety Level Indicator
// @namespace    https://example.local/flickr-safety-level-indicator
// @version      1.1
// @description  Shows a coloured S/M/R badge next to a Flickr photo's title so its safety level is visible without scrolling down to the metadata.
// @author       you
// @match        https://www.flickr.com/photos/*/*
// @match        https://flickr.com/photos/*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ---------------------------------------------------------------
    // Which pages count as a photo page
    // ---------------------------------------------------------------
    // Tampermonkey's match patterns are simple globs, so "/photos/*/*"
    // also catches albums, tags, favorites, per-tag pages and so on.
    // Check the path ourselves instead:
    //   /photos/<user-slug>/<photo-id>
    //   /photos/<user-slug>/<photo-id>/
    //   /photos/<user-slug>/<photo-id>/in/<context>/   (arrived from an
    //       album, the photostream, a group pool, etc. - still a photo page)
    // <user-slug> is either a numeric Flickr ID (144957155@N06) or an
    // alias (sierrajulietcharlie); <photo-id> is always numeric.
    const PHOTO_PATH = /^\/photos\/[^/]+\/\d+(?:\/in\/[^/]+)?\/?$/;

    // ---------------------------------------------------------------
    // Safety levels
    // ---------------------------------------------------------------
    // Keyed by the lower-cased text of Flickr's own "safety-value" span.
    // Moderate is amber rather than a true yellow: the badge is a filled
    // square with a white letter, and white on yellow is unreadable.
    const LEVELS = {
        safe: { letter: 'S', className: 'fsli-safe', label: 'Safe' },
        moderate: { letter: 'M', className: 'fsli-moderate', label: 'Moderate' },
        restricted: { letter: 'R', className: 'fsli-restricted', label: 'Restricted' }
    };

    const BADGE_CLASS = 'fsli-badge';
    const PLACEHOLDER_CLASS = 'fsli-untitled-title';

    // ---------------------------------------------------------------
    // Styles
    // ---------------------------------------------------------------
    // The badge sits inside the <h1>, so 1em resolves against the title's
    // own font size - that keeps the square the same height as the title
    // whatever size Flickr renders it at.
    const style = document.createElement('style');
    style.textContent = `
        .${BADGE_CLASS} {
            display: inline-flex;
            flex: none;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
            width: 1em;
            height: 1em;
            margin-right: 0.3em;
            border-radius: 3px;
            font-weight: 700;
            line-height: 1;
            color: #fff;
            vertical-align: baseline;
            user-select: none;
        }
        .fsli-safe { background: #2e8b46; }
        .fsli-moderate { background: #d99000; }
        .fsli-restricted { background: #cc2b2b; }

        /* Stand-in title row for photos that have no title. Flickr emits an
           empty container in that case, so there is no font size to inherit
           and the em-sized badge would collapse - hence the explicit size.
           24px approximates Flickr's own photo title; tune to taste. */
        .${PLACEHOLDER_CLASS} {
            display: flex;
            align-items: center;
            margin: 0;
            font-size: 24px;
            line-height: 1.2;
        }
        .fsli-untitled-label {
            font-style: italic;
            opacity: 0.55;
        }
    `;
    document.head.appendChild(style);

    // ---------------------------------------------------------------
    // Reading the level off the page
    // ---------------------------------------------------------------
    // Flickr renders the "safety-value" span client-side - it is not in
    // the server HTML at all - so this returns null until that happens
    // and the MutationObserver below brings us back.
    function readLevel() {
        const valueEl = document.querySelector('span.safety-value');
        if (!valueEl) return null;

        const key = valueEl.textContent.trim().toLowerCase();
        return LEVELS[key] || null;
    }

    function makeBadge(level) {
        const badge = document.createElement('span');
        badge.className = BADGE_CLASS + ' ' + level.className;
        badge.textContent = level.letter;
        badge.title = 'Safety level: ' + level.label;
        badge.setAttribute('aria-label', 'Safety level: ' + level.label);
        return badge;
    }

    // Give an untitled photo something to hang the badge off. Flickr omits
    // the entire title/description block for an untitled photo - not just an
    // empty <h1> - so there may be nothing inside the container at all.
    function ensurePlaceholder(container) {
        const existing = container.querySelector('.' + PLACEHOLDER_CLASS);
        if (existing) return existing;

        const host = document.createElement('div');
        host.className = PLACEHOLDER_CLASS;

        const label = document.createElement('span');
        label.className = 'fsli-untitled-label';
        label.textContent = 'Untitled';
        host.appendChild(label);

        // If the photo has a description but no title, the block does exist
        // and the placeholder belongs above the description inside it.
        const block = container.querySelector('.title-desc-block');
        (block || container).prepend(host);
        return host;
    }

    function setBadge(host, level) {
        const existing = host.querySelector(':scope > .' + BADGE_CLASS);
        if (!existing) {
            host.prepend(makeBadge(level));
            return;
        }
        // Same badge already in place: nothing to do. A different one means
        // Flickr swapped photos under us (SPA next/prev).
        if (existing.textContent !== level.letter) {
            existing.replaceWith(makeBadge(level));
        }
    }

    // ---------------------------------------------------------------
    // Injection
    // ---------------------------------------------------------------
    // Anchor on the title/description container rather than the <h1>: the
    // <h1> is absent entirely for untitled photos, but the container is
    // always there. Flickr renders two of these - one below the photo and
    // one in the sidebar layout - and only ever shows one, so handling both
    // is simpler and cheaper than working out which is live.
    function applyBadges() {
        if (!PHOTO_PATH.test(location.pathname)) {
            removeIndicators();
            return;
        }

        const level = readLevel();
        if (!level) {
            // Either the span hasn't rendered yet, or we've navigated to a
            // photo whose level we can't read - don't leave a stale badge.
            removeIndicators();
            return;
        }

        const containers = document.querySelectorAll('.sub-photo-title-desc-view');
        for (const container of containers) {
            const title = container.querySelector('h1.photo-title');
            if (title) {
                // A real title is present, so drop any placeholder left over
                // from an untitled photo we were showing a moment ago.
                const stale = container.querySelector('.' + PLACEHOLDER_CLASS);
                if (stale) stale.remove();
                setBadge(title, level);
            } else {
                setBadge(ensurePlaceholder(container), level);
            }
        }
    }

    function removeIndicators() {
        for (const host of document.querySelectorAll('.' + PLACEHOLDER_CLASS)) {
            host.remove();
        }
        for (const badge of document.querySelectorAll('.' + BADGE_CLASS)) {
            badge.remove();
        }
    }

    // Run immediately in case the photo metadata is already in the DOM
    applyBadges();

    // Re-run whenever Flickr mutates the DOM: the safety span arrives after
    // first paint, and moving between photos is a client-side route change
    // rather than a page load. applyBadges() is idempotent, so the mutations
    // it causes itself settle after one extra pass.
    const observer = new MutationObserver(() => {
        applyBadges();
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
