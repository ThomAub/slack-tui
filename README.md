# slacktui

A Slack terminal UI with vim-first ergonomics. Built with Bun.

> **Status:** Phase 1 (Core Runtime) - CLI validation only

## Goals

- Fast, responsive terminal UX (keyboard-first, low overhead)
- Vim-style navigation everywhere (modes + consistent focus model)
- Works well with flaky networks (cache-first + graceful degradation)
- Real-time updates via Slack Socket Mode
- Single-file distribution for common platforms (Bun compile)

## Quick Start

```bash
# Install dependencies
bun install

# Create config file
bun run start init

# Edit config with your Slack tokens
# See "Configuration" below for required scopes
$EDITOR ~/.config/slacktui/config.toml

# Validate setup
bun run start doctor

# List channels
bun run start channels

# Show messages
bun run start messages '#general'
```

## CLI Commands (Phase 1)

```
slacktui init              Create default config file
slacktui doctor            Validate setup and connectivity
slacktui channels          List all channels
slacktui messages <id>     Show messages from a channel
slacktui users             List all users
```

Options:
- `--debug` - Enable debug logging
- `--json` - Output as JSON (for scripting)
- `-h, --help` - Show help
- `-v, --version` - Show version

## Configuration

Create a Slack App with these scopes:

**Bot Token Scopes:**
- `channels:history`, `channels:read`
- `groups:history`, `groups:read`
- `im:history`, `im:read`
- `mpim:history`, `mpim:read`
- `reactions:read`, `reactions:write`
- `chat:write`
- `users:read`

**App-Level Token Scope:**
- `connections:write` (for Socket Mode)

Add tokens to `~/.config/slacktui/config.toml`:

```toml
[auth]
app_token = "xapp-1-..."   # App-level token (Socket Mode)
bot_token = "xoxb-..."     # Bot token (Web API)
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  UI Frontend (Phase 2+)                                     │
│  • OpenTUI + SolidJS  OR  Ratatui                           │
│  • Renders views, ephemeral UI state                        │
└─────────────────────────┬───────────────────────────────────┘
                          │ Event Bus / Commands
┌─────────────────────────▼───────────────────────────────────┐
│  Core Runtime (headless) ✓ Phase 1 Complete                 │
│  • Slack transport (Socket Mode + Web API)                  │
│  • Rate limiting / retries / backoff                        │
│  • SQLite persistence + migrations                          │
│  • Command execution + event emission                       │
└─────────────────────────────────────────────────────────────┘
```

## Development

```bash
# Run in dev mode
bun run dev

# Type check
bun run typecheck

# Run tests
bun test

# Build single binary
bun run build
```

## Project Structure

```
src/
├── main.ts                 # CLI entry point
├── core/
│   ├── runtime.ts          # Core runtime (start/stop, event bus)
│   ├── types.ts            # Domain types
│   ├── slack/
│   │   ├── socket.ts       # Socket Mode transport
│   │   ├── web.ts          # Web API client
│   │   ├── rateLimit.ts    # Rate limiting
│   │   └── normalize.ts    # Event normalization
│   ├── store/
│   │   ├── db.ts           # SQLite connection
│   │   ├── schema.sql      # Database schema
│   │   ├── queries.ts      # Query functions
│   │   └── outbox.ts       # Offline queue
│   └── commands/
│       ├── index.ts        # Command dispatcher
│       └── handlers/       # Command handlers
└── utils/
    ├── config.ts           # Config loading
    ├── logger.ts           # Structured logging
    └── time.ts             # Time formatting
```

## License

See [LICENSE](LICENSE) file.
