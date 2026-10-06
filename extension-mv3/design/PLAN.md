# Extension 2.0 design plan

Branch `claude/project-thread-kdr8g7` (PR screenbreak/SingleFile#1). Baseline taken 2026-10-06 at `cffcef88`.
Extraction logic (`src/content-print.js`, Readability) is out of scope: a separate process improves it.

## 1. Baseline: what exists and what is wrong

Captures: headless Chromium with `dist/` loaded (`design/baseline/`), plus Yorgos's real-Chrome screenshots.
Left edges and tops are CSS px at 1280 wide, measured with `getBoundingClientRect()` on the first text node.

| Surface | Defects found |
|---|---|
| Popup | Default action is a native `<select>` inside a sentence ("Clicking the button asks me"); the OS menu covers the label. `system-ui` font, not Work Sans. No shortcut hints. No state for pages it can't run on. No account state. Left edges OK: logo / label / Settings 14, icons 27, text 63. |
| Right-click menus | Save to Screenbreak · Print this article · When I click the button ▸ (radio). Fine, but nothing tells the user they exist. On chrome://, Web Store and PDF pages the only signal is a red "!" badge. |
| Status overlay | Error card keeps the green edge: `.ui.card.error` never matches (class is `card error`). No network shows the raw "Failed to fetch". "Saved" has no undo and no link to the article itself, only "Open my articles". No Retry. Login wait is silent for up to 5 min with no button. Auto-hides after 8 s even on hover. |
| Settings | Opens on install in place of a welcome. Radio labels at 351 vs headings 330; "Advanced" summary at 346. Shortcuts are hard-coded text, wrong once the user changes them. Native selects. |
| Print page | (a) The extracted `<article>` gets the page-card styles from the bare `article` selector: a second card inside the page, body text at 364 vs title at 304. (b) Raw radios; legends 2 px above labels; the toolbar wraps into two ragged rows at 700 px. (c) Standfirst repeats the byline ("By Maria Papadopoulou"). (d) Expired state still shows the toolbar with empty radios and a live Print button (`.toolbar{display:flex}` beats `hidden`). (e) Long source URL breaks mid-word. (f) Two columns: in the New Yorker print the left column starts lower than the right; the fixture does not reproduce it, needs a fixture with a leading wrapper margin. (g) Justified text in narrow columns opens wide word gaps. (h) Chrome's own header (date, title) prints next to ours: check which margin boxes suppress it. |
| Save login | 403 opens the login tab once by itself, then polls every 5 s for 5 min. An incomplete profile also returns 403, so it waits for a login that already happened. |
| Tests | `npm test` fails on this Mac: Playwright 1.63 headless shell can't load extensions. Passes with `CHROMIUM_PATH` = full Chromium. Fix with `channel: "chromium"`. |

## 2. Proposed new pages and states

1. **Welcome (first run)**, replaces opening Settings on install: pin the button (Chrome hides new icons in the puzzle menu), what Save and Print do, pick the click action, live shortcuts, try it on a sample article, log in (only needed for Save).
2. **Popup v2**: two actions with shortcut hints; click action as a segmented control or menu, not a native select; account line; "can't run on this page" state; narrow width.
3. **Save login prompt**: overlay "Log in to save this article" with Log in and Cancel; then "Waiting for you to log in" with Cancel; continues by itself; timeout with Try again. Separate "Finish your profile" case.
4. **Saved**: title of the article, Open in Screenbreak (`/articles/<ref_id>/`), Undo for a few seconds, hover pauses the timer.
5. **Errors**, each with plain copy and one action: offline, server error, monthly limit (server sends title, message, upgrade link), page not reachable (chrome://, Web Store, PDF viewer), no article found for Print.
6. **Print page v2**: toolbar with segmented controls and keyboard; states loading, ready, images still loading, expired (real empty state with a way back), no article; narrow layout.
7. **Settings v2**: one aligned column, segmented controls, live shortcuts with a Change link, account and server, reset to defaults.
8. **Discoverability**: shortcut hints in the popup, tooltips and welcome; one tip after the first success ("Right-click the page to save or print").
9. **What's new** on update from 1.x: Print is new.

## 3. Needs Nikos (webapp)

- Undo: an API call to remove an article the user just saved. Today only `GET /articles/delete/<ref_id>/` exists: a page view, soft delete, no check that the article belongs to the user (security issue to raise).
- Account state for popup and welcome: a "who am I" endpoint (email, plan, uploads used this month).
- Tell "not logged in" from "profile incomplete": both are 403 today.

## 4. Next: Refero research

Opus research agents, one topic each, images checked, screen ids cited:
1. Save-to-X extension popups and toolbar menus (Pocket, Matter, Readwise Reader, Raindrop, Notion clipper, Instapaper).
2. Toasts and status overlays: working, success with undo and open, error with retry.
3. First run after install: pin the extension, choose a default, try it.
4. In-context login prompts and wait / hand-off states.
5. Reader and print settings toolbars: segmented controls, font, size, columns, images.
6. Settings pages: single column, segmented controls, toggles, shortcut display.
7. Empty, expired, offline and error pages.

Then one reference lock in `design/REFERENCES.md`. Build order: tokens and shared components, popup, overlay states, print page, settings, welcome, login flow. Each surface: screenshots, left-edge script, awkward cases.

## 5. Awkward cases for every surface

Very long title · no author / date / hero · no article found · no network · server 500 · monthly limit · logged out · chrome:// page · narrow popup · print window at 700 px · two columns · serif · images off · RTL article.

## 6. Chrome Web Store

- Package sent 2026-10-06 = `cffcef88` (old UI).
- Save is still untested against production (README).
- `<all_urls>` host permission triggers in-depth review: needs a written justification.
- Data disclosure: Print uploads nothing; Save uploads the page HTML to the user's own account.

## 7. Status (2026-10-06, end of day)

Built and verified in headless Chromium (`design/capture.mjs`: 16/16 alignment checks, 37 screenshots; `npm test` passes):
popup, status card (all states), print page (toolbar, loading, images loading, expired, nothing to print, 2 columns), settings, welcome / what's new.
Fixed from section 1: nested article card, standfirst = byline, expired toolbar, long URL breaks, error edge colour, raw "Failed to fetch", popup native select, settings indents, hard-coded shortcuts, `npm test` on this Mac.
Open: Chrome's own print header and footer (all margin boxes now claimed; needs a check in real Chrome's print dialog), the 3 webapp items in REFERENCES.md, dark mode (not designed).
