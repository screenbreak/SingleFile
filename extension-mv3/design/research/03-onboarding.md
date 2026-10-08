# 03 · First run, onboarding, what's new

Refero, web, 2026-10-06: 14 screen searches, 3 flow searches, flows 9375 (Matter) and 13292 (mymind) opened, similar-screens on 3, 18 images viewed (full: `0bce8842`, `c7bc6e09`, `ab68a80b`). Pixel values are estimates from 800 px captures scaled to a 1440 px viewport.

## 1. Top references (ranked)

1. **mymind pin card** `ab68a80b` (flow 13292). Card at the top right, caret pointing up at the toolbar, eyebrow "NEXT STEP", two-line serif heading, a *drawn* Chrome bar (puzzle, Extensions list, cursor on the pin). Adopt all four.
2. **Arcade pin card** `c7bc6e09`. Three numbered lines with inline puzzle and pin glyphs; badges 1 and 2 drawn on the picture at the same spots. Adopt: numbers that match badges on the illustration.
3. **Matter, flow 9375**: pin `0bce8842`, first save `8f739fb2`. Eyebrow "You've installed the extension! Next:", button "I've pinned it", try-it with three real articles. Adopt: eyebrow, real sample. Reject: carousel, sign-up first.
4. **Mailchimp choice cards** `d8930ed2`. Serif question, reassurance line, three stacked full-width cards (bold title, one-line description, radio on the right); selected = pale teal fill + teal border. Adopt for the click action, in deep green.
5. **Linear** `08aba202`, `df32c961`. "Try opening the command menu with:" above two big keycaps in a bordered box; end screen "You're good to go" with three tip cells, inline kbd in body text. Adopt all three.
6. **Loom** `08ec0c2d`. One centred card, numbered circles, a "Not working? …" fallback line. Adopt: the fallback line.
7. **mymind checklist** `26dcf03f`. Rows labelled COMPLETE / NEXT STEP. Adopt: live status list as end state.
8. **Limitless** `4ced2adb`. "Try Limitless without an account" link under the auth card. Adopt: the no-account path stays visible.
9. **ElevenMusic** `22e176ed` + **Apollo** `d8e2ae7d`. What's new as one list (icon, title, "New" pill, one line); Apollo adds "View full changelog". Adopt for upgraders.

## 2. Recommended structure

**One scrolling page, no steps.** Pagers (Linear's 7 dots `08aba202`, Matter 9375, Pinterest flow 970) hide content behind Next; our tab may close in ten seconds, so each section stands alone. Progress = live status list (ref 7), not dots.

0. **Header**: logo, H1 "Screenbreak is installed", one line. Upgraders see What's new here.
1. **Pin** first (lost if the tab closes). Fixed callout, top right, 340 px wide (Arcade ≈ 23 % of 1440), caret up at the puzzle icon (`ab68a80b`): eyebrow, heading, 3 numbered steps with glyphs, drawn toolbar with matching badges (`c7bc6e09`), fallback line (`08ec0c2d`). Detect with `chrome.action.getUserSettings()` → `isOnToolbar`, re-check on `focus`/`visibilitychange`; when true, collapse to "Pinned ✓". "I've pinned it" (`0bce8842`) only as a fallback.
2. **Save and Print**: two cells, one line each (`df32c961`). Print: "No account needed".
3. **When you click the button**: three radio cards (`d8930ed2`): Ask me each time (Recommended) · Save to Screenbreak (needs login) · Print right away. Saves on change, inline "Saved", no Next.
4. **Shortcuts and right-click**: keycap box (`08aba202`) fed by `chrome.commands.getAll()`. On Mac Chrome maps Ctrl to ⌘: ⌘⇧Y, ⌥⇧P. Empty binding (conflict) → "Not set · Choose a shortcut", opening `chrome://extensions/shortcuts` via `chrome.tabs.create`. Beside it, a drawn context menu.
5. **Try it**: one sample-article card (thumbnail, title, source, reading time) like `8f739fb2`, button "Open sample article", steered to Print (no account). Host it on https: content scripts do not run on `chrome-extension://` pages.
6. **Log in (optional)**: quiet card, secondary button "Log in to Screenbreak", link "Not now" (`4ced2adb`, `2db227a4`). Logged in: email + check.
7. **End**: status list (`26dcf03f`): Pinned · Click action set · Tried it · Logged in (optional). First three done → "You're all set" + "Close this tab" (`df32c961`).

**What's new** (major update from 1.x only): same page, top block "What's new in Screenbreak 2", 4-row list (`22e176ed`): Print (New) · Choose what the button does (New) · Right-click menu · Shortcuts. Then "Save works as before." and "Full changelog" (`d8e2ae7d`). No pin callout if `isOnToolbar` is true.

**Layout specs**
- Column max 640 px, centred, 24 px side padding (Loom ≈ 610, Mailchimp ≈ 680). One left edge for eyebrow, heading, body, card text.
- Section gap 72; heading→body 8; body→control 20.
- H1 Trirong 40/48 (mymind, Matter ≈ 40). H2 Trirong 26/32. Eyebrow Work Sans 12 SemiBold uppercase +0.06em #005D4C. Body Work Sans 16/24 #1d1d1b; descriptions 14/20 at ~65 % ink.
- Radio cards: padding 20/24, gap 12, radius 8, 1 px border; selected 2 px #005D4C + ~6 % green tint.
- Keycaps: min 40×40, 1 px border + 2 px bottom, radius 6, Work Sans 16 Medium, 6 apart (Linear ≈ 48 for one hero shortcut; we show two).
- Pin callout: padding 24, 12 from top, 16 from right, soft shadow, 12 px caret.

## 3. Copy patterns (seen → Screenbreak)

| Seen | Screenbreak |
|---|---|
| "You've installed the extension! Next:" `0bce8842` | "Installed. One more step:" |
| "Pin the extension to start saving." `ab68a80b` | "Pin Screenbreak to your toolbar" |
| "Click the [pin] - it should turn blue" / "Congrats! Arcade is now pinned" `c7bc6e09` | "Click the pin next to Screenbreak. It turns blue." / "Pinned. The button is in your toolbar." |
| "Not working? …" `08ec0c2d` | "Can't find it? The shortcuts below work without pinning." |
| "Don't worry, you can still check out every part of Mailchimp." `d8930ed2` | "You can change this anytime in Settings." |
| "Try opening the command menu with:" `08aba202` | "Or skip the click:" |
| "Pick an article, then click the extension after the webpage opens" `8f739fb2` | "Open the sample, then click Screenbreak and choose Print." |
| "Try Limitless without an account" `4ced2adb` · "Do it later" `2db227a4` | "Print never needs an account." · "Not now" |
| "You're good to go" `df32c961` | "You're all set" |

## 4. Reject

- **Carousels/pagers** (`08aba202`, flows 9375, 970): hide sections, add clicks, lose state on tab close.
- **Sign-up first** (Matter 9375 steps 2–5; Tango flow 5786, 30 steps with password meter and survey). Print needs no account.
- **Upsell and phone-app steps** (Matter `2aabf129`, steps 9–11).
- **Blurred-overlay modals** (Arcade, DocuSign `d197ffa5`): no app sits behind our page.
- **Real Chrome screenshots** (Matter, Arcade): stale after each Chrome UI change; draw it, as mymind does.
- **Social proof after install** (Wiza "94% rating on Chrome").
- **Loud, gamified copy** ("I'M SO READY!", "View All Achievements", mymind): not calm.
- **Full shortcut tables** (Zendesk `f8bbd07c`, X `6ae856ff`): we have two shortcuts.
- **Strike-through on done rows** (`26dcf03f`): reads as cancelled; use check + muted text.
