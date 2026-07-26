// ==UserScript==
// @name         Flickr Albums Sort & Filter
// @namespace    https://example.com/tampermonkey
// @version      1.7
// @description  Sorts your Flickr albums page alphabetically and adds a live filter box to the toolbar
// @author       you
// @match        https://www.flickr.com/photos/strandloper/albums/
// @match        https://www.flickr.com/photos/strandloper/albums/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ---------------------------------------------------------------
    // Only run on the albums LIST page, never on an individual album
    // page. Flickr's own router treats these as distinct routes:
    //   list:   /photos/<user>/albums/
    //           /photos/<user>/albums/with/<id>/   (list, one album highlighted)
    //           /photos/<user>/albums/page<N>/
    //   single: /photos/<user>/albums/<id>/         (an actual album's photos)
    // A plain "/albums/*" @match can't tell these apart (Tampermonkey's
    // match patterns are simple globs, not real regex), so we check the
    // path ourselves and bail out immediately if this isn't the list page.
    const ALBUMS_LIST_PATH = /^\/photos\/[^/]+\/(?:albums|sets)\/?(?:with\/[^/]+\/?|page\d+\/?)?$/;
    if (!ALBUMS_LIST_PATH.test(location.pathname)) {
        return;
    }

    const FILTER_DEBOUNCE_MS = 250;

    // ---------------------------------------------------------------
    // Styles
    // ---------------------------------------------------------------
    // NOTE: Flickr lays albums out with absolutely-positioned tiles
    // (inline "transform: translate(x,y)") sized by its own justified-
    // layout engine. Re-sorting the DOM alone would not change what's
    // visible, since position comes from those inline styles rather
    // than DOM order. So we take over layout with a plain CSS grid
    // (square tiles) once this script runs - simpler and far more
    // robust than trying to replicate Flickr's justified-row math.
    const style = document.createElement('style');
    style.textContent = `
        .albums-list-container .photo-list-view {
            position: static !important;
            display: grid !important;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)) !important;
            gap: 16px !important;
            height: auto !important;
        }
        .albums-list-container .photo-list-album-view {
            position: relative !important;
            transform: none !important;
            width: auto !important;
            height: 0 !important;
            padding-bottom: 100% !important;
            background-size: cover !important;
            background-position: center !important;
        }
        .albums-list-container .photo-list-album-view.tm-hidden-album {
            display: none !important;
        }

        .tm-album-filter-wrap {
            display: inline-flex !important;
            align-items: center !important;
            margin-left: 12px !important;
            border: 1px solid #ccc !important;
            border-radius: 4px !important;
            background: #fafafa !important;
            height: 26px !important;
            padding: 0 4px 0 8px !important;
            box-shadow: none !important;
        }
        .tm-album-filter-wrap:focus-within {
            border-color: #4a90d9 !important;
            box-shadow: 0 0 0 2px rgba(74, 144, 217, 0.25) !important;
            background: #fff !important;
        }
        .tm-album-filter-input,
        .tm-album-filter-input:focus {
            border: none !important;
            outline: none !important;
            box-shadow: none !important;
            font-size: 13px !important;
            width: 120px !important;
            height: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            background: transparent !important;
            color: #333 !important;
        }
        .tm-album-filter-divider {
            width: 1px;
            align-self: stretch;
            margin: 4px 6px;
            background: #ddd;
            flex: none;
        }
        .tm-album-filter-clear {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            flex: none !important;
            box-sizing: border-box !important;
            width: 18px !important;
            height: 18px !important;
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            background: transparent !important;
            font-size: 15px !important;
            font-weight: bold !important;
            line-height: 18px !important;
            text-align: center !important;
            cursor: pointer !important;
            color: #333 !important;
            user-select: none !important;
        }
        .tm-album-filter-clear.tm-clear-disabled {
            color: #ccc !important;
            cursor: default !important;
        }
    `;
    document.head.appendChild(style);

    // ---------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------
    function getListView(container) {
        return container.querySelector('.photo-list-view');
    }

    function getAlbumEls(listView) {
        return Array.from(listView.children).filter(function (el) {
            return el.classList.contains('photo-list-album-view') &&
                   el.querySelector('a[href*="/albums/"]');
        });
    }

    function getAlbumTitle(el) {
        const a = el.querySelector('a[href*="/albums/"]');
        return a ? (a.getAttribute('title') || '') : '';
    }

    let listObserver = null;

    function sortAlbums(container) {
        const listView = getListView(container);
        if (!listView) return;

        const albumEls = getAlbumEls(listView);
        albumEls.sort(function (a, b) {
            return getAlbumTitle(a).localeCompare(getAlbumTitle(b), undefined, { sensitivity: 'base' });
        });

        // Disconnect while we rearrange, so our own DOM writes don't
        // trigger the mutation observer below.
        if (listObserver) listObserver.disconnect();
        albumEls.forEach(function (el) {
            listView.appendChild(el); // moves existing node to the end, in sorted order
        });
        if (listObserver) listObserver.observe(listView, { childList: true });
    }

    function applyFilter(container, query) {
        const listView = getListView(container);
        if (!listView) return;
        const q = query.trim().toLowerCase();
        const albumEls = getAlbumEls(listView);
        albumEls.forEach(function (el) {
            const title = getAlbumTitle(el).toLowerCase();
            const match = !q || title.indexOf(q) !== -1;
            el.classList.toggle('tm-hidden-album', !match);
        });
    }

    // ---------------------------------------------------------------
    // Filter box UI
    // ---------------------------------------------------------------
    let filterWrapEl = null;
    let toolbarDividerEl = null;

    function buildFilterBox(container) {
        const viewCollectionsLink = document.querySelector('a.toolbar-action.view-collections');
        if (!viewCollectionsLink || document.querySelector('.tm-album-filter-wrap')) return;

        const wrap = document.createElement('div');
        wrap.className = 'tm-album-filter-wrap';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'tm-album-filter-input';
        input.placeholder = 'Filter';

        const divider = document.createElement('span');
        divider.className = 'tm-album-filter-divider';

        const clearBtn = document.createElement('span');
        clearBtn.className = 'tm-album-filter-clear tm-clear-disabled';
        clearBtn.textContent = '\u00D7'; // ×
        clearBtn.setAttribute('role', 'button');
        clearBtn.setAttribute('aria-label', 'Clear filter');
        clearBtn.setAttribute('aria-disabled', 'true');
        clearBtn.tabIndex = -1; // not focusable while disabled

        wrap.appendChild(input);
        wrap.appendChild(divider);
        wrap.appendChild(clearBtn);

        const toolbarDivider = document.createElement('div');
        toolbarDivider.className = 'divider';
        viewCollectionsLink.insertAdjacentElement('afterend', toolbarDivider);
        toolbarDivider.insertAdjacentElement('afterend', wrap);
        filterWrapEl = wrap;
        toolbarDividerEl = toolbarDivider;

        function setClearEnabled(enabled) {
            clearBtn.classList.toggle('tm-clear-disabled', !enabled);
            clearBtn.setAttribute('aria-disabled', String(!enabled));
            clearBtn.tabIndex = enabled ? 0 : -1;
        }

        let debounceTimer = null;
        let savedPlaceholder = input.placeholder;

        function runFilter() {
            applyFilter(container, input.value);
            setClearEnabled(input.value.trim().length > 0);
        }

        input.addEventListener('input', function () {
            setClearEnabled(input.value.trim().length > 0);
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(runFilter, FILTER_DEBOUNCE_MS);
        });

        // Classic "Filter" placeholder behavior: disappear as soon as
        // the field is focused, reappear on blur only if still empty.
        input.addEventListener('focus', function () {
            input.placeholder = '';
        });
        input.addEventListener('blur', function () {
            if (input.value === '') input.placeholder = savedPlaceholder;
        });

        function doClear() {
            if (clearBtn.classList.contains('tm-clear-disabled')) return;
            input.value = '';
            setClearEnabled(false);
            applyFilter(container, '');
            input.focus();
        }

        clearBtn.addEventListener('click', doClear);
        clearBtn.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                doClear();
            }
        });
    }

    // ---------------------------------------------------------------
    // Init / teardown
    // ---------------------------------------------------------------
    // Flickr is a single-page app: navigating to a different section
    // (e.g. a group pool) from the albums page doesn't reload the
    // page, so this script keeps running in the background. We watch
    // location.pathname and tear everything down when it stops
    // matching the albums list page, and re-initialize if the user
    // navigates back to it - all without needing a full page reload.
    let bootstrapObserver = null;
    let initialized = false;

    function init(container) {
        sortAlbums(container);
        buildFilterBox(container);

        // Flickr may re-render/hydrate the album list shortly after
        // initial load. Watch for that and re-sort if it happens.
        listObserver = new MutationObserver(function () {
            sortAlbums(container);
        });
        const listView = getListView(container);
        if (listView) listObserver.observe(listView, { childList: true });

        initialized = true;
    }

    function teardown() {
        if (listObserver) {
            listObserver.disconnect();
            listObserver = null;
        }
        if (bootstrapObserver) {
            bootstrapObserver.disconnect();
            bootstrapObserver = null;
        }
        if (filterWrapEl && filterWrapEl.parentNode) {
            filterWrapEl.parentNode.removeChild(filterWrapEl);
        }
        if (toolbarDividerEl && toolbarDividerEl.parentNode) {
            toolbarDividerEl.parentNode.removeChild(toolbarDividerEl);
        }
        filterWrapEl = null;
        toolbarDividerEl = null;
        initialized = false;
    }

    function tryInit() {
        if (initialized) return;
        const container = document.querySelector('.albums-list-container');
        if (container && getListView(container) && getAlbumEls(getListView(container)).length > 0) {
            init(container);
            return;
        }
        if (!bootstrapObserver) {
            bootstrapObserver = new MutationObserver(function () {
                const c = document.querySelector('.albums-list-container');
                if (c && getListView(c) && getAlbumEls(getListView(c)).length > 0) {
                    bootstrapObserver.disconnect();
                    bootstrapObserver = null;
                    init(c);
                }
            });
            bootstrapObserver.observe(document.body, { childList: true, subtree: true });
        }
    }

    // Initial run for this page load.
    tryInit();

    // Poll for client-side route changes (Flickr uses History API
    // navigation that doesn't trigger a full page load/unload).
    let lastPath = location.pathname;
    setInterval(function () {
        if (location.pathname === lastPath) return;
        lastPath = location.pathname;
        if (ALBUMS_LIST_PATH.test(lastPath)) {
            tryInit();
        } else {
            teardown();
        }
    }, 700);
})();
