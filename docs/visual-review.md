# Visual review log

Newest first. Each entry: date · milestone.task · screenshots · scores (checklist numbers) · must-fix / should-fix.

## 2026-09-29 · M7.2 · fort, fort-closeup, wall-drag, wall-built (new); economy-placing-house
- Walls join cleanly along both tile axes, around corners and into closed squares at all three levels; back arms
  sit behind posts, front arms in front. Dragged diagonals read as stepped runs (inherent to a tile grid; the
  original's diagonal walls also stepped). Fortification merlons and the tower line (timber → stone-based
  sentry with tile roof → crenellated guard → guard with a roof ballista) read as a clear progression. Buildings 4.
- Fixed during review: the Wall button showed a text fallback ("Sm") — walls now have an icon model.
- Should-fix (M9): per-civ wall/tower styles; the ballista on the roof is small at zoom 1.

## 2026-09-29 · M7.1 · tower (new)
- A Watch Tower's arrow leaves the platform (launch height 2.8 levels, not a soldier's shoulder) toward an
  intruding villager; the first attempt showed a bowman's arrow instead, so the test now moves player 1's army
  away and waits for a missile fired by the tower itself. Arrows are small at zoom 2 — fine, like the
  original's. Readability 4.

## 2026-09-29 · M6.10 · victory, victory-results (new), ai-base
- Victory banner over a Bronze-Age town at 35:20; results table shows kills/losses/razed, gathered totals and
  age times; the loser's −100 "Other" is the manual's elimination penalty. HUD 4.
- ai-base (8:00) changed with the new AI: houses around the TC, granary + a second granary by the hunting
  grounds, storage pit at the woodline, barracks; reads as a working Stone-Age base. Buildings 4.

## 2026-09-29 · M6.9 · saves-save (new), menu-skirmish
- Save dialog matches the game's panels (bronze frame, Cinzel title); the list shows name, map, age, game
  clock and date; "Game saved." confirms. Readability 4, HUD 4.
- Skirmish setup gains "Map seed" (fixed 4242 in the test so the shot is stable); focus rings recoloured gold.

## 2026-09-29 · M6.8 · no new screenshots (audio); ai-base, battle re-checked
- Audio changes nothing on screen. The 19 shots that moved did so because tests now start paused (`paused=1`)
  instead of running a load-dependent number of real-time ticks before `pause(true)`; ai-base and battle
  re-checked and correct. A second run on an unchanged tree now changes 7 shots (the menu backdrop drifts by
  wall clock; raid/fog-scouted/work-overview ≤ 0.08%), down from 14.
- Audio review (no ears in the loop): `node tools/sfx.ts` prints length, peak and RMS for every effect and
  writes WAVs to `artifacts/audio/sfx/` for the playtest. All peak at −3 dBFS and end ≥ 20 dB down (unit test);
  the first cut of the fanfare and defeat sting stopped mid-note (clicks) and the alert was a gated square
  (−7 dB RMS, harsh) — fixed with a release fade, longer tails and a softer horn call.

## 2026-09-29 · M6.7 · village-tool, village-bronze (new), aged contact sheets
- Ages read at a glance: Stone huts → Tool mudbrick halls under thatch → Bronze limewash and stone under red tile
  with colonnades and domed silos; foundations rise in the current age's style. Buildings 4, style coherence 4.
- Fixed during review: the Government Center's pediment floated as a grey slab — removed.
- Should-fix (M9): one architecture set only (four more), dock/tower/walls have no age variants yet; Iron Age.

## 2026-09-29 · M6.4 · ai-base (new)
- The computer's base at 8:00 reads like the original's AI: TC ringed by houses, granary, storage pit at the
  woodline, barracks, villagers spread over wood/food. Composition 4.
- Fixed: an abandoned foundation (builder lost) now gets a new builder.

## 2026-09-29 · M6.3 · menu-main, menu-skirmish (new)
- "Empires" in Cinzel over the living village (farmers hoeing, woodcutters), dimmed at the edges; bronze-framed
  buttons. Skirmish panel matches the HUD style; player colour swatches. Menus 4.
- Fixed: the backdrop showed unexplored fog (black blobs) — menu mode now renders without fog.
- Should-fix (M9/KI-2): a painted title image would beat plain text; add civ emblems in the setup rows.

## 2026-09-29 · M6.2 · gameover, results (new)
- Victory/Defeat banner in Cinzel over the dimmed map; Results panel in the HUD's bronze-on-stone style with the
  score by category (winner starred) and a tallies table. HUD 4.
- Should-fix (M12): graphs over time and per-age breakdowns like the original's post-game timeline.

## 2026-09-29 · M6.1 · map-continental, map-inland (new)
- Generated starts read like the original's: TC + 3 villagers in a clearing, berries/gold/stone at a walk, a
  woodline, scattered trees, gazelle herds, elephants and lions further out; coastline + beach (Continental),
  central lake on the minimap (Inland); desert patches. Terrain 4, composition 4.
- Should-fix (M10): beach and desert share one tan; add palm/pine forests and elevation.

## 2026-09-29 · M5.7 · battle (new)
- 20v20 mid-fight: clubmen trading blows in knots, bowmen and slingers shooting from behind, arrows in the air,
  the fallen on the ground; trees break up the line. Reads like the original's skirmishes. Composition 4.
- Should-fix (M10/M11): no hit sparks/dust or sounds yet; HP bars show only on selection.

## 2026-09-29 · M5.5b · raid-base (new), raid (rubble), scout / building contact sheets
- A readable Tool-age base: barracks, archery range (shed, straw targets), stable (stalls, paddock, hay), watch
  tower (legs, platform, ladder); scouts read as horse + rider at game scale. Rubble now reads as a burnt ruin.
  Buildings 4, units 4, team colour 4.
- Fixed during review: the horse's tail stuck up like a post (axis flipped to hang).
- Should-fix (M9): horse legs are straight tubes (no hock shape); scout's fall separates rider and horse a lot.

## 2026-09-29 · M5.5a · clubman/axeman/slinger/bowman frame sheets, raid*, volley
- Four readable infantry silhouettes: pelt + club, cap + stone axe, headband + sling, cap + bow + quiver.
  Overhead blows read as blows; the bow stands upright through the draw. Readability 4, anchoring 4, team 4.
- Fixed during review: club/axe pointed straight along the arm like lances (now 0.9 rad off the forearm);
  the bow lay flat along the arm (quarter turn so it stands up) and across the hips at rest (bow-hand hold pose).
- Should-fix (M9): the sling cord is a rigid rod; bodies share one build — vary proportions per unit.

## 2026-09-29 · M5.3 · research-queued (new)
- Town Center grid: villager + age advances labelled ⬆II / ⬆III (identical ⬆ arrows were ambiguous); the queue
  shows the same glyph with its progress bar. HUD 3/5 — tech icons are text glyphs until M9's baked icons.

## 2026-09-29 · M5.2 · volley (new), raid*
- Arrows read at zoom 2: dark shaft, pale fletching, steel tip, a faint ground shadow tracking the flight;
  slight arc for arrows, high arc for stones. Readability 3 at zoom 1 (arrows are ~11 px) — acceptable, as in
  the original. Bowmen are placeholders (M5.5).

## 2026-09-29 · M5.1 · raid-corpses, raid (chromium + webkit)
- Villagers killed by clubmen fall and lie in the grass (baked die clip, last frame held, 20 s then fade); a razed
  house leaves a dark trampled plot. Clubmen are still placeholders (M5.5). Readability 3 (placeholders), depth 4.
- Should-fix (M5.5): rubble reuses the construction site (stakes + rope read as "site", not "ruin") — bake rubble.
- Should-fix (M5.4): surviving villagers stand still while their neighbours are cut down — retaliation/flee.

## 2026-09-29 · M4.7c · gazelle/elephant/lion frame sheets, work-overview, economy-after
- Animals read at game scale: tan gazelles with horns grazing, a grey elephant with ears/tusks/trunk, a maned
  lion; carcasses lie on their side where they fell. Readability 4, anchoring 4, light 4.
- Fixed during review: the elephant was a capsule on stubby legs (longer legs, shoulder hump, rump); the lion's
  tail tuft floated off the tail (tail axis flipped).
- Should-fix (M9): bodies are still smooth capsules — add musculature/tapering; death plays only as a pose (the
  sim removes animals instantly — dying/corpse timing lands with M5 deaths).

## 2026-09-29 · M4.7b · village (new), contact sheets granary/storagePit/barracks/dock/farm/site3
- A readable Stone-age village: raised granary bins, storage pit under a thatched roof with wood/stone/gold
  stacked beside it, a thatched barracks with spear rack and practice post, a dock on piles over the water,
  farms at four fill levels, foundations rising out of dirt sites. Buildings 4/5, anchoring 4, team color 4.
- Fixed during review: storage pit/barracks/dock sheds were yawed 45° so their gables faced the camera flat —
  aligned to the tile axes they read as proper iso; wheat was chess-pawn cones then smooth bars → irregular
  clumps; soil used the brick texture (read as planks) → plain earth.
- Should-fix: the bottom-up reveal slices hut roofs flat mid-way (acceptable, as in the original); stubble strips
  are plain; construction could add scaffolding (M9).

## 2026-09-29 · M4.7a · work-overview, villager frame sheets (tools/frames.ts)
- Villager work clips read at game scale: pick at the gold, basket at the berries, spear throw at the gazelles;
  chop/mine/hoe/hammer swings are two-handed where they should be. Readability 4, anchoring 4, light 4.
- Fixed during review: two-handed grips splayed apart overhead (X roll flips past horizontal → use yaw); tool
  heads enlarged ~1.5× (unreadable at 1×); the throw spear spun with the arm (now re-aimed each frame).
- Should-fix: forage reach is subtle from the back facings; the gold sack is dark — nuggets enlarged, check in game.

## 2026-09-29 · M4.5 · economy-after, economy-placing-house, economy-tc-queue
- The start scenario now has a gazelle herd, a lone elephant and a pond with shore fish (pond edge just visible at
  the bottom of the view). Animals are still placeholder shapes (tan ovals on legs, no heads that read): readability
  2/5 for animals — must-fix in M4.7 (baked quadrupeds). Fish/carcass placeholders are code-drawn (ripples +
  shoal; animal on its side) and sort flat under units standing on them.
- Farms, fish and carcasses sort from their back corner, so farmers draw on top of their field.

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
