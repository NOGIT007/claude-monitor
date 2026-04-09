# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-04-09

### Added
- Project scaffold with Bun, React 19, Recharts, bun:sqlite
- SQLite database layer with sessions and token_usage tables
- Model pricing constants for Sonnet, Opus, and Haiku
- JSONL parser and ingestion pipeline
- File watcher with byte-offset tailing for live session tracking
- WebSocket handler for real-time session updates
- REST API endpoints: sessions, stats (today/week/month), history
- Bun.serve entry point with static file serving and SPA fallback
- React dashboard with Catppuccin Mocha theme
- Live session cards with token breakdown and cost display
- Usage statistics with period tabs (Today/Week/Month)
- Token history bar chart and breakdown progress bars
- Start/stop convenience scripts with PID management
- Single binary compilation via `bun build --compile`
