# Changelog

All notable changes to MemeEmbed are recorded here.

Versions use [Semantic Versioning](https://semver.org/). Small UI, preset, and
bug-fix changes are released as patch versions (`0.1.x`); larger feature sets
get a minor bump. The version shown in the app header is the released version.

## [0.1.1] - 2026-11-21

### Added

- Version indicator in the top-left header.
- This changelog.
- Guidelines panel: show all slot outlines, rule of thirds, center alignments,
  and a labeled 100 px measurement grid.
- Outer glow control for slots (color, size, opacity).
- Image framing: zoom and offset/pan controls for the embedded image.
- P1–P4 corner labels for the selected slot on the canvas.
- Axis-aware stepper buttons: horizontal arrows for X/W, stacked arrows for
  Y/H, with the value increasing in the visual direction.
- Anime Girl at Computer Monitor preset.

### Changed

- Unselected slots no longer show an outline or badge unless outlines are
  enabled in Guidelines.
- Old Man Looking at Big TV Screen green screen geometry now uses the requested
  quad: P1 477,289 · P2 939,221 · P3 920,725 · P4 497,614.
- Anime Girl at Computer Monitor monitor quad updated to
  P1 31,64 · P2 236,63 · P3 235,214 · P4 31,225.

### Fixed

- Zooming out below 100% now reveals the full source image instead of shrinking
  an already-cropped image.
- Restoring presets now reloads the open template, so updated preset geometry
  appears immediately instead of staying stale until it is reopened.

## [0.1.0] - 2026-11-21

### Added

- Initial public release: rectangular and four-point perspective slots, masks
  and bevels, blend controls, text layers, undo/redo, IndexedDB template
  storage, template import/export, and PNG export.
