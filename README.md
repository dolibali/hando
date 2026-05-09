# Hando

Hando is a local-first handoff packet tool for AI coding agents.

It lets Codex, Claude Code, Gemini CLI, Cursor, and similar agents save a task handoff when a session is about to stop, then lets the next agent resume from the saved context.

The npm package is `hando-ai`, and the CLI command is `hando`.

## Install

```bash
npm install -g hando-ai
hando setup
```

You can also run it without global install:

```bash
npx -y hando-ai --help
```

## CLI Usage

```bash
hando
hando save "Implement setup token handoff" --summary "Current progress, next steps, risks, and code status..."
hando resume "setup token handoff"
hando get <id>
hando done <id>
hando restore <id>
```

Hando stores task packets in:

```text
~/.hando/tasks/<task-id>/task.md
~/.hando/archive/<task-id>/task.md
```

## Codex MCP Config

Recommended config without global install:

```toml
[mcp_servers.hando]
command = "npx"
args = ["-y", "hando-ai", "serve"]
```

If you installed globally:

```toml
[mcp_servers.hando]
command = "hando"
args = ["serve"]
```

After updating the config, restart Codex. Hando exposes these MCP tools:

```text
save
resume
ls
get
archive
restore
```

## Local Development

```bash
npm install
npm run typecheck
npm test
npm run build
npm run cli -- --help
```
