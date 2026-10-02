# LOOP.md — how every build-loop iteration works

The game is built in self-paced `/loop` iterations. This file is the protocol. **Repo docs are the source of
truth**, not conversation memory, because context gets summarized.

## Documents
| File | Purpose |
|---|---|
| `docs/PLAN.md` | The approved plan: goals, locked decisions, architecture, milestones, gates. |
| `docs/PROGRESS.md` | "State of the world" header (≤ 30 lines, rewritten each iteration) + milestone task checklists. |
| `docs/DECISIONS.md` | Numbered decisions (D1…). Changing a locked decision (D1–D14) means stop and ask the user. |
| `docs/KNOWN_ISSUES.md` | Open defects, must-fix visual items, blocked tasks with notes. |
| `docs/METRICS.md` + `docs/metrics/history.csv` | Gates, thresholds, and the metric history appended by verify. |
| `docs/visual-review.md` | Per-iteration screenshot scores against `docs/VISUAL_CHECKLIST.md`. |
| `docs/research/*` | Sourced game-rule research. Data rows cite these. |
| `docs/design/architecture-proposal.md` | Detailed design reference (interfaces, systems, budgets). |
| `docs/POLISH_LOOP.md` | The time-boxed polish run (M15.10): scope, discovery lenses, checkpoints, wrap-up. |

## Each iteration
1. **Check the tree.** `git status`. Leftovers from a crashed iteration are finished or reset to the last green
   commit. Anything else unknown → stop and ask the user.
2. **Load state.** Read the PROGRESS header, `KNOWN_ISSUES.md`, and the last `artifacts/verify/summary.md`.
3. **Pick work.** Take the next unblocked task(s) in the current milestone. Write a 3–5 line plan under each
   task in PROGRESS. Split any task larger than ~500 LOC. At the start of a milestone, expand its coarse
   bullets into concrete tasks with acceptance criteria.
4. **Implement.** Tests first where the outcome is objective. Match the surrounding code. Keep sim purity.
5. **Verify.** `npm run verify`. At most 3 fix cycles; then revert to the last green commit and mark the task
   `[blocked]` with notes in KNOWN_ISSUES.
6. **Look.** Open only the changed screenshots/contact sheets listed in `artifacts/screens/CHANGED.md`
   (≤ 8 images). Score them against `VISUAL_CHECKLIST.md`; log to `visual-review.md`. Must-fix items are fixed
   now or tracked in KNOWN_ISSUES.
7. **Record.** Update PROGRESS (tick tasks, rewrite header), DECISIONS, METRICS.
8. **Commit.** `git commit -m "M<n>.<k>: <summary>"` ending with the line
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Local only — never push, never add remotes.
9. **Milestone end.** Commit, run `npm run verify:full`, and only when it is green tag `m<n>` and bump the
   `empires-startos` submodule (its `make` runs inside verify:full, so re-run it after the bump). **Commit the
   bump before `make`:** the s9pk rule depends on the package repo's git HEAD, not the submodule's files, so an
   uncommitted bump leaves the old `.s9pk` "up to date" (check its timestamp and `Git:` line). Never chain
   tagging onto a command whose failure could be masked (e.g. by `| tail`).
   At M0, M6 and M15 run the StartOS VM protocol (below). Send the user a short push notification summary;
   at M6 and M15 invite a playtest.
10. **Next.** Schedule the next wakeup in 60–120 s while work remains. Never block on the user; fold in their
    feedback whenever it arrives (user feedback outranks the task list).

## Guardrails
- **Headless only.** No computer-use, no visible windows, no `tauri dev`, no launching Chrome visibly. Browser
  work = Playwright headless (Chromium + WebKit). Tauri checks = hidden-window `--smoke-test`.
- **Sim purity.** `src/sim`, `src/data`, `src/ai` must pass `tools/check-purity.ts` (no DOM, no Math.random,
  no trig/pow/exp/log, no `**`, no Date/performance/timers, no `for…in`, no render/ui/audio/art imports).
- **Gates only move by decision.** Relaxing a threshold requires a DECISIONS entry and asking the user.
- **IP.** Never the "Age of Empires" name, never original assets/audio/files. Numbers only, cited.
- **start-technologies/** — only the `git pull --ff-only` sync that `AGENTS.md` prescribes; never edit it.
- **start-cli** — always `/Users/b1ackswan/code/btctx-vm-lab/bin/start-cli` (v2.1.0), by path or by prefixing
  PATH. Never modify the system install.
- **Scratch files** go in the session scratchpad or `artifacts/` (gitignored), never `/tmp`.

## AI work (lessons from M13–M14)
- **Measure on a development set, gate on held-out seeds.** Dissecting games one by one fits the seeds you look at:
  the 12 water seeds of M8–M13 read 11/12 while fresh ones were decided 65% of the time. The suite's gates count
  seeds nobody traces — water 501–548 (D56), 1v1 wars 1001–1024 (D58); the ladder's 101–132 are the Done set.
  Trace and tune on the dev sets (water 401–448, wars 601–624, ladder cross-check 1101–1132) with
  `tools/sim/diagnose.ts`; keep a change only if the held-out numbers don't fall — judged on the noise band
  (D70: `node tools/sim/ai-band.ts`, the full suite at think shifts 0–3), not on one draw.
- **Look at a stalled game before changing numbers.** Most "the AI is weak" results this far were bugs found by
  tracing one game minute by minute (`tools/sim/diagnose.ts trace …`): villagers ping-ponged between two lions,
  an army waited for a wave its full population could never train, a cache kept land labels that the pathing
  renumbers whenever a building goes up. Parameter sweeps (rush odds, push ratio, villager targets) moved
  nothing beyond seed noise (±3 games in 64).
- **No fixed-seed AI tests.** A test that needs "seed 14 ends by minute 45" breaks whenever maps or the AI change
  and then tests nothing. Write a scene (a hand-made `SimConfig` with the situation) or a small peaceful match
  whose outcome doesn't hang on one war.
- **Anything the AI remembers about regions must key on `v.passVersion()`** — `region()` labels are renumbered
  whenever passability changes.
- **The ladder's Hard > Moderate sits near its bar** (49/64 vs 48): expect any AI or map change to move it ±3;
  run `node tools/sim/ai-suite.ts --full --adjacent` (≈4–6 min) before committing AI changes, not only the quick suite.
- Quote suite arguments containing `>` (`--pairs 'hard>moderate'`) — unquoted, the shell redirects.

## Stop and ask the user when
- credentials are needed (e.g. `start-cli auth login` — ask them to run `! <command>`),
- a license is in doubt,
- a gate would be relaxed or a locked decision D1–D14 would change,
- a game-rule fact can't be resolved from research (otherwise flag `verify:true` and continue).

## Parallelism
At most 2–3 subagents at once, only for independent chunks (e.g. art models while the main thread does sim),
each in its own worktree; their work must pass `npm run verify` before it is merged.

## StartOS VM protocol (M0, M6, M15)
1. `/Users/b1ackswan/code/btctx-vm-lab/vm.sh start` (UTM "StartOS test", muscular-privacy.local, ~8 GB RAM).
2. In `/Users/b1ackswan/code/empires-startos`: `PATH=/Users/b1ackswan/code/btctx-vm-lab/bin:$PATH make arm`,
   then install (`make arm install`, or `vm.sh install <file>.s9pk`).
3. Follow `start-technologies/projects/start-sdk/docs/skills/package-service/references/verify-on-startos.md`:
   health green and staying green, UI opens, real play, restart persistence, backup/restore,
   uninstall/reinstall, logs read end to end.
4. `vm.sh stop`. Record exactly what was verified in PROGRESS.
