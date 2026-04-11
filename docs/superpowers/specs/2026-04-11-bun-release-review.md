# Bun Release Review: v1.3.10 - v1.3.12

**Date:** 2026-04-11
**Scope:** Evaluate the last 3 Bun releases for improvements applicable to claude-monitor
**Current bun-types:** ^1.2.9

---

## Release Summaries

### Bun v1.3.12 (April 10, 2026)

| Feature | Description |
|---------|-------------|
| `Bun.markdown.ansi()` | Render markdown as ANSI terminal output (`bun ./file.md`) |
| `Bun.WebView` | Headless browser automation using system WebKit — zero external deps |
| `Bun.cron()` in-process | In-process cron scheduler with hot-reload safety, `ref()`/`unref()` lifecycle |
| Async stack traces | Native async stack traces for errors in Bun.serve, timers, etc. |
| 2.3x faster `URLPattern` | Significant regex-backed URL matching speedup |
| 2x faster `Bun.Glob.scan` | Faster filesystem glob scanning |
| cgroup-aware parallelism | Respects container CPU limits on Linux |
| HTTPS proxy tunnel reuse | Reuses CONNECT tunnels for HTTPS-through-proxy |
| **120 bug fixes** | Addressing 219 upvoted issues |

### Bun v1.3.11 (March 18, 2026)

| Feature | Description |
|---------|-------------|
| `Bun.cron` OS-level | Register, parse, and remove OS-level cron jobs cross-platform |
| `Bun.sliceAnsi` | ANSI/grapheme-aware string slicing |
| `expect.extends()` asymmetric matchers | Asymmetric matcher support in custom test matchers |
| `bunx --version` | Version flag for bunx |
| 4 MB smaller on Linux | Leaner binary output |
| Cross-compilation fixes | More reliable standalone executable cross-compilation |
| JSX transpilation fixes | Correctness improvements for JSX |
| **105 bug fixes** | Addressing 307 upvoted issues |

### Bun v1.3.10 (February 26, 2026)

| Feature | Description |
|---------|-------------|
| Native REPL | Top-level await, ESM/require, syntax highlighting, tab completion |
| `--compile --target=browser` | Bundle into self-contained HTML with inlined JS/CSS/assets |
| TC39 ES decorators | Standard (non-legacy) decorator support |
| Windows ARM64 | Native + cross-compilation support |
| Barrel import optimization | Up to 2x faster bundling for barrel re-export files |
| `structuredClone` 25x faster | For arrays specifically |
| `Buffer.slice()` 1.8x faster | General buffer operation speedup |
| `path.parse()` 7x faster | Path parsing performance |
| JSC upgrade: 168x faster deep rope slicing | Internal string representation improvement |
| MCP server fix | `Bun.spawn()` no longer breaks Python asyncio-based MCP servers |
| **155 bug fixes** | Addressing 642 upvoted issues |

---

## Relevance to claude-monitor

### High Impact

#### 1. `Bun.cron()` in-process scheduler (v1.3.11 + v1.3.12)

claude-monitor is a long-running server. The in-process `Bun.cron()` could replace manual timer logic for:

- **Database maintenance** — periodic WAL checkpointing, vacuum, or old-session cleanup
- **Stats aggregation** — pre-compute expensive aggregations on a schedule
- **Data retention** — purge token_usage rows older than N days

Key benefits:
- `--hot` safe: jobs auto-clear on module reload (perfect for dev workflow)
- `ref()`/`unref()`: control whether the cron keeps the process alive
- Disposable: auto-stops at scope exit
- Error handling matches `setTimeout` semantics

```ts
// Example: hourly DB maintenance
const cleanup = Bun.cron("0 * * * *", () => {
  db.run("DELETE FROM token_usage WHERE timestamp < datetime('now', '-30 days')");
  db.run("PRAGMA wal_checkpoint(TRUNCATE)");
});
```

**Recommendation:** Adopt for scheduled DB maintenance tasks.

#### 2. `--compile --target=browser` (v1.3.10)

Could generate a portable, self-contained HTML export of the dashboard:

```bash
bun build --compile --target=browser src/client/main.tsx --outfile dashboard.html
```

This would inline all JS, CSS, and assets into a single `.html` file that works via `file://` — useful for sharing snapshots or offline viewing.

**Recommendation:** Consider as a new `bun run export` script for portable dashboard snapshots.

#### 3. 2x faster `Bun.Glob.scan` (v1.3.12)

The `watcher.ts` uses `readdirSync` with `recursive: true` to scan `~/.claude/projects/**/*.jsonl`. If refactored to use `Bun.Glob.scan`, the initial file discovery would be 2x faster.

```ts
// Current: manual recursive readdir
const entries = readdirSync(dir, { withFileTypes: true, recursive: true });
for (const entry of entries) {
  if (!entry.name.endsWith(".jsonl")) continue;
  // ...
}

// Potential: Bun.Glob.scan
const glob = new Bun.Glob("**/*.jsonl");
for await (const path of glob.scan(dir)) {
  // ...
}
```

**Recommendation:** Evaluate refactoring `scanExistingFiles()` in `watcher.ts`.

#### 4. Async stack traces (v1.3.12)

The server has multiple async handlers (`Bun.serve` fetch, OTEL handling, WebSocket). Async stack traces will significantly improve debugging by showing the full call chain across `await` boundaries.

**Recommendation:** Upgrade Bun to get this automatically — no code changes needed.

#### 5. cgroup-aware parallelism (v1.3.12)

When deployed in Docker/containers, Bun will now respect CPU limits set via cgroups instead of detecting all host CPUs. Important for containerized deployments.

**Recommendation:** Automatically beneficial after upgrade.

#### 6. Cross-compilation fixes (v1.3.11)

The `bun build --compile` step that produces the standalone `./claude-monitor` binary is more reliable, especially when cross-compiling for different platforms.

**Recommendation:** Enables more reliable CI/CD binary builds.

### Medium Impact

#### 7. `Bun.WebView` for E2E testing (v1.3.12)

Native headless browser automation could replace the need for Playwright/Puppeteer for E2E testing the dashboard:

```ts
import { test, expect } from "bun:test";

test("dashboard loads", async () => {
  const view = new Bun.WebView();
  await view.goto(`http://localhost:${server.port}`);
  const title = await view.title();
  expect(title).toBe("Claude Monitor");
  view.close();
});
```

Uses system WebKit with zero external dependencies — one browser subprocess shared per process.

**Recommendation:** Evaluate for future E2E test suite (currently only unit/integration tests exist).

#### 8. Performance improvements (v1.3.10)

- **`structuredClone` 25x faster** — relevant if cloning session/stats objects
- **`Buffer.slice()` 1.8x faster** — used in `watcher.ts:readNewBytes()` for JSONL chunk reading
- **`path.parse()` 7x faster** — used transitively via path operations throughout

**Recommendation:** Free performance gains after upgrade.

#### 9. `Bun.sliceAnsi` (v1.3.11)

Useful if adding CLI output features (progress bars, formatted tables). Not immediately needed but good to know about.

#### 10. Barrel import optimization (v1.3.10)

The `recharts` dependency uses barrel exports. The bundler optimization means `Bun.build()` at server startup will be faster since it only parses the recharts components actually imported.

**Recommendation:** Automatically beneficial for build performance.

#### 11. Asymmetric matcher support in `expect.extends()` (v1.3.11)

Better custom matcher support in `bun:test`. Useful if writing custom matchers for test assertions (e.g., `expect.toBeValidSession()`).

**Recommendation:** Nice to have for future test improvements.

### Low Impact (Informational)

| Feature | Why low impact |
|---------|---------------|
| `Bun.markdown.ansi()` | Could be used for CLI formatting but not core to dashboard |
| Native REPL | Dev convenience, no code change needed |
| TC39 decorators | No decorator patterns in current codebase |
| Windows ARM64 | Linux/macOS primary targets |
| 4 MB smaller binary | Minor deployment benefit |

---

## Recommended Actions

### Immediate (low effort, high value)

1. **Update `bun-types`** from `^1.2.9` to `^1.3.12` in `package.json`
2. **Update Bun runtime** to v1.3.12 to get async stack traces, faster Glob.scan, cgroup awareness, and performance gains
3. **Run full test suite** after upgrade to verify compatibility

### Short-term (moderate effort)

4. **Add `Bun.cron()` for DB maintenance** — hourly WAL checkpoint, daily old-data cleanup
5. **Refactor `scanExistingFiles()`** in `watcher.ts` to use `Bun.Glob.scan` for 2x faster startup
6. **Add `bun run export` script** using `--compile --target=browser` for portable dashboard HTML

### Future consideration

7. **Add E2E tests** using `Bun.WebView` for dashboard smoke testing
8. **Add custom test matchers** leveraging improved `expect.extends()`

---

## Sources

- [Bun v1.3.12 Blog](https://bun.com/blog/bun-v1.3.12)
- [Bun v1.3.11 Blog](https://bun.com/blog/bun-v1.3.11)
- [Bun v1.3.10 Blog](https://bun.com/blog/bun-v1.3.10)
- [Bun GitHub Releases](https://github.com/oven-sh/bun/releases)
- [Bun Cron Docs](https://bun.com/docs/runtime/cron)
