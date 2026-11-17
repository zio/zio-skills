# Export and delivery

Do this only after the user approves the final brand sheet. Deliver in a dedicated PR to the project repo.

## Where it goes

A flat `brand/` folder at the repo root. It is the single source of truth; other places copy from it.

```
brand/
  README.md                         # what each file is for, palette, head snippet, rebuild steps
  tokens.css                        # colours, fonts, radii as CSS variables, light + dark
  <project>-logo-light.svg          # full lockup, horizontal (default)
  <project>-logo-dark.svg
  <project>-logo-stacked-light.svg  # for square spaces
  <project>-logo-stacked-dark.svg
  <project>-mark-light.svg          # bare mark
  <project>-mark-dark.svg
  <project>-mark-mono.svg           # one colour, fill="currentColor"
  <project>-symbol.svg              # mark on its tile
  favicon.svg  favicon.ico          # .ico holds 16, 32, 48
  favicon-16.png  favicon-32.png  favicon-48.png
  apple-touch-icon.png              # 180, square corners
  icon-192.png  icon-512.png        # web app manifest
  icon-maskable.svg  icon-maskable-512.png
  avatar-500.png                    # GitHub/Slack/X avatar, full bleed
  readme-banner-light.png  readme-banner-dark.png    # 1200 × 300 @2x
  social-github-light.png  social-github-dark.png    # 1280 × 640
  social-og-light.png  social-og-dark.png            # 1200 × 630
  brand-sheet.html  brand-sheet.png  # one-page overview
  sheet/                            # every section board: source + PNG
  tools/                            # the script that rebuilds everything
```

Then wire it in:

- **Docs site:** copy favicons, `apple-touch-icon.png`, icons and manifest to the site's static folder (e.g. `website/static/img/`); add the `<head>` tags from the README.
- **README:** banner at the top, switched by theme with `<picture>` and `prefers-color-scheme`.
- **GitHub:** Settings › Social preview takes `social-github-*.png`; org/repo avatar takes `avatar-500.png`. These are manual uploads: tell the user.

## How to export

1. **Pull the sources.** Download the final boards from the design tool (each section board's source, e.g. `.dc.html`, plus its PNG render). Keep the exploration rounds out of the repo.
2. **Build vector masters.**
   - Rebuild the mark as clean SVG: exact geometry, no editor wrappers, `viewBox` set, no embedded fonts or bitmaps.
   - Convert wordmark text to outlines (e.g. shape with HarfBuzz, kerning on, outline with fonttools). Never ship live text in a logo file.
   - Mono version uses `currentColor`.
3. **Rasterise.** Render PNGs from the SVGs (headless Chromium or resvg) at every listed size; export banners and cards at 2×. Build `favicon.ico` from the 16/32/48 PNGs.
4. **Cut banners and cards** from the hero and social boards at their exact sizes, light and dark.
5. **Write `tokens.css`** from the colour and type sections: light by default, dark under `prefers-color-scheme: dark`.
6. **Script it.** Put the build in `brand/tools/` so anyone can regenerate every file from the sources and the font files. Pin the fonts (name, licence, source URL) in the README.
7. **Check.** Favicons look right in light and dark tabs at 16 px; contrast pairs from the sheet hold in `tokens.css`; every file in the README exists and nothing extra ships.

## `brand/README.md` template

```markdown
# <Project> brand

<One paragraph: what the mark is and the idea behind it.>

## Files
**Logo and mark** · **Icons** · **Cards and banners** · **Tokens and sheet**
<One line per file: name, size, where to use it.>

## Palette
| Role | Light | Dark |
|---|---|---|
<Each role with hex and contrast ratio.>

## Docs site `<head>`
<link rel="icon" href="/favicon.svg" type="image/svg+xml"> … theme-color for light and dark

## Rebuild
<Tools needed, font files, one command.>

<Notes: taglines are proposals; trademark disclaimers.>
```
