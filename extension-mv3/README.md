# Screenbreak extension 2.0 (Manifest V3)

The 1.x extension in `../extension` is Manifest V2, which current Chrome no longer runs. This folder is a
rewrite for Manifest V3 that keeps **Save** working exactly as before and adds **Print**.

## What the user gets

- **Save**: captures the page with SingleFile and uploads it to their Screenbreak account. Same capture settings,
  same API calls and same login flow as 1.x, so the webapp needs no change.
- **Print**: pulls the article out of the page (Mozilla Readability, running in the browser), opens it in a clean
  print layout and opens the print dialog, which also offers "Save as PDF". Nothing is uploaded, and no account
  is needed. Charts drawn on a `<canvas>` or as inline SVG are turned into images first, so they print.
  Embeds (videos, tweets) become a link.
- **Default action**: clicking the toolbar button either asks (a small menu with Save and Print), saves, or prints.
  The choice can be changed in the menu itself, in Settings, or by right-clicking the button
  ("When I click the button"). Both actions are always available from the right-click menu on the button and on
  the page, and by keyboard: Ctrl+Shift+Y saves, Alt+Shift+P prints.
- **Print options**: font (sans/serif), text size, one or two columns, images on/off. Set defaults in Settings
  or adjust them on the print page before printing; the last choice is remembered.
- **Save when logged out**: the status card asks first ("Log in" or "Print instead"), opens the login page only
  on a click, waits with a Cancel, then saves by itself and brings the article tab back.
- **Saved**: the card names the article and offers "Open in Screenbreak" and Undo for 8 seconds (paused while the
  pointer is on it). Undo uses the articles page's remove link until the API has a call for it.

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
`npx playwright install chromium` once. Set `CHROMIUM_PATH` to use a specific Chromium.

`node design/capture.mjs design/after` screenshots every surface and state, and checks that text in each column
starts on the same x. Design notes are in `design/` (`REFERENCES.md` is the reference lock behind the UI).

## How it fits together

| File | Role |
|---|---|
| `src/background.js` | Service worker. Toolbar button, right-click menus, shortcuts, default action; runs Save/Print in the tab; fetches cross-origin resources for SingleFile; uploads. |
| `src/api.js` | Screenbreak API client (`/api/v1/csrf/`, `/api/v1/article/`, `/api/v1/article/<ref_id>/`), unchanged protocol. |
| `src/content-save.js` | Injected on Save: SingleFile capture (`single-file-core`), gzip. `content-frames.js` goes into every iframe so embeds are captured too. |
| `src/content-print.js` | Injected on Print: turns canvas/SVG graphics into images, then runs Readability on a copy of the page. |
| `static/print.html`, `src/print.js`, `static/print.css` | The print page. `print.css` is a port of the 1.x booklet's article layout (Work Sans, Trirong, Inconsolata, green accents). |
| `static/popup.html`, `src/popup.js` | The Save/Print menu shown when the default action is "ask", with the click action and shortcuts. Explains itself on pages Chrome keeps extensions out of. |
| `static/options.html`, `src/options.js` | Settings. `src/settings.js` holds the defaults. |
| `static/welcome.html`, `src/welcome.js` | Opens after install (and, with "What's new", after an update from 1.x): pin the button, choose the click action, shortcuts, right-click. |
| `src/overlay.js`, `src/status-copy.js` | The status card on the page: one card per tab that changes in place (saving, log in, saved with Undo, errors). Every state's copy and actions live in `status-copy.js`. |
| `static/ui.css`, `src/shortcuts.js` | Shared tokens and controls (segmented control, switch, key chips); the live keyboard shortcuts. |

## Not done yet

- Needs the webapp: an API call to remove an article (Undo uses `/articles/delete/<ref_id>/` today), a "who am I"
  call for an account line, and a different answer for "profile incomplete" than for "logged out" (both are 403).

- Save has only been tested against the stand-in API, because the production server isn't running.
  The server address is configurable under Settings → Advanced.
- One print layout. Layouts per article type (from the print work) should replace `print.css`, picked by
  `print.js`.
- Embeds print as links. The live tab could screenshot them instead (`chrome.tabs.captureVisibleTab`), which
  also works behind logins and paywalls.
- Chrome/Edge only; a Firefox build would need a `browser_specific_settings` manifest.
