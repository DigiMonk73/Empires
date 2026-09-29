# Visual review log

Newest first. Each entry: date · milestone.task · screenshots · scores (checklist numbers) · must-fix / should-fix.

## 2026-09-29 · M2.1 · demo-start, demo-moved (chromium + webkit)
- Placeholder shape art on a flat terrain grid. Both engines render identically.
- Scores: readability 3, scale 3, light 2 (placeholders have no consistent shading — expected until M3),
  anchoring 4, depth 4, team color 4, edges 4, terrain 2, fog n/a, HUD n/a.
- Should-fix (M2.2): the per-tile checkerboard makes the grid obvious — replace with noise-varied chunk meshes.
- Should-fix (M3): units only flip left/right; 8-direction baked sprites will replace them.
- Group move keeps formation and stops beside the stone mine without overlapping it. ✔
