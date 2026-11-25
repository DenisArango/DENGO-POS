---
name: DENGO Consola de clientes
description: Panel del proveedor para dar de alta, vigilar y operar los clientes de DENGO POS, en un tablero bento con volumen y movimiento.
colors:
  ink-rail: "#1E4D68"
  ink-deep: "#11303f"
  ink-night: "#0b1f2a"
  ink-mid: "#3b6e8f"
  ink-mist: "#b3cddf"
  ink-haze: "#eef4f8"
  coral: "#E07A5F"
  coral-press: "#c95f43"
  coral-glow: "#efa088"
  ice-floor: "#EEF3F7"
  tile-white: "#ffffff"
  status-online: "#10b981"
  status-pending: "#f59e0b"
  status-down: "#f43f5e"
  status-running: "#0ea5e9"
  status-archived: "#94a3b8"
typography:
  display:
    fontFamily: "Bricolage Grotesque Variable, Inter Variable, sans-serif"
    fontSize: "52px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Bricolage Grotesque Variable, Inter Variable, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Bricolage Grotesque Variable, Inter Variable, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "'cv11', 'ss01'"
  body-small:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.65
rounded:
  bar: "4px"
  chip: "8px"
  badge-sm: "10px"
  control: "12px"
  well: "16px"
  tile: "22px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  tile-gap: "20px"
  tile-pad: "24px"
  tile-pad-feature: "28px"
components:
  button-primary:
    backgroundColor: "{colors.coral}"
    textColor: "{colors.tile-white}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.coral-press}"
  button-ink:
    backgroundColor: "{colors.ink-rail}"
    textColor: "{colors.tile-white}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-ink-hover:
    backgroundColor: "#173c52"
  button-soft:
    backgroundColor: "{colors.tile-white}"
    textColor: "#173c52"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-soft-hover:
    backgroundColor: "{colors.ink-haze}"
  input:
    backgroundColor: "{colors.tile-white}"
    textColor: "{colors.ink-night}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  tile:
    backgroundColor: "{colors.tile-white}"
    rounded: "{rounded.tile}"
    padding: "{spacing.tile-pad}"
  tile-ink:
    backgroundColor: "{colors.ink-rail}"
    textColor: "{colors.tile-white}"
    rounded: "{rounded.tile}"
    padding: "{spacing.tile-pad}"
  well:
    backgroundColor: "{colors.ice-floor}"
    rounded: "{rounded.well}"
    padding: "16px"
  status-pill:
    rounded: "{rounded.pill}"
    padding: "4px 10px"
    typography: "{typography.label}"
  module-chip:
    rounded: "{rounded.chip}"
    padding: "4px 8px"
---

# Design System: DENGO Consola de clientes

## Overview

**Creative North Star: "The Living Mosaic"**

Every client is a tile on a bento board with real volume: white tiles stand on an ice-blue floor, lit from above by a one-pixel highlight and dropped onto it by layered, offset shadows. The board is read by color and motion before text: a pulsing dot says a client is alive, bars grow in to show fourteen days of sales, figures count up as they arrive, and a job's step ribbon lights up step by step while the server works. Nothing is flat or grey; the brand's ink blue and coral carry the frame and the action, and a small, fixed set of status hues carries state.

Density is that of an operator's console, not a marketing page: 12-14px Inter for everything you read, Bricolage Grotesque reserved for names and numbers that deserve weight. The ink rail on the left is the only dark surface besides the ink tile (server) and the job terminal; everything else lives on white tiles.

**Key Characteristics:**
- Bento grid of white tiles (22px radius) on an ice floor with soft radial washes of coral and ink.
- Volume through layered offset shadows plus a 1px inset top light, never glows or halos.
- Coral is the action color; status is emerald / amber / rose / sky / slate, always paired with a label.
- Colored icon badges with a glossy top highlight; lucide line icons inside.
- Spring-driven motion everywhere, all of it cancelled under reduced motion.

## Colors

A two-brand-color palette (ink blue and coral) over a cool ice floor, with a fixed set of saturated status hues.

### Primary
- **Ink Rail Blue** (ink-rail): the DENGO brand blue. Fills the side rail (as a gradient to Ink Deep), the ink tile, the `btn-ink` button, the POS module chip and the brand symbol stroke. It is the frame of the product.
- **Ink Deep / Ink Night** (ink-deep, ink-night): gradient ends of the rail and ink tile; Ink Night is the default text color and the terminal background.
- **Ink Mid, Ink Mist, Ink Haze** (ink-mid, ink-mist, ink-haze): secondary text and placeholder (Ink Mid), scrollbar thumbs and the inactive Toggle track (Ink Mist), soft-button hover and empty bars (Ink Haze). The full 50-950 ink ramp lives in `tailwind.config.js` and is the only neutral family; Tailwind slate is used only for the stopped/archived status.

### Secondary
- **Coral** (coral): the brand coral and the single action color. Primary buttons, the focus outline, the text caret, the active rail icon (as Coral Glow), today's bar in every sales chart, the IA module chip, and the add-client tile. Selection highlight is coral at 28% alpha.
- **Coral Press** (coral-press): primary-button hover and the tint of the coral button shadow.

### Tertiary
- **Status hues** (status-online emerald, status-pending amber, status-down rose, status-running sky, status-archived slate): each state has a dot, a 50-tint pill with a 700 text and a 20-25% ring, and a 400→700 gradient for icon badges. Running jobs are sky; online is emerald; suspended and warnings are amber; down and failures are rose; stopped and archived are slate.

### Neutral
- **Ice Floor** (ice-floor): the page background and the inside of wells.
- **Tile White** (tile-white): tile and control surfaces, with a faint vertical fade to #fbfdfe.

### Named Rules
**The Coral Means Act Rule.** Coral marks what you can do or what is happening today: the primary action, focus, caret, today's bar. It is never a status color; failure is rose.

**The Label With Color Rule.** A status hue never travels alone. Dots sit inside a pill with its word ("En línea", "Suspendido"), step dots carry an icon, meters carry their numbers.

## Typography

**Display Font:** Bricolage Grotesque Variable (with Inter Variable)
**Body Font:** Inter Variable (with system-ui), stylistic sets cv11 and ss01 on
**Label/Mono Font:** JetBrains Mono (400, 600), for domains, credentials, codes and the job log only

**Character:** a characterful grotesque for names and money set tight (-0.02em, bold) against a neutral, highly legible Inter for the operating text.

### Hierarchy
- **Display** (700, 48-52px, line-height 1): the hero sales figure on a client page and the featured client tile, always via CountUp.
- **Headline** (700, 32-34px, line-height 1): page titles ("Clientes", "Servidor", "Nuevo cliente").
- **Title** (700, 17-22px, ~1.25): tile titles and client names; 28px on the featured tile at md and up; 18px for result headings.
- **Body** (400-600, 14px): buttons, inputs, nav, page intros. **Body small** (13px) is the most common reading size inside tiles.
- **Label** (600, 12px): field captions and metric captions ("Vendido hoy") in sentence case. The `.label` utility (uppercase, 0.06em) is reserved for definition terms over values (review summary, provisioning facts).
- **Mono** (400, 12-13px; 12.5px/1.65 in the terminal): technical values only.

### Named Rules
**The Numbers Get The Display Face Rule.** Money, counts and client names are Bricolage; everything else is Inter. All numbers are tabular (`tabular-nums` on `.tabular`, `td`, `.num`).

**The Mono Is Technical Rule.** JetBrains Mono appears only for domains, emails, passwords, codes and log lines, never for decoration.

## Layout

A fixed left rail (232px at lg, 76px icon rail at md, a sticky top bar of icon tabs on phones) and a content column capped at 1440px with 16-36px side padding. Pages are a 12-column grid at xl: the board splits 8 (client tiles in a 2-column sub-grid) and 4 (ink server tile, recent jobs, amber checklist); detail pages use 5/7, 4/8 and 6/6 pairings, collapsing to 1 column (or 2 at md). Tiles are separated by a 20px gap; tile padding is 20px for small tiles, 24px standard and 28px on the featured tile, which takes double width and is reserved for the busiest client today. Inside tiles the rhythm is 6, 8, 12 and 16px gaps. Page headers sit 28px above the grid with the title left and actions right.

## Elevation & Depth

Depth is lifted and layered: every tile carries a stack of shadows tinted with Ink Deep, offset downward and widening (a 1px drop, a 16px soft, a 40px ambient), plus a 1px white inset at the top edge that reads as a light catching the tile's lip. Wells are the inverse: inset shadows that press a surface into the tile. Hover raises a tile 3px and swaps to the deeper lift stack; a finished job's tile rises and keeps the lift.

### Shadow Vocabulary
- **Tile** (`0 1px 0 0 rgba(255,255,255,.9) inset, 0 1px 2px rgba(17,48,63,.06), 0 6px 16px -6px rgba(17,48,63,.12), 0 18px 40px -18px rgba(17,48,63,.18)`): resting tiles, soft and ink buttons.
- **Lift** (`0 1px 0 0 rgba(255,255,255,.9) inset, 0 2px 4px rgba(17,48,63,.07), 0 12px 24px -8px rgba(17,48,63,.18), 0 30px 60px -24px rgba(17,48,63,.28)`): hovered tiles, the ink tile, the terminal, the completed job.
- **Well** (`inset 0 2px 4px rgba(17,48,63,.08), inset 0 0 0 1px rgba(17,48,63,.06)`): inputs, meters, progress tracks, credential and summary boxes.
- **Coral** (`0 1px 0 0 rgba(255,255,255,.35) inset, 0 6px 14px -4px rgba(201,95,67,.55), 0 2px 4px rgba(201,95,67,.3)`): the primary button only.

### Named Rules
**The Lit Lip Rule.** Every raised surface has the 1px white inset on top and a downward, ink-tinted drop beneath. Shadows are never centered glows and never neutral black on white.

## Shapes

Soft, generous corners that tighten as elements shrink: tiles 22px, wells and large icon badges 16px, buttons, inputs, nav items and medium badges 12px, small badges 10px, module chips 8px, chart bars 4px, and status pills, toggles and meters fully round. Borders are almost absent: tiles use a 1px ring at 6% ink, controls a 10% ring; the only visible border is the dashed coral outline of the add-client tile. Hairline dividers inside tiles are 1px at 6% ink.

## Components

### Buttons
Tactile and quick: every button presses to 97% scale on active and transitions in 150ms.
- **Shape:** gently rounded (12px), 10px by 16px, 14px semibold, icon gap 8px.
- **Primary:** coral fill, white text, coral shadow; hover deepens to Coral Press. One per view, for the main action ("Nuevo cliente").
- **Ink:** ink-rail fill, white text, tile shadow; for navigation onward ("Ir a la ficha").
- **Soft:** white with ink text, a 10% ring and tile shadow; hover Ink Haze. Secondary actions.
- **Danger:** rose-600 fill; appears only as the armed state of a ConfirmButton.
- **Disabled:** 50% opacity, no pointer events.

### Chips
- **Module chips:** 8px radius, 11px semibold, 12px icon; on = solid module color (POS ink, Maestros teal, Página sky, FEL emerald, IA coral) with white text; off = Ink Haze with Ink Mist text struck through.
- **Status pills:** fully round, 12px semibold, 50-tint fill, 700 text, 1px ring; online and down carry a pinging dot (scale 1→2.4, 1.8s).

### Cards / Containers
- **Corner Style:** 22px.
- **Background:** white fading to #fbfdfe; the ink variant is a radial gradient from #2b5b79 through Ink Rail to Ink Deep.
- **Shadow Strategy:** Tile at rest, Lift on hover and for the ink tile (see Elevation).
- **Border:** 1px ring at 6% ink.
- **Internal Padding:** 20 / 24 / 28px.
- **Entrance:** fade and rise 14px from 98.5% scale on a spring (stiffness 380, damping 30), staggered 40ms per tile.

### Inputs / Fields
- **Style:** white, 12px radius, no border, well shadow plus a 10% ring, 10px by 14px, 14px text, coral caret.
- **Focus:** the ring becomes 2px coral-400.
- **Error / Disabled:** the ring turns rose-400 and a 12px rose-600 message replaces the hint. Field captions are 13px semibold ink-800 above the control.

### Navigation
- **Rail:** ink gradient column with the white-squared DENGO symbol on top; items are 14px semibold Ink Mist text with a 20px icon, 12px radius. The active item gets a frosted 12% white pad that slides between items on a shared layout spring, and its icon turns Coral Glow. Hover is a 5% white wash.
- **Mobile:** the rail becomes a sticky horizontal top bar of icon-only tabs with the same active treatment.

### Icon Badge (signature)
A colored square (32 / 40 / 48px) with a 400→700 diagonal gradient in one of eight tones (ink, coral, emerald, amber, teal, sky, rose, slate), a glossy white top highlight at 35%, a soft tinted drop shadow, and a white lucide icon. It heads tiles and empty states.

### Step Ribbon (signature)
The live job view: a vertical list of 32px step dots joined by a 1px Ink Haze line. Pending is a hollow grey dot, running is sky with a ping and spinner, ok is emerald with a check that draws itself (380ms), warning amber, failed rose, undone pale amber. Each dot springs in when its state changes. Above it, a progress track fills sky-to-coral while running and turns emerald on success; on success the tile rises 4px and takes the Lift shadow.

### Terminal
Ink Night panel (gradient from #0f2733) at tile radius with the Lift shadow, JetBrains Mono 12.5px, lines colored by prefix (coral step headers, sky commands, rose errors, amber rollbacks, emerald success) and a blinking coral caret while live.

### Data marks
- **Bars:** 14 daily bars, 3px apart, 4px radius, ink gradient for past days and coral gradient for today, growing in on a spring with a 25ms stagger; empty days are Ink Haze stubs.
- **Meter:** a round well track whose gradient fill moves emerald → amber (over 70%) → rose (over 90%).
- **Toggle:** 48 by 28px round switch, emerald when on, Ink Mist well when off, white knob on a layout spring.
- **CountUp:** figures count from 0 over 0.9s with an expo-out curve when they scroll into view.
- **ConfirmButton:** destructive actions arm on first click (turning danger rose with the confirm text) and disarm after 4s; no modal.

## Do's and Don'ts

### Do:
- **Do** place every new surface on white 22px tiles with the Tile shadow over the ice floor, in the 12-column grid with 20px gaps.
- **Do** use coral for the one primary action of a view and for "today"; use Ink Rail for onward navigation.
- **Do** pair every status hue with its word, icon or number (The Label With Color Rule).
- **Do** head tiles with an Icon Badge in the tone that matches the tile's meaning.
- **Do** set client names, page titles and money in Bricolage Grotesque bold at -0.02em, with tabular numbers.
- **Do** animate with springs (entrance stiffness 380 / damping 30) and gate every animation on reduced motion, as the existing components do.
- **Do** confirm destructive actions in place with the two-step ConfirmButton.

### Don't:
- **Don't** build grey, flat or neutral screens: clients are tiles, never rows in a grey hosting-panel table; shadows are never untinted black. (Lists such as the jobs history may be tables, but inside a tile.)
- **Don't** use coral for errors or status; failure is rose, pending is amber.
- **Don't** use glows or centered halo shadows; depth is always offset downward with a lit top lip.
- **Don't** use JetBrains Mono outside technical values and the log.
- **Don't** mix in another style (frosted glass panels, hard zero-blur brutalist shadows, single-neon dark screens); this is one bento-with-volume system applied completely. The dark terminal with its status-colored log lines is part of this system, not an exception to it.
