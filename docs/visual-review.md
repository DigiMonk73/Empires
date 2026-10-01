# Visual review log

Newest first. Each entry: date · milestone.task · screenshots · scores (checklist numbers) · must-fix / should-fix.

## 2026-09-30 · M15.4b · every model rebaked (team overlays cut); HUD icons clipped (28 shots ≤ 0.18% px)
- World views: no visible change (units' team colours sit where they did — selection-box, army checked).
- HUD icons (tech-tree, selection-box/moved): each shows one figure now — before, a soldier's icon showed its atlas
  neighbours in the box's margins (three soldiers, or a grey team mask beside the unit). Icons 4.

## 2026-09-30 · M15.4 · no visual change (10 shots ≤ 0.28% px)
- Soak and art eviction only. The changed shots are the save lists' timestamps and the menus' live backdrop; the
  minimap fix of M15.3 took the run-to-run noise from ~20 shots to 10.

## 2026-09-30 · M15.3 · minimap now current in every shot (36 shots ≤ 0.12% px)
- Screenshots force a minimap redraw, so its camera frame sits over the view shown (ai-base, map-continental
  checked: before, the 4 Hz throttle could leave the frame where the camera had been). Main views unchanged but for
  a few pixels of animation. The minimap's resource dots now live on their own layer — no visible difference.

## 2026-09-30 · M15.2 · no visual change (20 shots ≤ 0.32% px)
- Lockstep router only. Checked menu-options (sub-pixel edges in the live backdrop behind the panel) and volley
  (minimap frame); units in the battle scenes unmoved. Run-to-run noise; nothing to score.

## 2026-09-30 · M15.1 · no visual change (14 shots ≤ 0.34% px)
- Determinism work only. Diffs checked: saves-server/saves-save (save-list timestamps and the other tests' saves),
  village (minimap viewport frame a pixel over), the rest run-to-run noise of the same size. Nothing to score.

## 2026-09-30 · M14 (D58) · hills on: map-*, ai-base, victory* re-shot
- Generated maps now rise and fall (D44 shading): soft slopes, level ground round each Town Center, the raised edge
  reading as terrain, not a seam; forests, mines and water unchanged in layout. Skirmish shots changed with the
  games they show (hills + the predator fix). Terrain 4.

## 2026-09-30 · M14.4 · menu-skirmish (Full Tech Tree checkbox)
- "Full Tech Tree" beside "Reveal map" on the first row; the panel widens a little (still inside 1280 CSS px) and
  everything stays aligned. With it ticked the civ panel lists "No civilization bonuses (Full Tech Tree)" and
  "everything but the Fire Galley" (checked by the lobby e2e). UI 4.

## 2026-09-30 · M14.3 · menu-skirmish (a second settings row)
- Victory, Starting age and Population on a second row under Map / Size / Resources / Seed, same labels and
  selects; Target or Time limit appears beside Victory when chosen. Aligned, readable; the players table moves
  down a row and the panel still fits at 1280×800 CSS px. UI 4.

## 2026-09-30 · M14.2 · countdowns (new); ai-base, victory*, results-timeline re-shot (Standard skirmishes)
- The clocks at the upper right in Cinzel, one line each ("You · Wonder · 1998", "Player 2 · All Artifacts ·
  1998"), in the owner's colour lightened a third (the raw blue was dark over unexplored ground); the notice at the
  upper left. HUD 4.
- Skirmish shots changed because skirmishes now default to Standard: 5 + 5 relics on the map (unclaimed Ruins at
  the bottom of ai-base, off-white), so the games play out a little differently; the victory game still ends by
  conquest (27:42). No regressions seen.

## 2026-09-30 · M14.1 · relics (new, chromium + webkit); ruins + artifact contact sheets
- Broken marble colonnade on a cracked 2×2 pavement; gold idol on a stepped pedestal with a team-coloured cloth.
  Contact sheets read at 1×; the idol's gold needed low metalness (the baker has no environment to reflect).
- Owner colour reads at a glance (banner on the Ruins, cloth on the Artifact); unclaimed ones are off-white, also
  on the minimap (the Gaia colour was teal — only relics show it). Notices at the upper left for both captures.
- Scores: readability 4, scale 4, light 4, anchoring 4, depth 4, team color 4, edges 4, terrain n/a, HUD 4.
- Should-fix (polish): the Ruins' banner is small at zoom ≤ 1 — a second one or a larger cloth if playtests miss it.

## 2026-09-30 · M12.6 · help, credits, scores-paused (new); all 130 re-shot (self-hosted fonts)
- The designed fonts arrive: Cinzel's capitals in titles, the top bar, the age and headings; Alegreya for text,
  menus and messages. Readable at every size used; the tech tree's small labels stay clear. Help: a two-column
  list (gold Cinzel terms, Alegreya prose) with a How to play / Keys switch; Credits the same layout. In game:
  the score list and F11 line at the upper right in player colours, the S button in the minimap corner, a large
  "Paused" in Cinzel with the hint beneath. UI 4.

## 2026-09-30 · M12.5 · saves-server (new), options (Autosave row)
- Save dialog: This device / Server tabs under the title (the chosen one lit), the server's list and the name
  field as before. Options gain an Autosave toggle between Start speed and Hotkeys. The saved-at column shows the
  wall-clock time, so these snapshots differ a little on every run (expected). UI 4.

## 2026-09-30 · M12.4 · victory-timeline, results-timeline (new), victory-results (tab bar)
- Timeline graph on the results panel: gridlines and round values, minutes along the bottom, each player's line in
  their colour over a dark underline, age marks (dot + II/III on the line). The 33-minute victory shows the winner
  climbing through Tool and Bronze and the loser's collapse to −66 at elimination — the first pass clipped that
  below the axis (→ the scale now reaches below zero with a brighter zero line) and cut the last minute label at
  the right edge (→ wider margin). Both engines identical. UI 4.

## 2026-09-30 · M12.3 · diplomacy (new)
- Diplomacy dialog on the stone panel: player swatch and name, civ emblem and name, three stance buttons with the
  chosen one lit in its colour (Ally green, Neutral gold, Enemy red), their stance in the same colours; Allied
  Victory checkbox; tribute row (player, resource with the amount held, amount, Send) and a note with the cost
  and fee or why it can't be sent. First pass centred the first column, tribute heading and note (the panel's
  base style) → left-aligned. UI 4.

## 2026-09-30 · M12.2 · options-classic, keys-grid (new), menu-options (new layout)
- Options: two columns — Sound and Controls on the left, Conveniences with the Modern/Classic preset on the
  right; toggles right-aligned, choices as small bronze buttons (first pass stretched Edge scroll across the
  column → fixed). Keys (F1): general keys as a two-column table with gold key names, the grid layout as a 5 × 3
  keycap block (first pass centred the descriptions → left-aligned). The command grid behind shows Q/W/E letters
  in Grid mode. WebKit's sliders draw white thumbs (as since M11.4). UI 4.

## 2026-09-30 · M12.1 · notify-attack (new), priest-converted, siege-volley, village-bronze (+ age/defeat texts elsewhere)
- Messages sit at the upper left under the top bar in Alegreya with a black halo: legible on grass and on the black
  of unexplored ground; each in its player's colour lightened a third (ours blue, Player 2 red), warnings coral.
  The attack ping (red rings) reads on the minimap beside the enemy base. Scenes that grant ages at start now show
  "You have advanced to…" lines — correct behaviour. A CSS fade-in caught mid-way made the first snapshot dim →
  removed (screenshots must not depend on real time). UI 4.

## 2026-09-30 · M11.4 · menu-options (new)
- Options on the main menu: Sound on/off and four sliders (Master, Music, Effects, Voices) with their values, on
  the stone panel; sliders grey out while sound is off. UI 4.

## 2026-09-30 · M10 exit · highland re-scored (artifacts/m10/highland.png)
- With beaches, foam, palms by the ponds and the fog on the hills, Highland reads as a finished map: 4 (was 3.5
  at M10.2). Every M10 item is at 4.

## 2026-09-30 · M10.6 · fog on Highland (artifacts/m10/fog.png)
- The explored trail of three scouting villagers on a hilly map: the soft fog edge follows the hill's contour;
  the villagers stand in their own sight. Fog 4.

## 2026-09-30 · M10.5 · fire (artifacts/m10), dust
- Damaged buildings burn: orange flame tongues on the roof under dark smoke columns leaning downwind, more fires
  as HP falls (the 15% granary has three). First try's additive flames blew out to white blobs → normal-blended
  tongues with a faint additive glow. Dust behind moving riders is deliberately faint at game zoom. FX 4.
- In verify (repair): the damaged house burns while a villager repairs it. Must-fix fixed: foundations still
  rising (their HP grows with progress) burned too — only finished buildings burn now.

## 2026-09-30 · M10.4 · harbor zoomed, coastal (artifacts/m10)
- Water has life: turquoise over the shallows darkening to navy offshore, drifting ripples, foam lines washing
  on the beaches, the Dock, boats and fish schools sitting in it rather than on a flat colour. First try's
  sparkles were a busy white speckle → sparser and fainter. Water 4. The harbor's straight deep-water column
  shows a hard diagonal (scenario layout; generated maps have natural edges).

## 2026-09-30 · M10.3 · coastal, desert (artifacts/m10), palm/pine sheets
- Coasts now have real beaches: an irregular sand band follows every shoreline (Coastal, the Continental rim,
  lakes, ponds) instead of the old green-blue haze; desert patches read warm gold, distinct from pale beach;
  palms stand on the sand with frond shadows, pines crown the Highland rises. Grass shows faint streaks. Terrain 4.
- Should-fix: a few grass flecks inside wide beaches where the band's noise dips.

## 2026-09-30 · M10.2 · highland, hillcountry (artifacts/m10)
- Highland: ponds with fish among uplands, forests and gold on the rises; Hill Country: a lake in rolling
  ground. Hills read as broad light and dark slopes (×2.2 shading); still softer than the original's — terrain
  texture and transitions (M10.3) should help them stand out. Maps 3.5.

## 2026-09-30 · M10.1b · hills (new), hills-map (?scenario=map&hills=1)
- The stepped review hill reads as a mound: slopes facing away from the sun fall into shade, the crest carries a
  House and three bowmen standing visibly above the clubmen on the plain, the trees on the slope sit on it.
  Smoothing the drawn height turned the first try's thin bright ramp lines into rounded hills. Terrain 4.
- Generated 1–2-level hills are gentle — readable as soft shading, not landmarks; taller ones come with
  Highland/Hill Country (M10.2). Flat scenes unchanged (shade is exactly 1 on level ground).

## 2026-09-30 · M9 exit · on the StartOS VM (artifacts/vm-e2e, Chromium + WebKit)
- 0.9.0 served by StartOS looks as in the local builds: the stone-and-bronze HUD with the Greek emblem by the age,
  the island start under fog. Menu loads in 1.0–1.2 s; 14/14 checks.

## 2026-09-30 · M9.9 · gallery (5 sets × Stone/Iron × 8 views) and contact sheets — the M9 scorecard
| Group | Score | Notes |
|---|---|---|
| Units (villager, 40 soldiers, cavalry, siege, priest, ships) | 4 | unchanged since their milestones (M3–M8 reviews) |
| Animals | 4 | alligator 4 after the ×1.35 scale (M9.1) |
| Greek set, 4 ages | 4 | Iron TC was 3.5 → propylon + two statues |
| Egyptian / Babylonian / Asian / Roman sets, 4 ages | 4 | fixes logged under M9.2–M9.6 |
| Towers | 4 | were one grey Greek set for all → each kit builds its own four towers |
| Walls, docks, farms, sites, rubble | 4 | shared by all sets (D43) — neutral materials read fine everywhere |
| Wonders (temple, pyramid, ziggurat, pagoda, amphitheatre) | 4–5 | the pagoda and amphitheatre the strongest |
| Tech icons | 4 | armour was 3.5 → an armour stand (helmet + cuirass) with a large class badge |
| UI (stone/bronze/parchment, emblems, loading screen) | 4 | Roman eagle the weakest emblem |
- In game (gallery): every set anchored on its footprint, team colours on bands and banners, age variants
  switch with the owner's age, no z-order faults. Budget 62 MB atlases + 1.9 MB metadata.

## 2026-09-30 · M9.8 · menu-skirmish, village-tool, victory-results, tech-tree + 100 more (UI restyle), emblems grid
- Panels now read as carved stone (block courses, mortar, grain) under the old tints; buttons are hammered
  bronze with a bevel; the civ box is parchment with dark-red heading and ink text. The top bar shows the
  player's emblem beside the age, the setup rows and results table carry each civ's roundel, the tech tree its
  title emblem. All 16 emblems distinct and legible at 24–64 px (the Roman eagle is the weakest). UI 4.
- Every shot with HUD chrome changed (104/106) — the restyle, reviewed on the four above.

## 2026-09-30 · M9.7 · tech-tree (0.55%), icon contact sheets
- Every chip in the tech tree has a picture: ages show the Town Center they build (Tool Age a thatched hall,
  Bronze and Iron tiled halls), the Market's axe/pick/sheaves/wheel, the Temple's astrolabe, orb, gods, ankh,
  flames and wreath, the Government Center's diadem, scroll, column, cart, laurel, target, flask and crane.
  Readable at 26 px; the armour icons (cuirass + sword/bow/horseshoe badge) are the least clear. UI 4.
- Should-fix (M12): unit chips in the tree are small — idle frames carry a lot of empty margin at 26 px.

## 2026-09-30 · M9.6b · Greek contact sheets (Iron variants); verify shots ≤ 0.26%
- Greek Iron Age: the Bronze buildings refaced in bright marble and warm ashlar, red-and-blue meander friezes
  under the team band, gilded finials, a bronze hoplite (Barracks), archer (Range), horse (Stable), torch-bearers
  (Town Center, Granary, Government Center) and a market fountain. Reads as "richer Bronze"; the Town Center is
  the weakest step (should-fix, M9.9). Must-fix fixed: the friezes first sat inside the team band.

## 2026-09-30 · M9.6 · Roman contact sheets (13 buildings × ages); verify shots ≤ 0.17% (re-bake only)
- Roman set: Palatine huts with crossed ridge poles (Stone); stucco on tufa under wide terracotta gables (Tool);
  red brick, arched openings, pedimented gable ends and pier arcades (Bronze); marble with pilasters, bronze-tiled
  domes and gilded acroteria (Iron). The high-podium temple reads Roman next to the Greek peripteral one. The
  amphitheatre Wonder: arcaded tiers, a coursed seating bowl, a sand arena. Must-fix fixed: the team ring was a
  solid disc lidding the arena; the domes rendered near-black (metalness without an environment → 0.2).
- All 16 civilizations now build in their own set (5 sets; Greek keeps the hand-built models).

## 2026-09-30 · M9.5 · Asian contact sheets (13 buildings × ages); verify shots ≤ 0.15% (re-bake only)
- Asian set: pit dwellings (Stone); raised timber halls under steep thatch with chigi and ridge logs, stilted
  granaries (Tool); red lacquer columns, white walls and grey tile roofs sweeping up at the corners (Bronze);
  double eaves, painted brackets, gilded jewels, bronze cauldrons (Iron). The five-storey pagoda Wonder with its
  gilded spire, gateway and lanterns is the most legible Wonder so far. Must-fix fixed: the pit house's team band
  floated on the roof as an outline (now a team mat on the porch); roofs were too flat at the corners.

## 2026-09-30 · M9.4 · Babylonian contact sheets (13 buildings × ages); verify shots ≤ 0.11% (re-bake only)
- Babylonian set: mudhif reed vaults and reed ricks (Stone); buttressed mudbrick under stepped merlons (Tool);
  brick with a blue rosette frieze, arched doors and bull-capital porticoes (Bronze); blue glazed walls with
  yellow lions and gilded merlons (Iron). The ziggurat temple and the four-terrace Wonder with hanging gardens
  read at a glance. Must-fix fixed: terrace tops and Iron shed roofs were solid glaze; the stairs were turned the
  wrong way and buried in the terraces (now solid flights climbing the +X faces). Buildings 3.5–4.

## 2026-09-30 · M9.3 · Egyptian contact sheets; siege-volley, ai-base (0.3–0.6%)
- Each building type now reads by shape: the Market is a stall square round a covered hall, the Archery Range a
  long open gallery with targets, the Stable a stall lean-to over a fenced paddock, the Siege Workshop a tall open
  shed with a crane wheel, the Barracks an L of halls round a drill yard. In play the red Egyptian barracks is an
  L of reed huts. Range and Stable are still close cousins (gallery + end house) — the props tell them apart.

## 2026-09-30 · M9.2 · gallery egyptian × 4 ages, contact sheets; ai-base, raid, siege-volley (changed 1.5–2.2%)
- Egyptian set: Stone oval reed-and-mud huts under reed domes and beehive silos; Tool whitewashed mudbrick with
  roof shades, jars and palm-log beam ends; Bronze battered limestone, blue cavetto cornices, clerestories,
  papyrus columns, a pylon temple with obelisks; Iron painted sandstone friezes, gilding, red-granite obelisks,
  a pyramid Wonder with valley temple and sphinx. Distinct from the Greek set at a glance. Buildings 3.5–4.
- In play: the AI's Egyptian Stone-age base (ai-base) and the raid camp now show the reed huts and silos with
  red team bands. Must-fix fixed before commit: the podium's paint stripe covered its whole top; bare flat roofs.
- Should-fix (M9.3): within a set the buildings are one block type with different props — Stable, Range, Siege
  Workshop and Market need their own shapes.

## 2026-09-30 · M9.1 · contact-academy, alligator sheets, gallery (greek, Bronze)
- Academy: an L of limewashed stoas under red tiles round a sanded yard, a verdigris hoplite on a marble plinth,
  a rack of team-blue shields and a straw practice post — reads as the Greek set's drill school. Building 4.
- Alligator: long, low and olive with a dark ridge, yellow eyes and a pale tooth line; the jaw gapes on attack
  and it dies belly-up. Side views read as a crocodile; legs sprawl only in front views. Unit 3.5. Small next
  to a lion at first → scaled ×1.35.
- Gallery (new): every Greek building in the Bronze Age on one map; nothing missing, no placeholders.
- Verify: 23 shots change by 0.06–0.5% (a full re-bake; the victory game's timing shifts slightly); the tech
  tree's Academy column now shows its building icon (the M7.9 should-fix).

## 2026-09-30 · M8 exit · on the StartOS VM (artifacts/vm-e2e, Chromium + WebKit)
- The game served by StartOS 0.8.0 looks as in the local builds: setup (Small Islands, Greek bonuses, Tech Tree),
  the island start under fog with woodlines, berries and gazelles, the tech tree, and the harbor sea battle.

## 2026-09-30 · M8.8a · victory, victory-results
- AI change only: the menu→victory game plays out differently (a Dock by the lake, victory at 30:26). Renders
  as before.

## 2026-09-30 · M8.7 · map-smallIslands, map-mediterranean (new)
- Small Islands: a whole island per player — berries, gold, stone, woodline, gazelles, shore fish round it and a
  deep-fish school offshore; the minimap shows the other islands and islets. Mediterranean: the sea just south
  of the Town Center, land all round. Maps 4/5. Should-fix (M10): sandy flecks where the coast noise was
  cleaned up; shallows are one flat colour.

## 2026-09-30 · M8.6c · harbor-battle (baked warships, fish); contact sheets
- A blue War Galley and a red Scout Ship trade arrows: shields along the rail carry the team colour, the ram and
  oar banks read; the fishing boat is now clearly a different ship; deep-fish schools are baked (ripple rings,
  dark backs). Ships 3/5. Should-fix (M10): ships still sit on a flat colour — no hull reflection or waterline
  darkening; wakes are a fixed V (not trailing the real path).

## 2026-09-30 · M8.6b · all scenes (WebP atlases, lazy textures)
- Every scene re-shot on lossy WebP atlases: ≤ 0.16% px change anywhere but the drifting menu; art-closeup
  checked by eye — clean edges, true team colours, no blotching. No placeholder caught in any shot (tests settle
  until on-demand art has loaded).

## 2026-09-30 · M8.6a · harbor-fishing, trade, ferry-aboard (baked ships); contact sheets
- Baked fishing boats (net boom out, team-striped braced sail), trade boats and transports replace the shared
  placeholder. Fixed in review: a thick white foam ring read as a lifebuoy (now a thin pale waterline); square
  sails vanished side-on (braced 26°); ships were a third of a Dock long (drawn 1.5×). Ships 3/5.
  Should-fix: the end-on facing hides most of the hull under the sail; no wake yet (M8.6c).

## 2026-09-30 · M8.5 · trade (new)
- A Trade Boat on its second run to the red Dock: "Carrying 20 Stone", 40 stone out and 6 gold in by 0:12
  (a 13-tile route — below the 40-tile par, so a loss, as intended for a short route). Should-fix (M12): the
  grid doesn't show which good is on (only the tooltip says "(on)" — same for Stand Ground); the Fd / Wd / St
  text glyphs want resource icons (M9).

## 2026-09-30 · M8.4 · ferry-aboard (new)
- A selected Light Transport: "Aboard 3 / 5" in the panel, Unload (L, ⚓) in the grid; the clubmen are off the
  map. Must-fix found and fixed: the top bar read 3/4 — it recounted units itself (missing riders, Logistics,
  pop limit); it now shows the sim's 6/4. Transport art is the shared placeholder (M8.6).

## 2026-09-30 · M8.3 · repair (new); villager command grids
- The villager grid gains Repair (R, ⚒) between Build and Stop; a villager walks to a damaged house. Should-fix
  (M10): a house at 20/75 HP looks untouched — damage fire/smoke below 75/50/25% (PLAN art pipeline) isn't
  drawn yet, so the player can't see what needs repair without selecting it.

## 2026-09-30 · M8.2 · harbor-battle (new)
- A selected War Galley (145/160) trades arrows with a red Scout Ship; the arrow in flight and the target ring
  read. Must-fix (M8.6): every ship is the same placeholder sailboat on a dark disc — a galley can't be told
  from a fishing boat. Others: the usual ≤ 0.16% render noise and the menu drift.

## 2026-09-30 · M8.1 · harbor-fishing (new); menu-main, menu-skirmish
- Harbor: the Dock on the shore, two placeholder sailboats, shore-fish ripples along the beach and the new
  deep-fish schools (wider rings, more backs) read clearly; the selected boat's panel shows "Carrying 10 Fish".
  Should-fix (M8.5): baked boats (the placeholder hull floats on a dark disc), a boat portrait ("Fi").
- Menu: a uniform 1 px shift of the whole backdrop — its slow real-time drift, not a content change.

## 2026-09-30 · M7.10 · victory, victory-results
- AI change only: the menu→victory game plays out differently (P1 34 kills / 11 lost). Results table renders
  as before. No visual change.

## 2026-09-30 · M7.9 · tech-tree (new); top bar in every shot
- Greek tree: buildings across with baked icons, ages down; done items gold with ✓, later dimmed, missing
  struck through on red. Reads well. UI 4. The ~0.12% change in every other shot is the new Tech Tree button.
- Should-fix (M9): the Academy has no baked icon ("Ac"); "Government Center" is clipped at 1280 px and the
  Granary/Dock columns need a horizontal scroll — tighten column widths or wrap long names (M12).

## 2026-09-30 · M7.8 · menu-skirmish
- Setup shows the chosen civilization's bonuses and how many items its tree lacks, in the panel's style.

## 2026-09-30 · M7.7 · wonder (new)
- A standing Wonder and one rising from its 5×5 site. Fixed during review: the pediments (cones squashed the
  wrong way) stood up as huge grey sails above the roof — now a shared, correctly oriented pediment helper
  (the temple had the same bug); the gold roof blew out to near-white in the sun — tiled roof, gilded ridge.
  Buildings 4. Should-fix (M9): a taller, more monumental silhouette per architecture set.

## 2026-09-29 · M7.5 · priest-chant, priest-converted (new)
- The chanting priest raises his staff with both arms; a gold ring pulses under the target; a flash marks the
  conversion. Robed priests with team stoles read clearly apart from soldiers. Units 4.
- Should-fix (M9/M11): temple variants per architecture set; a proper vocal chant (voice set) instead of the
  synthesized hum.

## 2026-09-29 · M7.4c · army (mounted rows)
- Every mounted unit reads at zoom 1.6: the three cavalry steps by horse coat and barding, camel, horse
  archers, chariots with crew and rolling wheels (scythes visible), elephants with mahout / scale / howdah and
  clearly bigger than horses. Units 4. Priests are the last placeholder (M7.5).

## 2026-09-29 · M7.4b · army, army-clash (new)
- Infantry lines read as upgrades at a glance (more metal, bigger shields, longer blades, crests). Fixed during
  review: the Legion was a team-coloured blob (tunic, skirt and scutum all team) and its scutum lay sideways
  (hung off a level forearm) — leather skirt, and the scutum turned upright. Units 4.
- Mounted units and priests are still placeholder shapes (M7.4c, M7.5).

## 2026-09-29 · M7.3 · siege-park, siege-volley (new)
- Side-on the torsion engines read at once (cocked arm, frame, spoked wheels, team cloth); head-on the first
  cut looked like a chair (tall rectangular stop-bar frame) — fixed with a leaning A-frame and braces. Three
  sizes/finishes separate Stone Thrower / Catapult / Heavy Catapult; the ballista carts read as crossbows, the
  helepolis with its double bow and mantlet. Units 4.
- Should-fix (M9): stones in flight are small grey dots — give them a shadow and a little size; the workshop
  yard is fine at zoom 1 but plain at 2.

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
