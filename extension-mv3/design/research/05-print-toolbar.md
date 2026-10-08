# 05 · Print toolbar and page preview

Refero, 2026-10-06. 17 screen searches, 2 similar-screen expansions, flows 4469 / 7958 / 9177, 16 images checked (5 full). Web px come from 800 px renders ×1.8 (1440 viewport), so allow ±2 px. iOS values are pt.

## 1. Top references

| # | Product · id | Does well | Adopt |
|---|---|---|---|
| 1 | Craft PDF Preview `755fa3f2` | The settings change a live A4 preview. One primary: "Export to PDF". | Booleans as switches. The preview equals the output. One green button. |
| 2 | Medium iOS text settings `4ccc779c` | A small and a large serif "A" for size. "System/Light/Dark" segments: grey track, white thumb. | "A" glyphs for size. Track and thumb style. |
| 3 | Substack Display Settings `7821f944` | Font options set in their own face ("New York", "Messina"). The article updates live. | "Serif" in Trirong, "Sans" in Work Sans. |
| 4 | ElevenReader Theme `c61d33bc` | Segments about 36 px tall, 2 px inset, 14 px labels. | Segment size. Not its dropdown or slider. |
| 5 | Arcade Export `3263cc29` | Compact inline segments ("GIF/Video", "24/30/60 FPS"). The primary states the result: "Download video (36.02MB)". | Short labels. Result beside Print: "4 pages". |
| 6 | Missive PDF viewer `29eeffa2` | Dark keycap chips ("Enter" to open). "1 / 4" counter. | ⌘P keycap chip. |
| 7 | DocuSign viewer `1f0198f2` | Icon-only view toggles. Grey canvas, white sheets, caption "2 of 3". | Column icons. Page caption. |
| 8 | Craft exporting `5e0f42c8` | A small card with a spinner and "Exporting to PDF" on a dimmed document. | Printing card. |
| 9 | Contra unsupported link `209d65b9` | One sentence, an outline button and a solid button. | No-article layout (without the art). |
| 10 | Canva export `dd63dc1f` | Light canvas, white A4 page, about 75 px top gap. | Canvas spacing. |

Also checked: Bear `baab05aa`, Promova `67a42fcc`, Boords `7307969f`, Headspace `64066605`, Zara `232f8bd8`.

## 2. Toolbar spec

**Layout.** Use one sticky top bar, not a side panel (`755fa3f2`, `dd63dc1f`) or a modal. Four options do not justify a 300 px panel. The bar is 56 px, white at 92% with a blur, and has a 1 px bottom border `rgba(29,29,27,.08)`.

**Order.** Mark → Font, Size, Columns, Images → space → "4 pages" → ⌘P chip → **Print**. Settings sit on the left and the action on the right (`3263cc29`, Dock `5079f9c2`).

| Option | Control | Content |
|---|---|---|
| Font | Segmented, 2 × 52 px | "Serif" in Trirong, "Sans" in Work Sans, 14 px (`7821f944`) |
| Size | Segmented, 3 × 32 px | "A" at 12/14/17 px (`4ccc779c`) |
| Columns | Segmented, 2 × 32 px icons | 16 px page icons with 1 or 2 bars (`1f0198f2`) |
| Images | Switch 32×18, label "Images" | On = `#005D4C` (`755fa3f2`) |

- **Segments** (`c61d33bc`, `4ccc779c`): 32 px tall. Track `#ECE9E3`, radius 8, 2 px padding. Thumb white, radius 6, shadow `0 1px 2px rgba(29,29,27,.10)`. Selected text `#1d1d1b`, other text `#6E6A64`. No green on segments.
- **Labels.** No group labels: the controls describe themselves. Each group gets `role="radiogroup"`, an `aria-label` and a `title`. This keeps the bar on one row.
- **Keyboard.** Tab moves between groups and arrow keys move inside a group. Focus ring: 2 px `#005D4C`, 2 px offset.
- **Print.** 36 px, padding 0 16, radius 8, `#005D4C`, white Work Sans 14/600, printer icon. Before it: "4 pages" (12 px, muted) and a "⌘P" / "Ctrl P" chip (11 px on `#ECE9E3`, radius 4, `29eeffa2`). Tooltip: "Opens the print dialog. Choose Save as PDF there." Catch ⌘P so it runs the same path.

**At 700 px.** 16 + 24 + 16 + 108 + 12 + 100 + 12 + 68 + 12 + 88 + 88 + 16 ≈ 560 px, so the bar stays on one row. Below 1024 px, hide the ⌘P chip and the wordmark. Below 600 px, the four options go into an "Aa" popover (280 px, stacked, `4ccc779c`). Print stays visible.

**States**

| State | Toolbar | Canvas |
|---|---|---|
| Loading | Controls at 40%. Print disabled, "Preparing…" | A4 skeleton: meta line, 2 title bars, standfirst, 16:9 hero, 8 lines. `#ECE9E3`, radius 4 (`64066605`, made warm) |
| Ready | Enabled | Page |
| Images loading | "Images 3/7" replaces "4 pages". A click waits for the images, then prints | Image slot skeleton |
| Printing | Spinner and "Opening…" | A card (`5e0f42c8`) only if the wait is more than 300 ms |
| Expired | Hide the controls, do not disable them (PLAN.md bug d). Mark only | On the sheet: Trirong 28 px "This print preview has expired", one line, primary "Open the article", outline "Close tab" (`209d65b9`, `232f8bd8`) |
| No article | Same as Expired | "No article found on this page", one hint, "Back to the page" |

## 3. Page preview

- **Canvas:** warm grey, about `#E9E6E0`. DocuSign `1f0198f2` uses a flat `#E6E6E6`. Craft uses a cool gradient; reject it.
- **Sheet:** white, 794 px (A4). Scale it down with `transform` when the viewport is narrower. Shadow `0 1px 2px rgba(29,29,27,.06), 0 12px 32px rgba(29,29,27,.10)`, as in the soft lift of Craft and Canva. No border, no radius.
- **Spacing:** 40 px below the bar, 32 px between sheets, 64 px at the bottom.
- **Caption:** "1 / 4" under each sheet, 11 px `#8A857D` (`1f0198f2`).

## 4. Reject

- Side panel or modal (`755fa3f2`, `dd63dc1f`, `7307969f`): too heavy, and a modal hides the page.
- Font dropdown (`c61d33bc`): it hides one of two options.
- Size slider (`67a42fcc`): print needs three discrete sizes.
- Stepper A−/A+ (`baab05aa`): the user does not see the three options.
- "Show X" checkbox lists (`7307969f`): they read as a form.
- Dark canvas (`29eeffa2`): not paper-like.
- Blue selection outline (`7821f944`): a second accent colour.
- Spinner-only loading (`d0035cdf`): it shows no structure.
- Illustrations on error screens (`209d65b9`): off-tone.
- A separate "Download PDF" button: it duplicates Save as PDF in the browser dialog. Say so in the tooltip instead.
