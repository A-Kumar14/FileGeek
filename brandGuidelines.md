# FileGeek Brand Guidelines

## Brand Name
**FileGeek**

Always written as a single word with "F" and "G" capitalized. Reflects an intelligent, research-first tool for document understanding and AI-powered study.

### Acceptable Usage
- FileGeek
- FILEGEEK (all-caps in headings only)

### Unacceptable Usage
- File Geek (with space)
- filegeek (all lowercase)
- Filegeek (lowercase 'g')

---

## Logo

### Mark
A soft circular orb using the primary gradient (`#7C3AED → #F97316`), paired with the wordmark **FileGeek** in Inter 700.

### Clear Space
Maintain clear space around the logo equal to the height of the "F" in the wordmark on all sides.

### Minimum Size
- Digital: 120px width minimum
- Print: 1 inch / 25mm width minimum

### Logo Don'ts
- Do not stretch or distort the logo.
- Do not add drop shadows or heavy gradients outside the approved palette.
- Do not use monospaced or terminal-style fonts for the wordmark.
- Do not place the logo on busy or dark non-neutral backgrounds.

---

## Color Palette

### Primary — Cortex Orange (Accent)
**Hex:** `#F97316`
**RGB:** 249, 115, 22
Use as: primary buttons, active indicators, interactive highlights, link color, brand accent.

### Secondary — Amber (Accent Secondary)
**Hex:** `#FBBF24`
**RGB:** 251, 191, 36
Use as: warm gradient partner to Cortex Orange, star/rating indicators, secondary highlights.

### Purple — Brand Gradient Start
**Hex:** `#7C3AED`
Use as: orb gradient start, "New Chat" button gradient, premium or AI-powered feature badges.

### Background Colors
| Token | Hex | Use |
|-------|-----|-----|
| `--bg-primary` | `#FFFFFF` | Main canvas, cards, panels |
| `--bg-secondary` | `#F9FAFB` | Sidebar, input backgrounds |
| `--bg-tertiary` | `#F3F4F6` | Code blocks, hover states |

### Text Colors
| Token | Hex | Use |
|-------|-----|-----|
| `--fg-primary` | `#111827` | Body copy, headings |
| `--fg-secondary` | `#374151` | Secondary labels, descriptions |
| `--fg-dim` | `#6B7280` | Captions, placeholders, metadata |

### Border & Structural
| Token | Value | Use |
|-------|-------|-----|
| `--border` | `rgba(0,0,0,0.08)` | All dividers, card borders |
| `--shadow` | `0 4px 24px rgba(0,0,0,0.08)` | Panel elevation |
| `--accent-dim` | `rgba(249,115,22,0.08)` | Hover fills on accent-colored elements |

### Status Colors
| State | Hex |
|-------|-----|
| Success | `#059669` |
| Error | `#DC2626` |
| Warning | `#F59E0B` |

---

## Typography

### Primary Font
**Inter** — the default UI typeface across all components.
Fallbacks: `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `sans-serif`

### Monospace Font
**JetBrains Mono** — used exclusively for code blocks, inline code, and technical values.
Fallbacks: `Fira Code`, `Courier New`, `monospace`

### Font Weights
- **Bold (700)**: Section headings, button labels, session titles.
- **SemiBold (600)**: Navigation labels, modal headers, key metadata.
- **Medium (500)**: Body copy, quick-action chips.
- **Regular (400)**: Secondary text, captions.

### Font Sizes
| Style | Size | Weight | Use |
|-------|------|--------|-----|
| Display | 1.5rem | 700 | Greeting text, empty state heads |
| Heading | 1.05rem | 700 | Dialog/panel titles |
| Body | 0.875rem | 400–500 | Chat messages, descriptions |
| Small | 0.78rem | 500–600 | Labels, chips, metadata |
| Caption | 0.65–0.72rem | 500–600 | Timestamps, badges, source refs |

---

## UI Elements

### Buttons
**Primary (Filled)**
- Background: `var(--accent)` (`#F97316`)
- Text: `#FFFFFF`
- Border Radius: `10–12px`
- Hover: `opacity: 0.88`

**Secondary (Outlined)**
- Background: `transparent`
- Border: `1px solid var(--border)`
- Text: `var(--fg-secondary)`
- Hover: `bgcolor: var(--bg-secondary)`

**Destructive**
- Border + Text: `var(--error)` (`#DC2626`)
- Hover fill: `rgba(220,38,38,0.06)`

### Pill / Chip
- Border: `1px solid var(--border)`, `borderRadius: 20px`
- Active: `border: var(--accent)`, `bgcolor: var(--accent-dim)`

### Cards & Panels
- Background: `var(--bg-primary)` or `var(--bg-secondary)`
- Border: `1px solid var(--border)`
- Border Radius: `12–16px`
- Shadow: `var(--shadow)` on floating elements, `none` on inline panels

### Input Fields
- Border Radius: `10px`
- Focus Border: `var(--accent)`
- Font: `var(--font-family)` (Inter)
- No terminal-style prefixes (`//`, `>`)

### Glassmorphism (Command Bar, Selection Toolbar)
- Background: `rgba(255,255,255,0.92)` or `rgba(255,255,255,0.96)`
- Backdrop Filter: `blur(12px)`
- Border: `1px solid var(--border)`
- Border Radius: `20px`

---

## Iconography
- **Library**: MUI Icons (Outlined style).
- **Weight**: Outlined/thin stroke.
- **Color**: `var(--accent)` for active/brand, `var(--fg-dim)` for inactive.
- **Size**: 18–22px in navigation; 14–16px in inline UI.

---

## Motion & Animation

- **Transitions**: `all 0.15s` ease-in-out for hover states and micro-interactions.
- **Entrance**: `opacity 0 → 1`, `translateY(8px) → 0` for panels and dialogs.
- **Orb**: Slow pulsing radial gradient animation for the brand orb and discovery screen.
- **No jarring transforms** — everything feels fluid and calm.

---

## Tone of Voice
- **Warm & intelligent**: Helpful first, technical when needed.
- **Agentic transparency**: Proactive about what the AI is doing (e.g., "Searching document…").
- **Minimal friction**: Short labels, no marketing jargon, no terminal-style all-caps commands.

---

## What to Avoid

| Old (Brutalist) | New (Cortex) |
|-----------------|--------------|
| `#00FF00` green on black | `#F97316` orange on white |
| `JetBrains Mono` everywhere | Inter for UI, JB Mono for code only |
| `border-radius: 0` | `border-radius: 10–20px` |
| `[BRACKET LABELS]` | Clean text labels |
| All-caps `ARTIFACT` headers | Title-case "Artifacts" headers |
| Dark `#0D0D0D` cards | White `#FFFFFF` / `#F9FAFB` cards |

---

## Contact
For brand-related questions or system updates, contact the **FileGeek** engineering team.
