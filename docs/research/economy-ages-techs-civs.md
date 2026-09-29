# Research: AoE1 + Rise of Rome — economy, ages, buildings, techs, civs, maps

> Research report produced 2026-09-29 during planning. Numbers are facts about the original game rules, used for
> fidelity; no original game files or assets are stored in this repo. Tags: [DAT]/[EXE]/[MAN]/[FAN]/[HG]/[DAO].

I've finished the research. Nearly every number below comes from the game's own data rather than from wikis. I parsed the Rise of Rome 1.0 `empires.dat` (Gold Edition) and read the relevant code in `EMPIRESX.EXE`, both from the daominah repo, then checked them against the 1997 manual, AoE Heaven and the fandom wiki.

**Tags used below:**
- **[DAT]** read directly from RoR 1.0 `empires.dat`. I parsed it in memory with the genieutils field layout. The parse used up the file exactly: 17 civs, 127 techs, 218 effects, 10 random-map scripts.
- **[EXE]** read by disassembling `EMPIRESX.EXE` (RoR 1.0).
- **[MAN]** the 1997 manual (archive.org OCR).
- **[FAN]** ageofempires.fandom.com. It mostly describes current DE/Return of Rome and gives "before DE" values as tooltips.
- **[HG]** AoE Heaven.
- **[DAO]** daominah's in-game tests of RoR 1.0.
- **(unverified)** I could not confirm it from a reliable source.

**Patch notes.** RoR 1.0a (released alongside AoE 1.0c) changed only three things that matter here:
- Shang villagers went from 35 to **40 food**, and Shang start with **−40 food**.
- The Phoenician woodcutter bonus dropped to **+15% work rate / +2 carry** (from +36% / +3).
- The farm "S" refill bug was fixed.

Everything else below is RoR 1.0 = 1.0a.

**Units and time.** Distances are in tiles. Times are game-seconds at speed 1.0. Rates are resource per second.

---

## 1. Economy

### 1.1 Resource objects [DAT]

| Object | Amount | HP | Other data | DE change [FAN] |
|---|---|---|---|---|
| Berry bush (Forage) | 150 food | – | stationary | same |
| Gazelle | 150 food | 8 | speed 1.1, flees, carcass decays 0.3 food/s (fandom says 0.25) | – |
| Elephant | 300 food | 45 | melee attack 10, speed 1.0, decays 0.2/s, fights back | Return of Rome: decays 0.4/s |
| Lion | 100 food | 20 | attack 2 (reload 1.0), speed 1.1, aggressive, decays 1.0/s | – |
| Alligator | 100 food | 20 | ranged spit attack 4, speed 0.5, found on shallows/beach, decays 1.0/s | – |
| Shore fish (2 kinds) | 250 food | – | 1 tile, villagers can fish it | Return of Rome: 200 |
| Deep fish (tuna/salmon) | 250 food | – | 2×2, boats only | – |
| Whale | 250 food | – | boats only | DE: 300; removed in Return of Rome |
| Scattered tree | 75 wood | 25 | – | – |
| Forest tree | 40 wood | 25 | spawned automatically on forest terrain | – |
| Gold mine | 400 gold per 1-tile node | – | random maps place them in clusters of 6–9 nodes | DE 450, Return of Rome 500 |
| Stone mine | 250 stone per node | – | clusters of 7 | DE 300, Return of Rome 350 |
| Farm | 250 food | 50 | see 1.4 | DE upgrades give 550 max |

Horses exist on the map but give no food.

### 1.2 Villagers [DAT]

- Cost 50 food, 20 s at the Town Center.
- 25 HP, LOS 4, melee attack 3 (reload 1.5).
- Speed **1.1**. The Wheel adds **+0.7**, giving 1.8.
- Carry capacity **10** for every gathering job.
- The engine switches the villager to a different unit per job. Each job has its own work rate and drop sites:

| Job | Rate/s | Drop sites | Upgrades (all additive to the rate) |
|---|---|---|---|
| Forager (berries) | 0.45 | TC, Granary | – |
| Farmer | 0.45 | TC, Granary | Farm food amount only |
| Hunter | 0.45 (attack 4, range 4) | TC, **Storage Pit** | – (DE: 0.4725) |
| Fisherman (shore fish) | **0.60** (fastest food) | TC, **Storage Pit** | Return of Rome also allows the Dock |
| Woodcutter | 0.55 | TC, Storage Pit | +0.2 and +2 carry each for Woodworking, Artisanship, Craftsmanship → 1.15 |
| Gold miner | 0.45 | TC, Storage Pit | Gold Mining +0.3 and +3 carry; Coinage then makes each unit mined yield ×1.25 → effective 0.9375 |
| Stone miner | 0.45 | TC, Storage Pit | +0.3 and +3 carry each for Stone Mining and Siegecraft → 1.05 |
| Builder | 1.0 (×1.5 with Architecture) | – | – |
| Repairer | 0.4 | – | – |

- A villager loses whatever it is carrying the moment you give it a different resource job. DE keeps food when switching between food types [FAN].
- Boats: see 1.3.
- The manual confirms the drop-off rules. Hunting meat and villager-caught fish go to the Storage Pit, not the Granary [MAN].
- To keep the TC training non-stop you need 50 food per 20 s = 2.5 food/s, which is about 6 foragers or 7 fishing boats [FAN].

**How many builders it takes:** the dat gives build times for one builder. I don't know the formula for multiple builders (unverified).

### 1.3 Boats and trade [DAT]

| Unit | Cost | Train time | HP | Speed | Rate | Carry |
|---|---|---|---|---|---|---|
| Fishing Boat | 50 W | 40 s | 45 | 1.4 | 0.4/s | 15 |
| Fishing Ship (upgrade) | – | – | 75 | 2.0 | 0.4/s | 20 |
| Trade Boat (Stone Age) | 100 W | 50 s | 200 | 2.0 | – | 20 |
| Merchant Ship (upgrade) | – | – | 250 | 2.5 | – | 20 |

- Boats drop off only at the Dock.
- Search radius for boats is 8.
- The exact trade payout formula is unverified.
- The Dock works faster than other buildings: ×1.5 in the Stone/Tool Age and ×2.0 from the Bronze Age (Dock unit 45 becomes Dock 133 on Bronze). Fandom says this speeds up training and research at the Dock.

### 1.4 Farms [DAT]

- Cost 75 W, build time 30 s, 50 HP, 3×3 tiles, LOS 4.
- **You need a Market to build farms.** The auto-tech triggered by finishing a Market is what enables the Farm.
- Food: 250 base.
  - +75 each for Domestication, Plow and Irrigation → **475**.
  - Sumerian +250 (so 500 base). Minoan +60.
  - DE: +75 / +100 / +125 → 550; Sumerian +125; Minoan bonus removed.
- A farm runs out and has to be rebuilt; there is no reseeding.
- One farmer per farm (community knowledge, unverified).
- RoR 1.0 bug: selecting a farmer and a farm together and pressing S refills the farm. Fixed in 1.0a [FAN].
- DE: build time 24 s, and farms can be walked over.

### 1.5 Starting conditions

Starting resources by setting, read from the exe's switch statement [EXE]:

| Setting | Food | Wood | Stone | Gold |
|---|---|---|---|---|
| Default (random-map default; the manual calls it "the lowest level") | 200 | 200 | 150 | 0 |
| Low | 200 | 200 | 100 | 0 |
| Medium | 500 | 500 | 250 | 0 |
| High | 1000 | 1000 | 750 | 0 |
| Death Match | 20000 | 20000 | 5000 | 10000 |

- The Default row is the civ values stored in the dat.
- I mapped switch indices 0/1/2/3 to Default/Low/Medium/High by the order the menu presents them. That mapping is my inference.
- The 1997 manual says Death Match gives 20,000 **stone**. That is probably original-AoE behaviour; RoR gives 5,000.

Starting units [DAT]:
- Every player gets 1 Town Center and **3 villagers** placed 2–4 tiles from it. **No scout.**
- DE also starts with 3 villagers and no scout.
- Nomad: no Town Center. Fandom says you get 1 villager (unverified).

Civ start modifiers:
- Shang (1.0a): −40 food.
- Palmyran villagers cost 75 food.
- DE: Carthaginian +50 of each resource; Palmyran +75 food.

Tribute [DAT]: you need a Market. There is a **25% fee** (to give 100 you pay 125). Coinage, or the Palmyran bonus, removes the fee.

---

## 2. Population

- **House +4, Town Center +4** [DAT][MAN].
- Cap **50** in the original game [MAN]. From patch 1.0a and in RoR, the multiplayer host can set **25–200** [FAN]. The exe stores the cap in player resource 32 [EXE].
- DE: 25–250. Return of Rome: up to 500.
- RoR added unit queueing.
- Converting units and training in several buildings at once can push you over the cap [FAN].

---

## 3. Ages [DAT][MAN]

| Age | Cost | Research time | Prerequisite |
|---|---|---|---|
| Tool | 500 F | 120 s | Any 2 of: Granary, Storage Pit, Dock, Barracks (houses don't count) |
| Bronze | 800 F | 140 s | Any 2 of: Market, Archery Range, Stable |
| Iron | 1000 F + 800 G | 160 s | Any 2 of: Temple, Government Center, Siege Workshop, Academy |

Each age up also gives the Scout +2 LOS [DAT].

What unlocks in each age [DAT]:

**Stone Age**
- Buildings: Town Center, House, Granary, Storage Pit, Dock, Barracks.
- Units: Villager, Clubman, Fishing Boat, Trade Boat.

**Tool Age**
- Buildings: Market (needs Granary), Archery Range and Stable (need Barracks), Farm (needs Market).
- Units: Bowman, Scout, Slinger, Scout Ship, Light Transport.
- Techs: Small Wall, Watch Tower, Battle Axe, Toolworking, the three Leather Armors, Woodworking, Gold Mining, Stone Mining, Domestication.

**Bronze Age**
- Buildings: Government Center and Temple (need Market), Siege Workshop (needs Archery Range), Academy (needs Stable). **Extra Town Centers need a Government Center.** You can only rebuild a lost single TC before that.
- Units:
  - Priest, Stone Thrower, Hoplite.
  - Short Swordsman (needs Battle Axe plus the Short Sword research).
  - Chariot and Chariot Archer (need Wheel).
  - Cavalry, Camel.
  - Improved Bowman, then Composite Bowman.
  - Fishing Ship, War Galley, Merchant Ship.

**Iron Age**
- Buildings: Wonder.
- Units:
  - War Elephant, Horse Archer, Elephant Archer, Ballista.
  - Trireme, Heavy Transport.
  - Catapult Trireme (needs Trireme).
  - Fire Galley (needs War Galley; there is no research cost).
  - All the top-tier upgrades.

---

## 4. Buildings [DAT]

- Footprint = 2 × the collision half-size.
- No building can garrison in the original. Garrisoning arrived with Return of Rome.
- Melee armor is 0 on everything. Pierce armor is 0 except on walls and towers.

| Building | Cost | HP | Build time | LOS | Size | Trains / researches | Age |
|---|---|---|---|---|---|---|---|
| Town Center | 200 W | 600 | 60 | 7 | 3×3 | Villager, age advances. Accepts all resources. +4 pop. **Cannot attack.** | Stone (more need Gov Center) |
| House | 30 W | 75 | 20 | 3 | 2×2 | +4 pop | Stone |
| Granary | 120 W | 350 | 30 | 5 | 3×3 | Drop site for berries and farm food; wall/tower research | Stone |
| Storage Pit | 120 W | 350 | 30 | 4 | 3×3 | Drop site for wood, stone, gold, hunted meat, shore fish; armor/attack research | Stone |
| Dock | 100 W | 350 | 50 | 5 | 3×3 | Boats. Work rate ×1.5, ×2.0 from Bronze | Stone |
| Barracks | 125 W | 350 | 30 | 5 | 3×3 | Clubman/Axeman, Slinger, sword line | Stone |
| Market | 150 W | 350 | 40 | 5 | 3×3 | Economy techs, Wheel, tribute; unlocks Farm | Tool |
| Archery Range | 150 W | 350 | 40 | 4 | 3×3 | Archers | Tool |
| Stable | 150 W | 350 | 40 | 4 | 3×3 | Mounted units | Tool |
| Farm | 75 W | 50 | 30 | 4 | 3×3 | – | Tool |
| Government Center | 175 W | 350 | 60 | 6 | 3×3 | Techs; enables extra TCs | Bronze |
| Temple | 200 W | 350 | 60 | 4 | 3×3 | Priest and temple techs | Bronze |
| Siege Workshop | 200 W | 350 | 60 | 5 | 3×3 | Siege units | Bronze |
| Academy | 200 W (DE 150) | 350 | 60 | 6 | 3×3 | Hoplite line | Bronze |
| Wonder | 1000 W / 1000 S / 1000 G | 500 | **8000** | 4 | 5×5 | Standard-victory countdown | Iron |

- Wonder build time is 8000 s in RoR 1.0 and 3500 s in Return of Rome [FAN].
- A few LOS values in DE differ from the dat (House 2, Granary 4, Farm 3, Government Center 5).

**Walls** (each 1×1 segment costs 5 stone and takes 7 s; LOS 3):
- Small Wall: 200 HP, pierce armor 3.
- Medium Wall: 300 HP, pierce armor 4.
- Fortification: 400 HP, pierce armor 4 (DE 5).

**Towers** (2×2, 150 stone each, 80 s build; DE 72 s, later 65 s; reload 1.5 unless stated):

| Tower | HP | Pierce attack | Range | LOS | Pierce armor |
|---|---|---|---|---|---|
| Watch | 100 | 3 | 5 | 8 | 3 |
| Sentry | 150 | 4 | 6 | 9 | 4 |
| Guard | 200 | 6 | 7 | 10 | 4 |
| Ballista | 200 | 20 | 7 | 10 | 4 (reload 3.0) |

DE tower HP: 125 / 185 / 240 / 240. Return of Rome raises attack and range.

**Hidden armor classes [DAT]:**
- Ordinary buildings have class-6 armor −140; towers have −50.
  - Stone-thrower line: class-6 attack 0 → bonus vs buildings.
  - Catapult Trireme / Juggernaught: class-6 attack 35.
  - Armored Elephant: class-6 attack −100 → +40 vs buildings.
- Walls have class-10 armor −80 and towers −40.
  - Villagers start with class-10 attack −150, so they can't hurt walls or towers. Siegecraft adds +150.
- Walls and towers also have class-1 armor −7. The slinger's class-1 attack of 0 gives it a bonus there.

**How building damage works (DE-era analysis, unverified for 1.0):** fandom says buildings take only **1/5** of the summed damage, with a minimum of 0.1. Units take max(1, Σ max(0, attack−armor)).

---

## 5. Technologies [DAT]

Unless noted:
- Each tech needs its building plus the listed age.
- "req" means an extra prerequisite tech.
- DE notes come from [FAN] and [DAO].

**Granary**

| Tech | Age | Cost | Time | Effect |
|---|---|---|---|---|
| Small Wall | Tool | 50 F | 10 | enables walls |
| Watch Tower | Tool | 50 F | 10 | enables towers |
| Medium Wall | Bronze | 180 F, 100 S | 60 | walls upgrade (req Small Wall) |
| Sentry Tower | Bronze | 120 F, 50 S | 30 | towers upgrade |
| Fortification | Iron | 300 F, 175 S | 75 | walls upgrade (req Medium Wall) |
| Guard Tower | Iron | 300 F, 100 S | 75 | towers upgrade (req Sentry) |
| Ballista Tower | Iron | 1800 F, 750 S | 150 | towers upgrade (req Guard Tower **and Ballistics**) |

**Storage Pit** (armor techs chain Leather → Scale → Chain, one line per unit group)

| Tech | Age | Cost | Time | Effect |
|---|---|---|---|---|
| Toolworking | Tool | 100 F | 40 | +2 melee attack for infantry, hoplites, cavalry class (scout/cav/camel), chariots. **War elephants get +0.** |
| Metalworking | Bronze | 200 F, 120 G | 75 | +2, same units |
| Metallurgy | Iron | 300 F, 180 G | 100 | +3, same units |
| Leather Armor – Soldiers | Tool | 75 F | 30 | +2 melee armor, infantry and hoplites |
| Leather Armor – Archers | Tool | 100 F | 30 | +2 melee armor: bowman line, chariot/horse/elephant archers |
| Leather Armor – Cavalry | Tool | 125 F | 30 | +2 melee armor: cavalry class, chariots, war elephants |
| Scale Armor (S / A / C) | Bronze | 100 F+50 G / 125 F+50 G / 150 F+50 G | 60 | +2 each |
| Chain Mail (S / A / C) | Iron | 125 F+100 G / 150 F+100 G / 175 F+100 G | 75 | +2 each |
| Bronze Shield | Bronze | 150 F, 180 G | 50 | +1 pierce armor for infantry, hoplites, slingers |
| Iron Shield | Iron | 200 F, 320 G | 75 | +1 more |
| Tower Shield (RoR) | Iron | 250 F, 400 G | 100 | +1 more |

**Market**

| Tech | Age | Cost | Time | Effect |
|---|---|---|---|---|
| Woodworking | Tool | 120 F, 75 W | 60 | Woodcutters +0.2 rate and +2 carry. +1 range and +1 LOS for archers, towers, and the scout ship / war galley / trireme line. DE: +20%, multiplicative. |
| Artisanship | Bronze | 170 F, 150 W | 80 | same (req Woodworking) |
| Craftsmanship | Iron | 240 F, 200 W | 100 | same (req Artisanship) |
| Gold Mining | Tool | 120 F, 100 W | 50 | Gold miners +0.3 rate, +3 carry |
| Coinage | Iron | 200 F, 100 G | 60 | Gold yield ×1.25, tribute fee removed (req Gold Mining) |
| Stone Mining | Tool | 100 F, 50 S | 30 | Stone miners +0.3, +3 carry. Slingers +1 attack, +1 range, +1 LOS. |
| Siegecraft | Iron | 190 F, 100 S | 60 | Same as Stone Mining, plus villagers can damage walls and towers (req Stone Mining) |
| Domestication | Tool | 200 F, 50 W (DE 150 F) | 40 | Farms +75 |
| Plow | Bronze | 250 F, 75 W | 75 | Farms +75 (DE +100) |
| Irrigation | Iron | 300 F, 100 W | 100 | Farms +75 (DE +125) |
| Wheel | Bronze | 175 F, 75 W | 75 | Villager speed +0.7. Required for Chariot and Chariot Archer. DE: 90 s. |

Note: the Wheel is researched at the **Market** in the original, not the Town Center.

**Temple**

| Tech | Age | Cost | Time | Effect |
|---|---|---|---|---|
| Astrology | Bronze | 150 G | 50 | Priest work rate +0.3 (conversion/heal +30%). Fandom now lists 175 G. |
| Mysticism | Bronze | 120 G | 50 | Priest HP ×2 |
| Polytheism | Bronze | 120 G | 50 | Priest speed ×1.4 |
| Afterlife | Iron | 275 G | 75 | Priest range and LOS +3 |
| Monotheism | Iron | 350 G | 75 | Priests can convert priests and buildings |
| Fanaticism | Iron | 150 G | 60 | Faith regen 2.0 → 3.5 per second (full recharge 50 s → about 29 s) |
| Jihad | Iron | 120 G | 60 | Villagers +7 attack, +40 HP, +0.3 speed, −8 carry. Renamed Zealotry in DE. |
| Medicine (RoR) | Iron | 150 G | 50 | Healing ×3 (DE ×2) |
| Martyrdom (RoR) | Iron | 600 G | 100 | Sacrifice a priest to convert instantly (DE 400 G) |

**Government Center**

| Tech | Age | Cost | Time | Effect |
|---|---|---|---|---|
| Nobility | Bronze | 175 F, 120 G | 70 | +15% HP for cavalry, chariots, horse archers, chariot archers |
| Writing | Bronze | 200 F, 75 G | 60 (DE 30) | Shared exploration with allies |
| Architecture | Bronze | 150 F, 175 W | 50 | Builders ×1.5; buildings and walls +20% HP |
| Logistics (RoR) | Bronze | 180 F, 100 G | 60 | Infantry and slingers count as ½ pop |
| Aristocracy | Iron | 175 F, 150 G | 60 | Hoplite line +0.25 speed |
| Ballistics | Iron | 200 F, 50 G | 60 | Projectiles lead moving targets |
| Alchemy | Iron | 250 F, 200 G | 100 | +1 attack for every missile unit, tower and siege weapon; flaming projectiles; Fire Galley +6 |
| Engineering | Iron | 200 F, 100 W | 70 | Siege units, Catapult Trireme and Juggernaught +2 range and LOS |

**Unit upgrade techs**

| Building | Tech | Age | Cost | Time | Extra prerequisite | DE |
|---|---|---|---|---|---|---|
| Barracks | Battle Axe | Tool | 100 F | 40 | – | same |
| Barracks | Short Sword (enables the unit) | Bronze | 120 F, 50 G | 50 | Battle Axe | free and automatic |
| Barracks | Broad Sword | Bronze | 140 F, 50 G | 80 | – | 90 s |
| Barracks | Long Sword | Iron | 160 F, 50 G | 90 | – | 240 F, 100 G |
| Barracks | Legion | Iron | 1400 F, 600 G | 150 | **Fanaticism** | same |
| Archery Range | Improved Bow (a separate unit) | Bronze | 140 F, 80 W | 60 | – | 45 s |
| Archery Range | Composite Bow | Bronze | 180 F, 100 W | 100 | – | same |
| Archery Range | Heavy Horse Archer | Iron | 1750 F, 800 G | 150 | Chain Mail Archers | same |
| Stable | Heavy Cavalry | Iron | 350 F, 125 G | 90 | – | same |
| Stable | Cataphract | Iron | 2000 F, 850 G | 150 | Metallurgy | 1600 F, 600 G |
| Stable | Armored Elephant | Iron | 1000 F, 1200 G | 150 | Iron Shield | same |
| Stable | Scythe Chariot | Iron | 1200 W, 800 G | 150 | Nobility | 1400 W, 1000 G |
| Siege Workshop | Catapult | Iron | 300 F, 250 W | 100 | – | same |
| Siege Workshop | Heavy Catapult | Iron | 1800 F, 900 W | 150 | Siegecraft | same |
| Siege Workshop | Helepolis | Iron | 1500 F, 1000 W | 150 | Craftsmanship | 1200 F, 1000 W |
| Academy | Phalanx | Iron | 300 F, 100 G | 90 | – | same |
| Academy | Centurion | Iron | 1800 F, 700 G | 150 | Aristocracy | fandom now lists 1000 F, 75 s |
| Dock | Fishing Ship | Bronze | 50 F, 100 W | 30 | – | – |
| Dock | War Galley | Bronze | 150 F, 75 W | 75 | – | – |
| Dock | Merchant Ship | Bronze | 200 F, 75 W | 60 | – | – |
| Dock | Trireme | Iron | 250 F, 100 W | 100 | – | – |
| Dock | Heavy Transport | Iron | 150 F, 125 W | 75 | – | – |
| Dock | Catapult Trireme | Iron | 300 F, 100 W | 100 | Trireme | – |
| Dock | Juggernaught | Iron | 2000 F, 900 W | 180 | Engineering | 1300 F, 500 W |

City Watch, Conscription, Urbanization and Theocracy do not exist before DE / Return of Rome.

---

## 6. Civilizations

### 6.1 Bonuses and architecture [DAT, with measured percentages from DAO]

In the dat, architecture is the civ's "IconSet". Fandom confirms Hittites were originally Mesopotamian and Sumerians originally Egyptian; Return of Rome swapped them.

| Architecture | Civs |
|---|---|
| Egyptian | Egyptian, Assyrian, Sumerian |
| Greek | Greek, Minoan, Phoenician |
| Babylonian (Mesopotamian) | Babylonian, Hittite, Persian |
| Asian | Shang, Yamato, Choson |
| Roman | Roman, Carthaginian, Palmyran, Macedonian |

Bonuses, exact values from the dat:

- **Assyrian:**
  - Archer reload set to 1.1 (bowman line from 1.4 → about 27% faster; chariot archers and horse archers from 1.5 → about 36%).
  - Villagers +0.2 speed (+18%).
- **Babylonian:**
  - Priest faith regen +0.75.
  - Stone miners +0.2 rate and +3 carry.
  - Walls and all towers ×2 HP.
- **Carthaginian:**
  - Hoplite line, war elephants and elephant archers ×1.25 HP.
  - Light Transport +0.35 speed, Heavy Transport +0.75 speed.
  - Fire Galley +6 attack.
- **Choson:**
  - Priest cost ×0.68 (125 → 85 gold).
  - All towers +2 range and +2 LOS.
  - Long Swordsman and Legion +80 HP.
- **Egyptian:**
  - Priests +3 range and +3 LOS.
  - Gold miners +0.2 rate and +2 carry.
  - Chariot, Chariot Archer and Scythe Chariot ×1.33 HP.
- **Greek:** hoplite line +0.3 speed; warships +0.3 speed.
- **Hittite:**
  - Siege units ×2 HP.
  - All archers +1 attack.
  - Scout Ship and War Galley +4 range and +4 LOS.
- **Macedonian:**
  - Hoplite line +2 pierce armor.
  - +2 LOS for infantry, cavalry, elephants, hoplites, villagers and non-war boats.
  - Siege cost ×0.5.
  - Units are 4× harder to convert. This is hard-coded in the exe, not in the dat [FAN/DAO].
- **Minoan:**
  - All ships cost ×0.7.
  - Composite Bowman +2 range and +2 LOS.
  - Farms +60.
- **Palmyran:**
  - Villagers cost 75 food, +1 base armor.
  - +0.2 rate for foragers, fishermen, hunters, woodcutters and both miners. The bonus is wrongly applied to the Farm object, so farmers get nothing.
  - Camels ×1.25 speed.
  - No tribute fee.
- **Persian:**
  - Hunters +0.3 rate and +3 carry.
  - War elephants, armored elephants and elephant archers +0.5 speed (0.9 → 1.4).
  - Trireme reload 1.8 → 1.3.
- **Phoenician:**
  - Elephants cost ×0.75.
  - Catapult Trireme and Juggernaught reload 5.0 → 2.9.
  - Woodcutters +0.2 rate and +3 carry (1.0a: +15%, +2).
- **Roman:**
  - Buildings cost ×0.85, except walls and Wonder.
  - Towers cost ×0.5.
  - Swordsman line reload 1.5 → 1.0.
- **Shang:**
  - Villagers cost 35 food (1.0a: 40, and −40 starting food).
  - Walls ×2 HP.
- **Sumerian:**
  - Villagers +15 HP (40 total).
  - Siege reload 5.0 → 3.5.
  - Farms +250.
- **Yamato:**
  - Scout, cavalry line and horse-archer line cost ×0.75.
  - Ships ×1.3 HP; fishing boats ×1.33.
  - Villagers +0.2 speed.

DE changed almost every civ. For example, the Assyrian/Yamato villager speed bonus became 10%, Roman building discount −10% and towers −40%, and Babylonian/Shang wall HP +60%. The full list is on fandom's "Summary of changes in AoE: DE" page.

### 6.2 Tech-tree gaps [DAT]

"–" means the civ does not have it. The table only lists items at least one civ lacks. Every civ has all Leather and Scale armors, Toolworking, Metalworking, Battle Axe, Short Sword, Domestication, Woodworking, Gold Mining, Stone Mining, Writing, Small/Medium Wall, Watch/Sentry Tower, War Galley and Merchant Ship.

| Item | As | Ba | Ca | Ch | Eg | Gr | Hi | Ma | Mi | Pa | Pe | Ph | Ro | Sh | Su | Ya |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Academy (whole building) | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | – | Y | Y | Y | Y | Y |
| Phalanx | – | – | Y | – | – | Y | Y | Y | Y | Y | – | Y | Y | – | Y | Y |
| Centurion | – | – | Y | – | – | Y | Y | Y | Y | – | – | Y | Y | – | Y | Y |
| Broad Sword | Y | Y | Y | Y | – | – | Y | Y | Y | Y | Y | Y | Y | Y | Y | – |
| Long Sword | Y | Y | Y | Y | – | – | – | – | Y | – | Y | Y | Y | – | Y | – |
| Legion | Y | Y | – | Y | – | – | – | – | – | – | Y | Y | Y | – | – | – |
| Slinger | – | Y | Y | Y | Y | Y | – | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| Improved Bow | – | Y | Y | Y | Y | – | – | Y | Y | Y | Y | Y | Y | Y | – | Y |
| Composite Bow | – | Y | – | – | Y | – | – | Y | Y | Y | Y | Y | – | Y | – | Y |
| Chariot Archer | Y | Y | – | – | Y | – | Y | – | – | Y | – | Y | – | Y | Y | – |
| Horse Archer | Y | Y | Y | Y | – | – | Y | Y | – | Y | Y | – | – | Y | Y | Y |
| Heavy Horse Archer | – | – | – | – | – | – | Y | Y | – | Y | Y | – | – | Y | Y | Y |
| Elephant Archer | – | – | Y | – | Y | – | Y | – | – | – | Y | Y | – | – | – | – |
| Chariot | Y | Y | – | – | Y | – | Y | – | – | Y | – | Y | Y | Y | Y | – |
| Scythe Chariot | – | Y | – | – | Y | – | Y | – | – | Y | – | Y | Y | Y | Y | – |
| Cavalry | Y | Y | Y | Y | – | Y | Y | Y | Y | Y | Y | Y | Y | Y | – | Y |
| Heavy Cavalry | Y | – | Y | Y | – | Y | – | Y | – | Y | Y | – | – | Y | – | Y |
| Cataphract | Y | – | – | Y | – | – | – | Y | – | – | Y | – | – | Y | – | Y |
| Camel | Y | Y | Y | – | Y | – | Y | – | Y | Y | Y | Y | – | Y | Y | – |
| War Elephant | – | – | Y | – | Y | – | Y | Y | – | Y | Y | Y | – | – | Y | – |
| Armored Elephant | – | Y | Y | – | – | – | Y | Y | – | Y | Y | Y | – | – | – | Y |
| Catapult | Y | Y | – | – | – | Y | Y | – | Y | Y | Y | – | Y | Y | Y | – |
| Heavy Catapult | Y | Y | – | – | – | Y | Y | – | Y | Y | – | – | Y | – | Y | – |
| Ballista | Y | – | Y | Y | – | Y | – | Y | Y | Y | – | – | Y | Y | – | – |
| Helepolis | Y | – | Y | Y | – | Y | – | – | Y | – | – | – | Y | Y | – | – |
| Fishing Ship | Y | Y | Y | Y | Y | Y | – | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| Trireme | Y | – | Y | Y | Y | Y | – | Y | Y | Y | Y | Y | Y | – | Y | Y |
| Catapult Trireme | – | – | – | – | Y | Y | – | Y | Y | – | Y | Y | Y | – | – | Y |
| Juggernaught | – | – | – | – | Y | Y | – | – | Y | – | Y | Y | Y | – | – | Y |
| Heavy Transport | – | – | Y | – | Y | Y | – | Y | Y | – | Y | Y | Y | – | – | Y |
| Fire Galley | Y | Y | Y | – | – | – | Y | – | – | Y | – | – | – | Y | Y | – |
| Temple / Priest | Y | Y | Y | Y | Y | Y | Y | – | Y | Y | Y | Y | Y | Y | Y | Y |
| Guard Tower | Y | Y | Y | Y | Y | Y | Y | Y | – | Y | Y | Y | – | Y | Y | – |
| Ballista Tower | Y | Y | Y | Y | Y | Y | Y | Y | – | Y | – | Y | – | – | Y | – |
| Fortification | Y | Y | – | Y | Y | Y | Y | – | – | Y | Y | Y | Y | Y | Y | – |
| Wheel | Y | Y | Y | Y | Y | Y | Y | – | Y | Y | – | Y | Y | Y | Y | Y |
| Artisanship | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | – | Y | Y | Y | Y | Y |
| Craftsmanship | Y | Y | Y | Y | Y | Y | Y | – | Y | – | – | Y | Y | Y | – | Y |
| Plow | Y | Y | Y | Y | Y | Y | Y | Y | Y | – | – | Y | Y | Y | Y | Y |
| Irrigation | Y | Y | Y | Y | Y | Y | Y | Y | Y | – | Y | Y | – | Y | Y | Y |
| Coinage | Y | Y | Y | Y | – | Y | Y | Y | Y | – | – | Y | Y | – | – | Y |
| Siegecraft | Y | Y | – | Y | – | Y | Y | – | Y | Y | – | – | Y | – | Y | Y |
| Metallurgy | Y | – | – | Y | Y | – | Y | Y | Y | – | Y | – | Y | Y | – | Y |
| Chain Mail (all three) | – | – | – | – | Y | Y | Y | Y | Y | Y | Y | – | Y | Y | Y | Y |
| Bronze Shield | – | Y | Y | Y | – | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| Iron Shield | – | – | Y | – | – | Y | Y | Y | Y | Y | Y | Y | Y | Y | – | Y |
| Tower Shield | – | – | Y | – | – | Y | Y | Y | Y | – | Y | Y | Y | Y | – | – |
| Nobility | – | Y | Y | – | Y | Y | Y | – | Y | Y | Y | Y | Y | Y | Y | Y |
| Architecture | – | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | – | Y | Y | Y | Y |
| Logistics | Y | Y | Y | Y | Y | Y | Y | Y | Y | – | Y | Y | Y | Y | Y | Y |
| Aristocracy | – | Y | Y | – | Y | Y | Y | Y | Y | – | – | Y | Y | – | Y | Y |
| Ballistics | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | – | Y | Y | – | Y | Y |
| Alchemy | – | Y | Y | – | Y | Y | Y | Y | Y | Y | Y | Y | – | – | Y | Y |
| Engineering | – | Y | Y | – | Y | Y | Y | – | Y | – | Y | Y | Y | – | Y | Y |
| Astrology | Y | Y | – | Y | Y | Y | Y | – | – | Y | Y | Y | – | Y | – | – |
| Mysticism | Y | Y | Y | Y | Y | Y | – | – | – | – | Y | Y | Y | Y | Y | – |
| Polytheism | Y | Y | Y | Y | Y | Y | – | – | Y | – | Y | Y | Y | Y | Y | Y |
| Afterlife | Y | Y | Y | Y | Y | Y | – | – | – | Y | Y | Y | – | Y | – | Y |
| Monotheism | Y | Y | – | Y | Y | – | – | – | – | – | Y | Y | Y | Y | – | – |
| Fanaticism | Y | Y | – | Y | Y | Y | – | – | – | Y | Y | Y | Y | Y | – | – |
| Jihad | Y | Y | Y | Y | Y | – | – | – | – | Y | Y | Y | Y | Y | – | – |
| Medicine | Y | Y | Y | Y | Y | Y | – | – | Y | – | Y | Y | Y | Y | Y | – |
| Martyrdom | Y | Y | Y | Y | Y | – | – | – | – | – | Y | Y | Y | Y | Y | – |

Full Tech Tree removes civ bonuses. In the original, Fire Galleys are not available under Full Tech Tree [MAN][FAN].

---

## 7. Game setup

**Victory conditions [MAN]:**
- **Standard:** any one of the following wins:
  - Conquest.
  - Hold a Wonder for 2000 years.
  - Hold all Artifacts for 2000 years.
  - Hold all Ruins for 2000 years.
  - The manual says 2000 years is "about 15 minutes". Fandom says 16:40 at speed 1.0. The exe loads 2000.0 into the countdown.
  - A random map has **5 Artifacts and 5 Ruins, or none**.
- **Conquest:** destroy all enemy villagers, military units, warships and buildings. Trade, transport and fishing boats, walls, artifacts and ruins don't need to be destroyed.
- **Score:** first to reach the target.
- **Time Limit:** highest score when time runs out.
- Scenarios can also use Exploration, Discoveries and custom goals.

**Map types** (9 random maps):
- Original: Small Islands, Large Islands, Coastal, Inland, Highland.
- RoR added: Continental, Hill Country, Mediterranean, Narrows [FAN].

**Map sizes [EXE]:** Tiny 72, Small 96, Medium 120, Large 144, Huge 200, Gigantic 250 (tiles per side). The size names are my inference from the order in the switch statement.

**Other options:**
- Game speed 1.0 / 1.5 / 2.0 [HG].
- Starting age: Default/Stone, Tool, Bronze, Iron, plus Nomad [MAN]. Post-Iron is used in Death Match [FAN].
- Toggles: Reveal Map, Full Tech Tree, Fixed Positions, Enable Cheating [MAN]. Path-finding quality was added in patch 1.0a.
- Difficulty: the manual only says levels run "easy to hardest". The usual names are Easiest / Easy / Moderate / Hard / Hardest (unverified). Forum reports say the Hardest AI gets extra food, e.g. +2000 (unverified).

**Score [FAN, from the manual's tech-tree foldout]:**
- **Military:**
  - ½ point per kill.
  - 1 per building razed.
  - Kills minus losses, if positive.
  - +25 for most military units.
- **Economy:**
  - Gold collected ÷ 100.
  - Tribute ÷ 60.
  - 1 per villager or boat.
  - +25 for most villagers.
  - 1 per 3% of the map explored.
  - +25 for most explored.
- **Religion:**
  - 2 per conversion.
  - +25 for most conversions.
  - 3 per Temple.
  - 10 per Ruin or Artifact held.
  - +50 for holding all of them.
- **Technology:**
  - 2 per tech.
  - +50 for most techs.
  - +25 each for first to Bronze and first to Iron.
- **Other:**
  - −100 if eliminated.
  - +100 per Wonder standing at game end.

---

## 8. Random-map object placement [DAT]

The generator settings are stored in the dat. The distances below are tile distances from the player's Town Center. Every map places **1 TC plus 3 villagers at 2–4 tiles**.

**Water-heavy template** (dat map IDs 4, 0, 8):
- Stone: 2 clusters of 7 nodes at 10–35.
- Gold: one cluster of 9 at 14–18, one cluster of 9 at 20–40.
- Berries: 7 ±1 bushes at 7–16, plus 6 ±1 at 18–40.
- Gazelles: 6 ±2 at 12–40.
- Elephants: 2 ±1 at 10–40.

**Land template** (dat map IDs 6, 5, 7, 2, 3, 1, 9):
- Near stone: 7 nodes at 10–18. Near gold: 8 nodes at 12–18.
- Far stone: 7 nodes at 20–35. Far gold: 8 nodes at 21–35.
- Berries: 7 ±1 at 7–16 (or 7–18).
- Gazelles: 6 ±2 at 10–22/24.
- Scattered across the map (scaled by map size):
  - 1 stone cluster of 7 and 2 gold clusters of 6, at least 40 from any player.
  - 5 berry clusters of 6, at least 18–20 away.
  - 7 elephant pairs.
  - 5–6 gazelle herds.

**Every map:**
- 10–15 scattered trees at 8–22 tiles.
- 6–7 lions at least 18 away.
- Alligators on shallows and beaches.
- Fish scaled by map size: shore fish 15 or 25 groups, deep fish 9–28, whales 6–15.
- Terrain mix: desert about 20%, forest (id 10) 7%, palm, jungle and pine forest 3% each, then deep water placed on water. Map 3 has no water terrain and 10% pine forest.
- The dat stores no elevation data for any map, so hills must be generated by the exe (unverified).
- My guess at which dat map is which named map (unverified): 4 = Small Islands, 0 = Large Islands, 6 = Coastal, 5 = Continental, 8 = Narrows, 1 = Mediterranean, 3 = Highland or Hill Country.

The AoE Heaven article on gold placement matches this: 2 gold mines near each player (1 on Tiny), plus 0–4 more depending on size [HG].

---

## 9. Competitive build orders (RoR) [HG]

The Stone Age opening everyone uses:
1. Keep the TC training villagers non-stop.
2. Two of the starting villagers build a house; the third scouts.
3. Build a Granary at the berries and put 6 villagers on food.
4. Send the next villagers to wood, with a Storage Pit once you have 120 wood (start it at 80–90).
5. Add a house every 4 pop, and a Dock plus fishing boats if there is water.
6. For Tool Age, the two cheapest buildings are Granary + Storage Pit, or Barracks.

| Plan | Villagers | Timings (in-game clock) | Notes |
|---|---|---|---|
| Slinger rush | 6 on berries, villagers 7–10 on wood, villager 10 or 11 goes forward; click Tool at about 20 (18 if food is short), before 10:00 | First forward Barracks at 400 food; second Barracks; queue 4 slingers in each, then 4–6 more | Market with at least 4 woodcutters, then Stone Mining; author's Bronze averages 18:30 |
| Axe rush | 6 food → 6 wood → 7 food, stop at 21 | 4–6 clubmen by the Tool click | On Tool: Battle Axe (100 F), Toolworking (100 F), Leather Armor Soldiers (75 F); 2 Barracks, 10–15 axemen |
| Tool army (Blitz) | – | Barracks near the enemy in Stone Age | 10–12 slingers, 5–8 axemen, 1–3 scouts |
| Fast Bronze (NathanC) | 21 (21–27) | Tool research takes 2:00; Bronze about 14–15 min; Iron 28–32 min | Needs 800 F + 300 W; Woodworking then Gold Mining; on Bronze build Market and Stable, send 2 cavalry + 1 scout; split villagers about ½ food, ⅓ wood, rest gold |
| "Crappy Bronzing" | 20 (opponents 22–24) | Tool 9:00–9:40; Bronze 12:30–13:30 (fast civs), 13:00–14:00 (slow) | Total food needed is 1300; 4–5 fishing boats before Bronze |
| Dock first (Minoan) | 7 villagers then boats | Boats: 6 by 4:00, 11 by 6:30, 16 by 9:00, 24 by 14:00; Tool 11:08, Bronze 14:05, Iron 21:21 | – |
| Mediterranean boom (Minoan) | 38 total pop at 9:00 | Tool click 10:00, Bronze click 12:20, Bronze about 14:40 | – |
| Assyrian Bronze boom | About 24 at Tool | 700–800 F and at least 300 W | Bronze: Wheel, 5–8 Archery Ranges, 30–50 chariot archers, 80+ villagers before Iron |

For the AI, a useful rule of thumb is that food income decides the timing: 1300 total food by about 12–14 minutes means Bronze on time.

---

## 10. Things I could not pin down

- Which dat map ID is which named map.
- How elevation is generated.
- The multiple-builder build-speed formula.
- The trade payout formula.
- The Nomad starting villager count.
- Difficulty level names and AI resource bonuses.
- Whether the "buildings take ⅕ damage" rule applies in 1.0 or only in DE.
- The exact seconds-per-game-year conversion.
- A dat that already includes the 1.0a changes. I only know them from the patch notes (Shang, Phoenician, farm bug).

Fandom's "TRoR" notes disagree with the RoR 1.0 dat on two values:

| Tech | Dat | Fandom "TRoR" |
|---|---|---|
| Wheel | +0.7 speed | +0.33 |
| Jihad | +0.3 speed / −8 carry | +0.11 / −7 |

I used the dat values.

---

**Sources:**
- Data files I parsed:
  - [RoR 1.0 empires.dat](https://raw.githubusercontent.com/daominah/age_of_empires_ror_hd/master/data/empires_original.dat)
  - [EMPIRESX.EXE](https://raw.githubusercontent.com/daominah/age_of_empires_ror_hd/master/EMPIRESX.EXE)
  - [daominah repo and README (tested civ bonuses, DE deltas)](https://github.com/daominah/age_of_empires_ror_hd)
  - [genieutils (file-format reference)](https://github.com/Tapsa/genieutils)
- [AoE 1997 manual OCR (archive.org)](https://archive.org/details/manual_Age_of_Empires)
- Fandom:
  - [Technology (AoE)](https://ageofempires.fandom.com/wiki/Technology_(Age_of_Empires))
  - [Upgrade (AoE)](https://ageofempires.fandom.com/wiki/Upgrade_(Age_of_Empires))
  - [Villager (AoE)](https://ageofempires.fandom.com/wiki/Villager_(Age_of_Empires))
  - [Summary of changes in AoE:DE](https://ageofempires.fandom.com/wiki/Summary_of_changes_in_Age_of_Empires:_Definitive_Edition)
  - [Patch 1.0a (RoR)](https://ageofempires.fandom.com/wiki/Patch_1.0a_(The_Rise_of_Rome))
  - [Armor class (AoE)](https://ageofempires.fandom.com/wiki/Armor_class_(Age_of_Empires))
  - [Score](https://ageofempires.fandom.com/wiki/Score)
  - [Victory](https://ageofempires.fandom.com/wiki/Victory)
  - [Population](https://ageofempires.fandom.com/wiki/Population)
  - [Random map](https://ageofempires.fandom.com/wiki/Random_map)
  - [Deathmatch](https://ageofempires.fandom.com/wiki/Deathmatch)
  - [The Rise of Rome](https://ageofempires.fandom.com/wiki/Age_of_Empires:_The_Rise_of_Rome)
  - [Civilization (AoE)](https://ageofempires.fandom.com/wiki/Civilization_(Age_of_Empires))
  - Individual building and civ pages
- AoE Heaven:
  - [Units/Buildings index](https://aoe.heavengames.com/theacademy/unitsboatsandbuildings/)
  - [Goldmine Distribution in RoR](https://aoe.heavengames.com/theacademy/multiplayerstrategies/goldmine-distribution-in-rise-of-rome/)
  - [Fast Bronze](https://aoe.heavengames.com/theacademy/multiplayerstrategies/the-fast-bronze-strategy/)
  - [Bronze in under 15 min (Medit)](https://aoe.heavengames.com/theacademy/multiplayerstrategies/how-to-bronze-in-under-15-mins-on-medit/)
  - [Slinger Rush](https://aoe.heavengames.com/theacademy/multiplayerstrategies/the-slinger-rush/)
  - [Axer Rush](https://aoe.heavengames.com/theacademy/multiplayerstrategies/the-axer-rush/)
  - [Tool Age Warfare](https://aoe.heavengames.com/theacademy/multiplayerstrategies/tool-age-warfare/)
  - [Booming Building Order](https://aoe.heavengames.com/theacademy/multiplayerstrategies/booming-building-order/)
  - [Dock First](https://aoe.heavengames.com/theacademy/multiplayerstrategies/dock-first/)
  - [Assyria Bronze Boom](https://aoe.heavengames.com/theacademy/multiplayerstrategies/assyria-bronze-boom/)
  - [Crappy Bronzing](https://aoe.heavengames.com/theacademy/multiplayerstrategies/crappy-bronzing-revisited/3/)
  - [Pros and Cons of 1.0 speed](https://aoe.heavengames.com/theacademy/multiplayerstrategies/the-pros-and-cons-of-1-0-speed/)
