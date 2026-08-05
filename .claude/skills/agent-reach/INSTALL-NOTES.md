# Agent Reach — install notes

Source: https://github.com/Panniantong/Agent-Reach (v1.5.0)

This directory is a vendored copy of the skill so it loads automatically in any
Claude Code session opened on this repo. The skill itself is only the routing
guide — it tells the agent *which* upstream tool to call. The tools have to be
installed separately.

## Installing the runtime (once per machine / environment)

```bash
pipx install https://github.com/Panniantong/agent-reach/archive/main.zip
agent-reach install --env=auto
agent-reach doctor
```

`agent-reach install` sets up the zero-config channels (Web via Jina Reader,
YouTube, GitHub, RSS, Exa search, V2EX, Bilibili basic). Everything else is
opt-in:

```bash
agent-reach install --channels=twitter,reddit,xiaohongshu   # pick what you need
agent-reach install --channels=all
```

## Updating

```bash
pipx upgrade agent-reach   # or reinstall from the archive URL
agent-reach skill --install
```

Then re-copy `~/.claude/skills/agent-reach/` over this directory and commit.

## Known limits in Claude Code web sessions

Remote sessions run behind an allowlist egress proxy. Only package registries,
GitHub, and Anthropic hosts are reachable, so the channels that call out to
x.com, youtube.com, r.jina.ai, mcp.exa.ai, etc. will fail with
`Tunnel connection failed: 403 Forbidden`. Exa also needs an interactive OAuth
browser approval, which a headless session cannot complete.

Run Agent Reach from a local Claude Code install (or an environment with open
network access) to actually use the channels.
