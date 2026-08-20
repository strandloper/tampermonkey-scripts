// ==UserScript==
// @name         Flickr Dismiss Upsell Modal
// @namespace    https://example.local/flickr-dismiss-upsell-modal
// @version      1.0
// @description  Automatically dismisses Flickr's "Upgrade to Pro" upsell modal, logging to the console each time it does.
// @author       you
// @match        https://www.flickr.com/*
// @match        https://flickr.com/*
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    const LOG_PREFIX = '[flickr-dismiss-upsell-modal]';

    // Panels we have already announced. Dismissal itself may be retried (see
    // dismissUpsell below), but the console should only get one line per
    // modal - the log exists to prove the script fired, not to count clicks.
    const announced = new WeakSet();

    // Flickr's "close-x no-outline" is its generic modal close button: every
    // modal on the site has one. Always reach it through the upsell panel's
    // own .modal ancestor, so we can never close a modal the user opened
    // themselves.
    function findCloseButton(panel) {
        const modal = panel.closest('.modal');
        return modal ? modal.querySelector('.close-x') : null;
    }

    // getClientRects() is empty for a display:none element and, unlike
    // offsetParent, stays meaningful for position:fixed ones. If Flickr
    // hides a dismissed modal instead of removing it, this is what stops us
    // clicking at it forever.
    function isVisible(el) {
        return el.getClientRects().length > 0;
    }

    // Escape is handled by Flickr's own modal code, so it runs the same
    // cleanup as the close button (scroll unlock, backdrop removal) rather
    // than us tearing the modal out of the DOM by hand.
    function pressEscape(target) {
        for (const type of ['keydown', 'keyup']) {
            const event = new KeyboardEvent(type, {
                key: 'Escape',
                code: 'Escape',
                bubbles: true,
                cancelable: true
            });
            // keyCode/which are not part of KeyboardEventInit, so the
            // constructor silently drops them - but plenty of handlers still
            // read them, so define them by hand.
            Object.defineProperty(event, 'keyCode', { get: () => 27 });
            Object.defineProperty(event, 'which', { get: () => 27 });
            // Dispatched on the panel rather than document so it bubbles up
            // through the modal, body, document and window - whichever of
            // those Flickr listens on, the event reaches it.
            target.dispatchEvent(event);
        }
    }

    function announce(panel, how) {
        if (announced.has(panel)) return;
        announced.add(panel);
        console.log(LOG_PREFIX, 'Pro upsell modal dismissed (' + how + ')');
    }

    function dismissUpsell() {
        const panel = document.querySelector('.upsell-modal-panel');
        if (!panel || !isVisible(panel)) return;

        const closeButton = findCloseButton(panel);
        if (closeButton) {
            closeButton.click();
            announce(panel, 'close button');
            return;
        }

        pressEscape(panel);
        announce(panel, 'Escape fallback');
    }

    // In case the modal is somehow already up when the script runs
    dismissUpsell();

    // The modal appears at random, potentially a long way into a session, so
    // unlike the howtogeek dismisser this observer stays connected for the
    // life of the page instead of giving up after a few seconds.
    // dismissUpsell() re-checks visibility every time, so a click that lands
    // before Flickr has bound its handler is retried on the next mutation.
    const observer = new MutationObserver(dismissUpsell);

    observer.observe(document.body, { childList: true, subtree: true });
})();
