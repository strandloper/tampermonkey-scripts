// ==UserScript==
// @name         ComicsRSS — Filter GoComics, Stale Feeds & FreshRSS Subscriptions
// @namespace    https://www.comicsrss.com/
// @version      3.9
// @description  Hides GoComics entries. Filters stale feeds. Marks comics already in FreshRSS.
// @author       Steve (via Claude)
// @match        https://www.comicsrss.com/
// @match        https://www.comicsrss.com
// @grant        GM_xmlhttpRequest
// @connect      comicsrss.com
// @connect      192.168.50.71
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ── Configuration ─────────────────────────────────────────────────────────
    const GOCOMICS_HOST     = 'www.gocomics.com';
    const FRESHNESS_DAYS    = 30;
    const FETCH_DELAY_MS    = 150;

    const FRESHRSS_BASE     = 'http://192.168.50.71/freshrss';
    const FRESHRSS_API_KEY  = 'ce041360f7603bf1b8ae963ac580e1b5';

    // ── State ──────────────────────────────────────────────────────────────────
    let freshnessActive  = false;
    let freshnessRunning = false;
    let hideSubscribed   = false;
    const staleLis       = new Set();   // hidden by freshness filter
    const subscribedLis  = new Set();   // have a ✓ badge (may also be hidden)

    // ── UI elements ────────────────────────────────────────────────────────────
    let freshnessBtn, freshnessStatus;
    let freshRSSBtn, freshRSSStatus;

    // ─────────────────────────────────────────────────────────────────────────
    // UTILITIES
    // ─────────────────────────────────────────────────────────────────────────

    function gmFetch(url, params) {
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method:    'POST',
                url,
                headers:   { 'Content-Type': 'application/x-www-form-urlencoded' },
                data:      params,
                onload:    r  => resolve(r.status === 200 ? r.responseText : null),
                onerror:   () => resolve(null),
                ontimeout: () => resolve(null),
                timeout:   8000,
            });
        });
    }

    function gmGet(url) {
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method:    'GET',
                url,
                onload:    r  => resolve(r.status === 200 ? r.responseText : null),
                onerror:   () => resolve(null),
                ontimeout: () => resolve(null),
                timeout:   10000,
            });
        });
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function getRssUrl(li) {
        for (const a of li.querySelectorAll('a[href]')) {
            try {
                const url = new URL(a.href);
                if (url.hostname === 'www.comicsrss.com' && url.pathname.endsWith('.rss')) {
                    return a.href;
                }
            } catch { /* ignore */ }
        }
        return null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. GOCOMICS FILTER
    // ─────────────────────────────────────────────────────────────────────────

    function hideGoComicsEntries() {
        let hiddenCount = 0;
        document.querySelectorAll('ul li').forEach(li => {
            for (const a of li.querySelectorAll('a[href]')) {
                try {
                    if (new URL(a.href).hostname === GOCOMICS_HOST) {
                        li.dataset.gocomics = '1';
                        li.style.display = 'none';
                        hiddenCount++;
                        break;
                    }
                } catch { /* ignore */ }
            }
        });
        return hiddenCount;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. FRESHRSS SUBSCRIPTION SYNC
    // ─────────────────────────────────────────────────────────────────────────

    async function fetchFreshRSSFeeds() {
        const url  = `${FRESHRSS_BASE}/api/fever.php?api&feeds`;
        const text = await gmFetch(url, `api_key=${FRESHRSS_API_KEY}`);
        if (!text) return null;
        try {
            const data = JSON.parse(text);
            // data.feeds is an array of {id, feed_url, title, ...}
            return data.feeds ? data.feeds.map(f => f.url).filter(Boolean) : null;
        } catch {
            return null;
        }
    }

    function normUrl(raw) {
        // Normalise for comparison — lowercase, strip trailing slash
        try {
            const u = new URL(raw);
            return (u.hostname + u.pathname).toLowerCase().replace(/\/$/, '');
        } catch {
            return raw.toLowerCase().replace(/\/$/, '');
        }
    }

    function addSubscribedBadge(li) {
        if (li.querySelector('.crss-subscribed-badge')) return; // already badged
        const tick = document.createElement('span');
        tick.className = 'crss-subscribed-badge';
        tick.textContent = '✓ ';
        Object.assign(tick.style, {
            color:      '#2a7a2a',
            fontWeight: 'bold',
        });
        // The title lives inside <div class="ellipsis"> — insert the tick there
        // so it sits inline with the title text without disrupting the li's flex layout.
        const titleDiv = li.querySelector('div.ellipsis');
        if (titleDiv) {
            titleDiv.insertBefore(tick, titleDiv.firstChild);
        } else {
            li.insertBefore(tick, li.firstChild);
        }
    }

    async function syncFreshRSS() {
        freshRSSBtn.disabled = true;
        freshRSSBtn.textContent = '⏳ Connecting…';
        setFreshRSSStatus('Fetching subscriptions from FreshRSS…');

        const feedUrls = await fetchFreshRSSFeeds();

        if (!feedUrls) {
            freshRSSBtn.disabled = false;
            freshRSSBtn.textContent = '🔄 Retry FreshRSS sync';
            setFreshRSSStatus('⚠ Could not reach FreshRSS — are you on the home network?');
            return;
        }

        const normalisedFreshRSS = new Set(feedUrls.map(normUrl));

        // Build a map of normalised RSS URL → li for quick lookup
        const allLis = [...document.querySelectorAll('ul li')]
            .filter(li => !li.dataset.gocomics);

        let matchCount = 0;
        subscribedLis.clear();

        for (const li of allLis) {
            const rssUrl = getRssUrl(li);
            if (!rssUrl) continue;
            if (normalisedFreshRSS.has(normUrl(rssUrl))) {
                addSubscribedBadge(li);
                subscribedLis.add(li);
                matchCount++;
            }
        }

        freshRSSBtn.disabled = false;

        if (hideSubscribed) {
            // Re-apply hide state to any newly found subscribed entries
            subscribedLis.forEach(li => { li.style.display = 'none'; });
            freshRSSBtn.textContent = '👁 Show subscribed feeds';
        } else {
            freshRSSBtn.textContent = '🙈 Hide subscribed feeds';
        }

        setFreshRSSStatus(
            matchCount > 0
                ? `${matchCount} feed${matchCount !== 1 ? 's' : ''} already in FreshRSS — marked with ✓`
                : 'No comics feeds matched your FreshRSS subscriptions.'
        );
    }

    function toggleHideSubscribed() {
        if (subscribedLis.size === 0) {
            // Haven't synced yet — kick off sync
            syncFreshRSS();
            return;
        }
        hideSubscribed = !hideSubscribed;
        subscribedLis.forEach(li => {
            li.style.display = hideSubscribed ? 'none' : '';
        });
        freshRSSBtn.textContent = hideSubscribed ? '👁 Show subscribed feeds' : '🙈 Hide subscribed feeds';
        setFreshRSSStatus(
            hideSubscribed
                ? `${subscribedLis.size} subscribed feed${subscribedLis.size !== 1 ? 's' : ''} hidden.`
                : `${subscribedLis.size} subscribed feed${subscribedLis.size !== 1 ? 's' : ''} restored.`
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. FRESHNESS FILTER
    // ─────────────────────────────────────────────────────────────────────────

    async function fetchMostRecentPubDate(rssUrl) {
        try {
            const text = await gmGet(rssUrl);
            if (!text) return null;
            const xml = new DOMParser().parseFromString(text, 'application/xml');
            const pubDates = [...xml.querySelectorAll('item pubDate')]
                .map(el => new Date(el.textContent.trim()))
                .filter(d => !isNaN(d));
            if (!pubDates.length) return null;
            return new Date(Math.max(...pubDates));
        } catch {
            return null;
        }
    }

    async function applyFreshnessFilter() {
        if (freshnessRunning) return;
        freshnessRunning = true;
        freshnessActive  = true;
        freshnessBtn.textContent = '⏳ Filtering…';
        freshnessBtn.disabled    = true;

        const candidates = [...document.querySelectorAll('ul li')]
            .filter(li => !li.dataset.gocomics && !staleLis.has(li));

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - FRESHNESS_DAYS);

        let checked = 0, hidden = 0;
        const total = candidates.length;
        setFreshnessStatus(`Checking feeds… 0 / ${total}`);

        for (const li of candidates) {
            const rssUrl = getRssUrl(li);
            if (!rssUrl) { checked++; continue; }

            const latestDate = await fetchMostRecentPubDate(rssUrl);
            checked++;

            if (latestDate === null || latestDate < cutoff) {
                li.style.display = 'none';
                li.dataset.stale = '1';
                staleLis.add(li);
                hidden++;
            }

            setFreshnessStatus(`Checking feeds… ${checked} / ${total} — ${hidden} stale so far`);
            await sleep(FETCH_DELAY_MS);
        }

        freshnessRunning = false;
        freshnessBtn.disabled    = false;
        freshnessBtn.textContent = '✅ Freshness filter ON — click to restore stale feeds';
        setFreshnessStatus(`Done. ${hidden} feed${hidden !== 1 ? 's' : ''} hidden as stale. ${total - hidden} fresh feeds shown.`);
    }

    function removeFreshnessFilter() {
        staleLis.forEach(li => {
            li.style.display = '';
            delete li.dataset.stale;
        });
        staleLis.clear();
        freshnessActive = false;
        freshnessBtn.textContent = '🔍 Filter by freshness (last 30 days)';
        setFreshnessStatus('Stale feeds restored. Click the button to filter again.');
    }

    function toggleFreshness() {
        if (freshnessRunning) return;
        freshnessActive ? removeFreshnessFilter() : applyFreshnessFilter();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. UI
    // ─────────────────────────────────────────────────────────────────────────

    function makeBar(topOffset, bgColor) {
        const bar = document.createElement('div');
        Object.assign(bar.style, {
            position:    'sticky',
            top:         topOffset,
            zIndex:      '9998',
            background:  bgColor,
            color:       '#e8f0ff',
            padding:     '7px 16px',
            fontSize:    '13px',
            display:     'flex',
            alignItems:  'center',
            gap:         '14px',
            boxShadow:   '0 2px 6px rgba(0,0,0,0.35)',
            flexWrap:    'wrap',
        });
        return bar;
    }

    function makeBtn(label) {
        const btn = document.createElement('button');
        btn.textContent = label;
        Object.assign(btn.style, {
            background:   '#2e6da4',
            color:        '#fff',
            border:       'none',
            borderRadius: '4px',
            padding:      '5px 12px',
            fontSize:     '13px',
            cursor:       'pointer',
            whiteSpace:   'nowrap',
            flexShrink:   '0',
        });
        btn.addEventListener('mouseenter', () => { if (!btn.disabled) btn.style.background = '#3a85c8'; });
        btn.addEventListener('mouseleave', () => { if (!btn.disabled) btn.style.background = '#2e6da4'; });
        return btn;
    }

    function makeStatus(text) {
        const s = document.createElement('span');
        s.textContent = text;
        s.style.flexGrow = '1';
        return s;
    }

    function setFreshnessStatus(msg)  { if (freshnessStatus)  freshnessStatus.textContent  = msg; }
    function setFreshRSSStatus(msg)   { if (freshRSSStatus)   freshRSSStatus.textContent   = msg; }

    function buildUI(gocomicsCount) {
        // Red GoComics banner
        const gcBanner = document.createElement('div');
        Object.assign(gcBanner.style, {
            position:  'sticky', top: '0', zIndex: '9999',
            background: '#8b2020', color: '#fff',
            padding: '7px 16px', fontSize: '13px', textAlign: 'center',
            boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
        });
        gcBanner.textContent =
            `⛔ ${gocomicsCount} GoComics entr${gocomicsCount === 1 ? 'y' : 'ies'} hidden — feeds broken due to copyright takedown.`;

        // Blue freshness bar
        const freshnessBar = makeBar('30px', '#1a3a5c');
        freshnessBtn    = makeBtn('🔍 Filter by freshness (last 30 days)');
        freshnessStatus = makeStatus('Click to check which feeds have been updated in the last 30 days.');
        freshnessBtn.addEventListener('click', toggleFreshness);
        freshnessBar.appendChild(freshnessBtn);
        freshnessBar.appendChild(freshnessStatus);

        // Green FreshRSS bar
        const freshRSSBar = makeBar('62px', '#1a4a2a');
        freshRSSBtn    = makeBtn('🔄 Sync with FreshRSS');
        freshRSSStatus = makeStatus('Click to mark feeds already in your FreshRSS Comics category.');
        freshRSSBtn.addEventListener('click', () => {
            if (subscribedLis.size > 0) {
                toggleHideSubscribed();
            } else {
                syncFreshRSS();
            }
        });
        freshRSSBar.appendChild(freshRSSBtn);
        freshRSSBar.appendChild(freshRSSStatus);

        // Insert all three at top of body (reverse order so they stack correctly)
        document.body.insertBefore(freshRSSBar,  document.body.firstChild);
        document.body.insertBefore(freshnessBar, document.body.firstChild);
        document.body.insertBefore(gcBanner,     document.body.firstChild);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ENTRY POINT
    // ─────────────────────────────────────────────────────────────────────────

    const gocomicsCount = hideGoComicsEntries();
    buildUI(gocomicsCount);

    // Kick off FreshRSS sync automatically — it's fast (single request)
    // and will silently do nothing if unreachable
    syncFreshRSS();

})();
