# Hando

Hando is a local-first handoff packet tool for AI coding agents.

It lets Codex, Claude Code, Gemini CLI, Cursor, and similar agents save a task handoff when a session is about to stop, then lets the next agent resume from the saved context.

## Quick Start

```bash
npm install
npm run build
npm run cli -- setup
npm run cli -- save "Implement setup token handoff" --summary "Current progress, next steps, risks, and code status..."
npm run cli -- resume "setup token handoff"
```

Start the stdio MCP server:

```bash
npm run cli -- serve
```

Hando stores task packets in `~/.hando/tasks/<task-id>/task.md`.
