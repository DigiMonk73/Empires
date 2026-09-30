# Asset licenses

Every non-code asset the game ships, where it came from, and the terms it is under. Nothing here comes from the
original game (D14).

| Asset | Path | Origin | Terms |
| --- | --- | --- | --- |
| Icon / brand mark | `assets/brand/icon.svg`, `public/favicon.svg` | Drawn in code for this project | Project's own |
| Unit, building, resource and terrain sprites | `public/baked/` | Modelled in code (`src/art/`) and baked by `tools/bake/cli.ts` | Project's own |
| Sound effects | none on disk — synthesised at runtime by `src/audio/synth.ts` (`node tools/sfx.ts` writes copies to `artifacts/` for listening) | Procedural synthesis | Project's own |
| Voice acknowledgements | `public/audio/voices/` | Rendered by `tools/voices.ts` with macOS `say` built-in voices "Melina" (Greek) and "Grandpa (Italian (Italy))", then trimmed and normalised | macOS system voices: the macOS software licence allows voice output for the licensee's **personal, non-commercial** projects. Fine for this personal build; **re-record or replace before any commercial or public distribution** (tracked as KI-5). |

Lines spoken (all original, short common words): villagers — *Ne? Parakalo? Nai! Amesos! Endaxi! Pame!*;
soldiers — *Paratus! Imperia? Ita! Ad arma! Eamus! Pugnemus!*; deaths — *Ah! Uh! Oh!*
