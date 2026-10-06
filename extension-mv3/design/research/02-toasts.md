# 02 · Toasts and status overlays: research for the in-page status card

Source: Refero (24 screen searches, 2 flow searches, similar-screens on 3 hits, 31 images seen, 4 at full size). Px values are read from 800 px captures of about 1440 px desktops (×1.8), so they are approximate. Timings do not show in screenshots, so every timing below is a proposal.
Gaps: Refero has no screens for Raindrop, Notion Clipper, Readwise, Instapaper, Arc, Gmail, Vercel or Google Drive uploads.

## 1. Top references

| # | Screen | What it does well | Adopt |
|---|---|---|---|
| 1 | Linear `d0d9c7d9` | White card, bottom-right: check + "Issue created", a row naming the item, a "View issue" link, × at top right | Three rows: **status / item / one link** |
| 2 | Twist `16c7520e` | Dark toast about 300×58 px: "Thread saved · Undo · │ ×" | Undo is the last text action. × comes after a 1 px divider. |
| 3 | Shuttle `d9c3d968`→`a2e63dac` | The same card changes from "Uploading…" (with bar and time left) to "Uploaded…" | **Replace in place, never stack** |
| 4 | Pocket `f96968cc` | Shows the saved title (truncated) + domain. Footer: "Remove Item \| View List" | **Show what was saved.** Undo and Open side by side. |
| 5 | Hello Ivy `92335de2` | "Page deleted" + "Undo" chip, with a green line along the bottom edge that looks like a countdown | **A 2 px countdown line** |
| 6 | Pocket `6bd73b34`, Slite `229f0c74` | Limit copy: a fact, then an inline "Upgrade now →". Usage shown as "11/50 free docs". | A number, a fact, an Upgrade link |
| 7 | Pinterest `0045242c` | Small pin thumbnail + "Saved to **Toys**" | Thumbnail later (v2) |
| 8 | Grammarly `c001e968`, Julienne `a9062a62` | The undo message names the item | On a web page the saved item is not visible, so the card names it |
| 9 | Dropbox `f205b205` | Sub-status "Finalizing..." | A third step label |

The Sonner-style cards (Supercut `7776d0fc`, ElevenLabs `818f1298`, Anam `eab0e179`, Cofounder `49e14b29`) are all about 360 px wide, sit bottom-right about 32 px in, have a check and one line, and have no ×.

## 2. State spec

**Shell.** Size: `width: min(320px, 100vw − 32px)`, bottom-right, 20 px from both edges. Look: `#fff`, 1 px border `rgba(29,29,27,.10)`, 10 px radius, shadow `0 1px 2px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.12)`. Padding 14/16 px. Layout: 16 px icon column, 10 px gap. Type: Work Sans. Title 14/20 600 `#1d1d1b`. Detail 13/18 400 at 70 % ink. Actions 13 px 600, 12 px above them, green `#005D4C`. × is 24 px, 8 px in from the top-right corner. Light, not dark: the card needs room for a title and a link (refs 1, 3). No accent bars: the icon carries the status.

| State | Icon | Title | Detail | Actions | Dismiss | Based on |
|---|---|---|---|---|---|---|
| Working | Spinner | Saving to Screenbreak | "Capturing the page…" → "Uploading…" → "Almost done…"; 3-step 2 px bar | none | Until result. After 12 s: "Still working. Slow connection?" | `d9c3d968`, `f205b205`, Vimeo `eb208237` |
| Saved | Check-circle | Saved to Screenbreak | Article title (2-line clamp) + domain (12 px, muted) | `Open my articles` (link) · `Undo` (text button) · × | 6 s, countdown line, pause on hover and focus | `d0d9c7d9`, `f96968cc`, `16c7520e`, `92335de2` |
| Undone | none | Removed from Screenbreak | none | none | 3 s | Klarna iOS `79c69d11` |
| Login required | Screenbreak mark | Log in to save this article | Your articles go to your Screenbreak account. | `Log in` (filled, 32 px) · `Print instead` (link) · × | Stays | Xbox `85362106` (reason sentence) |
| Waiting for login | Spinner | Waiting for you to log in | Finish in the new tab. We'll save this article right after. | `Cancel` (link) | Stays, then changes to Working | Cofounder `8515e561` |
| Offline | Alert, red (icon only) | You're offline | Connect to the internet, then try again. | `Try again` (filled) · × | Stays | Twist `a7b8a7c7` (the opposite: it does not say which cause) |
| Server error | Alert | Couldn't save this article | Something went wrong on our side. Nothing was lost. | `Try again` · × | Stays | Shuttle `c46c41a3` |
| Monthly limit | Alert | You've used 10 of 10 saves this month | Upgrade for unlimited saves, or print this one now. | `Upgrade` (filled) · `Print instead` · × | Stays | `6bd73b34`, `229f0c74` |
| Page blocked | Alert | Can't save this page | Chrome doesn't let extensions read this kind of page. | × | 8 s | none found |
| Print preparing | Spinner | Preparing print version | "Finding the article…" → "Opening in a new tab…" | none | Changes in place to a check + "Opened in a new tab", closes after 2 s | `a2e63dac` |
| Print failed | Alert | Couldn't make a print version | We couldn't find an article on this page. | `Try again` · × | Stays | Pexels `9bd92426` |

Rules:
- One card per tab. A new action replaces the current card's content.
- Esc closes the card. Use `role="status"` for working and success, and `role="alert"` for errors.
- Motion: 8 px rise + fade, 160 ms. Exit: fade, 120 ms.

## 3. Copy seen (exact)

- "Thread saved" / "Undo" (Twist); "Message sent." / "Undo" (Kitchen `b541029e`); "File moved to trash" / "Undo" (Figma `e92e15ef`); "Item removed everywhere" / "Undo" (Klarna); "'Demo document' was deleted. Undo" (Grammarly)
- "Issue created" / "View issue" (Linear); "2 docs successfully restored." / "Go there now" (Slite); "Saved to" / "Toys" (Pinterest); "Remove Item | View List" (Pocket)
- "Uploading 1 item to My First Space" → "Uploaded 1 item to My First Space" (Shuttle); "Finalizing..." (Dropbox); "Saving to your library" (Vimeo)
- "Your team used 11/50 free docs" / "Upgrade to create unlimited docs" (Slite); "Upgrade now →" (Pocket)

## 4. Reject

- **Blocking modals for status** (Vimeo, Xbox, Twist offline, Cofounder): the user is reading the page.
- **Duplicate stacked toasts:** Tango `6045ad8a` shows two identical "Copied to clipboard" cards.
- **Coloured outlines and fills** (Tango green border, Klarna mint fill): loud, not paper-like. None of the references used left accent bars.
- **A check icon on a message that is still in progress:** Appwrite `1db5ee38`.
- **Exclamation marks and ALL CAPS** (Dribbble `31648f36` "Link Copied", Xbox "SIGN IN").
- **"Offline or Twist is down":** we can detect offline, so we say which cause it is.
- **A multi-file upload tray with tabs** (Dropbox): too heavy for one article.
- **Raw error text** such as "Failed to fetch".
