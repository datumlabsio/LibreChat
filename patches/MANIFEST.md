# WW Patch Manifest — datumlabsio/LibreChat (frozen fork @ v0.8.7)

Policy: findings/plan-librechat-plan-a.md §7 in westwise-context. One commit per patch,
prefixed `fork-NN:`. New logic in new files (client/src/components/ww/); upstream files
touched only at registration points. Budget ≤6 landed patches; upstream-touched LOC must
stay below new-file LOC. Frozen for features, open for security (cherry-pick only).

| Patch | Status | What | Why | Where |
|---|---|---|---|---|
| fork-06b | LANDING (P2) | `{{LIBRECHAT_CONVERSATION_ID}}` header placeholder for custom endpoints | Per-conversation Langfuse grouping (ADR-8/13) | header resolution + 1 call site |
| fork-01 | LANDING (P2) | Render ```chart/```echarts fences as live ECharts in messages | WW agent emits charts; §4 B5 | client/src/components/ww/EChartsBlock.tsx + markdown registry |
| fork-02 | LANDING (P2) | "⚡ deep reasoning" route chip in the Thoughts section | §4 B8 escalation visibility | client/src/components/ww/RouteChip.tsx + reasoning renderer |
| fork-03 | PILOT-GATED | Structured tool-step rows | §4 B6 | reserved |
| fork-04 | PILOT-GATED (ADR-12) | Pin-to-dashboard button | Conversational pin_to_dashboard tool covers B7; button adds CORS+credentialed cross-origin surface | reserved |
| fork-05 | LIKELY DROP | Mermaid pan/zoom | v0.8.7 ships zoom natively (P0); confirm-drop test on large diagram pending | reserved |
| fork-06 | CONDITIONAL | Branding beyond config | Only if librechat.yaml interface config falls short | reserved |

Non-patch commits on ww/patches (infra, not counted in budget): this manifest, .github/workflows/ww-ci.yml, Dependabot config.
