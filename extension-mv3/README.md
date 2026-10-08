# Screenbreak extension 2.0 (Manifest V3)

The 1.x extension in `../extension` is Manifest V2, which current Chrome no longer runs. This folder is a
rewrite for Manifest V3 that keeps **Save** working exactly as before and adds **Print**.

## What the user gets

- **Save**: captures the page with SingleFile and uploads it to their Screenbreak account. Same capture settings,
  same API calls and same login flow as 1.x, so the webapp needs no change.
- **Print**: pulls the article out of the page (Mozilla Readability, running in the browser) and opens the print
  page: the article set by the Screenbreak print engine, page by page exactly as it will print. The engine ranks
  our designs for the article and shows the top three with the reason for each; all eleven are a click away.
  Pictures print in colour, as ink-saving halftone dots, in greys, or not at all; long reference lists can be
  left out or kept. Charts drawn on a `<canvas>` or as inline SVG are turned into images first, so they print.
  Embeds (videos, tweets) become a link. Nothing is uploaded.
- **Print straight away**: with this on (Settings or the button's right-click menu) the button works as a printer: the print dialog opens with the reader's settings, and the
  reader is back on the article afterwards, where a card says what printed ("Broadsheet, 5 pages", 6 seconds,
  "Print again"). The print page sends `{ method: "screenbreak.printed", id, tabId, design, pages }` before it
  closes; `background.js` shows the card on that tab. "Choose a design, then print…" in the right-click menu
  always shows the print page.
- **Free tier** (SPEC in screenbreak-notes `free-tier/`): printing is unlimited for everyone, with no print
  counter anywhere. Without an account the reader prints the engine's pick; a free account opens all 11 designs
  and every option and adds a library; Plus keeps everything. The meter is on saves only, as text. The library
  size shows nowhere until the server sends `saves_limit` (no placeholder number in the copy).
- **Not in the UI**: the gift line ("Printed for X, from Y") stays in the engine only (`compose`'s optional
  `gift`); no surface passes it. Print codes are out (SPEC D6): no code on paper, no code page.
- **Account data**: `GET /api/v1/me/` (webapp#103, not built yet), read once per surface by `plans.js`
  `getAccount`: `plan` and `email` for the tier, and `saves_used`, `saves_limit` (free) and `articles` (Plus)
  for the popup's account row, which hides each number the server doesn't send. Until the call exists, everyone
  is a guest. The door and library addresses also live in `plans.js` only.
- **Default action**: clicking the toolbar button either asks (a small menu with Print and Save), prints, or saves.
  The choice can be changed in the menu itself, in Settings, or by right-clicking the button
  ("When I click the button"). Both actions are always available from the right-click menu on the button and on
  the page, and by keyboard: Ctrl+Shift+Y saves, Alt+Shift+P prints.
- **Settings** use the print page's frame, with a sample article on the desk that shows every change as it
  will print.
- **Print and save**: with "Also save what I print" on (popup, Settings or welcome page), every print opens the
  print version straight away and saves the article in the background. The print page's toolbar shows the save:
  "Saving…", then "Saved · Open · Undo", or "Not saved yet · Continue with email".
- **Save when signed out** (popup, shortcut, right-click): the status card asks first ("Save this article to your
  library" · "Continue with email" or "Print instead"), opens the sign-up page
  (`/signup/?from=extension&next=/extension/signed-in/`) only on a click, stores the pending save in
  `chrome.storage.session` under `sbIntent` (`{ kind: "save", sourceUrl, title, created }`), waits with a
  Cancel, then saves by itself and brings the article tab back. Cancel, a timeout or "Print instead" deletes it.
- **Saved**: "Saved to your library" names the article and offers Open and Undo for 8 seconds (paused while the
  pointer is on it); a meter line ("18 of 20 saves this month") shows only from 80% and only when the upload's
  answer carries `saves_used` and `saves_limit`. Undo uses the articles page's remove link until the API has a
  call for it. A full library (429) is a neutral notice, not an error: "Your library is full" with "See Plus ↗"
  and "Print instead".
- **Uninstall**: Chrome opens `https://myscreenbreak.com/bye?v=<version>` (the version only; set in `onInstalled`).
  The survey page itself is website work.

## Build and try it

```sh
npm install
npm run build          # writes dist/
```

Then open `chrome://extensions`, turn on Developer mode, click **Load unpacked** and pick `dist/`.
`npm run zip` builds `screenbreak-extension-chromium.zip` for the Chrome Web Store.

`npm test` loads `dist/` into a headless Chromium and checks Print and Save end to end against a stand-in
for the Screenbreak API (`test/server.mjs`): print, the login prompt, the upload, and Undo. It uses Playwright's
full Chromium (`channel: "chromium"`), because the default headless shell can't load extensions; run
`npx playwright install chromium` once. Set `CHROMIUM_PATH` to use a specific Chromium, and `SB_TEST_PORT` for
another stand-in port (default 8765; `test/paper.mjs` reads it too).

```sh
npm run build && npm test     # print and save end to end (Playwright)
node test/done.mjs            # the print log and the offer scheduler (no browser)
node test/paper.mjs           # the printed page: page counts, end-block modes, QR, one-page prints
```

`node design/capture.mjs design/after` screenshots every surface and state, and checks that text in each column
starts on the same x. `node design/capture-small.mjs` does the same for the popup (guest, unsupported, free,
nearly full, full, already saved, Plus; 320 px wide, full height), the welcome page, "What's new" and the status
cards, with a stand-in `/api/v1/me/`, and runs the guest Save door and the straight-away card for real
(`design/after/small/`). Both take `SB_CAPTURE_PORT` for the stand-in port (capture.mjs default 8766;
capture-small.mjs a free port).
Design notes are in `design/` (`REFERENCES.md` is the reference lock behind the UI).

## How it fits together

| File | Role |
|---|---|
| `src/background.js` | Service worker. Toolbar button, right-click menus, shortcuts, default action; runs Save/Print in the tab; fetches cross-origin resources for SingleFile; uploads. |
| `src/api.js` | Screenbreak API client (`/api/v1/csrf/`, `/api/v1/article/`, `/api/v1/article/<ref_id>/`), unchanged protocol; the remove link for Undo; the key of a saved page. |
| `src/content-save.js` | Injected on Save: SingleFile capture (`single-file-core`), gzip. `content-frames.js` goes into every iframe so embeds are captured too. |
| `src/content-print.js` | Injected on Print: turns canvas/SVG graphics into images, then runs Readability on a copy of the page. |
| `static/print.html`, `src/print.js`, `static/flow.css` | The print page: the desk of pages and the panel of choices. `flow.css` is shared with Settings. |
| `src/engine/`, `engine/` | The print engine, from screenbreak/webapp `printlab/` (branch `claude/project-thread-2c6roz`, 6346675): `layout.js` (article clean-up, image placement, sidenotes, pull quotes, halftones), `recommend.js` (the design picker), the design CSS and `paginate.js` (unchanged). Fonts are copied from `@fontsource` at build time. It runs in the extension until rendering moves to the Screenbreak server; the pages only call `prepare()` and `compose()`. |
| `static/sheet.html`, `src/sheet.js`, `src/desk.js` | One document per design, built by `paginate.js`, shown scaled on the desk and printed as it is. |
| `src/designs.js`, `src/plans.js`, `src/panel.js` | The designs offered and their copy; the tiers (what a guest can print), the account lookup and every door/library address; panel pieces shared by the print page and Settings. |
| `static/popup.html`, `src/popup.js` | The Print/Save menu shown when the default action is "ask", with the click action, shortcuts and the account row. Explains itself on pages Chrome keeps extensions out of. |
| `static/options.html`, `src/options.js` | Settings. `src/settings.js` holds the defaults. |
| `static/welcome.html`, `src/welcome.js` | Opens after install: print the sample, the click action, shortcuts, the free account (step two), setup checks. After an update from a 1.x version only, `#updated` shows "What's new" instead. |
| `src/overlay.js`, `src/status-copy.js` | The status card on the page: one card per tab that changes in place (saving, the Save door, saved with Undo, library full, printed, errors). Every state's copy and actions live in `status-copy.js`. |
| `static/ui.css`, `src/shortcuts.js` | Shared tokens and controls (segmented control, switch, key chips); the live keyboard shortcuts. |

## Not done yet

- Needs the webapp: `GET /api/v1/me/` with `email`, `plan`, `saves_used`, `saves_limit`, `articles` (webapp#103);
  `saves_used`/`saves_limit` in the answer to an upload, for the "Saved" meter; the sign-up page that also signs
  existing readers in, and `/extension/signed-in/` after it (the addresses in `plans.js` are best guesses); a Plus
  page (`/plus/`); an API call to remove an article (Undo uses `/articles/delete/<ref_id>/` today); and a
  different answer for "profile incomplete" than for "logged out" (both are 403).
- Needs the website: `myscreenbreak.com/bye` (the uninstall survey, SPEC C6).
- "Saved 3 Oct · Open ↗" in the popup only knows saves made from this browser (`savedPages` in local storage,
  keyed by a short hash of the address).
- Save has only been tested against the stand-in API, because the production server isn't running.
  The server address is configurable under Settings → Advanced.
- The print engine runs in the extension, so its rules ship with it. Rendering moves to the server before a public
  release (decided 2026-10-07).
- Paper is A4 or US Letter. The print engine's "fit on N pages" isn't offered yet.
- The preview is laid out for the screen and printed as it is; Chrome sets the same lines in print, but a page
  that runs over would be clipped. printlab paginates under print media for that reason.
- Embeds print as links. The live tab could screenshot them instead (`chrome.tabs.captureVisibleTab`), which
  also works behind logins and paywalls.
- Chrome/Edge only; a Firefox build would need a `browser_specific_settings` manifest.
