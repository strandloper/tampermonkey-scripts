# tampermonkey-scripts

A collection of personal [Tampermonkey](https://www.tampermonkey.net/) userscripts. Each script is
a standalone `.js` file with no shared code, build step, or dependencies — install the ones you
want directly from source.

## Installation

1. Install the [Tampermonkey](https://www.tampermonkey.net/) browser extension.
2. Open the raw content of the script you want from this repo.
3. Tampermonkey will detect the userscript and prompt you to install it. Review the `@match` and
   `@grant` lines in the header before installing, since a couple of scripts talk to external
   endpoints (see below).

## Scripts

### `comicsrss-filter.user.js`
Enhances [comicsrss.com](https://www.comicsrss.com/): hides GoComics entries (whose feeds are
broken due to a copyright takedown), adds a button to filter out feeds that haven't posted in the
last 30 days, and syncs with a FreshRSS instance to mark/hide comics you're already subscribed to.
The FreshRSS base URL and API key are hardcoded for a specific home-network install — edit
`FRESHRSS_BASE`/`FRESHRSS_API_KEY` to point at your own instance.

### `flickr-albums-sort-filter.user.js`
On a Flickr user's albums list page, sorts albums alphabetically and adds a live text filter box
to the toolbar. Takes over the album grid's layout with CSS since Flickr positions tiles with
absolute coordinates that don't follow DOM order.

### `flickr-group-my-photos.user.js`
Adds a "My Photos" tab next to the "Pool" tab on Flickr group pages, linking to just your own
photos in that group's pool. The target Flickr username is hardcoded (`strandloper`) — change it
to your own.

### `flickr-tag-filter.user.js`
On a Flickr user's tags page, adds a toggle button that hides every tag except a chosen allow-list.
The allow-list can be edited in place (`PLACEHOLDER_TAGS`) or loaded from a remote JSON endpoint
(`REMOTE_TAG_LIST_URL`) if you want to share the list with other tooling.

### `howtogeek-adblock-dismisser.js`
Automatically dismisses the adblock-detection banner on howtogeek.com and shows a brief toast
confirming it did so.

## Development

There's no build, lint, or test tooling — these are plain userscripts loaded directly by
Tampermonkey. To make changes, edit a file directly, bump its `@version` header, and reload it in
Tampermonkey's dashboard, then verify the behavior by visiting the matching site.

See [CLAUDE.md](CLAUDE.md) for the conventions shared across scripts (SPA navigation handling,
async network helpers, UI injection patterns, etc.) if you're extending one of them.

## License

Public domain, via [The Unlicense](LICENSE).
