# MemeEmbed

A browser-based meme editor for embedding images into a scene. Pick a base
image, define rectangular or four-point (perspective) slots, attach images, and
tune color, edges, resolution, and backfill so the insert blends in. Add
top/bottom text, save templates, and export a flattened PNG.

Built with Svelte 5, TypeScript, Vite, and the Canvas 2D API. It runs entirely
client-side: no server, no account, and no upload.

## Features

- Rectangular and **four-point quad** slots, with drag and Ctrl-drag corner
  editing.
- Perspective warp (homography + canvas mesh) so an embedded image lands on an
  askew screen.
- Image framing: zoom and offset (pan) the embedded image inside its slot,
  independent of the fit mode.
- **Outer glow**: an adjustable color/size/opacity glow drawn outside the slot
  silhouette (rect or quad).
- Optional canvas guidelines: slot outlines, rule of thirds, center alignments,
  and a labeled 100 px measurement grid. Unselected slots stay hidden unless
  outlines are enabled.
- Blend controls: trim white/black edges, edge feather, surrounding-color tint,
  downscale, blur, brightness, saturation, and opacity.
- **Mask / bevel**: rectangle, rounded bevel with corner radius and bezel inset,
  and content-aware **auto-trace** for white/black cut-outs. `Detect bevel` fits
  the slot transform to the traced cutout first.
- Optional top and bottom text with font, size, fill, outline, and spacing.
- **Undo/redo** (Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y) covering geometry, bevels,
  blending, text, slots, and image attach/remove.
- Templates stored in the browser, portable via **Export template** /
  **Import template** bundles (`.memeembed.json`, images embedded).

## Run

```bash
npm install
npm run dev
```

Open the printed local URL. The first launch seeds the bundled presets
(`Coraline Dad Looking at Screen` and `Old Man Looking at Big TV Screen`).

## Build and test

```bash
npm run build      # production build in dist/
npm run preview    # serve the production build
npm run check      # svelte-check + tsc
npm test           # vitest (unit + headless canvas render tests)
```

## Storage

- Templates live in **IndexedDB** in your browser, including their base and
  embedded images.
- **Save** updates the current template; **Save as copy** creates a new one.
- **Export template** downloads a `.memeembed.json` bundle; **Import template**
  restores it on another browser or machine.
- **Export PNG** downloads a flattened meme.
- Clearing site data removes saved templates, export the ones you want to keep.

## Bundled presets

Presets are static files under `public/templates/`:

```
public/templates/
  index.json                              # list of preset directories
  coraline-dad-looking-at-screen/
    template.json
    base.png
  old-man-looking-at-screen/
    template.json
    base.png
  anime-girl-at-computer-screen/
    template.json
    base.png
```

To add a preset, create a folder with a `template.json` (and its images),
then add the folder name to `public/templates/index.json`. Missing presets are
seeded on first load; **Restore presets** re-copies the bundled ones without
touching your saved copies.

## Bundled templates and ownership

- **Coraline Dad Looking at Screen**
- **Old Man Looking at Big TV Screen**: source:
  <https://www.reddit.com/r/MemeTemplatesOfficial/comments/cbc3vs/old_man_looking_at_big_tv_screen_request_made_by/>
- **Anime Girl at Computer Monitor**: source:
  <https://i.pinimg.com/564x/e5/66/56/e56656a35f232f71a76d7989bc960b20.jpg>

I don't own any of the bundled meme images. Rights remain with their original
creators. The templates are included for meme editing and demonstration; if you
are a rights holder and want a template removed, please open an issue. Images
you import stay in your browser and are not claimed by the project.

The code is released under the MIT License (see `LICENSE`). The bundled meme
images are excluded from that license and remain the property of their
respective creators.

## Live site

<https://pipettingbeaver.github.io/MemeEmbed/>

Built from `main` and deployed to GitHub Pages by
`.github/workflows/deploy.yml`.

## Deploy to GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds and publishes `dist/`.
In the repository settings, set **Pages → Build and deployment → Source** to
**GitHub Actions**. Vite uses a relative `base` so the site works from a
project path such as `https://user.github.io/MemeEmbed/`.

## Notes for remote images

Features that call `getImageData` (trim detection, tint sampling, auto-trace,
blur, brightness/saturation) cannot read pixels from a cross-origin image unless
it is served with permissive CORS headers and loaded with
`crossOrigin="anonymous"`. Prefer same-origin template assets (like the bundled
presets) or user uploads.

## Project structure

```
src/
  App.svelte            editor shell and state
  components/           Stage, Inspector, TemplateList, dialogs
  lib/
    composite.ts        canvas rendering, masks, bevels, overlays
    warp.ts             homography + mesh perspective warp
    mask.ts             cutout tracing and bevel estimation
    cutout.ts           fitting the slot transform to a traced cutout
    webStore.ts         IndexedDB template storage + import/export
    history.ts          undo/redo stack
    geometry.ts         rect/quad math
public/
  templates/            bundled presets
  manifest.webmanifest  PWA metadata
```
