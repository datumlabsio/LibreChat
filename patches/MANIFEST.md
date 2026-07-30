# WW Patch Manifest — datumlabsio/LibreChat (frozen fork @ v0.8.7)

Policy: findings/plan-librechat-plan-a.md §7 in westwise-context. One commit per patch,
prefixed `fork-NN:`. New logic in new files (client/src/components/ww/); upstream files
touched only at registration points. Budget ≤6 landed patches; upstream-touched LOC must
stay below new-file LOC. Frozen for features, open for security (cherry-pick only).

| Patch | Status | What | Why | Where |
|---|---|---|---|---|
| fork-06b | ✅ LANDED ab3b78874 | `{{LIBRECHAT_CONVERSATION_ID}}` header placeholder for custom endpoints | Per-conversation Langfuse grouping (ADR-8/13) | header resolution + 1 call site |
| fork-01 | ✅ LANDED e7cee7988 | Render ```chart/```echarts fences as live ECharts in messages | WW agent emits charts; §4 B5 | client/src/components/ww/EChartsBlock.tsx + markdown registry |
| fork-02 | ✅ LANDED 5ecd08151 | "⚡ deep reasoning" route chip in the Thoughts section | §4 B8 escalation visibility | client/src/components/ww/RouteChip.tsx + reasoning renderer |
| fork-03 | PILOT-GATED | Structured tool-step rows | §4 B6 | reserved |
| fork-04 | PILOT-GATED (ADR-12) | Pin-to-dashboard button | Conversational pin_to_dashboard tool covers B7; button adds CORS+credentialed cross-origin surface | reserved |
| fork-05 | ❌ DROPPED (confirmed 2026-07-29) | Mermaid pan/zoom | v0.8.7 ships zoom natively (P0); confirm-drop test on large diagram pending | reserved |
| fork-06 | ❌ DROPPED (config sufficed) | Branding beyond config | Only if librechat.yaml interface config falls short | reserved |

Non-patch commits on ww/patches (infra, not counted in budget): this manifest, .github/workflows/ww-ci.yml (Dependabot alerts enabled via repo settings), ww-sec security cherry-picks (policy-sanctioned).

Security log: 2026-07-29 ww-sec-1 — websocket-driver 0.7.4→0.7.5 (CVE-2026-54466, override) + .trivyignore for npm-bundled tar CVE-2026-59873 (build-time only, not runtime-reachable). fork-05 confirm-drop: v0.8.7 Expand = full-screen viewer with zoom/reset controls, verified on patched image.
2026-07-29 ww-sec-2 — Dependabot triage of 61 findings (see patches/SECURITY-TRIAGE-2026-07-29.md): 10 runtime-reachable highs fixed via overrides/range bumps (axios 1.19.0, sharp 0.35.3, protobufjs 7.6.5, js-yaml 4.3.0, fast-uri 3.1.4, postcss 8.5.25, @opentelemetry/propagator-jaeger 2.9.0, brace-expansion 2.1.3); 4 highs accepted with rationale (dev-only / not in deployed artifact / no in-major fix); moderates+lows triaged in doc. Next review 2026-08-05.
2026-07-30 fork-01a — echarts XSS CVE-2026-45249 (GHSA-fgmj-fm8m-jvvx, moderate) mitigated: no fix in ^5 range (first patched 6.1.0), so EChartsBlock hardened instead — option sanitized before setOption (functions stripped, HTML string formatters dropped), tooltip renderMode forced to richText, renderer pinned to canvas. LLM-emitted options are now never rendered through echarts' innerHTML tooltip sink. Alert stays open until the 6.x upgrade; details in the triage doc.

2026-07-30 ww-fix (build correctness, infra) — **CI green ≠ client built.** The Dockerfile chained
`npm run frontend; npm prune --production; npm cache clean` with `;`, so a failed client build was
swallowed: the layer exited 0 on the status of `npm cache clean`, the image was staged to
`ghcr.io/datumlabsio/librechat-ww:latest`, and ww-ci reported success. Run 30481241253 (ww-sec-2) is a
confirmed instance — its log shows `src/request.ts(13,3): error TS2322` and `npm error command failed`
in the frontend step, then a green run. That image has **no client bundle**: inferred, not pulled (we
have no GHCR read access), but the log shows the frontend step dying inside data-provider, i.e. before
`cd client && npm run build` ever ran, and CI builds from a clean checkout that carries no prebuilt
`client/dist`. Now `&&`, so a broken client build fails the image build loudly.
Two breakers behind that failure, both fixed: (1) `packages/data-provider/src/request.ts` — the ww-sec-2
axios 1.19.0 override replaced the old `get<T, R = AxiosResponse<T>>` signature with an
`AxiosResponseResult`/`AxiosResponseDefault` sentinel, so `_getResponse`'s `Promise<T>` return no longer
type-checked; signature corrected to `Promise<AxiosResponse<T>>` (which is what all three call sites in
data-service.ts already declared). Axios override kept — it closed 9 CVE alerts, no downgrade.
(2) `react-window` (peer of `react-vtree`, used by the upstream Skills UI) was never in package-lock, so
`npm ci` never installed it and rolldown could not resolve it; added `react-window@^1.8.11` to the client
workspace. Verified from clean: `npm ci && npm run frontend` succeeds, and the built image contains
`/app/client/dist/index.html` plus hashed assets carrying the fork-01a `richText`/`renderMode` markers.
Upstream files touched: `packages/data-provider/src/request.ts` +6/-3, `client/package.json` +1,
`Dockerfile` +4/-2 (infra).

Health check 2026-07-29: total diff vs v0.8.7 = +413/-3 (QA-measured at health-check commit, excl. package-lock); upstream-touched source lines ~33 vs ~250 new-file lines — metric satisfied. (Updated 2026-07-30: the
ww-fix build repair adds +6/-3 in `packages/data-provider/src/request.ts` and +1 in `client/package.json`,
so upstream-touched source lines are now ~40 vs ~250 — still satisfied. Counted here rather than left out
so the metric stays honest; the Dockerfile change is infra, as with the other non-patch commits.) fork-06 dropped: v0.8.7 interface config covers all governance needs (agents/marketplace/memories/webSearch/runCode/public-shares).
