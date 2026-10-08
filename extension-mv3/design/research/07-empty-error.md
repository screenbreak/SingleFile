# 07 · Empty, expired, offline, limit and error states

Refero, web, 2026-10-06: 19 searches, 24 images checked (4 full). Short ids = first 8 chars.
px values come from 800 px previews of ~1440 px captures (×1.8): treat them as ±2 px.
No Medium, Substack, Readwise, Pocket or Instapaper error screens exist in Refero; NYT `0641871b` is mostly hidden by a search overlay.

## 1. Top references

| # | Product · screen id | Does well | Adopt |
|---|---|---|---|
| 1 | Claude 404 · `4030cd10-4eb8-491f-8c1e-a3da7905c447` | Paper background, serif title, one sans line, one button | Title ≈40 px, body ≈18 px, gaps ≈16 / 30 px, button ≈36 px |
| 2 | Zara expired · `232f8bd8-b999-4897-aa8d-b2e7dead4e7a` | Left-aligned on the content edge, no art | Left edge = article column; buttons ≈41 px, 16 px apart |
| 3 | Cursor expired · `737698ee-aa03-42fe-96b5-6f6dcd32351a` | Says *why* it expired, then the fix | Cause sentence + fix sentence |
| 4 | Visual Electric toast · `42444166-de33-45b8-aa56-cc26b97d040e` | ≈320 px card, 16 px from bottom and right | Card size and position; text ≈13 px |
| 5 | Claude limit · `4d366989-3a26-469f-a0d9-2ceb9409d2d3` | Inline underlined upgrade link, close X, no modal | Upgrade link inside the message |
| 6 | Shuttle · `c46c41a3-b682-49bd-8a8e-69820a2b8bbf` | Bold serif title over sans body in a narrow card | Serif title in compact surfaces |
| 7 | Family · `2eb69beb-c683-480a-b830-a98dd14b777b` | Grey cause line ending in an ink "Try again" link | Secondary as inline link |
| 8 | Tango · `5b750161-e12d-43fa-8ed3-68b88e1f2e52` | Button, then a plain "Try again" link | Button + link hierarchy |
| 9 | Anam · `3f1ba001-5eda-4d31-bcc8-4356afe7d04f` | "used 1 of 1" + what the upgrade gives | Count and gain in the limit copy |
| 10 | Contra · `209d65b9-6e0a-4a3f-a79e-b65074b5dc92` | Back action beside forward action | "Back to the page" for no-article |

## 2. Spec per state

### Print page (full tab)
Shared rules:
- Hide the toolbar entirely (PLAN defect d). No illustration.
- Left-align the block on the article column (Zara `232f8bd8`, Family `2eb69beb`), ≈96 px from the top, 560 px wide at most.
- Trirong 40/48 title in ink. 16 px gap. Work Sans 18/27 body, ink 70%. 32 px gap (Claude `4030cd10`).
- One green #005D4C button, 40 px tall. Secondary text link 16 px to its right.

States:
- **Expired.** "This print preview has expired" / "Screenbreak keeps the article only until Chrome closes. Go back to the article and click Print again." (cause + fix, Cursor `737698ee`). Primary: "Open the article" (only when the source URL survives). Secondary: "Close this tab".
- **No article.** "Couldn't find an article on this page" / "Screenbreak looks for one main article. Home pages, lists and pages behind a login often have none." Primary: "Back to the page" (Contra `209d65b9`). Secondary: "Try again" (Family `2eb69beb`), for pages that load late.
- **Images still loading.** Not an error page: article visible, Print live. Beside Print, one Work Sans 13 px line: "Loading images… 3 of 12" + "Print anyway" link (one status line: Rivian `8c865022`; action on the same row: Claude `4d366989`). After a timeout: "2 images didn't load. They'll print as blank space."

### In-page status card (bottom-right)
- 300 px wide, 16 px from bottom and right, 16 px padding (Visual Electric `42444166`).
- Trirong 17/22 title; Work Sans 14/20 body, ink 75%. Serif title in a small card: Shuttle `c46c41a3`.
- Actions: green 14 px semibold text buttons on the text's left edge. Close X top-right, 24 px hit area.
- No red fill, no coloured edge. Errors never auto-hide (PLAN).

States:
- **Offline.** Check `navigator.onLine` first (Twist `a7b8a7c7` merges offline and server-down). "You're offline" / "Screenbreak will try again when you're back online." Primary: "Try again". Also retry on the `online` event.
- **Server error.** "Couldn't save this article" / "Something went wrong on our side. Nothing on this page changed." Primary: "Try again". Secondary: "Get help" (Tango `5b750161`, PayPal `a1401081`).
- **Monthly limit.** Server title ("October uploads limit reached") and message as sent, 3 lines max. Primary: the server link "Upgrade to go unlimited", inline as in Claude `4d366989`. Secondary: "Print it instead": Print uploads nothing, so it still works. Ask Nikos for the count and reset date (Anam `3f1ba001` "used 1 of 1"; Claude `86f4dd93` "until 3 AM").
- **Can't access the page.** Content scripts cannot run on chrome://, the Web Store or the PDF viewer, so this card never renders there. Use the popup and badge.

### Toolbar popup (~300 px)
Replace the two action rows with a message on the 14 px text edge. Keep the account line and Settings. Trirong 17/22 title "Screenbreak can't run on this page". Work Sans 13/19 body, one cause line per case, then "Open an article in a normal tab and try again." No button (Shuttle `c46c41a3` hierarchy).
- Chrome page: "Chrome doesn't let extensions read its own pages."
- Web Store: "Chrome blocks extensions on the Web Store."
- PDF: "Screenbreak can't read PDFs yet."

## 3. Copy patterns seen (exact)
- "This page has been inactive for too long." — Zara `232f8bd8`
- "For security, GitHub connections must be completed in the same browser session where they were started." — Cursor `737698ee`
- "Suspect a network issue? Try again" — Family `2eb69beb`
- "You are out of free messages until 3 AM" · "Subscribe to Pro" — Claude `4d366989`
- "The Free plan includes 1 custom avatar and you've used 1 of 1." — Anam `3f1ba001`
- "You appear to be offline or Twist is down." — Twist `a7b8a7c7`
- "Oops! It looks like this link is unsupported." · "Try another URL" — Contra `209d65b9`

## 4. Reject
- **Mascots and 3D art**: Pitch `1b7e88dd` (astronaut dog), Gumroad `e0222d5d`, Contra `209d65b9` / `2d40263a`. Cute, not paper.
- **"Oops / Whoops / Magically"** (Tango, SavvyCal `40cc45a5`, Contra): flippant when work is lost. No jokes on expired pages either.
- **Blocking modals for offline or limit** (Twist, Anam, Kitchen.co `d109cf10`): the page underneath still works.
- **ALL CAPS** (Zara), orange or yellow CTA slabs, and centered text longer than 2 lines.
- **A visible toolbar or live Print button** on expired or no-article pages.
