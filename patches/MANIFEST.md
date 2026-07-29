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

Health check 2026-07-29: total diff vs v0.8.7 = +443/-3; upstream-touched source lines ~33 vs ~250 new-file lines — metric satisfied. fork-06 dropped: v0.8.7 interface config covers all governance needs (agents/marketplace/memories/webSearch/runCode/public-shares).
