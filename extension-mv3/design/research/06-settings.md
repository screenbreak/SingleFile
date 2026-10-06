# 06 · Settings page

Refero, 2026-10-06. 15 screen searches, 3 similar-screen expansions, flows 5676 and 9409. 28 images checked, 4 full size. Reference px are scaled from previews (±3 px). Refero has no settings screens for 1Password, Arc, Readwise or Superhuman.

## 1. Top references

| # | Product · id | Does well | Adopt |
|---|---|---|---|
| 1 | Rise `23dad935` | No card. Title and labels share one x (~495 px column). Segments on the right ("System / Light / Dark"), switches, ~46 px rows, no dividers. | Row model: text left, controls right. |
| 2 | Whereby `a76499eb` | Serif "Settings" title, deep-green switch, 15 px bold label over a 15/22 description, static save note. | Trirong H1, #005D4C switch, the note. |
| 3 | Matter `7baf4158`, `7e4df831` | ~580 px column on one edge. Hairline under section headings. Outline "Sign out". Theme chips in their own colours. | Headings, account button, fonts set in their own face. |
| 4 | Linear `af9377a1` | Short label plus one line of what it does. Controls share one right edge. | Copy pattern, not the cards. |
| 5 | Dona `39d8e3de` | One ~24 px chip per key, no "+". | Shortcut chips. |
| 6 | ChatGPT `ceef8f22` | "Log out of this device" as a row with an outline "Log out". | Account row. |
| 7 | Missive `06229a09` | "Restore Defaults" as a quiet text link. | Reset link. |
| 8 | Memotron `a4507edb`, Craft `a98355cd` | Small muted version string. | Footer version. |
| 9 | Amie `2cd59ba6` | Each option has its own explanation. | Live description for the click action. |

## 2. Spec

**Page.** One centred 560 px column with no card, on paper white (Rise ~495, Matter ~580). Top padding 64 px; 16 px gutters below 600 px. **Two edges only:** all text starts on the left x and all controls end on the right x (`23dad935`).

**Header.** Wordmark (24 px), 32 px gap, "Settings" in Trirong 32/40 500 (`a76499eb`), then "Changes save automatically." in 14/20 at 60% ink.

**Sections, in order.** The Screenbreak button · Print · Account · Advanced (collapsed) · footer. Leave 40 px above each heading. Headings are Trirong 20/28 500 with a 1 px hairline `rgba(29,29,27,.12)` 8 px below (`7baf4158`). No row dividers.

**Row.** Minimum height 56 px. Label Work Sans 15/22 500 ink. Description 13/20 at 62% ink. The control is centred on the text, with at least 24 px clear to its left (`af9377a1`).

| Setting | Control |
|---|---|
| When I click it | Segments "Ask me · Save · Print". The description follows the choice (`2cd59ba6`). |
| Save / Print shortcut | Key chips |
| Font | Segments: "Sans" in Work Sans, "Serif" in Trirong (`7e4df831`) |
| Text size | Segments: "A" at 12/14/17 |
| Columns | Segments: 1- and 2-column icons |
| Include images · Open the print dialog straight away | Switches |

Segments and switches are the print-toolbar components (05): segments 32 px, track `#ECE9E3`, radius 8, white thumb. Switch 32×18, on `#005D4C`. Focus ring 2 px `#005D4C`.

**Shortcuts.** Read `chrome.commands.getAll()` on load and on `focus`. One chip per key, no "+" (`39d8e3de`): 24 px tall, radius 5, 1 px border plus 2 px bottom at 16% ink, 12/500, 4 px apart. Mac shows ⌘⇧Y / ⌥⇧P. An empty binding shows "Not set". Under the rows: "Both actions are also in the right-click menu. **Change shortcuts**". The link opens `chrome://extensions/shortcuts` with `chrome.tabs.create`.

**Account.** One row, no avatar (`ceef8f22`). Logged in: the email, "Your saved articles go to this account.", and an outline **Log out** (32 px). Logged out: "Not logged in", "Log in to save articles. Print works without an account.", and a filled green **Log in**.

**Advanced.** "Advanced" starts on the left x, with the chevron after the text (today ▶ sits before it, at 346 vs 330). "Server URL", described as "Only change this if Screenbreak support asks you to.", has a full-width 36 px input below it.

**Autosave.** No Save button (`23dad935`, `af9377a1`); the header note does the work (`a76499eb`). After a change, "Saved" (13 px, `#005D4C`) shows for 1.5 s in a reserved space left of that control, with `aria-live="polite"`. This is our choice; no reference shows it.

**Reset.** "Reset to defaults" is a text link on the footer's right edge (`06229a09`). It does not reset login or the Chrome-owned shortcuts. No dialog: "Settings reset. **Undo**" for 6 s.

**Footer.** 56 px gap, hairline, 16 px. Left: "Screenbreak 2.0.0 · Help · Privacy", 13 px muted (`a4507edb`). Right: the reset link.

## 3. Copy seen

- "Which view is opened when you open up Linear"; "Adjust the size of text across the app" (`af9377a1`)
- "Reduces animations for popovers, modals and sidebars" (`23dad935`)
- "Preferences will be saved on this device only for meetings on whereby.com" (`a76499eb`)
- "Sign out of your account" / "Sign out" (`7baf4158`)
- "Sync theme with your system preference" (`2cd59ba6`)
- "Log out of this device" / "Log out" (`ceef8f22`)
- "Restore Defaults" (`06229a09`)

## 4. Reject

- **Side nav or modal shell** (Linear, Rise, Dona, Whereby). Four sections need no navigation.
- **Cards with inset rows** (`af9377a1`, `2cd59ba6`). Headings sit ~18 px left of the labels.
- **Dropdowns for 2–3 options** (Linear, Excalidraw `8449559b`, today's selects). They hide the choices.
- **Save button plus toast** (Rivian `0f1b5116`). It duplicates autosave.
- **Click-to-record shortcuts** (Dona `557b81f0`). Chrome owns extension shortcuts.
- **One wide "⌘ + Shift + P" pill** (`a4507edb`). The "+" signs are noise.
- **Avatars** (Raycast `6791a493`). They push the name to a second x.
- **Red Log out** (Clearful `bd461725`). Logging out loses nothing.
- **Title Case** (Grok `27520677`). Use sentence case.
