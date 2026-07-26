// ==UserScript==
// @name         Flickr Tag Page Filter
// @namespace    https://example.local/flickr-tag-filter
// @version      1.0.0
// @description  Adds a toggle button to Flickr's user tag pages to hide all tags except a chosen list.
// @author       you
// @match        https://www.flickr.com/photos/*/tags
// @match        https://www.flickr.com/photos/*/tags/
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      localhost
// @connect      127.0.0.1
// @connect      dietpi.tail6280e.ts.net
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    /* ------------------------------------------------------------------
     * CONFIG
     * ------------------------------------------------------------------
     * PLACEHOLDER_TAGS is used as-is unless REMOTE_TAG_LIST_URL is set
     * and reachable, in which case the remote list (a JSON array of
     * strings) replaces it for this run.
     *
     * To wire this up to a shared tags.json also read by your LINQPad
     * script, run a tiny local static file server in the folder that
     * contains it, e.g.:
     *     python -m http.server 8787
     * and set REMOTE_TAG_LIST_URL below to point at it. Leave it as
     * an empty string to just use PLACEHOLDER_TAGS.
     * ------------------------------------------------------------------ */

    const PLACEHOLDER_TAGS = [
        'landscape', 'portrait', 'macro', 'streetphotography',
        'blackandwhite', 'sunset', 'architecture', 'wildlife'
    ];

    const REMOTE_TAG_LIST_URL = 'http://dietpi.tail6280e.ts.net/tags-server/tags.json'; // e.g. 'http://127.0.0.1:8787/tags.json'

    /* ------------------------------------------------------------------ */

    let ALLOWED_TAGS = new Set(PLACEHOLDER_TAGS.map(t => t.trim().toLowerCase()));
    let filterOn = false;
    let initialised = false;

    function loadRemoteTagsIfConfigured(callback) {
        if (!REMOTE_TAG_LIST_URL) {
            callback();
            return;
        }
        GM_xmlhttpRequest({
            method: 'GET',
            url: REMOTE_TAG_LIST_URL,
            timeout: 3000,
            onload: function (res) {
                try {
                    const list = JSON.parse(res.responseText);
                    if (Array.isArray(list) && list.length) {
                        ALLOWED_TAGS = new Set(
                            list.map(t => String(t).trim().toLowerCase())
                        );
                        console.log('[FlickrTagFilter] Loaded', ALLOWED_TAGS.size, 'tags from', REMOTE_TAG_LIST_URL);
                    }
                } catch (e) {
                    console.warn('[FlickrTagFilter] Failed to parse remote tag list, using placeholder list.', e);
                }
                callback();
            },
            onerror: function () {
                console.warn('[FlickrTagFilter] Could not reach', REMOTE_TAG_LIST_URL, '- using placeholder list.');
                callback();
            },
            ontimeout: function () {
                console.warn('[FlickrTagFilter] Timed out reaching', REMOTE_TAG_LIST_URL, '- using placeholder list.');
                callback();
            }
        });
    }

    /* ------------------------------------------------------------------
     * DOM helpers
     * ------------------------------------------------------------------ */

    function waitForElement(selector, timeoutMs = 15000) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(selector);
            if (existing) {
                resolve(existing);
                return;
            }
            const observer = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) {
                    observer.disconnect();
                    resolve(el);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => {
                observer.disconnect();
                reject(new Error('Timed out waiting for ' + selector));
            }, timeoutMs);
        });
    }

    // The jump-list link's href fragment (e.g. "#%C3%80-tags") is the
    // percent-encoded, case-preserved id of its target <tr> (e.g.
    // "À-tags"). Decoding the fragment directly and looking it up with
    // getElementById avoids needing to separately parse out a "letter"
    // and match it case-insensitively - which breaks for accented
    // letters (À vs à) and other non-ASCII tag-index characters, since
    // <tr> ids in the page use the exact original case.
    function getJumpTargetId(li) {
        const link = li.querySelector('a[href]');
        if (!link) return null;
        const href = link.getAttribute('href') || '';
        const hashIndex = href.indexOf('#');
        if (hashIndex === -1) return null;
        let frag = href.slice(hashIndex + 1);
        try {
            frag = decodeURIComponent(frag);
        } catch (e) {
            // Malformed percent-encoding - fall back to the raw fragment.
        }
        return frag || null;
    }

    /* ------------------------------------------------------------------
     * One-time DOM preparation: wrap each ", " separator between tag
     * links in its own <span> so it can be shown/hidden independently
     * of the surrounding <a> tags, and give every non-first tag link
     * in a cell a "synthetic" leading separator we control ourselves.
     * ------------------------------------------------------------------ */

    function prepareCombinedCell(td) {
        if (td.dataset.ttfPrepared === '1') return;

        const anchors = Array.from(td.querySelectorAll('a'));

        // Hide the page's own separator content by wrapping any stray
        // text nodes between anchors in a span we can toggle.
        Array.from(td.childNodes).forEach(node => {
            if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') {
                const span = document.createElement('span');
                span.className = 'ttf-orig-sep';
                span.textContent = node.textContent;
                node.replaceWith(span);
            }
        });

        // Insert a synthetic separator immediately before every anchor
        // except the first one in the cell. We control this ourselves
        // so commas are only ever shown between two *visible* tags,
        // regardless of which original tags got hidden.
        anchors.forEach((a, idx) => {
            if (idx === 0) return;
            const sep = document.createElement('span');
            sep.className = 'ttf-synth-sep';
            sep.textContent = ', ';
            sep.style.display = 'none';
            a.parentNode.insertBefore(sep, a);
        });

        td.dataset.ttfPrepared = '1';
    }

    function applyFilterToRow(tr) {
        const td = tr.querySelector('td.combined');
        if (!td) return;

        prepareCombinedCell(td);

        const anchors = Array.from(td.querySelectorAll('a'));
        const origSeps = Array.from(td.querySelectorAll('span.ttf-orig-sep'));

        if (!filterOn) {
            // Restore original appearance.
            anchors.forEach(a => { a.style.display = ''; });
            origSeps.forEach(s => { s.style.display = ''; });
            td.querySelectorAll('span.ttf-synth-sep').forEach(s => { s.style.display = 'none'; });
            tr.style.display = '';
            return;
        }

        // Filtering on: decide visibility per tag.
        let anyVisible = false;
        let seenVisible = false;

        anchors.forEach((a, idx) => {
            const tagText = a.textContent.trim().toLowerCase();
            const visible = ALLOWED_TAGS.has(tagText);
            a.style.display = visible ? '' : 'none';
            if (visible) anyVisible = true;

            const synthSep = idx === 0 ? null : a.previousElementSibling;
            if (synthSep && synthSep.classList && synthSep.classList.contains('ttf-synth-sep')) {
                synthSep.style.display = (visible && seenVisible) ? '' : 'none';
            }
            if (visible) seenVisible = true;
        });

        // Original separators are never shown while filtering - the
        // synthetic ones above handle correct comma placement instead.
        origSeps.forEach(s => { s.style.display = 'none'; });

        tr.style.display = anyVisible ? '' : 'none';
    }

    function applyFilterToJumpList() {
        const jumpList = document.querySelector('ol.jump-list, .jump-list');
        if (!jumpList) return;

        const items = Array.from(jumpList.querySelectorAll('li'));
        items.forEach(li => {
            if (!filterOn) {
                li.style.display = '';
                return;
            }
            const targetId = getJumpTargetId(li);
            const tr = targetId ? document.getElementById(targetId) : null;
            const rowVisible = !!tr && tr.style.display !== 'none';
            li.style.display = rowVisible ? '' : 'none';
        });
    }

    function applyFilter() {
        const rows = Array.from(document.querySelectorAll('tr[id$="-tags"]'));
        rows.forEach(applyFilterToRow);
        applyFilterToJumpList();
    }

    /* ------------------------------------------------------------------
     * Toggle button
     * ------------------------------------------------------------------ */

    function updateButtonLabel(btn) {
        btn.textContent = filterOn ? 'Show all tags' : 'Filter tags';
        btn.setAttribute('aria-pressed', String(filterOn));
    }

    function createToggleButton() {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'ttf-toggle-btn';
        btn.style.cssText = [
            'margin: 0 0 12px 0',
            'padding: 6px 14px',
            'font-size: 13px',
            'font-weight: 600',
            'border: 1px solid #999',
            'border-radius: 4px',
            'background: #f4f4f4',
            'cursor: pointer'
        ].join(';');
        updateButtonLabel(btn);

        btn.addEventListener('click', () => {
            filterOn = !filterOn;
            updateButtonLabel(btn);
            applyFilter();
        });

        return btn;
    }

    /* ------------------------------------------------------------------
     * Init
     * ------------------------------------------------------------------ */

    async function init() {
        if (initialised) return;
        initialised = true;

        let jumpList;
        try {
            jumpList = await waitForElement('ol.jump-list, .jump-list');
        } catch (e) {
            console.warn('[FlickrTagFilter] Jump list not found, aborting.', e);
            return;
        }

        const btn = createToggleButton();
        jumpList.parentNode.insertBefore(btn, jumpList);
    }

    loadRemoteTagsIfConfigured(init);
})();
