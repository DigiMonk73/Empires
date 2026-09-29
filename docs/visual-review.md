# Visual review log

Newest first. Each entry: date · milestone.task · screenshots · scores (checklist numbers) · must-fix / should-fix.

## 2026-09-29 · M4.6 · economy-placing-house, economy-tc-queue, economy-after
- Real opening by mouse: placement ghost (translucent baked hut on green/red tiles), build menu with original
  hotkeys + next-age buildings greyed, baked-art icons for villager/house/TC, TC portrait, queue with progress.
- Fixed: Back button read "Ba" (looked like Barracks) → ↩ glyph; Stop → ✋.
- Should-fix (M4.7): Granary/Storage Pit/Barracks/Dock/Farm still placeholder boxes & text icons; newly trained
  villagers bunch at one spawn tile.

## 2026-09-29 · M3.4 · contact-townCenter, contact-house, art-closeup
- Stone-age huts: thatch cone roofs, mud-brick walls, door toward the viewer, team band on the wall; the Town
  Center adds a storage hut, raised granary, fire pit, palisade posts and team banners.
- Fixed: contact sheets cropped buildings (unit-style anchors); house team band hidden inside the tapered wall;
  thatch texture too coarse.
- Scores: readability 4, scale 4, light 4, team color 4 (TC banners + bands). Barracks still a placeholder box.

## 2026-09-29 · M3.3 · contact-villager, art-closeup
- Baked villager: 8 facings × idle/walk/die, team-colored tunic; walks face their direction of travel in game.
- Fixed: all facings identical (pose reset the facing rotation — facing now on a wrapper group); death fell
  forward onto hands → now topples backward; tree shadows were clipped by fixed render cells (straight edges) →
  cells auto-fit to projected model + shadow bounds; sun raised (shorter, softer shadows, opacity 0.27).
- Scores: readability 4, scale 4, light 4, anchoring 5, team color 4. Remaining placeholders: buildings, soldiers.

## 2026-09-29 · M3.2 · contact sheets: tree, forestTree, goldMine, stoneMine, berryBush, calTile, calBox
- First baked art: lit, textured, soft shadows falling screen-right/down; calibration IoU 1.0000 (tile + box).
- Round 1 → fixed: lollipop trees (thin trunk, smooth ball canopy) → sturdy trunk + limbs + lumpy clumped
  canopy; gold was dark brown → bright ore; lighting raised; forest variants were all conifers (seed mixing bug).
- Scores: readability 4, light 4, anchoring 5 (calibrated), edges 4. Trees now read like 1990s pre-rendered art.

## 2026-09-29 · M2.6 · demo-lake-forest (fogged), fog-scouted
- Fog: unexplored black with soft, noisy edges; enemy base hidden until the scout arrives; minimap fogged the
  same way. Fog 4/5.
- Explored-but-unwatched ground renders ~50% dark (not captured in these shots — scout LOS covers the view).

## 2026-09-29 · M2.4 · hud-single
- Top bar (stockpile, pop, age, clock, buttons) and bottom panel (selection, command grid, minimap slot) in a
  bronze-on-dark-stone style. HUD 3/5 at this stage.
- Should-fix (M12): vendor the OFL Cinzel/Alegreya fonts (Georgia fallback today); the ⚔ glyph renders as ×
  — replace text glyphs with baked icons; portraits come from the baker (M3/M9).
- Should-fix (M2.x): camera centering ignores the bottom panel (visual center sits ~80 px low).

## 2026-09-29 · M2.3 · selection-box, selection-moved
- White ellipses under selected own units, green HP bars above; drag box translucent white. Readable.
- Fixed: HP bars sat ~10 px above villager heads — lowered.

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
