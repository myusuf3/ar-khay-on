# Keep — one-click Karakeep saver for keep.booq.cc

A tiny Chrome (MV3) extension to use instead of the official Karakeep extension.
Click the toolbar icon (or press **⌥⇧K** on Mac, **Ctrl+Shift+K** elsewhere) and the current
page goes to `https://keep.booq.cc`. There's no popup: a small Karakeep toast in the
bottom-right corner of the page shows the result:

- **Saving to Karakeep…**: the bookmark ribbon hovers above its slot in the logo
- **Saved to Karakeep ✓**: the ribbon drops into place, the tile pops, and a check draws in
- **Already in Karakeep ✓**: if the URL was already saved
- Errors (bad key, server unreachable) show in the same pill

Click the toast to open the bookmark in Karakeep. Hovering pauses the auto-dismiss.
Honors `prefers-reduced-motion`. On pages Chrome won't let extensions script
(`chrome://`, the Web Store) it falls back to a ✓ / ! badge on the icon.

Right-click menu: save page, link, image, or selected text.

The toolbar icon is a solid black tile with a white glyph, so it stays visible on any
toolbar color - light, dark, or a custom theme. Chrome doesn't expose the toolbar color
to extensions, so swapping icons per theme can't be done reliably.

## Install

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → pick this folder.
2. The settings page opens. Paste an API key from
   keep.booq.cc → Settings → API Keys. It's checked against `/api/v1/users/me`.
3. Pin the icon. Done.

If you want, remove the official Karakeep extension. You can change the shortcut at `chrome://extensions/shortcuts`.

## How it works

- `background.js`: `POST https://keep.booq.cc/api/v1/bookmarks` with
  `{ type: "link", url, title, source: "extension" }` and `Authorization: Bearer <key>`
  (the same REST API the official extension's server exposes; 201 = new, 200 = already exists).
- `toast.js`: injected on click through `activeTab` + `scripting`. It renders in a closed
  shadow root so page CSS can't touch it and it can't break the page.
- `options.html/js`: stores the API key in `chrome.storage.local`.

The server is hardcoded (`SERVER` in `background.js`, `API` in `options.js`,
`host_permissions` in `manifest.json`).

Icons are taken from the Karakeep repo (`apps/browser-extension/public`, AGPL-3.0), with the glyph cutout filled in white.
