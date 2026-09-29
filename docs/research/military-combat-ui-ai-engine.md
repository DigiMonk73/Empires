# Age of Empires (1997) + The Rise of Rome (patch 1.0c / RoR 1.0a): military, combat, priests, naval, UI, AI and engine reference

## 0. How to read this report

**Primary sources used:**
- The original **AoE 1.0 manual** (OCR text): https://archive.org/details/manual_Age_of_Empires
- The **RoR manual**: https://archive.org/details/Age_of_Empires_The_Rise_of_Rome
- **Fandom wiki infoboxes**, pulled through its API. I resolved every `{{tt|current|history}}` tooltip to the value marked "before the Definitive Edition", i.e. the original game: https://ageofempires.fandom.com/wiki/Unit_(Age_of_Empires)
- **openage reverse-engineering docs**, including a table copied from the AoE1 Mac manual: https://github.com/SFTtech/openage/tree/master/doc/reverse_engineering
- **AoE Heaven**, including posts by ES_Sandyman, who worked at Ensemble.
- The **Ensemble postmortem** and the **patch notes**.

**Conventions:**
- **Speed** is in tiles per second at game speed 1.0.
- **ROF** (rate of fire) is seconds between attacks.
- **LOS** (line of sight) and range are in tiles.
- **Train and research times** are in game-seconds.
- "(unverified)" means I could not confirm the value.
- "DE:" marks a change made in the Definitive Edition. Don't copy those if you want 1.0c behaviour.

---

## 1. Units

### 1a. Land units (original / RoR 1.0a)

Sources:
- Per-unit fandom pages, e.g. https://ageofempires.fandom.com/wiki/Composite_Bowman_(Age_of_Empires)
- AoE manual appendix p.108 and RoR manual appendix
- openage `unit_stats_aoe.csv`: https://github.com/SFTtech/openage/blob/master/doc/reverse_engineering/unit_stats/unit_stats_aoe.csv

| Unit | Building / Age | Cost | Train | HP | Attack (type) | Armor / Pierce | Range | ROF | Speed | LOS | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Villager | Town Center / Stone | 50F | 20 | 25 | 3 melee (hunter: 4, thrown, range ~4, **80% accuracy**) | 0/0 | 0 | 1.5 | 1.1 | 4 | Wheel speeds them up. Jihad: +7 attack, +40 HP, +0.3 speed, −8 carry. Siegecraft adds a hidden bonus vs walls/towers. |
| Clubman | Barracks / Stone | 50F | 26 (Mac table: 27) | 40 | 3 M | 0/0 | – | 1.5 | 1.2 | 4 | Takes the cavalry "infantry" bonus |
| Axeman | Barracks / Tool | 50F | 26 | 50 | 5 M | 0/0 | – | 1.5 | 1.2 | 4 | Battle Axe upgrade: 100F, 40s |
| Short Swordsman | Barracks / Bronze | 35F 15G | 26 | 60 | 7 M | 1/0 | – | 1.5 | 1.2 | 4 | Original needs the "Short Sword" tech (120F 50G); DE removed it |
| Broad Swordsman | Barracks / Bronze | 35F 15G | 26 | 70 | 9 M | 1/0 | – | 1.5 | 1.2 | 4 | Broad Sword: 140F 50G, 80s |
| Long Swordsman | Barracks / Iron | 35F 15G | 26 | 80 | 11 M | 2/0 | – | 1.5 | 1.2 | 4 | Long Sword: 160F 50G, 90s |
| Legion | Barracks / Iron | 35F 15G | 26 | 160 | 13 M | 2/0 | – | 1.5 | 1.2 | 4 | Legion: 1400F 600G, 150s, needs Fanaticism. DE: 140 HP |
| Slinger (RoR) | Barracks / Tool | 40F 10S | 24 | 25 | 2 pierce | 0/**2** | 4 | 1.5 | 1.2 | 5 | +2 vs archers, extra damage vs walls/towers. No Leather/Scale/Chain; shields give +1 pierce armor each. Stone Mining and Siegecraft each give +1 attack and +1 range; Alchemy +1 attack |
| Bowman | Archery Range / Tool | 40F 20W | 30 | 35 | 3 P | 0/0 | 5 | 1.4 | 1.2 | 7 | |
| Improved Bowman | Archery Range / Bronze | 40F 20G | 30 | 40 | 4 P | 0/0 | 6 | 1.4 | 1.2 | 8 | Improved Bow: 140F 80W, 60s |
| Composite Bowman | Archery Range / Bronze | 40F 20G | 30 | 45 | 5 P | 0/0 | 7 | 1.4 | 1.2 | 9 | Composite Bow: 180F 100W, 100s |
| Chariot Archer | Archery Range / Bronze (needs Wheel) | 40F 70W | 40 | 70 | 4 P | 0/0 | 7 | 1.5 | 2.0 | 9 | **8× conversion resistance**. vs Priest: ×3 (AoE), +7 (RoR) |
| Horse Archer | Archery Range / Iron | 50F 70G | 40 | 60 | 7 P | 0/**2** | 7 | 1.5 | 2.2 | 9 | DE: 1 pierce armor |
| Heavy Horse Archer | Archery Range / Iron | 50F 70G | 40 | 90 | 8 P | 0/2 | 7 | 1.5 | 2.5 (fastest unit) | 9 | 1750F 800G, 150s, needs Chain Mail Archers |
| Elephant Archer | Archery Range / Iron | 180F 60G | 50 | 600 | 5 P (manual; fandom 6) | 0/0 | 7 | 1.5 | 0.9 | 8–9 (sources differ) | |
| Scout | Stable / Tool | 100F | 30 | 60 | 3 M | 0/0 | – | 1.5 | 2.0 | 8 | Undocumented +2 LOS per Age advance. Does **not** auto-attack |
| Chariot | Stable / Bronze (needs Wheel) | 40F 60W | 40 | 100 | 7 M | 0/0 | – | 1.5 | 2.0 | 4 | 8× conversion resistance. vs Priest: ×2 (AoE), +7 (RoR) |
| Scythe Chariot (RoR) | Stable / Iron (needs Nobility) | 40F 60W | 40 | 120 | 9 M | 2/0 | – | 1.5 | 2.0 | 4 | Trample damage to adjacent units. Upgrade: 1200W 800G, 150s |
| Cavalry | Stable / Bronze | 70F 80G | 40 | 150 | 8 M | 0/0 | – | 1.5 | 2.0 | 4 | +5 vs Barracks infantry (not Slingers) |
| Heavy Cavalry | Stable / Iron | 70F 80G | 40 | 150 | 10 M | 1/1 | – | 1.5 | 2.0 | 4 | 350F 125G, 90s |
| Cataphract | Stable / Iron | 70F 80G | 40 | 180 | 12 M | 3/1 | – | 1.5 | 2.0 | 4 | 2000F 850G, 150s, needs Metallurgy. DE: 240 HP, 5/3 |
| Camel Rider (RoR) | Stable / Bronze | 70F 60G | 30 | 125 | 6 M | 0/0 | – | 1.5 | 2.0 | 4 | +8 vs cavalry and horse archers, +4 vs chariots. No bonus vs infantry |
| War Elephant | Stable / Iron | 170F 40G | 50 | 600 | 15 M | 0/0 | – | 1.5 | 0.9 | 5 | Trample. Attack cannot be upgraded |
| Armored Elephant (RoR) | Stable / Iron (needs Iron Shield) | 170F 40G | 50 | 600 | 18 M | 2/1 | – | 1.5 | 0.9 | 5 | Bonus vs walls/towers. Upgrade: 1000F 1200G, 150s |
| Hoplite | Academy / Bronze | 60F 40G | 36 | 120 | 17 M | 5/0 | – | 1.5 | 0.9 | 4 | |
| Phalanx | Academy / Iron | 60F 40G | 36 | 120 | 20 M | 7/0 | – | 1.5 | 0.9 | 4 | 300F 100G, 90s |
| Centurion | Academy / Iron | 60F 40G | 36 | 160 | 30 M | 8/0 | – | 1.5 | 0.9 | 4 | 1800F 700G, 150s, needs Aristocracy |
| Priest | Temple / Bronze | 125G | 50 | 25 | – | 0/0 | 10 (convert) | – | 0.8 | 12 (Mac table: 15) | See §3 |
| Stone Thrower | Siege Workshop / Bronze | 180W 80G | 60 | 75 | 50 M (+140 vs buildings, +50 vs towers) | 0/0 | 10, min 2 | 5 | 0.8 | 13 | Blast radius 0.5. Friendly fire |
| Catapult | Siege Workshop / Iron | 180W 80G | 60 | 75 | 60 M (same bonuses) | 0/0 | 12, min 2 | 5 | 0.8 | 15 | Blast radius 1.5. Upgrade: 300F 250W, 100s |
| Heavy Catapult | Siege Workshop / Iron | 180W 80G | 60 | 150 | 60 M | 0/0 | 13, min 2 | 5 | 0.8 | 16 | Blast 1.5 ("large"). Kills trees. 1800F 900W, 150s, needs Siegecraft |
| Ballista | Siege Workshop / Iron | 100W 80G | 50 | 55 | 40 P | 0/0 | 9, min 3 | 3.0 | 0.8 | 11 | +5 vs Fire Galley |
| Helepolis | Siege Workshop / Iron | 100W 80G | 50 | 55 | 40 P | 0/0 | 10, min 3 | 1.5 | 0.8 | 12 | 1500F 1000W, 150s, needs Craftsmanship. Looks identical to the Ballista in the original |

**Discrepancies:**
- Sandyman confirms "all stable unit attack rate is 1.5". The Mac-manual table instead lists 1.3 for the Cavalry line, 0.9 for the Scout and 1.0 for elephants. I would use 1.5.
- Projectile speeds before the DE: arrows 8, stones 2.7, ballista bolts 4.5.
- The "frame delay" (the animation frame at which the attack is released) is 5 for foot archers, 6–7 for mounted archers and 11 for siege.

### 1b. Naval units

Sources: fandom ship pages; Sandyman's corrections thread https://aoe.heavengames.com/cgi-bin/aoecgi/display.cgi?action=st&fn=1&tn=194

**The Dock trains faster in later Ages** (original data): about 1.5× in Stone/Tool Age and 2× in Bronze/Iron Age. For example, the Scout Ship takes 60s base, 40s in Tool Age and 30s in Bronze/Iron.

| Unit | Age | Cost | Base train | HP | Attack | Range | ROF | Speed | LOS | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| Fishing Boat | Stone | 50W | 40 | 45 | – | – | – | 1.4 | 6 | |
| Fishing Ship | Bronze | 50W | 40 | 75 | – | – | – | 2.0 | 6 | Upgrade 50F 100W |
| Trade Boat | Stone (per fandom) | 100W | 50 | 200 | – | – | – | 2.0 | 4 | DE: 120 HP |
| Merchant Ship | Bronze | 100W | 50 | 250 | – | – | – | 2.5 | 4 | Upgrade 200F 75W, 60s |
| Light Transport | Tool | 150W | 75 | 150 | – | – | – | 1.4 | 4 | Carries 5 |
| Heavy Transport | Iron | 150W | 75 | 200 | – | – | – | 1.75 | 5 | Carries 10. Upgrade 300F 150W, 75s |
| Scout Ship | Tool | 135W | 60 | 120 | 5 P | 5 | 1.5 | 1.75 | 7 | |
| War Galley | Bronze | 135W | 60 | 160 | 8 P | 6 | 1.7 | 1.75 | 9 | Upgrade 150F 75W, 75s |
| Trireme | Iron | 135W | 60 | 200 | 12 P | 7 | 1.8 (manual says 2) | 1.75 | 10 | Upgrade 250F 100W, 100s |
| Catapult Trireme | Iron | 135W 75G | 90 | 120 | 35 (ignores armor; +140 vs buildings, +50 vs towers) | 9 | 5 | 1.35 | 12 | Blast 1.0, friendly fire. Tech: 300F 100W, 100s, after Trireme |
| Juggernaught | Iron | 135W 75G | 90 | 200 | 35 | 10 | 5 | 1.35 | 13 | Blast 1.5, kills trees. 2000F 900W, 180s, needs Engineering |
| Fire Galley (RoR) | Iron | 115W 40G | 45 | 200 | 24 | 1 | 1.0 | 2.0 | 8 | Needs War Galley. Takes +5 damage from Ballista/Helepolis and +10 from stone throwers/Catapult Triremes. Alchemy +6. Not available with the Full Tech Tree option |

**General naval rules:**
- All ships are **2× harder to convert**.
- Villagers repair ships, which costs a share of the ship's wood/gold.
- Priests cannot heal ships.
- Shallows can be crossed by land units and ships. Water, forest and cliffs block land units.

### 1c. Tower line

All towers: 150 stone, 2×2 tiles, 80s to build, no minimum range, garrison none in original.

| Tower | Age | HP | Attack | Range | ROF | Pierce armor | LOS | Upgrade |
|---|---|---|---|---|---|---|---|---|
| Watch Tower | Tool | 100 | 3 | 5 | 1.5 | 3 | 8 | Needs the "Watch Tower" research at the Granary (cost unverified) |
| Sentry Tower | Bronze | 150 | 4 | 6 | 1.5 | 4 | 9 | 120F 50S, 30s |
| Guard Tower | Iron | 200 | 6 | 7 | 1.5 | 4 | 10 | 300F 100S, 75s |
| Ballista Tower | Iron | 200 | 20 | 7 | 3.0 | 4 | 10 | 1800F 750S, 150s, needs Ballistics |

- Towers count as "missile weapons", so Woodworking, Artisanship and Craftsmanship each give them +1 range.
- Alchemy did not raise tower attack in the original; it only changed the visuals.
- Towers can be told to target a specific unit with right-click.
- Town Centers cannot attack or garrison units in the original.
- DE: tower HP raised to 125/185/240/240.

### 1d. Military technologies (RoR manual appendix; fandom research times)

**Storage Pit:**

| Tech | Age | Cost | Time | Effect |
|---|---|---|---|---|
| Toolworking | Tool | 100F | 40s | +2 melee attack |
| Metalworking | Bronze | 200F 120G | 75s | +2 melee attack |
| Metallurgy | Iron | 300F 180G | 100s | +3 melee attack |
| Bronze Shield | Bronze | 150F 180G | 50s | +1 infantry pierce armor |
| Iron Shield | Iron | 200F 320G | 75s | +1 infantry pierce armor |
| Tower Shield (RoR) | Iron | 250F 400G | 100s | +1 infantry pierce armor |
| Leather Armor: Infantry / Archers / Cavalry | Tool | 75F / 100F / 125F | 30s | +2 melee armor |
| Scale Armor (same three lines) | Bronze | +50G each | 60s | +2 melee armor |
| Chain Mail (same three lines) | Iron | +100G each | 75s | +2 melee armor |

**Government Center:**
- Nobility 175F 120G, 70s: +15% HP for cavalry, chariots and horse archers (not elephants).
- Aristocracy 175F 150G, 60s: Academy units +0.25 speed.
- Logistics (RoR) 180F 100G, 60s: Barracks units count as ½ population.
- Alchemy 250F 200G, 100s: +1 missile/siege attack; +2 Ballista/Helepolis in RoR; +6 Fire Galley.
- Ballistics 200F 50G, 60s: ranged units lead moving targets.
- Engineering 200F 100W, 70s: +2 range for siege and siege ships.
- Writing 200F 75G: allies share exploration.

**Market:**
- Woodworking 120F 75W, Artisanship 170F 150W, Craftsmanship 240F 200W: +1 missile range each (and woodcutting bonuses).
- Stone Mining 100F 50S and Siegecraft 190F 100S: Slingers +1 attack and +1 range each; Siegecraft also lets villagers damage walls/towers.
- Wheel 175F 75W: required for chariots.

**Temple:**
- Astrology 150G (RoR manual; fandom says 175)
- Mysticism 120G
- Polytheism 120G
- Fanaticism 150G
- Monotheism 350G
- Afterlife 275G
- Jihad 120G
- Martyrdom (RoR) 600G
- Medicine (RoR) 150G

---

## 2. Combat mechanics

### Damage formula

Sources: https://ageofempires.fandom.com/wiki/Armor_class_(Age_of_Empires) and https://github.com/SFTtech/openage/blob/master/doc/reverse_engineering/game_mechanics/damage.md

- **Against units:** `dmg = max(1, Σ_i max(0, Atk_i − Arm_i))`, summed over armor classes. Class 4 is base melee and class 3 is base pierce.
- **Against buildings:** there is an extra ×0.2 (buildings resist 80% of everything), with a minimum of 0.1: `max(0.1, 0.2 × Σ …)`.
- **Pierce armor is visible in the original UI.** The status box shows HP, attack, armor, piercing armor and range. Missile attacks (Archery Range units, towers, Scout Ship line, Slinger, Ballista, Helepolis) use pierce. The stone throwers and all melee units use melee.

### Hidden bonus classes

Bonuses work by giving the target a **negative** armor value and the attacker 0 in that class.

| Class | Name | Negative armor on | Attacker |
|---|---|---|---|
| 0 | Fire Galley | Fire Galley −5 | Ballista / Helepolis |
| 1 | Towers, walls, archers | Bowman line −2, mounted archers −2 in original (−4 in DE), walls/towers −3 | Slinger |
| 6 | Buildings | Buildings −140, towers −50, Fire Galley −10 | Stone-thrower line and Catapult Trireme line; elephants |
| 7 | Priests | – | Chariots (removed in DE) |
| 8 | Cavalry | Chariots −4; Scout / Cavalry line / Horse Archer line −8 | Camel Rider |
| 9 | Infantry | Clubman line and Swordsman line −5 (original) | Cavalry line (+5) |
| 10 | Towers | Towers | Elephants, Villagers with Siegecraft |
| 17 | Walls | Walls | Villagers with Siegecraft |

Worked results:
- Stone throwers deal effectively **+28 vs buildings and +10 vs towers** after the ×0.2.
- Elephant building bonus in the original: War Elephant +25 vs walls only; Armored Elephant +40 vs buildings (per fandom; the ×0.2 still applies).

### Elevation (conflicting sources, pick one deliberately)
- **Original manual:** hills and cliffs give "a **25 percent chance** that the attacking unit will cause **triple damage** on each hit when the target is at a lower elevation." The expected value is ×1.5.
- **Fandom (DE-era analysis):** deterministic ×1.5 for ranged units firing downhill and ×0.67 for melee units attacking uphill. https://ageofempires.fandom.com/wiki/Elevation
- **openage:** ×1.33 / ×0.66 for AoE1 (unverified).

### Accuracy and projectiles
- All projectiles have 100% accuracy, except the hunter (80%).
- The projectile path is fixed at the moment of release and aimed at the target's current position. Moving targets can dodge: move sideways against arrows, move anywhere against arcing stones.
- **Ballistics** makes shots lead the target.
- RoR gave siege "limited predictive" fire: all slow units are hit, some medium units, all fast units are missed.
- A stray projectile hitting a different unit deals ½ damage (engine-level; unverified for AoE1).
- Source: https://ageofempires.fandom.com/wiki/Accuracy

### Splash damage
- Elephants and the Scythe Chariot: trample at 100% on adjacent units, radius 2 in original data.
- Stone thrower line and Catapult Trireme line: damage tapers with distance and **hits your own units**.
- Radii (Sandyman): Stone Thrower 0.5, Catapult 1.5, Heavy Catapult 1.5, Catapult Trireme 1.0, Juggernaught 1.5.
- Sandyman also implies that elephant and catapult splash can hit allied units.
- DE shrank the trample radius so it no longer hits through walls.

### Stances and orders (original)
- There are **no stances**. The only option is the **Stand Ground** button (unit stays put and fires within range; melee only hits what is adjacent). Since patch 1.0a, Stand Ground stops catapult-line units from firing at all.
- **Attack Ground** exists for catapult-line units and Catapult Triremes/Juggernaughts.
- There is **no attack-move and no patrol** (DE added attack-move and stances).

### Targeting and retaliation
- Military units automatically attack enemies that enter their sight.
- Diplomacy affects auto-attack: at **Neutral**, units attack military units and buildings but not villagers. At **Enemy**, they attack everything, **except Scouts, which never auto-attack**.
- Patch 1.0a: when a unit is attacked, **all own and allied units within 2 tiles respond**, even if the attacker is outside their sight. Villagers that were assigned a task but are idle also react.
- Chase/leash distance: unverified.

### Healing and regeneration
- Units do not regenerate on their own. Only Priests heal.
- Buildings and ships are repaired by villagers.

### Damaged buildings
- Burning/damage graphics exist in the original data. The HP thresholds are unverified (AoE2 uses 75/50/25%).
- Deleting a building under construction refunds 50% of the resources for the unbuilt part.

---

## 3. Priests and conversion

Sources: manual §5; https://ageofempires.fandom.com/wiki/Priest_(Age_of_Empires); Heaven thread https://aoe.heavengames.com/cgi-bin/aoecgi/display.cgi?action=st&fn=1&tn=5368; DE change summary https://ageofempires.fandom.com/wiki/Summary_of_changes_in_Age_of_Empires:_Definitive_Edition

**Conversion probability:**
- Each chant has a **30% chance** to convert (39% with Astrology).
- Resistance divides that chance:
  - Ships: 2× harder → 15% / 19.5%.
  - Chariots and Chariot Archers: **8×** harder in the original (DE changed this to 2×).
  - Macedonian units: 4× harder.
- Implied average number of chants: about 3.3 for a normal unit, 6.7 for a ship, 27 for a chariot.
- One chant ≈ 1.5s and "minimum 3 chants" are DE-era figures (unverified for 1.0c).
- A conversion either happens or it doesn't. There is no partial progress and no conversion indicator.

**Range and rejuvenation:**
- Conversion range is 10; Afterlife adds +3 range and LOS.
- After a conversion the priest must recharge ("rejuvenate") to 100%, which takes 50s (2%/s). Fanaticism makes it 50% faster (33s). Babylonians get +30%.
- The rejuvenation percentage is shown in the status box.

**What can be converted:**
- Every enemy unit except Priests, **including siege**.
- **Monotheism** adds Priests and buildings, except Town Center and Wonder. The priest must stand **adjacent** to the building.
- A converted building you haven't built yourself can't be used until you build one.
- Converting a loaded transport converts the ship but not its cargo.
- Converted units keep their stats. Your future techs don't apply to them, except Monotheism, Astrology, Fanaticism, Ballistics and Siegecraft.
- Conversions ignore the population cap.

**Behaviour:**
- Priests don't auto-convert unless they are attacked. After a conversion the priest goes idle.
- **Martyrdom (RoR):** start converting, then press DELETE. The priest dies and the unit converts instantly (priests can't be targeted).

**Temple techs:**
- Astrology: +30% conversion and healing.
- Mysticism: doubles priest HP.
- Polytheism: +40% speed.

**Healing:**
- The priest must be adjacent (DE: +1 range).
- 3 HP/s. Medicine (RoR) gives ×3 (DE: ×2).
- Once ordered to heal, a priest keeps auto-healing nearby units, with no recharge time.
- Cannot heal buildings or boats. Can heal siege.

**Counters:** there is no tech that protects against conversion. The only answers are fleeing, killing the priest, or deleting your own unit.

---

## 4. Movement and pathing

- **No formations** in the original. Per the manual, "units near each other move in formation unless ordered to move to or attack an object, in which case they converge."
- Patch 1.0b: grouped units no longer stop when they bump into each other, and groups get through narrow passages better.
- **Pathing option** (1.0a): a setting for how many route possibilities units compute on long moves (reportedly 3 levels).
- Pathfinding was widely considered poor: units get stuck on other units and bunch up around rivers. Units do not push each other (unverified).
- **Waypoints:** Shift+right-click to lay a path, then release Shift and right-click the last point.
- Collision radii ("Size Radius 1/2" data fields) exist, but I could not find the AoE1 values (unverified).
- Ships use water tiles; transports unload onto shore or shallows.
- Terrain types (IDs from scenario data): grass, water, beach, shallows, jungle edge, desert, forest, dirt, desert palm, forest edge, pine forest, jungle, pine edge, deep water, plus several hidden impassable types. Forest, water and cliffs are impassable to land units. Source: https://aoe.heavengames.com/siegeworkshop/editing-scenario-data/2/

---

## 5. UI and controls

Sources: manual chapter 1; https://ageofempires.fandom.com/wiki/User_interface; https://aoe.heavengames.com/theacademy/hotkeysandcommands/hotkeys/

**Screen:**
- Resolutions 640×480, 800×600 (default) and 1024×768. The UI was designed at 640×480.

**Top bar:**
- Left: stockpile counters for Wood, Food, Gold, Stone.
- Center: current Age name.
- Right: Chat (multiplayer only), Diplomacy, Menu buttons.
- Messages appear at upper-left. Wonder, Ruins and Artifact countdowns appear at upper-right in the owner's color.
- There is **no always-on population counter**. RoR's F11 shows population/limit plus time and game speed.

**Bottom panel:**
- **Status box (lower-left):** shows **one** selected object at a time (name, HP cur/max, attack, armor, pierce armor, range, priest rejuvenation, resource amounts). **TAB / Shift+TAB cycle** through a multi-selection; there is no grid of unit portraits.
- **Command buttons (center):** 10 slots per page per the data format (arrangement unverified). A "Next" arrow shows more buildings.
- **Right side:** "?" popup-help button, and the **diamond-shaped minimap**. An "S" button above the minimap (or F4) toggles the score list.
- Minimap: click or drag the white view box.
- Commands available: Stop (appears only while moving), Stand Ground, Attack Ground, Group/Ungroup, Unload, Heal/Convert, Build/Repair.

**Selection:**
- Drag a box, up to **25 units**.
- Add units with Ctrl+click (manual) or Shift+click (Heaven).
- **Double-click selects all of that type on screen: RoR only.**
- Control groups: Ctrl+1–9 to assign, 1–9 to select, Alt+# to select and center, Shift+# to add.

**Queues and rally points:**
- **Original: no training queue.**
- **RoR:** queue one unit type per building. Cost is paid when you queue. Right-click the button to remove one; Stop clears the queue. If the building dies, the resources for queued units are refunded (not the unit in production).
- **No rally/gather points** (DE added them).
- **No research queue.**

**Hotkeys:**
- Space: go to selected unit.
- H: Town Center.
- Ctrl+A / B / D / K / L / P / Y: cycle Archery Range / Barracks / Dock / Siege Workshop / Stable / Temple / Academy.
- Build: B then a letter. B=Barracks, E=House, G=Granary, S=Storage Pit, D=Dock, A=Archery Range, L=Stable, F=Farm, T=Tower, W=Wall, M=Market, C=Government Center, P=Temple, N=Town Center, K=Siege Workshop, Y=Academy, O=Wonder. Shift-click places several.
- Train examples: TC: C = Villager. Barracks: T = Clubman/Axeman, L = Slinger, Z = Swordsmen (RoR). Archery Range: T / A / R / C / E. Stable: T=Scout, R=Chariot, C=Cavalry, L=Camel, E=Elephant. Temple and Academy: T. Siege Workshop: C = catapults, B = ballistae. Dock: F / R / T / E / G.
- Other keys:

  | Key | Action |
  |---|---|
  | R | Repair |
  | L | Unload transport |
  | Delete | Delete unit/building |
  | Esc | Deselect / cancel |
  | Enter | Chat (taunts 1–25) |
  | + / − | Game speed |
  | F1 | Help |
  | F3 or Pause | Pause |
  | F4 | Scores |
  | F10 | Menu |
  | F11 | Time / speed (RoR adds population) |
  | Ctrl+F12 | Screenshot |
  | Home or middle mouse (RoR) | Jump to last sound cue; repeat to cycle the last 5 |
  | **. (RoR 1.0a)** | Cycle idle villagers / fishing boats |

**Game speeds:** 1.0 (Normal), 1.5 (Fast), 2.0 (Very Fast). 2000 game-years ≈ 1000 seconds at speed 1.0.

**Menus and settings:**
- Save/Load, Achievements (score details), Scenario Instructions, Resign, Quit.
- One-button vs two-button mouse; roll-over help.

**Diplomacy dialog:**
- Per player: Ally / Neutral / Enemy, plus an Allied Victory checkbox.
- Tribute needs a Market and has a 30% tax until Coinage.

**Population:**
- Houses and the Town Center give 4 each; cap 50.
- 1.0a / RoR: multiplayer host can set 25–200.

---

## 6. Feedback and feel

**Player colors** (original, hex from fandom https://ageofempires.fandom.com/wiki/Player):

| # | Color | Hex |
|---|---|---|
| 1 | Blue | #3F5F9F |
| 2 | Red | #CF0A00 |
| 3 | Gold/Yellow | #C3A31B |
| 4 | Brown | #8B5B37 |
| 5 | Orange | #F06C07 |
| 6 | Olive Green | #637B2F |
| 7 | Silver/Grey | #8F8F8F |
| 8 | Teal | #00AB93 |

Gaia is also teal.

**Fog of war:**
- Unexplored areas are **black**.
- Explored areas outside current sight are **dimmed**.
- Enemy buildings and walls stay visible as last seen; damage, age upgrades and destruction don't update until you see them again.
- Enemy units are only visible inside your LOS or when they attack you.
- Allies share LOS only after **Writing**. In RoR, allied Town Centers are shown at start and fog edges are smoothed instead of jagged.

**Health bars:** a bar above a selected unit, green when healthy and red when wounded. The exact look of the selection outline is unverified; OpenAOE draws it as an isometric box around the unit's footprint.

**Sound:**
- Priest chant "wololo / ay-yo". A shortened chant plays when one of your units is converted off-screen.
- Unit voices are made-up words (some are names spelled backwards).
- There is an attack warning sound.
- Chat taunts 1–25.
- Music was CD audio (a MIDI option exists).

**Notifications:**
- All players are told when a Wonder is started, and its location flashes on the minimap.
- When the Wonder is completed, a countdown clock appears.
- Ruins and Artifacts, once all held by one player/team, start a 2000-year countdown. Sources disagree on how long that is in real time (fandom says about 5 minutes; unverified).

**Score:** Military, Economy, Religion (2 points per conversion, +25 for most conversions), Technology, Other. https://ageofempires.fandom.com/wiki/Score

**Corpses and rubble:** decay timers are unverified.

---

## 7. AI (original computer players)

Sources: https://ageofempires.fandom.com/wiki/Artificial_intelligence; Sandyman https://aoe.heavengames.com/cgi-bin/aoecgi/display.cgi?action=st&fn=1&tn=77; https://aoe.heavengames.com/cgi-bin/aoecgi/display.cgi?action=st&fn=1&tn=1096

**Difficulty levels:**
- The manual says levels range "from easy to hardest". Easiest / Easy / Moderate / Hard / Hardest is likely, but unverified.
- Moderate is much more aggressive than Easy.
- Per Sandyman, the only cheats are **extra resources on Hardest** and better unit micromanagement. The amount is commonly reported as about +2000 of each resource (unverified).
- Hardest reaches Bronze Age in about 7–8 minutes, attacks with 5–10 units, and fades out around mid-Bronze when its gold runs low.

**Diplomacy toward you:**
- Computer players start allied with each other.

  | Number of computer players | How many turn hostile |
  |---|---|
  | 2 | both |
  | 3 | 2 |
  | 4–5 | 3 |
  | 6–7 | 4 |

- The neutral ones turn hostile if you attack them twice, or after 10–15 minutes unless you tribute about 1000 (fandom says 2600+).

**Habits you can reproduce or exploit:**
- Almost never builds walls. Scouts with villagers indefinitely. Caps at about 30 villagers.
- Builds in a ring around its Town Center.
- Keeps repairing buildings no matter the danger.
- **Destroying a foundation stops it from ever building that building type again.**
- Never stops attacking a target unless threatened.
- Targets the **lowest-HP** unit. Its priests go for clubmen before elephants.
- Switches onto a damaged tower that is shooting at it.
- Throws every villager at a tower built near its Town Center.
- Its melee units try to fight ships sitting in shallows.
- In RoR it favours Slingers.
- Its archers micro-kite well.

**Scripting (for inspiration):**
- The `.ai` file is an ordered build list with prefixes: B (building, rebuilt if destroyed), A (building, limited rebuilds), R (research, skippable), C (critical research, blocks until done), U (unit, always replaced), T (unit, limited retrains).
- The `.per` file holds "strategic numbers", e.g. `170 SNMinimumFood`, `49 SNRetreatAfterTargetDestroyed`, `103 SNAttackIntelligence`, `47 SNAttackCoordination`, `30/31/91` retreat thresholds, `180/205–210/223` auto-build.
- `.cty` files handle wall and tower layouts.
- Source: https://aoe.heavengames.com/siegeworkshop/per/

---

## 8. Engine and graphics

**Tiles:**
- Isometric 2:1 **64×32 px** diamonds. This comes from OpenAOE, which reads AoE1's own data file and projects with half-tile 32/16 px: https://github.com/angered-ghandi/OpenAOE/blob/master/src/ecs/resource/view_projector.rs
- AoE2 tiles are 97×49 by comparison.
- **8 elevation levels (0–7)**. Each level appears to raise terrain about 16 px (derived from OpenAOE's projection).

**Map sizes:**
- Medium 120×120, Large 144, Huge 200, RoR Gigantic 250. Small is unverified.
- The editor hard limit is 255×255.
- Source: https://aoe.heavengames.com/cgi-bin/aoecgi/display.cgi?action=st&fn=1&tn=6332

**Sprites:**
- 8 facings, drawn from 5 stored directions with the other 3 mirrored (standard for the engine). About 10 frames per direction is typical (unverified).
- Most sprites are 20–100 px tall.
- Made from 3D Studio / 3DS MAX models (a few thousand to 100k polygons), rendered to FLC animation files, then cleaned up frame by frame in Photoshop.
- A fixed **256-color palette, 236 of which are usable**. Player colors are remapped palette ramps (index 0 = brightest to 9 = darkest).
- Each frame also has a white player-colored silhouette, likely used to draw units hidden behind buildings (unverified).
- Shadows use a lookup table rather than alpha blending.
- Source: https://www.gamedeveloper.com/game-platforms/the-game-developer-archives-postmortem-ensemble-s-age-of-empires-

**Data and files:**
- Game data lives in `empires.dat`, built from 40+ database tables.
- Graphics and sounds are packed in `graphics.drs` (about 810 sprite files across AoE+RoR), `terrain.drs`, `interfac.drs`, `sounds.drs`, `border.drs`.

**Multiplayer:** every machine runs the same deterministic simulation and only commands are exchanged (lockstep, DirectPlay), with up to 8 players.

---

## 9. Where the Definitive Edition differs

If you want 1.0c behaviour, don't copy these:
- Unit speeds were reduced by about 17% in the later Return of Rome port (e.g. infantry 1.2 → 1.0).
- Chariots lost their bonus vs Priests, and their conversion resistance dropped from 8× to 2×.
- Medicine: ×2 instead of ×3.
- Cataphract 240 HP, 5/3 armor. Legion 140 HP. Long Swordsman 100 HP.
- Horse Archers 1 pierce armor.
- Scout costs 90F.
- Helepolis slower (1.85s) with 45 attack.
- Catapult Trireme 135 HP and 50 gold.
- Trample radius reduced.
- Tower HP increased.
- Added: gather points, attack-move, stances, idle-military buttons, multi-building queues.

Source: https://ageofempires.fandom.com/wiki/Summary_of_changes_in_Age_of_Empires:_Definitive_Edition

## 10. Still unverified

- Collision radii and chase distance.
- Exact frame counts per animation.
- Command button grid layout and panel pixel sizes.
- Small map size.
- Watch Tower research cost.
- Hardest-level resource bonus amount.
- Building damage-fire thresholds and corpse/rubble decay times.
- Priest LOS: 12 or 15.
- Elephant Archer attack (5 or 6) and LOS (8 or 9).
- Which elevation rule to use (§2).
