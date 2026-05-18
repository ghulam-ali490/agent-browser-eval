# Browser Automation Tooling Evaluation

**Owner:** Workshop R&D Team (Rodolfo, Merwin, Gian, Ghulam)
**Date:** 18 May 2026
**Task:** Test Vercel Agent Browser against Playwright MCP, Chrome DevTools MCP, and Claude in Chrome. Deliver a verdict on speed, token efficiency, and usability. If viable, build a one-skill installer.

## Verdict (TL;DR)

Four browser-control tools an AI agent could use were benchmarked on an identical 5-task suite.

- **Most token-efficient:** Vercel agent-browser (roughly one third of the tokens used by the MCP servers).
- **Fastest and most reliable:** Playwright MCP.
- **Recommendation:** Adopt **Playwright MCP** as the default agent browser-automation tool. **Do not** adopt agent-browser yet, and **do not** build the one-skill installer at this time. agent-browser is genuinely token-lean, but a reproducible bug (its `click` command does not navigate links) plus Windows daemon instability make it unsafe for autonomous use today. Re-evaluate when that bug is fixed.

## Tools tested

| Tool | Type | Version |
|---|---|---|
| Vercel agent-browser | Native CLI + background daemon | 0.27.0 |
| Playwright MCP | MCP server | @playwright/mcp, latest as of 18 May 2026 |
| Chrome DevTools MCP | MCP server | chrome-devtools-mcp, latest as of 18 May 2026 |
| Claude in Chrome | Browser extension | current |

## Method

Identical 5-task suite, all on quotes.toscrape.com (a stable site built for automation testing):

1. Navigate and extract text
2. Form fill and login
3. Pagination (click Next, read page 2)
4. JavaScript-rendered content
5. Full-page screenshot

The three code-driven tools were each run 3 times per task (median reported), driven programmatically: agent-browser through its CLI, the two MCP servers through the MCP stdio protocol. Claude in Chrome was run once per task by hand, because it is an interactive extension and cannot be scripted.

Metrics:
- **Speed:** wall-clock time per task.
- **Token efficiency:** size of the data each tool returns to the AI (characters; roughly 4 characters per token). This is the dominant cost driver.
- **Usability and reliability:** setup friction, errors, whether tasks completed.

Environment: Windows 10, Node 24.

## Results

### Speed (median seconds, lower is better)

| Task | agent-browser | Playwright MCP | Chrome DevTools MCP |
|---|---|---|---|
| 1 Extract | 3.6 (cold start 12.8) | 0.5 | 0.6 |
| 2 Login | 10.0 | 2.1 | 1.9 |
| 3 Pagination | failed | 1.8 | 1.1 |
| 4 JS content | 4.8 | 0.6 | 0.9 |
| 5 Screenshot | 4.8 | 0.8 | 0.7 |

The MCP servers are 3 to 10 times faster. agent-browser spawns a separate process for every command and pays that startup cost each time, while the MCP servers hold one persistent connection. agent-browser also has a roughly 13 second cold start.

### Token efficiency (characters returned to the agent, lower is better)

| Task | agent-browser | Playwright MCP | Chrome DevTools MCP |
|---|---|---|---|
| 1 Extract | 5,264 | 10,758 | 11,356 |
| 2 Login | 2,314 | 12,371 | 12,500 |
| 3 Pagination | 7,256 (failed) | 24,199 | 26,364 |
| 4 JS content | 2,628 | 4,028 | 9,245 |
| 5 Screenshot | 148 | 537 | 247 |
| **Total** | **~17,600** | **~51,900** | **~59,700** |

agent-browser is clearly the leanest, using roughly one third of the tokens. Its snapshot format is more compact, and its interactive-only snapshot mode is especially lean for action tasks. This is its real strength.

### Reliability and usability

| Tool | Tasks passed | Notes |
|---|---|---|
| agent-browser | 4 of 5 | `click` reports success but does not navigate links (Task 3 failed, confirmed 5 ways). Daemon hung on Windows and needed manual process kills. ~13s cold start. |
| Playwright MCP | 5 of 5 | No friction. Cleanest run of all four. |
| Chrome DevTools MCP | 5 of 5 | Works well, but leaves a Chrome process holding a profile lock; a second run failed until an isolated-profile flag was added. |
| Claude in Chrome | 4 of 5 | Reads pages well. Could not produce a usable full-page screenshot (Task 5). Interactive only, cannot be scripted, slowest by nature. |

## Per-tool assessment

**Vercel agent-browser.** The most token-efficient by a wide margin, and the install is simple (one npm command). But the `click` command silently fails to navigate links: it prints a success message while the page never moves. A tool that reports false success is more dangerous than one that errors, because an agent proceeds believing the action worked. Combined with Windows daemon hangs and a slow cold start, it is not dependable for autonomous use today.

**Playwright MCP.** The strongest all-rounder: fastest, fully reliable, zero setup friction. Token use is higher than agent-browser but predictable. The safe default.

**Chrome DevTools MCP.** Fast and reliable in use, with the richest DevTools and debugging surface. The leftover-Chrome profile lock is a real but easily managed gotcha (use the isolated-profile flag). Highest token use of the three.

**Claude in Chrome.** A different category: an assistant inside a real browser, for human-in-the-loop tasks rather than headless automation. Good at reading and navigating pages, weak at deterministic artifacts such as screenshots, and not scriptable. Useful for assisted browsing, not for autonomous agent pipelines.

## Recommendation

1. Adopt **Playwright MCP** as the default browser-automation tool for agent workflows.
2. Keep **Chrome DevTools MCP** as the option when deep DevTools inspection or performance tracing is needed.
3. **Do not** adopt agent-browser yet, and **do not** build the one-skill installer. Its token efficiency is attractive and worth tracking, but the click-navigation bug and Windows instability are blockers. Re-test on the next agent-browser release.
4. Treat **Claude in Chrome** as a human-assist tool, separate from the automation stack.

### On "viable" and the installer

The task said to build a one-skill installer "if viable." Viable is defined here as: completes all 5 tasks reliably with no blocking bug. agent-browser fails that bar on Task 3. The installer is therefore deferred, not built. Shipping an installer for a tool whose click does not work would only spread a known-broken setup.

## Caveats and methodology notes

- Token counts are characters of tool output; roughly 4 characters per token. The relative comparison holds regardless of the exact ratio.
- agent-browser was measured with its compact snapshot modes where appropriate. Even on a like-for-like full snapshot it remains about half the size of the MCP servers.
- MCP server speed was measured over a persistent connection driven by a script, with no language model in the loop. Real agent latency would add model thinking time on top, equally for all tools.
- Claude in Chrome was run once per task by hand because it cannot be scripted; its results are qualitative.
- All tests ran on Windows 10. The agent-browser daemon hangs may be Windows-specific.

## Reproducing

Benchmark scripts and raw results are in this repository:

- `bench_agentbrowser.sh` — agent-browser benchmark
- `mcp_bench.js` — Playwright MCP and Chrome DevTools MCP benchmark
- `mcp_probe.js`, `mcp_schema.js` — MCP tool discovery helpers
- `results/` — raw per-task output and screenshots from the three code-driven tools
