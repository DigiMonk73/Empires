# Visual review log

Newest first. Each entry: date · milestone.task · screenshots · scores (checklist numbers) · must-fix / should-fix.

## 2026-09-29 · M2.2 · demo-start, demo-lake-forest (chromium + webkit)
- Terrain is now chunk meshes with half-tile color blending + shader noise: no visible grid; desert and water
  blend softly into grass; forest floor reads darker under the clumps.
- Scores: terrain 4 (was 2), readability 3, scale 3, light 2 (placeholders), anchoring 4, depth 4, team 4.
- Should-fix (M10): shoreline needs a sandy beach band and animated water; water edge is a soft haze today.
- Should-fix (M3/M9): forest trees are identical stamps — baked trees with variants will fix.

## 2026-09-29 · M2.1 · demo-start, demo-moved (chromium + webkit)
- Placeholder shape art on a flat terrain grid. Both engines render identically.
- Scores: readability 3, scale 3, light 2 (placeholders have no consistent shading — expected until M3),
  anchoring 4, depth 4, team color 4, edges 4, terrain 2, fog n/a, HUD n/a.
- Should-fix (M2.2): the per-tile checkerboard makes the grid obvious — replace with noise-varied chunk meshes.
- Should-fix (M3): units only flip left/right; 8-direction baked sprites will replace them.
- Group move keeps formation and stops beside the stone mine without overlapping it. ✔
