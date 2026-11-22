// ==UserScript==
// @name         Flickr User Info Button
// @namespace    https://example.local/flickr-user-info-button
// @version      1.2.1
// @description  Adds a "Copy Info" button beside a Flickr user's Follow button (profile cover or photo page) that copies a summary of that user's info (from the page's modelExport) to the clipboard as JSON.
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

    // A marker attribute rather than an id: photo pages can get more than one
    // button (see injectPhoto).
    const BUTTON_ATTR = 'data-tm-copy-user-info';
    const BUTTON_SEL = '[' + BUTTON_ATTR + ']';
    const LABEL = 'Copy Info';

    // Used if there's no Follow button to copy classes from (e.g. on your
    // own profile, where Flickr shows different actions).
    const FALLBACK_CLASSES = 'butt flex action-button ds-button ds-button-transparent ds-button-small';

    // Follow-specific classes (e.g. follow-flickr-user-button, and "follow"
    // on the label) that Flickr's delegated click handlers key off; copying
    // them would make our button act as a Follow button.
    const BEHAVIOUR_CLASS = /follow/i;

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

    function findProfilePersonData(modelExport, slug) {
        const models = modelExport && modelExport.main && modelExport.main['person-models'];
        if (!Array.isArray(models)) return null;
        const datas = models.map(m => m && m.data).filter(Boolean);
        // Prefer the person the URL names (the profile owner, or the photo's
        // owner on a photo page); otherwise anyone who isn't the viewer.
        const data = datas.find(d => matchesSlug(d, slug))
            || datas.find(d => d.id !== SELF_NSID);
        return data || null;
    }

    function matchesSlug(data, slug) {
        if (!data || !slug) return false;
        const s = slug.toLowerCase();
        return [data.id, data.nsid, data.pathAlias]
            .some(v => typeof v === 'string' && v.toLowerCase() === s);
    }

    function personDataFromSource(source, slug) {
        return findProfilePersonData(extractModelExport(source), slug);
    }

    async function getPersonData() {
        const slug = getUserSlug();

        // 1. The inline script from the original page load.
        for (const script of document.querySelectorAll('script:not([src])')) {
            const text = script.textContent;
            if (!text.includes('initFcn') || !text.includes('modelExport')) continue;
            const data = personDataFromSource(text, slug);
            // After client-side navigation the inline script still describes
            // the page the tab was first loaded on, so only trust it if it's
            // for the user now on screen.
            if (data && matchesSlug(data, slug)) return data;
        }

        // 2. Otherwise re-fetch the current page's source (same origin).
        try {
            const resp = await fetch(location.href, { credentials: 'include' });
            if (!resp.ok) return null;
            return personDataFromSource(await resp.text(), slug);
        } catch (e) {
            console.warn('[flickr-user-info-button] fetch failed', e);
            return null;
        }
    }

    // Reduce the full person-model data to the fields we actually want.
    function summarise(data) {
        // pathAlias is the user's chosen URL alias; accounts without one
        // are addressed by their numeric id instead. Also used by the
        // LINQPad import as the folder name under D:\Grabbed Pictures\Flickr\.
        const userPath = data.pathAlias || data.id;
        return {
            username: data.username,
            realname: data.realname,
            isPro: data.isPro,
            id: data.id,
            photosUrl: 'https://www.flickr.com/photos/' + userPath + '/',
            profileUrl: 'https://www.flickr.com/people/' + userPath + '/',
            userPath,
        };
    }

    // ---- UI -------------------------------------------------------------------

    function flashLabel(btn, text) {
        const label = btn._tmLabel || btn;
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
            await navigator.clipboard.writeText(JSON.stringify(summarise(data), null, 2));
            flashLabel(btn, 'Copied!');
        } catch (e) {
            console.warn('[flickr-user-info-button] clipboard write failed', e);
            flashLabel(btn, 'Copy failed');
        }
    }

    // Copy a Follow button's classes for styling, minus the follow-specific
    // ones Flickr's delegated click handlers key off.
    function styleClasses(el) {
        return Array.from(el.classList).filter(c => !BEHAVIOUR_CLASS.test(c)).join(' ');
    }

    function makeButton(templateBtn) {
        const btn = document.createElement('button');
        btn.setAttribute(BUTTON_ATTR, '');
        btn.type = 'button';
        btn.className = templateBtn ? styleClasses(templateBtn) : FALLBACK_CLASSES;

        // Mirror the template's label wrapper (e.g. <span class="action-button-text">)
        // if it has one, so text styling matches too.
        const templateLabel = templateBtn && Array.from(templateBtn.querySelectorAll('span'))
            .find(s => s.children.length === 0 && s.textContent.trim());
        let label = btn;
        if (templateLabel) {
            label = document.createElement('span');
            label.className = styleClasses(templateLabel);
            btn.appendChild(label);
        }
        label.textContent = LABEL;
        btn._tmLabel = label;

        btn.addEventListener('click', onClick);
        return btn;
    }

    function inject() {
        injectProfile() || injectPhoto();
    }

    // Photo page: beside the owner's Follow button under the photo. Flickr
    // renders the attribution block more than once (a hidden copy for the
    // full-screen viewer comes first in the DOM), so add a button to each.
    function injectPhoto() {
        const infos = document.querySelectorAll('div.attribution-info');
        for (const info of infos) {
            if (info.querySelector(BUTTON_SEL)) continue;

            // The follow-view's contents are rendered client-side, so it may
            // still be empty; the MutationObserver will call us again.
            const followBtn = info.querySelector('.follow-view button');
            if (!followBtn) continue;

            const btn = makeButton(followBtn);
            btn.style.marginLeft = '8px';
            followBtn.after(btn);
        }
        return infos.length > 0;
    }

    // Profile/photostream cover: beside the user's name in the cover photo.
    function injectProfile() {
        const h1 = document.querySelector('div.title-container > h1');
        if (!h1) return false;
        const container = h1.parentElement;
        if (container.querySelector(BUTTON_SEL)) return true;

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
        return true;
    }

    inject();

    // Flickr re-renders the cover area on client-side navigation; re-inject.
    const observer = new MutationObserver(inject);
    observer.observe(document.body, { childList: true, subtree: true });
})();
