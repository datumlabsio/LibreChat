# Security triage — Dependabot findings, 2026-07-29 (ww-sec-2)

Policy: `patches/MANIFEST.md` + westwise-context `findings/plan-librechat-plan-a.md` §7.
Frozen for features, open for security. Fix = smallest targeted dep bump (npm override
preferred), only for findings **reachable in the deployed surface** — the running container
(api server + built client bundle). Not dev/build tooling; not disabled features (rag_api,
meilisearch run as separate containers and are off in our deploy).

Snapshot: Dependabot reported **61** findings on the default branch (`ww/patches`):
2 critical, 16 high, 37 moderate, 6 low. At triage time **58 open** — both criticals and
1 moderate were already closed by ww-sec-1 (commits `1d0835e8c`, `20127a861`).

## Critical + high (18 total)

| # | Package | Sev | CVE / GHSA | Classification | Action |
|---|---|---|---|---|---|
| 31 | websocket-driver | critical | CVE-2026-54466 | (a) fixed pre-triage | **FIXED** ww-sec-1: override `^0.7.5` |
| 16 | aquasecurity/trivy-action | critical | CVE-2026-33634 | (a) fixed pre-triage | **FIXED** `20127a861`: action ref → v0.36.0 |
| 54 | @opentelemetry/propagator-jaeger | high | CVE-2026-59892 | (c) runtime — api, via `@opentelemetry/sdk-node` (backend + agents); DoS via crafted `uber-trace-id` header | **FIXED** 2.7.1 → 2.9.0 (override pin + lockfile; nested `@opentelemetry/core` 2.9.0 added — top-level otel SDK stays 2.7.1) |
| 47 | axios | high | GHSA-gcfj-64vw-6mp9 | (c) runtime — api server-side HTTP client + client bundle | **FIXED** 1.16.0 → 1.19.0 (override `^1.18.0`) |
| 15 | axios (`packages/data-provider/react-query/package-lock.json`) | high | GHSA-gcfj-64vw-6mp9 | (e) not in deployed artifact — nested lockfile is never installed (Dockerfile runs root `npm ci` only; workspace resolves axios from the root lockfile, now fixed) | **ACCEPTED** — vestigial lockfile; refresh or dismiss at next review |
| 61 | brace-expansion (2.x copies) | high | CVE-2026-14257 | (f) runtime-present, not attacker-reachable — expansion inputs are developer-supplied glob patterns (rimraf/sucrase→minimatch), never user input; only fixed release is 5.0.8 and 2.x→5.x crosses a major under CJS minimatch | **ACCEPTED** (partial: all 5.x copies moved to 5.0.8) |
| 38 | brace-expansion (2.x) | high | CVE-2026-13149 | (c) runtime — rimraf (gaxios chain) + sucrase (tailwind chain) | **FIXED** 2.0.3 → 2.1.3 |
| 37 | brace-expansion (1.x) | high | CVE-2026-13149 | (b) dev-only | **FIXED incidentally** 1.1.13 → 1.1.17 (lockfile update ride-along) |
| 36 | brace-expansion (3–5.x) | high | CVE-2026-13149 | (b) dev-only | **FIXED incidentally** 5.0.6 → 5.0.8 |
| 58 | fast-uri | high | CVE-2026-16221 | (c) runtime — via ajv v8 (MCP SDK et al.) in api | **FIXED** 3.1.2 → 3.1.4 (override `^3.1.4`) |
| 53 | fast-uri | high | CVE-2026-13676 | (c) runtime — same chain | **FIXED** by the same bump |
| 1 | google.golang.org/grpc (`otel/langfuse-fanout/go.mod`) | high | GHSA-hrxh-6v49-42gf | (e) stale — manifest does not exist on `ww/patches` (leftover from when upstream `main` was the default branch); Go service not in our image | **ACCEPTED** — dismiss alert in UI as "not used" |
| 39 | js-yaml | high | CVE-2026-59869 | (c) runtime — api YAML parsing (`librechat.yaml` et al.) | **FIXED** 4.2.0 → 4.3.0 (override `^4.2.0`→`^4.3.0`) |
| 60 | postcss | high | GHSA-r28c-9q8g-f849 | (c) runtime — `sanitize-html` depends on postcss at runtime in api (style parsing of sanitized content); also build chain | **FIXED** 8.5.13 → 8.5.25 (override `^8.5.18`) |
| 20 | protobufjs | high | CVE-2026-48712 | (c) runtime — api via `@google/genai` + `@grpc/proto-loader`; client via `@hyperdx` recorder | **FIXED** 7.5.9 → 7.6.5 (override pin; also closes moderates #19/#40) |
| 57 | sharp (lockfile) | high | GHSA-f88m-g3jw-g9cj | (c) runtime, genuinely attacker-reachable — api processes user-uploaded images (avatars); libvips CVEs | **FIXED** 0.33.5 → 0.35.3 (declared range bump `^0.35.0` in `api/package.json` + `packages/api/package.json`; Node 24 satisfies engines) |
| 17 | sharp (`api/package.json`) | high | GHSA-f88m-g3jw-g9cj | (c) same finding, package.json manifest | **FIXED** by the same range bump |
| 56 | svgo | high | GHSA-2p49-hgcm-8545 | (b) dev-only — client build (`removeScripts` plugin; our SVGs are our own assets) | **ACCEPTED** — existing override `^2.8.2` can go to `^2.8.3` at next review if we want the alert closed |

**Counts:** 18 critical+high → 2 fixed pre-triage (ww-sec-1) · 10 runtime-reachable fixed today ·
2 dev-only fixed incidentally · 4 accepted (1 no-safe-fix/not-reachable, 2 not-in-artifact/stale, 1 dev-only).
**Zero critical or high remains unaddressed without a written rationale.**

## Moderate (36) / low (6) — triaged, not fixed today

- **Ride-along closures from today's bumps:** 9 axios moderates (root lockfile, #33–35/#41–46)
  and 2 protobufjs moderates (#19, #40) are resolved by the 1.19.0 / 7.6.5 bumps.
- **Nested react-query lockfile:** 9 axios moderates (#6–14) — same disposition as high #15
  (manifest not installed in the image).
- **Priority for next review — echarts XSS (#18/#30, CVE-2026-45249):** moderate, but `fork-01`
  renders ` ```echarts ` fences from LLM output in messages, so this sits directly on our
  patched surface. Fix is 6.1.0 (major-adjacent; verify fork-01 renderer against it).
- **hono (#50–52):** fixes are within the existing `^4.12.25` override range — a plain
  `npm update hono` closes all three. `@hono/node-server` (#49) needs a 2.x major — evaluate.
- Remaining: dompurify 5 moderate + 4 low (one NOFIX), mongoose 1, react-router 2,
  react-router-dom 1 (NOFIX), @opentelemetry/core 1, body-parser 1 low,
  elliptic 1 low (dev, NOFIX, already pinned by upstream override).

## Notes for the record

- npm 11.12 did not retroactively apply the new `overrides` to already-locked transitive
  edges pinned outside the override range (`protobufjs` via `@hyperdx`'s `~7.5.8`,
  `propagator-jaeger` via sdk-node's exact `2.7.1`). Those two were pinned directly in
  `package-lock.json` (version/resolved/integrity, plus nested `@opentelemetry/core` 2.9.0
  and `@protobufjs/eventemitter` 1.1.1). `npm ci --dry-run` validates clean (2997 packages);
  `npm ls` shows the two edges as `invalid` (range-vs-lockfile mismatch), which `npm ci`
  ignores — but a plain `npm install` by a dev may attempt to re-resolve them. CI and the
  image build both use `npm ci`, so the pins hold where it matters.
- Verification relies on the CI rebuild + trivy rescan triggered by this push; sharp
  0.33→0.35 is the only bump with meaningful API surface (image pipeline) — smoke-test
  avatar upload on the rebuilt image.

**Next review: 2026-08-05** (or sooner on any new critical/high touching the deployed surface).
