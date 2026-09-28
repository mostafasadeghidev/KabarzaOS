# KabarzaOS — DESIGN.md

The visual language of KabarzaOS. Read it before writing or changing any UI.

It sits on top of shadcn/ui. shadcn provides the components; this file decides
how they look. Which component does which job (Section, Panel, framed table,
toolbars, tabs, empty states) is the structural contract in
`src/components/page-shell.tsx` and `src/components/ui/table.tsx`. This file
covers the look.

The language is calm and paper-like, built for a Persian, right-to-left and
data-dense work tool.

## 1. Intent

A tidy desk in daylight: the chrome recedes and the data is what you read.
The calm comes from three things, in this order:

1. **Figure and ground.** Content sits on white surfaces over a warm paper
   canvas. The change of colour separates things, not lines.
2. **Hierarchy.** Titles are heavy and body text is calm. On every page it is
   obvious what matters most.
3. **Restraint.** There is one accent colour and one hairline, and almost no
   shadow.

## 2. Colour

Values live in `src/app/globals.css` as oklch; the hex values here are for
reading.

| Token | Light | Dark | Role |
|---|---|---|---|
| `background` | `#f7f5f3` warm paper | `#181716` | Page canvas behind the content |
| `sidebar` | `#f1efec` | `#121110` | The sidebar, one step below the canvas |
| `card`, `popover` | `#ffffff` | `#201f1d`, `#262523` | Every surface that holds content |
| `foreground` | `#191816` | `#ebe9e7` | Titles and body text |
| `muted-foreground` | `#645f5b` | `#a6a29e` | Descriptions, labels, metadata |
| `border` | `#e6e3e0` | `#32302e` | The single hairline |
| `input` | `#dad7d3` | `#3b3936` | Field outlines, a step stronger than the hairline |
| `muted`, `accent`, `secondary` | `#f1efed` | `#292726` | Hover, selected row, quiet fills |
| `primary` | `#046dce` | `#569bec` | The primary action, links, focus ring |
| `primary-foreground` | white | `#171614` | Text on a primary fill |

- **One accent.** `primary` is for the main button of a view, links and the
  focus ring. It is never decoration.
- **Dark mode uses a lighter blue with dark text on it.** White on the blue
  that reads well as a link was 3.5:1. Now a button label is 6.3:1 and a link
  on a card is 5.7:1. The other palettes inherit the dark label.
- **Tag colours** (status, role, category) appear only as a small dot inside a
  neutral chip (`TagChip`) or as a soft tint. They are never a solid fill with
  white text.
- **Semantic colours carry meaning only:** red for overdue, errors and
  destructive actions; green for paid and done; amber for warnings. Text uses
  the 700 shade in light mode (see the contrast notes in `globals.css`).
- Text on the canvas and on white must reach 4.5:1. `muted-foreground` is
  6:1 on both.
- **Palettes** (stone, ocean, forest, sunset, violet, slate) change only the
  hue of the neutrals and the accent; the canvas/surface split and the
  lightness steps above are the same in all of them.

## 3. Typography

Vazirmatn throughout. **No letter-spacing on Persian:** tightening the
tracking breaks the joined letters. Hierarchy comes from size and weight.

| Role | Size / weight | Class |
|---|---|---|
| Page title | 24 / 700 | `text-2xl font-bold` |
| Section title | 16 / 700 | `text-base font-bold` |
| Panel title | 14 / 600 | `text-sm font-semibold` |
| Body, table cells | 14 / 400 | `text-sm` |
| Supporting text | 13 / 400, muted | `text-[13px] text-muted-foreground` |
| Labels, table headers, meta | 12 / 500, muted | `text-xs font-medium text-muted-foreground` |
| Metric value | 30 / 700, tabular | `num text-3xl font-bold` |

Weight is the main lever: 700 for titles, 600 for panel titles and emphasis,
500 for labels and buttons, 400 for reading.

## 4. Space

- 4 px base unit.
- Page padding: 16 px on phones, 24 px on tablets, 32 px on desktop.
- Between page sections: 32 px (24 px on phones). Between a section title and
  its content: 12 px. Inside a panel: 16 px.
- Whitespace goes **between** sections, not between table rows. Rows stay
  compact (40 px) because this is a data tool.

## 5. Surfaces, lines and depth

| Level | Treatment | Used for |
|---|---|---|
| 0 | White surface, 1 px hairline, no shadow | Cards, panels, framed tables, filter forms |
| 1 | The component's own shadcn shadow | Only what floats: menus, popovers, dialogs, toasts |

- Depth runs sidebar < canvas < surface < floating, in both themes. The
  sidebar is its own column: one step darker than the canvas, with a hairline
  on its inner edge, and its colour reaches the window edge on wide screens.
  It is never the same colour as the canvas, because then the navigation and
  the content read as one piece.
- No gradients. No shadow on a flat card. No coloured borders except a
  panel's `tone="danger"` or `tone="warning"`.
- A panel's title needs no divider line; padding separates it from the
  content.
- Separate sections with space, not with rules.

## 6. Shape

| Element | Radius |
|---|---|
| Surfaces: cards, panels, framed tables, filter forms, dialogs | 12 px (`rounded-xl`) |
| Small repeated items on the canvas (list rows, board cards) and boxes nested inside a surface | 8 px (`rounded-lg`) |
| Controls: buttons, inputs, selects | 6 px (`rounded-md`) |
| Chips and badges | full |

## 7. Components

- **PageHeader:** 24/700 title, one muted line under it, and the page's
  actions at the end edge.
- **SectionHeader:** 16/700 title, a 13 px muted description, and actions on
  the same row.
- **Panel:** white surface, 12 px radius and a hairline. The title row has no
  divider. A flush table starts right under the title, and its first and last
  cells line up with the title. Every group of form fields lives in a panel;
  fields never float on the canvas next to panels.
- **Table:** a standalone table is a white surface with a hairline and a
  12 px radius. The header row is not tinted: 12/500 muted labels over a
  hairline. Rows are separated by hairlines, and hover uses `muted`.
- **Boxes on the canvas:** anything with a border that sits directly on the
  canvas is a white surface (`border bg-card`). A transparent bordered box
  on the paper reads as an empty frame.
- **Toolbars and filters:** a filter *form* with an «Apply» button is a white
  surface (`rounded-xl border bg-card p-3`). An instant toolbar (search, quick
  chips, selects that filter as you type) sits directly on the canvas.
- **Fields:** inputs, selects and textareas are white in light mode, on the
  canvas and inside surfaces alike.
- **Dialogs and sheets:** white (`popover`) surfaces with a 12 px radius.
- **Tabs:** page sections use line tabs, with the underline in `foreground`.
  Filters use pill tabs, where the active pill is a white surface.
- **Buttons:** one primary (blue) button per view, for the main action.
  Secondary buttons are outline (white with a hairline). Workflow actions in
  a table row are outline `sm` buttons; edit and delete are ghost icons. An
  active preset in a segmented choice is `secondary`, not primary.
- **Metric tile:** white surface, 13 px muted label, 30/700 value. No
  gradient and no dimming.
- **TagChip:** a neutral chip with a colour dot, for any tag-coloured value
  (project and task status, priority, member role, service category).
- **Semantic badges:** `success`, `warning` and `destructive` are soft tints
  with dark text (5:1 or better), never solid fills. `outline` is the neutral
  soft chip; it has no outline any more, and the name was kept so call sites
  did not change. `default` (solid primary) is only for counters.
- **Empty states:** one calm line inside a section; the `EmptyState` box (a
  white surface with a dashed hairline) only when a whole page or tab is
  empty.
- **Documents:** a printable document such as the invoice is a white sheet on
  the canvas, without the frame in print.

## 8. Do and don't

**Do**
- Let white surfaces on the paper canvas do the grouping.
- Give every page one clear title and a few bold section titles.
- Keep one primary button per view.
- Show tag colours as dots.

**Don't**
- Don't add a border, divider or card where space already separates things,
  and don't put a bordered box inside a bordered surface; use a soft `muted`
  fill instead.
- Don't use a gradient, a heavy shadow or a second accent colour.
- Don't fill a badge with a tag colour and white text.
- Don't dim content with opacity to make it look secondary; use
  `muted-foreground`, or a dashed border for something inactive.
- Don't letter-space Persian text.

## 9. Checking a change

Every page and tab is checked in both themes with scripts in the browser:
text contrast of 4.5:1 or better, no transparent bordered box on the canvas,
no bordered surface inside another, and no horizontal overflow at 375 px.
