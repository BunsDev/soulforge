# Themes

SoulForge ships with 24 builtin themes and supports custom themes with hot reload.

## Quick Start

Press `/theme` or `Ctrl+K` → search "theme" to open the theme picker. Themes preview live as you navigate.

## Builtin Themes

### Dark

| Theme | Description |
|-------|-------------|
| `dark` | SoulForge default |
| `solarized-dark` | Ethan Schoonover's classic |
| `catppuccin` | Catppuccin Mocha |
| `catppuccin-frappe` | Catppuccin Frappe |
| `catppuccin-macchiato` | Catppuccin Macchiato |
| `gruvbox-dark` | Retro groove |
| `tokyo-night` | Tokyo Night |
| `tokyonight-storm` | Tokyo Night Storm |
| `dracula` | Dracula |
| `nord` | Arctic, north-bluish |
| `one-dark` | Atom One Dark |
| `rose-pine` | All natural pine |
| `kanagawa` | Inspired by Katsushika Hokusai |
| `github-dark` | GitHub Dark |
| `everforest-dark` | Comfortable green |
| `ayu-dark` | Ayu Dark |
| `nightfox` | Nightfox |
| `proxysoul-main` | proxySoul — deep purple with hot pink |
| `proxysoul-coffee` | proxySoul Coffee — warm amber & burnt orange |
| `proxysoul-water` | proxySoul Water — ocean blue & teal |

### Light

| Theme | Description |
|-------|-------------|
| `light` | Clean light theme |
| `catppuccin-latte` | Catppuccin Latte |
| `one-light` | Atom One Light |
| `github-light` | GitHub Light |

## Config

Theme is saved globally in `~/.soulforge/config.json`:

```json
{
  "theme": {
    "name": "catppuccin",
    "transparent": true,
    "userMessageOpacity": 70,
    "diffOpacity": 30,
    "borderStrength": "strong"
  }
}
```

| Field | Description |
|-------|-------------|
| `name` | Theme ID (builtin or custom) |
| `transparent` | Make background transparent (for terminal background bleed-through) |
| `userMessageOpacity` | User message background opacity when transparent: `0` (clear), `30` (dim), `70` (subtle), `100` (solid) |
| `diffOpacity` | Diff background opacity when transparent: `0` (clear), `30` (dim), `70` (subtle), `100` (solid) |
| `borderStrength` | Border visibility: `"default"`, `"strong"`, or `"op"` |

### Theme Picker Controls

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate themes (live preview) |
| `Enter` | Apply selected theme |
| `Tab` | Toggle transparent mode |
| `M` | Cycle message background opacity |
| `D` | Cycle diff background opacity |
| `B` | Cycle border strength |

## Custom Themes

Create your own theme by adding a JSON file to `~/.soulforge/themes/`:

```bash
mkdir -p ~/.soulforge/themes
```

### Example: custom theme

`~/.soulforge/themes/my-coffee.json`:

```json
{
  "_extends": "dark",
  "_label": "My Coffee",
  "_description": "Warm amber & burnt orange",
  "_variant": "dark",
  "brand": "#de7c00",
  "brand-secondary": "#e65f2a",
  "brand-dim": "#2e2010",
  "brand-alt": "#c8944a",
  "bg-app": "#020204",
  "bg-elevated": "#1a1510",
  "border": "#2e2010",
  "border-focused": "#e65f2a",
  "border-active": "#de7c00",
  "accent-assistant": "#de7c00"
}
```

The file name (minus `.json`) becomes the theme ID. This theme appears as "My Coffee" in the picker.

### Metadata Fields

| Field | Description |
|-------|-------------|
| `_extends` | Inherit from a builtin theme (default: `dark`). Only override the tokens you want to change. |
| `_label` | Display name in the theme picker |
| `_description` | Description shown in the picker |
| `_variant` | `"dark"` or `"light"` — controls light/dark indicator in the picker |

### Token Reference

Tokens use kebab-case in JSON files (auto-converted to camelCase internally). The full list:

**Brand**
- `brand` — primary brand color (highlights, active elements)
- `brand-secondary` — secondary brand color
- `brand-dim` — dimmed brand variant
- `brand-alt` — alternative brand color

**Text**
- `text-primary` — main text
- `text-secondary` — secondary text
- `text-muted` — muted text
- `text-dim` — dimmed text
- `text-faint` — faint text
- `text-subtle` — faintest text

**Backgrounds**
- `bg-app` — root application background
- `bg-primary` — primary content area
- `bg-secondary` — secondary content areas
- `bg-elevated` — elevated panels (reasoning, diffs, plans)
- `bg-popup` — popup/modal backgrounds
- `bg-popup-highlight` — selected row in popups
- `bg-overlay` — overlay dimming layer
- `bg-input` — input fields
- `bg-banner` — system banner
- `bg-banner-error` — system banner (error state)
- `bg-user` — user message bubble background

**Borders**
- `border` — default border color
- `border-focused` — focused/active border
- `border-active` — active state border
- `border-slash` — slash command mode border

**Status**
- `success` — success indicators
- `error` — error indicators
- `warning` — warning indicators
- `info` — info indicators
- `amber` — secondary warning/warm indicator

**Diff**
- `diff-added-bg` — background for added lines
- `diff-removed-bg` — background for removed lines
- `diff-added-sign` — color for + indicators
- `diff-removed-sign` — color for - indicators

**Accents**
- `accent-user` — user message accent
- `accent-assistant` — assistant message accent
- `accent-system` — system message accent

### Legacy Format

You can also define multiple themes in a single file at `~/.soulforge/themes.json`:

```json
{
  "my-theme": {
    "_extends": "dark",
    "brand": "#ff6600"
  },
  "another-theme": {
    "_extends": "light",
    "brand": "#0066ff"
  }
}
```

## Hot Reload

Theme files are watched for changes. Edit a custom theme file and the UI updates instantly — no restart needed. This applies to both `~/.soulforge/themes.json` and individual files in `~/.soulforge/themes/`.
