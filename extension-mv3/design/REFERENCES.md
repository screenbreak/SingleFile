# Reference lock: extension 2.0 UI

Research 2026-10-06: 3 Refero styles in full plus 7 topic notes in `research/` (≈110 screen searches, ≈150 images). Screen ids are Refero ids; the notes give the full UUIDs.

## Lock

- **Primary direction: Perplexity product chrome** (style `5c7acdfb`). Compact, restrained UI. One deep teal/green accent only for the primary action, the selected state and focus. Thin hairlines, light shadows, 8 px rhythm, small radii. Screenbreak's `#005D4C` takes the accent role exactly as Perplexity's `#016a71` does.
- **Preserve:** white surfaces; ink text; one accent with a narrow role; hairlines over boxes; compact 32–36 px controls; type hierarchy by size and weight, not colour.
- **Borrow only:**
  1. Serif display titles (Readwise `c848b5d7`): Trirong for page titles, section titles on full pages, and article titles. Never in buttons, labels or controls.
  2. Paper sheet on a desk (Symbolic.ai `b49ec76c`): only for the print preview. A white A4 sheet with a soft two-layer lift on a neutral desk colour.
- **Role rules:** green = primary button fill, switch on, focus ring, links. `#4c9b6e` = progress fill only. Tint `#edf2ee` (webapp and 1.x) = control tracks, key chips, hover fills. Red `#b3261e` = error icon only, never a fill or an edge.
- **Media:** no illustrations or mascots anywhere (all 7 notes reject them). Drawn UI (toolbar, context menu) only on the welcome page, as code-native diagrams.
- **Reject:** cream or ivory UI canvases, coloured accent bars on cards (today's overlay), native selects, modals over the article, "Oops" copy, a second accent colour.

## Tokens

| Token | Value | Role |
|---|---|---|
| `--ink` | `#1d1d1b` | text, icons |
| `--ink-2` | `#4a5250` | secondary text |
| `--muted` | `#6b7370` | captions, hints, key chip text |
| `--green` | `#005d4c` | accent (roles above) |
| `--green-hover` | `#00483b` | primary hover |
| `--progress` | `#4c9b6e` | progress fill |
| `--tint` | `#edf2ee` | tracks, chips, hover |
| `--line` | `rgba(29,29,27,.12)` | hairlines, borders |
| `--canvas` | `#ffffff` | page and card surfaces |
| `--desk` | `#e8e9e5` | behind the print sheet only |
| `--danger` | `#b3261e` | error icon only |
| radius | 4 chips · 6 thumbs · 8 controls, buttons, rows · 10 status card | |
| shadow | `0 1px 2px rgba(29,29,27,.06), 0 8px 24px rgba(29,29,27,.12)` | status card, pin callout, sheet |
| type | Work Sans variable 400–700 (UI); Trirong 500 (display, article titles) | |

## Decision ledger

| Decision | Source |
|---|---|
| Popup 320 px; flat 56 px rows (icon 20, title 14/500, description 12.5); hover fill radius 8 | Todoist `2b7297d6`, Raycast `4a3426e7`, Matter `f5cd2c6c` |
| One left edge in the popup: x 16 for logo, icons, footer; x 48 for text | Todoist `2b7297d6`; Yorgos's alignment rule |
| One key chip per key, right of the row, from `chrome.commands.getAll()` | Amie `85d34fc5`, Raycast `4a3426e7`, Dona `39d8e3de` |
| Click action as a segmented control Ask · Save · Print, with a consequence line | Supercut `7776d0fc`, Amie `2cd59ba6` |
| Unsupported page: rows disabled, Trirong note, one line of why | mymind `ab68a80b` |
| One status card per tab that changes in place; icon carries the status, no accent bar | Shuttle `d9c3d968` → `a2e63dac`; Tango `6045ad8a` (rejected) |
| Saved state names the article; Undo with a countdown line, pause on hover and focus | Linear `d0d9c7d9`, Pocket `f96968cc`, Hello Ivy `92335de2`, Twist `16c7520e` |
| Working state with named steps and a 3-step bar | Shuttle `d9c3d968`, Dropbox `f205b205` |
| Login tab opens only on click; card holds the wait with Cancel and "Open login tab"; save continues and the article tab comes back | Wynde `7fcf156e`, Xbox `85362106`, Plaid `ad464b8a`, Teams `61939138`, Cursor flow 9917 |
| Errors: cause then fix, one action; offline separate from server; "Print instead" when Save is blocked | Twist `a7b8a7c7` (rejected), Pocket `6bd73b34`, Slite `229f0c74`, Claude `4030cd10` |
| Print toolbar: one 56 px sticky row; Serif/Sans set in their own faces; size as three "A"s; column icons; images switch; Print right | Craft `755fa3f2`, Medium `4ccc779c`, Substack `7821f944`, DocuSign `1f0198f2` |
| Segments 32 px, white thumb on a tint track, no green on segments | ElevenReader `c61d33bc`, Medium `4ccc779c` |
| Print expired / no article: toolbar hidden, text on the article column, Trirong title, one button and one link | Zara `232f8bd8`, Contra `209d65b9`, Family `2eb69beb` |
| Settings: one 560 px column, no card, text on one left x and controls on one right x | Rise `23dad935`, Matter `7baf4158` |
| Settings autosave note under the title; reset as a link with Undo | Whereby `a76499eb`, Missive `06229a09` |
| Print and save: one switch ("Also save what I print") for every way of printing, not a 4th click action; the background save reports quietly in the print toolbar, left of Print | W&B autosave status `452e5353`, Revolut toggle row `14b7365e`; Yorgos's request 2026-10-06 |
| Welcome: one scrolling page; pin callout first, detected with `isOnToolbar`; radio cards; keycaps; optional login; what's new for 1.x users | mymind `ab68a80b`, Arcade `c7bc6e09`, Mailchimp `d8930ed2`, Linear `08aba202`, ElevenMusic `22e176ed` |

## Not built (needs the webapp)

- Account line ("Logged in as …") in popup, settings and welcome: no "who am I" API.
- "Finish your profile" state: the API answers 403 for logged out and for profile incomplete.
- Save counts in the limit message ("10 of 10 saves"): the server message has no count.
- Print page count ("4 pages"): the browser does not expose it before the print dialog.
