// ==UserScript==
// @name         Flickr User Info Button
// @namespace    https://example.local/flickr-user-info-button
// @version      1.0.1
// @description  Adds a "Copy Info" button beside a Flickr profile's name that copies the profile's person-model data (from the page's modelExport) to the clipboard as JSON.
// @author       you
// @match        https://www.flickr.com/people/*
// @match        https://www.flickr.com/photos/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // The viewing (signed-in) user's own person-model also appears in the
    // modelExport; we want the *other* one, i.e. the profile being viewed.
    const SELF_NSID = '77907748@N08';

    const BUTTON_ID = 'tm-flickr-copy-user-info';
    const LABEL = 'Copy Info';

    // Used if there's no Follow button to copy classes from (e.g. on your
    // own profile, where Flickr shows different actions).
    const FALLBACK_CLASSES = 'butt flex action-button ds-button ds-button-transparent ds-button-small';

    // Classes on the Follow button that Flickr's delegated click handlers
    // key off; copying them would make our button act as a Follow button.
    const BEHAVIOUR_CLASSES = ['follow-flickr-user-button'];

    function getUserSlug() {
        const match = location.pathname.match(/^\/(?:people|photos)\/([^/]+)/);
        return match ? decodeURIComponent(match[1]) : null;
    }

    // ---- modelExport extraction --------------------------------------------

    // Return the balanced {...} JSON object literal starting at `start`
    // (which must index a '{'), honouring string literals and escapes.
    function sliceBalancedObject(text, start) {
        let depth = 0;
        let inString = false;
        for (let i = start; i < text.length; i++) {
            const ch = text[i];
            if (inString) {
                if (ch === '\\') i++;
                else if (ch === '"') inString = false;
                continue;
            }
            if (ch === '"') inString = true;
            else if (ch === '{') depth++;
            else if (ch === '}') {
                depth--;
                if (depth === 0) return text.slice(start, i + 1);
            }
        }
        return null;
    }

    // Find initFcn -> Y.ClientApp.init({ ... modelExport: {...} ... }) in a
    // chunk of page source and return the parsed modelExport object.
    function extractModelExport(source) {
        const fcnIdx = source.indexOf('initFcn');
        if (fcnIdx < 0) return null;
        const initIdx = source.indexOf('Y.ClientApp.init', fcnIdx);
        if (initIdx < 0) return null;
        const keyMatch = /modelExport\s*:\s*\{/.exec(source.slice(initIdx));
        if (!keyMatch) return null;
        const braceIdx = initIdx + keyMatch.index + keyMatch[0].length - 1;
        const json = sliceBalancedObject(source, braceIdx);
        if (!json) return null;
        try {
            return JSON.parse(json);
        } catch (e) {
            console.warn('[flickr-user-info-button] modelExport JSON parse failed', e);
            return null;
        }
    }

    function findProfilePersonData(modelExport) {
        const models = modelExport && modelExport.main && modelExport.main['person-models'];
        if (!Array.isArray(models)) return null;
        const model = models.find(m => m && m.data && m.data.id !== SELF_NSID);
        return model ? model.data : null;
    }

    function matchesSlug(data, slug) {
        if (!data || !slug) return false;
        const s = slug.toLowerCase();
        return [data.id, data.nsid, data.pathAlias]
            .some(v => typeof v === 'string' && v.toLowerCase() === s);
    }

    function personDataFromSource(source) {
        return findProfilePersonData(extractModelExport(source));
    }

    async function getPersonData() {
        const slug = getUserSlug();

        // 1. The inline script from the original page load.
        for (const script of document.querySelectorAll('script:not([src])')) {
            const text = script.textContent;
            if (!text.includes('initFcn') || !text.includes('modelExport')) continue;
            const data = personDataFromSource(text);
            // After client-side navigation the inline script still describes
            // the profile the tab was first loaded on, so only trust it if
            // it's for the profile now on screen.
            if (data && matchesSlug(data, slug)) return data;
        }

        // 2. Otherwise re-fetch the current page's source (same origin).
        try {
            const resp = await fetch(location.href, { credentials: 'include' });
            if (!resp.ok) return null;
            return personDataFromSource(await resp.text());
        } catch (e) {
            console.warn('[flickr-user-info-button] fetch failed', e);
            return null;
        }
    }

    // ---- UI -------------------------------------------------------------------

    function flashLabel(btn, text) {
        const label = btn.querySelector('.action-button-text') || btn;
        label.textContent = text;
        clearTimeout(btn._tmResetTimer);
        btn._tmResetTimer = setTimeout(() => { label.textContent = LABEL; }, 1500);
    }

    async function onClick(event) {
        // Keep Flickr's delegated handlers (on .action-button etc.) out of it.
        event.preventDefault();
        event.stopPropagation();

        const btn = event.currentTarget;
        const data = await getPersonData();
        if (!data) {
            flashLabel(btn, 'Not found');
            return;
        }
        try {
            await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
            flashLabel(btn, 'Copied!');
        } catch (e) {
            console.warn('[flickr-user-info-button] clipboard write failed', e);
            flashLabel(btn, 'Copy failed');
        }
    }

    function makeButton(templateBtn) {
        const btn = document.createElement('button');
        btn.id = BUTTON_ID;
        btn.type = 'button';
        btn.className = templateBtn
            ? Array.from(templateBtn.classList).filter(c => !BEHAVIOUR_CLASSES.includes(c)).join(' ')
            : FALLBACK_CLASSES;

        const label = document.createElement('span');
        label.className = 'action-button-text';
        label.textContent = LABEL;
        btn.appendChild(label);

        btn.addEventListener('click', onClick);
        return btn;
    }

    function inject() {
        const h1 = document.querySelector('div.title-container > h1');
        if (!h1) return;
        const container = h1.parentElement;
        if (container.querySelector('#' + BUTTON_ID)) return;

        const actions = container.querySelector('.coverphoto-actions');
        const followBtn = container.querySelector('button.follow-flickr-user-button');
        const btn = makeButton(followBtn);

        // Flickr spaces "..." from Follow with a margin on the "..." button
        // itself, so match that gap on our button.
        const menuBtn = container.querySelector('button.context-menu-button');
        const gap = menuBtn ? getComputedStyle(menuBtn).marginLeft : '0px';
        btn.style.marginLeft = parseFloat(gap) > 0 ? gap : '8px';

        if (actions) {
            // After Follow and the "..." context-menu button.
            actions.appendChild(btn);
        } else {
            h1.after(btn);
        }
    }

    inject();

    // Flickr re-renders the cover area on client-side navigation; re-inject.
    const observer = new MutationObserver(inject);
    observer.observe(document.body, { childList: true, subtree: true });
})();
