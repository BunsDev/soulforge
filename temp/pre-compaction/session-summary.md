# Pre-Compaction Context Dump
## Session: Kitty Graphics Protocol Image Rendering in SoulForge

### What was accomplished this session:

1. **soul_vision tool** (`src/core/tools/show-image.ts`)
   - New tool that displays images inline in chat
   - Accepts local file paths OR URLs (`https://...`)
   - Supports PNG, JPG, WebP, GIF, BMP, TIFF
   - Non-PNG formats auto-converted via `sips` (macOS) / ImageMagick
   - Returns `_imageArt` which useChat picks up for inline rendering

2. **Kitty graphics protocol implementation** (`src/core/terminal/image.ts`)
   - `isKittyGraphicsTerminal()` — detects Kitty terminal
   - `renderImageFromData(buffer, name, opts)` — core rendering API
   - Transmits PNG data via Kitty graphics protocol (`\x1b_G` APC sequences)
   - Writes directly to `/dev/tty` to bypass TUI renderer stdout interception
   - Creates virtual placement with `U=1` for Unicode placeholders
   - Returns `ImageArt` with `kittyImageId`, `kittyCols`, `kittyRows` metadata
   - Falls back to half-block ANSI art for non-Kitty terminals
   - `getPngDimensions()` — fast PNG header reader
   - `halfBlockArtFromPng()` — extracted shared half-block renderer

3. **ImageDisplay React component** (`src/components/chat/ImageDisplay.tsx`)
   - For Kitty: renders U+10EEEE placeholder chars directly via React `<text>`+`<span>`
   - Bypasses ghostty-terminal (which can't handle supplementary plane PUA chars)
   - Uses correct 297-entry diacritics lookup table from Kitty spec
   - Each cell: `U+10EEEE + ROW_DIACRITIC + COL_DIACRITIC`
   - Image ID encoded as fg color: `(r<<16 | g<<8 | b)`
   - Shows metadata header: icon + filename + resolution
   - For non-Kitty: falls back to ghostty-terminal for half-block art

4. **code_execution image capture** (`src/hooks/useChat.ts`)
   - Handles `case "file"` stream parts from AI SDK
   - When code_execution generates image files, captures them
   - Renders via `renderImageFromData` and attaches as `imageArt` to tool call

5. **Tool display branding** (`src/core/tool-display.ts`)
   - `soul_vision` categorized under `soul-map` (green)
   - Active label: "Visualizing", Done label: "Visualized"
   - Uses "image" icon (󰋩)

### Key technical challenges solved:

1. **ghostty-terminal can't handle U+10EEEE** (supplementary plane PUA character)
   - Solution: render placeholders directly via React `<text>`+`<span>` elements (like FloatingTerminal does)

2. **Wrong row diacritics** (was using sequential `0x0305 + row`, only row 0 correct → ~2% visible)
   - Solution: 297-entry diacritics table from Kitty's `rowcolumn-diacritics.txt`

3. **Missing column diacritics** (only had row encoding)
   - Solution: each cell needs BOTH row AND column: `U+10EEEE + ROW_DIA + COL_DIA`

4. **Kitty only accepts PNG** (not JPG/WebP/GIF/BMP natively for `f=100`)
   - Solution: auto-convert via `sips` (macOS built-in) or `convert` (ImageMagick)

5. **TUI stdout interception** blocks graphics protocol escape codes
   - Solution: write directly to `/dev/tty` via `openSync`/`writeSync`/`closeSync`

### Files modified (10 files):
- `src/core/terminal/image.ts` — Kitty protocol + buffer rendering + ImageArt type + transmit/delete
- `src/core/tools/show-image.ts` — soul_vision tool implementation (**NEW**)
- `src/core/tools/index.ts` — wire soul_vision into buildTools + import
- `src/components/chat/ImageDisplay.tsx` — Kitty placeholder + fallback renderer (**NEW**)
- `src/components/chat/StaticToolRow.tsx` — use ImageDisplay instead of ghostty-terminal
- `src/components/chat/MessageList.tsx` — use ImageDisplay instead of ghostty-terminal
- `src/components/chat/ToolCallDisplay.tsx` — use ImageDisplay instead of ghostty-terminal
- `src/hooks/useChat.ts` — handle `case "file"` stream parts from code_execution
- `src/types/index.ts` — ImageArt type with Kitty metadata fields
- `src/core/tool-display.ts` — soul_vision branding (category, icons, labels)

### Conversation flow (key moments):
1. User asked to show images in chat using code execution
2. Built initial pipeline: `renderImageFromData` + `case "file"` handler in useChat
3. User suggested a `show_image` tool instead → simpler, built it
4. First attempt: Kitty placeholders via ghostty-terminal → blank (VT parser issue)
5. Switched to direct React rendering → saw ~2% of image (diacritics wrong)
6. Fixed diacritics table + added column diacritics → WORKING! 🎉
7. Added metadata header (icon + filename + resolution)
8. Renamed to `soul_vision` for branding
9. Added URL support + multi-format conversion (JPG, WebP, GIF, BMP, TIFF)
10. Tested with URLs (JPG, GIF) — both work (GIF = static first frame)

### Current limitations:
- Animated GIF shows only first frame (Kitty protocol supports animation via `a=f` frames but not yet implemented)
- Image pasting from clipboard not yet supported (separate PR exists but stale)
- Some extra whitespace above/below images in layout (marginTop removed but tree continuation box may add space)
- Non-Kitty terminals get half-block art only (no native pixel rendering)

### Conversation statistics:
- ~20 user messages
- Heavy tool usage: read, edit_file, multi_edit, soul_grep, web_search, fetch_page, navigate, shell, project, soul_vision, code_execution
- Multiple rounds of debugging (diacritics, ghostty-terminal bypass, spacing)
- Full check (typecheck + lint + test) passed at multiple checkpoints
