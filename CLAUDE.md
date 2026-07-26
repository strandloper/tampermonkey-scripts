# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A flat collection of independent Tampermonkey userscripts. There is no shared code, no build step,
no package.json, no linter, and no test suite — each `.js` file is a complete, self-contained script
that Tampermonkey loads directly from source.

## Development workflow

There are no build/lint/test commands. To develop or verify a change:

1. Edit the `.user.js` file directly.
2. Open the file's raw contents in the browser (or use Tampermonkey's dashboard "Edit" for the
   installed script) and paste/sync the updated source — Tampermonkey re-runs it on the next
   matching page load.
3. Bump the `@version` header when shipping a change to an already-installed script; Tampermonkey
   uses it to detect updates.
4. Manually exercise the affected site in a browser. There is no automated way to verify DOM
   scraping/mutation logic — reload the target URL(s) from the script's `@match` list and check
   behavior directly.

## File naming

Scripts follow `<site>-<feature>.user.js` (e.g. `flickr-tag-filter.user.js`). The one exception,
`howtogeek-adblock-dismisser.js`, lacks the `.user.js` suffix — check a file's `==UserScript==`
header rather than assuming behavior from its filename.

## Common structure across every script

Each file is a single IIFE (`(function () { 'use strict'; ... })()`) preceded by a userscript
metadata block. When editing one script, the patterns below are established conventions shared
by the others — follow them rather than introducing new patterns:

- **`@grant`**: `none` when the script only touches the current page's DOM. `GM_xmlhttpRequest`
  (plus `@connect` entries for every host it calls) when a script needs to reach a cross-origin
  endpoint the page's own CSP/CORS would otherwise block. `GM_getValue`/`GM_setValue` for
  persisted state across page loads.
- **SPA lifecycle**: the Flickr scripts (`flickr-albums-sort-filter.user.js`,
  `flickr-group-my-photos.user.js`) run on pages that use client-side routing, so a full page load
  doesn't happen on navigation. They poll `location.pathname` on an interval and/or use
  `MutationObserver` on `document.body` to detect both route changes and Flickr's own
  re-rendering, calling matching `init()`/`teardown()` pairs so the script's DOM insertions don't
  leak across navigations or get duplicated.
- **Async network helpers**: scripts that call `GM_xmlhttpRequest` wrap it in a small
  Promise-returning helper (e.g. `gmFetch`/`gmGet` in `comicsrss-filter.user.js`) that resolves
  `null` on error/timeout instead of rejecting, so callers can `await` without try/catch at every
  call site.
- **Injected UI**: scripts that add buttons/bars/toasts build DOM nodes by hand with
  `Object.assign(el.style, {...})` rather than injecting stylesheet classes for one-off elements
  (see `makeBar`/`makeBtn` in `comicsrss-filter.user.js`, the toast in
  `howtogeek-adblock-dismisser.js`). Scripts with more elaborate styling instead inject a `<style>`
  block once (see `flickr-albums-sort-filter.user.js`).
- **Debounced filtering**: text-input filters debounce with `setTimeout`/`clearTimeout` before
  re-applying (`FILTER_DEBOUNCE_MS` pattern in `flickr-albums-sort-filter.user.js`).

## Personal configuration baked into scripts

Several scripts hardcode endpoints/credentials specific to the author's own setup rather than
exposing them as user-facing settings — this is intentional for personal-use scripts, not an
oversight to "fix" generically:

- `comicsrss-filter.user.js` hardcodes a FreshRSS base URL/API key (`FRESHRSS_BASE`,
  `FRESHRSS_API_KEY`) pointing at a home-network IP.
- `flickr-tag-filter.user.js` hardcodes a remote tag-list URL (`REMOTE_TAG_LIST_URL`) served from
  a Tailscale host, with a `PLACEHOLDER_TAGS` fallback if that endpoint is unreachable.
- `flickr-group-my-photos.user.js` and the `@match` blocks in the Flickr scripts hardcode the
  author's own Flickr username (`strandloper`).

When modifying these, preserve the hardcoded-personal-config pattern rather than generalizing it
into options/settings unless asked.
