# 01 · Toolbar popup and small action menus (Refero research)

Refero holds almost no real extension popups (Pocket, Raindrop, Notion clipper and Readwise popups are not indexed). The evidence comes from anchored menus, action panels and save menus. Sizes are read from 800 px renders of 1440 px captures (×1.8): ±2 px.

## 1. Top references (ranked)

| # | Product · screen id | Does well | Adopt |
|---|---|---|---|
| 1 | Todoist account menu `2b7297d6-418c-4569-8f32-927830ef1b9f` | ~292 px; avatar/name/email header; icon rows; muted shortcut at right ("⌘P" on **Print**); full-bleed hairlines between groups; footer "v3195 · What's new" | Header → actions → divider → footer anatomy |
| 2 | Raycast "Arc" action panel `4a3426e7-8b15-4ad7-93cf-85f4f55e8489` | ~350 px, ~40 px rows, hover row inset ~7 px, radius ~7, **one chip per key**; strip "Open in Arc ↵" names the default | Inset hover, per-key chips, show what a click does |
| 3 | Matter save menu `f5cd2c6c-c3e5-4f61-9eb9-9bfab4dc46c2` | Grey label "Ways to save", 24 px icon tile, ~42 px flat rows, no borders | Section label; flat rows, no cards |
| 4 | mymind pin popover `ab68a80b-6da8-4e2b-a174-58715ff4180b` | Caret to the toolbar; accent eyebrow "NEXT STEP"; serif headline; one CTA | Trirong headline + eyebrow for notes |
| 5 | Pi account `6f494cb7-af38-43a2-a446-482f30f9f244` | Cream, deep-green serif, "Signed in as Liam", outlined "Sign out" | Closest tone; "Signed in as" line |
| 6 | Supercut share popover `7776d0fc-168a-4f8e-a952-2cdcf26829f5` | Full-width 2-segment control, then one sentence stating the result | Segmented + consequence line |
| 7 | Amie shortcuts `85d34fc5-aa43-4f86-b802-06fd9c5c5164` | Per-key chips, grey fill, no border (Dona `39d8e3de-f09e-4d21-b03f-880df33e4100` adds a border: heavier) | Amie chip style |
| 8 | Supercut account menu `46f4328b-3272-4727-8bfb-3bf0ac6c163f` | "You are logged in as" + email, muted small text | Identity as quiet text |
| 9 | Clearful appearance `79fefc18-0a0e-4b8f-9767-5663951dd602` | Options with title + one-line sub, check at right | Same for the click choice on Settings |
| 10 | Xbox save gate `85362106-4df4-4db2-916d-c4d301993a31` | Says why saving needs an account + one button | Copy logic only |

## 2. Component specs

- **Width 320 px**, white, no inner border or shadow (Chrome draws the frame).
- **One left edge:** logo, icons, footer text at x 16; text column at x 48 (16 + 20 icon + 12). Today: logo 14, icons 27, text 63.
- **Header:** 48 px, wordmark 20 px tall, no divider below (Todoist).
- **Section label:** "This page", Work Sans 11/16 600 muted `#6b6b66`, 8 px above rows (Matter).
- **Action rows:** 56 px (two lines); list inset 8, row padding 8, radius 8 (Raycast). Icon 20 px. Title Work Sans 14/20 500 `#1d1d1b`; description 12.5/16 400 muted. No border, no fill at rest.
- **States:** hover `rgba(29,29,27,.05)`, pressed `.08`, `:focus-visible` 2 px `#005D4C` inset ring; arrows move, Enter runs (Raycast).
- **Kbd chips:** right side, centred on the title line; one per key, 20 px tall, min-width 20, padding 0 5, radius 4, Work Sans 11 500 muted, fill `rgba(29,29,27,.06)`, no border, gap 3 (Amie, Raycast). Fill from `chrome.commands.getAll()`; hide if unassigned.
- **Default action:** full-bleed 1 px `rgba(29,29,27,.08)` divider; label "Toolbar button" 11 px muted; segmented Ask · Save · Print, 32 px, track radius 8 fill `.05`, selected segment white + hairline + `0 1px 2px rgba(0,0,0,.06)`, 13 px 500 (Supercut). One consequence line under it, 12 px muted.
- **Footer:** 40 px, divider above. Left "Signed in as yorgos@…" 12 px muted, ellipsis; right "Settings" link (Todoist, Supercut, Pi).
- **Signed out:** same layout. Save description → "Log in to save to your account"; footer "Not signed in" · "Log in". Print unchanged. No blocking gate.
- **Unsupported page (chrome://, Web Store, PDF):** rows stay but disabled (opacity .45, `aria-disabled`, no hover), so nothing jumps. Above them: Trirong 16/22 "Screenbreak can't run on this page" + one 12.5 px line saying why and what to do (mymind). No illustration.

## 3. Copy seen

- "Ways to save" (Matter `f5cd2c6c`)
- "You are logged in as" (Supercut `46f4328b`); "Signed in as Liam" (Pi `6f494cb7`)
- "In order to save the design, you'll need to sign in with your Microsoft account." (Xbox) → "Log in to save articles to your account."
- "Pin the extension to start saving." + "NEXT STEP" (mymind `ab68a80b`)
- "Add it to the browser bar to save content faster" / "I've pinned it" (Matter `0bce8842-030a-4167-b3d6-fb090b069d5c`)
- "Remove Item | View List" (Pocket `f96968cc-9b88-4a8e-8083-d90080ba9bf5`) → "Open in Screenbreak"
- "Automatic / Match my device setting" (Clearful): title + consequence

Consequence lines: Ask "Shows this menu." · Save "Saves straight to your account." · Print "Opens the print version." When not Ask, add "Right-click the button to get this menu back." Without it the user cannot reopen the popup.

## 4. Reject

- **Bordered grey card per action** (baseline): doubles borders; all references use flat rows.
- **Dark glass, gradients** (Raycast, Clay `8024994d-c2ff-417a-91f6-d465e51838fe`): not paper-like.
- **Search field on top** (Linear `7be65bdd-5156-44c6-94c1-61cd115b0d83`): noise for two actions.
- **"O then S" text shortcuts** (Todoist): ours are chords; use chips.
- **Caps CTAs** "I'M SO READY!", "SIGN IN": they shout.
- **Illustrated errors** (Mural `dfdfe225-7814-49e0-8f9b-7a77753a800c`): no room at 320 px.
- **Upsell rows** (Superlist `30d81489-9d1b-4536-bc3d-e31b49e32c01`).
- **Bare stacked buttons** "print" / "share" (REKKI iOS `d71aca2a-ad04-482e-b555-a417a1a458fc`): no description or hint.
- **Native `<select>` in a sentence** (baseline): the OS menu covers the label.
