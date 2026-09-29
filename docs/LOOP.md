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
9. **Milestone end.** Run `npm run verify:full`; tag `m<n>`; bump the `empires-startos` submodule and `make`.
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
