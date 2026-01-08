# slacktui

> A Slack terminal UI with vim-first ergonomics. Primary UI: OpenTUI + SolidJS on Bun. Fallback UI: Ratatui.
> Core principle: **UI is a client of a headless runtime** (opencode-style separation).

-----


## 0. Product Principles

### Goals

- Fast, responsive terminal UX (keyboard-first, low overhead)
- Vim-style navigation everywhere (modes + consistent focus model)
- Works well with flaky networks (cache-first + graceful degradation)
- Real-time updates via Slack Socket Mode
- Single-file distribution for common platforms (Bun compile)

### Non-Goals (MVP)

- Multi-workspace
- Desktop notifications
- File upload
- Slash commands / workflows
- Marketplace distribution

### Success Criteria (MVP)

- "Cold start to usable UI" < 1s with warm cache (target)
- "Channel switch" feels instant (cached render immediately)
- Survives reconnects without UI lockups (Socket Mode backoff)
- Basic operations: browse, read, threads, react, send/edit/delete

-----

## 1. Architecture (opencode-inspired)

OpenCode uses a client/server split so multiple UIs can share one headless backend. We adopt the same **shape**, even if it runs in-process initially.

```
┌─────────────────────────────────────────────────────────────────┐
│                         slacktui                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    UI Frontend                          │   │
│  │  (OpenTUI + SolidJS  OR  Ratatui)                       │   │
│  │                                                         │   │
│  │  • Renders views (sidebar, messages, threads)           │   │
│  │  • Maintains ephemeral UI state (focus, mode, selection)│   │
│  │  • Subscribes to core runtime events                    │   │
│  │  • Dispatches commands to core                          │   │
│  └───────────────────────────┬─────────────────────────────┘   │
│                              │                                  │
│                    Event Bus │ Commands                         │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Core Runtime (headless)               │   │
│  │                                                         │   │
│  │  • Slack transport (Socket Mode + Web API)              │   │
│  │  • Rate limiting / retries / backoff                    │   │
│  │  • SQLite persistence + migrations                      │   │
│  │  • Domain model + query API                             │   │
│  │  • Command execution                                    │   │
│  │  • Event emission to UI                                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.1 Why This Split?

- Makes OpenTUI ↔ Ratatui swap realistic (UI adapters only)
- Makes testing easier (core can be tested without a terminal)
- Keeps Slack/network edge cases out of UI code
- Future: could expose core as local server for mobile/web clients

-----

## 2. Tech Stack

### 2.1 Primary (Bun + OpenTUI + SolidJS)

|Layer       |Choice                                      |
|------------|--------------------------------------------|
|Runtime     |Bun                                         |
|UI Framework|OpenTUI + SolidJS reconciler                |
|Storage     |SQLite (`bun:sqlite` or `better-sqlite3`)   |
|Config      |TOML (XDG-compliant)                        |
|Slack SDK   |`@slack/socket-mode` + `@slack/web-api`     |
|Packaging   |`bun build --compile` single-file executable|

**⚠️ Risk Note:** OpenTUI explicitly states it's "in development" and "not ready for production use." We mitigate with an isolation layer + decision gate (see §11).

### 2.2 Fallback (Rust + Ratatui)

|Layer        |Choice                         |
|-------------|-------------------------------|
|UI Framework |ratatui + crossterm            |
|Async Runtime|tokio                          |
|Storage      |rusqlite                       |
|Config       |toml + directories             |
|Slack        |slack-morphism or custom client|

App structure follows Ratatui conventions: `App` struct with main loop, separate `draw()` and `handle_event()` functions.

-----

## 3. Repository Layout

```
slacktui/
├── package.json
├── bun.lock
├── tsconfig.json
├── src/
│   ├── main.ts                     # CLI entry / wiring
│   │
│   ├── core/                       # ═══ HEADLESS RUNTIME ═══
│   │   ├── runtime.ts              # start(), stop(), event bus
│   │   ├── types.ts                # Domain types (Channel, Message, User, Reaction)
│   │   │
│   │   ├── slack/
│   │   │   ├── socket.ts           # Socket Mode transport + reconnect
│   │   │   ├── web.ts              # Web API client wrapper
│   │   │   ├── rateLimit.ts        # Per-method limiter + Retry-After
│   │   │   ├── normalize.ts        # Slack payload → domain events
│   │   │   └── types.ts            # Slack API types
│   │   │
│   │   ├── store/
│   │   │   ├── db.ts               # Connection + migrations
│   │   │   ├── schema.sql          # Table definitions
│   │   │   ├── queries.ts          # Typed query functions for UI
│   │   │   ├── writeModel.ts       # Apply domain events → DB
│   │   │   └── outbox.ts           # Offline action queue
│   │   │
│   │   └── commands/
│   │       ├── index.ts            # execute(command) dispatcher
│   │       ├── types.ts            # Command type definitions
│   │       └── handlers/           # Individual command handlers
│   │
│   ├── ui-opentui/                 # ═══ PRIMARY UI ═══
│   │   ├── app.tsx                 # Root component
│   │   ├── adapter.ts              # UI primitive abstraction layer
│   │   ├── views/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── MessageList.tsx
│   │   │   ├── ThreadView.tsx
│   │   │   ├── MessageInput.tsx
│   │   │   └── StatusBar.tsx
│   │   ├── components/
│   │   │   ├── Message.tsx
│   │   │   ├── Reaction.tsx
│   │   │   ├── ChannelItem.tsx
│   │   │   └── EmojiPicker.tsx
│   │   ├── keymap/
│   │   │   ├── index.ts            # Keymap manager
│   │   │   ├── intents.ts          # UI intent types
│   │   │   └── bindings.ts         # Default keybindings
│   │   └── state/
│   │       └── ui.ts               # Ephemeral UI state (focus, mode)
│   │
│   ├── ui-ratatui/                 # ═══ FALLBACK UI (later) ═══
│   │   └── ...
│   │
│   └── utils/
│       ├── mrkdwn.ts               # Slack mrkdwn → terminal
│       ├── time.ts                 # Relative timestamps
│       └── logger.ts               # Structured logging
│
├── config/
│   └── default.toml                # Default configuration
│
└── scripts/
    ├── build.ts                    # Production build
    └── doctor.ts                   # Validate setup
```

-----

## 4. OpenTUI + SolidJS Implementation Notes

### 4.1 UI Adapter Layer (Required)

Create a thin abstraction so OpenTUI specifics don't leak everywhere:

```typescript
// src/ui-opentui/adapter.ts
export interface UiAdapter {
  List: Component<ListProps>;
  Pane: Component<PaneProps>;
  Input: Component<InputProps>;
  Text: Component<TextProps>;
  Modal: Component<ModalProps>;
}

// Actual OpenTUI implementation
export const opentuiAdapter: UiAdapter = {
  List: OpenTuiList,
  Pane: OpenTuiPane,
  // ...
};
```

### 4.2 Keybinding → Intent Pattern

All keybindings dispatch high-level "intents" rather than executing logic directly:

```typescript
// Intents (pure data)
type UiIntent =
  | { type: 'FocusSidebar' }
  | { type: 'FocusMessages' }
  | { type: 'OpenThread'; parentTs: string }
  | { type: 'SelectNext' }
  | { type: 'SelectPrev' }
  | { type: 'EnterInsertMode' }
  | { type: 'ExecuteCommand'; command: Command };

// Keymap returns intents
const normalModeKeymap: Record<string, UiIntent> = {
  'h': { type: 'FocusSidebar' },
  'l': { type: 'FocusMessages' },
  'j': { type: 'SelectNext' },
  'k': { type: 'SelectPrev' },
  'i': { type: 'EnterInsertMode' },
  // ...
};
```

### 4.3 Testability

OpenTUI's Solid integration includes `testRender()` for testing without a real terminal:

```typescript
import { testRender } from '@opentui/solid/test';

test('sidebar shows channels', () => {
  const { getByText } = testRender(() => <Sidebar channels={mockChannels} />);
  expect(getByText('#general')).toBeDefined();
});
```

-----

## 5. Slack Integration

### 5.1 Authentication (MVP)

User provides tokens via config file:

```toml
# ~/.config/slacktui/config.toml
[auth]
# App-level token for Socket Mode (requires connections:write scope)
app_token = "xapp-1-A0123456789-..."

# Bot token for Web API
bot_token = "xoxb-..."

# Optional: User token for user-context actions
# user_token = "xoxp-..."
```

**Required Slack App Scopes:**

```yaml
# Bot Token Scopes
- channels:history
- channels:read
- groups:history
- groups:read
- im:history
- im:read
- mpim:history
- mpim:read
- reactions:read
- reactions:write
- chat:write
- users:read

# App-Level Token Scope
- connections:write
```

### 5.2 Socket Mode (Real-time)

Socket Mode uses WebSocket, avoiding public HTTP endpoints.

**Implementation Rules:**

1. **ACK fast** — Always acknowledge before heavy processing
1. **Reconnect with backoff** — Exponential backoff + jitter on disconnect
1. **De-duplicate events** — Track envelope IDs to prevent double-processing
1. **Handle `disconnect` messages** — Slack requests reconnection periodically

```typescript
// src/core/slack/socket.ts
class SocketModeTransport {
  private client: SocketModeClient;
  private seenEnvelopes = new Set<string>();

  async connect() {
    this.client = new SocketModeClient({
      appToken: config.auth.appToken,
      clientOptions: {
        slackApiUrl: 'https://slack.com/api/',
      },
    });

    this.client.on('message', this.handleMessage.bind(this));
    this.client.on('disconnect', this.handleDisconnect.bind(this));

    await this.client.start();
  }

  private async handleMessage(event: SocketModeEvent) {
    // ACK immediately
    if (event.envelope_id) {
      await this.client.ack(event.envelope_id);
    }

    // Dedupe
    if (this.seenEnvelopes.has(event.envelope_id)) return;
    this.seenEnvelopes.add(event.envelope_id);

    // Normalize and emit
    const domainEvent = normalize(event);
    this.eventBus.emit(domainEvent);
  }
}
```

### 5.3 Web API Rate Limiting

Slack rate limits are **per method, per workspace**, with tiered per-minute windows.

**Implementation:**

```typescript
// src/core/slack/rateLimit.ts
class RateLimiter {
  private buckets = new Map<string, TokenBucket>();

  // Tier 1: ~1 req/sec, Tier 2: ~20 req/min, etc.
  private readonly tierLimits: Record<string, number> = {
    'conversations.history': 50,  // Tier 3
    'conversations.list': 20,     // Tier 2
    'chat.postMessage': 1,        // Tier 1 (special)
    'reactions.add': 50,          // Tier 3
    // ...
  };

  async acquire(method: string): Promise<void> {
    const bucket = this.getOrCreateBucket(method);
    await bucket.acquire();
  }

  handleRateLimit(method: string, retryAfter: number) {
    // Pause bucket for retryAfter seconds
    this.buckets.get(method)?.pause(retryAfter);
  }
}
```

**Priority Rules:**

1. Interactive actions (send/edit/react) > background sync
1. On 429: respect `Retry-After` header, retry with backoff
1. Max 4 parallel Web API calls (configurable)

-----

## 6. Data Model & Persistence

### 6.1 SQLite Schema

```sql
-- Future-proofing for multi-workspace
CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    team_id TEXT UNIQUE NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Channels (public, private, DMs, group DMs)
CREATE TABLE channels (
    id TEXT PRIMARY KEY,              -- C0123456789
    workspace_id TEXT NOT NULL,
    name TEXT,                        -- null for DMs
    type TEXT NOT NULL,               -- public_channel | private_channel | im | mpim
    is_member INTEGER DEFAULT 1,
    is_archived INTEGER DEFAULT 0,
    last_read_ts TEXT,                -- Timestamp of last read
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

-- Users
CREATE TABLE users (
    id TEXT PRIMARY KEY,              -- U0123456789
    workspace_id TEXT NOT NULL,
    username TEXT,
    display_name TEXT,
    real_name TEXT,
    avatar_hash TEXT,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

-- Messages
CREATE TABLE messages (
    channel_id TEXT NOT NULL,
    ts TEXT NOT NULL,                 -- Slack timestamp (unique per channel)
    user_id TEXT,
    text TEXT,
    thread_ts TEXT,                   -- Parent message ts (if reply)
    reply_count INTEGER DEFAULT 0,
    is_edited INTEGER DEFAULT 0,
    is_deleted INTEGER DEFAULT 0,
    raw_json TEXT,                    -- Full payload for edge cases
    cached_at INTEGER NOT NULL,
    PRIMARY KEY (channel_id, ts),
    FOREIGN KEY (channel_id) REFERENCES channels(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Reactions (normalized for querying)
CREATE TABLE reactions (
    channel_id TEXT NOT NULL,
    message_ts TEXT NOT NULL,
    emoji TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (channel_id, message_ts, emoji, user_id),
    FOREIGN KEY (channel_id, message_ts) REFERENCES messages(channel_id, ts),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Offline action queue
CREATE TABLE outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    command_type TEXT NOT NULL,       -- SendMessage | AddReaction | ...
    payload TEXT NOT NULL,            -- JSON
    status TEXT DEFAULT 'pending',    -- pending | in_flight | failed
    attempts INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_attempt_at INTEGER
);

-- Indexes
CREATE INDEX idx_messages_channel_ts ON messages(channel_id, ts DESC);
CREATE INDEX idx_messages_thread ON messages(channel_id, thread_ts) WHERE thread_ts IS NOT NULL;
CREATE INDEX idx_reactions_message ON reactions(channel_id, message_ts);
CREATE INDEX idx_outbox_status ON outbox(status) WHERE status = 'pending';
```

### 6.2 Cache & Sync Strategy

**Startup:**

1. Open DB, run migrations
1. Load cached channel list + last selected channel
1. Start Socket Mode connection in background
1. UI renders immediately from cache

**Opening a Channel:**

1. Query SQLite for cached messages (instant)
1. Render cached messages immediately
1. If stale (>5 min) or empty, fetch latest page from API
1. Merge API results into cache, update UI

**Real-time:**

1. Socket Mode event received
1. Normalize → apply to SQLite
1. Emit event to UI via event bus
1. UI re-renders affected views

**Retention:**

- Configurable cleanup job (default: 30 days)
- Cleanup runs on startup + daily

### 6.3 Offline Mode

**Connection States:**

|State     |Socket     |API   |Behavior                     |
|----------|-----------|------|-----------------------------|
|`ONLINE`  |✅ Connected|✅ OK  |Normal operation             |
|`DEGRADED`|❌ Down     |✅ OK  |Show warning, use API polling|
|`OFFLINE` |❌ Down     |❌ Down|Show cache, queue outgoing   |

**Outbox Queue:**

- Persisted to SQLite (survives restart)
- Retry with exponential backoff when back online
- UI shows pending indicator on queued messages

-----

## 7. UI / UX Specification

### 7.1 Layout (2-Pane)

```
┌──────────────────┬──────────────────────────────────────────────┐
│ # general        │ alice [10:32 AM]                             │
│ # random         │ Hey team, quick update on the project        │
│ # engineering    │   ├─ bob [10:33 AM]: Sounds good!            │
│                  │   └─ [+2 more replies]                       │
│ Direct Messages  │                                              │
│ ● bob            │ charlie [10:45 AM]                           │
│   charlie        │ Anyone seen the new designs?                 │
│                  │   👍 2  🎉 1                                 │
│                  │                                              │
│                  │ you [10:50 AM]                               │
│                  │ Just pushed the fix to staging               │
├──────────────────┼──────────────────────────────────────────────┤
│ [NORMAL] #general│ > _                                          │
└──────────────────┴──────────────────────────────────────────────┘
```

### 7.2 Focus & Modes

**Single Source of Truth:**

```typescript
interface UiState {
  mode: 'NORMAL' | 'INSERT' | 'COMMAND';
  focus: 'SIDEBAR' | 'MESSAGES' | 'THREAD' | 'INPUT' | 'MODAL';
  sidebar: {
    selectedIndex: number;
    scrollOffset: number;
  };
  messages: {
    selectedTs: string | null;
    scrollOffset: number;
  };
  thread: {
    parentTs: string | null;
    selectedTs: string | null;
  };
  commandBuffer: string;  // For ':' commands
}
```

### 7.3 Thread Model

**Inline Expansion (≤3 replies):**

```
alice [10:32 AM]
Hey team, quick update
  ├─ bob [10:33 AM]: Sounds good!
  ├─ charlie [10:34 AM]: +1
  └─ alice [10:35 AM]: Thanks!
```

**Collapsed Preview (>3 replies):**

```
alice [10:32 AM]
Hey team, quick update
  └─ [12 replies] Last: bob 5m ago  [Enter to expand]
```

**Focused Thread View:**

- Replaces message pane temporarily
- Shows full thread with parent context
- `Esc` or `q` to return to channel

### 7.4 Slack mrkdwn Rendering (MVP)

|Slack Syntax |Terminal Output                    |
|-------------|-----------------------------------|
|`*bold*`     |**bold** (ANSI bold)               |
|`_italic_`   |*italic* (ANSI italic)             |
|`~strike~`   |~strikethrough~                    |
|``code``     |`monospace` (different color)      |
|````block````|Indented block, dim                |
|`<@U123>`    |@displayname (lookup from DB)      |
|`<#C123>`    |#channel-name (lookup from DB)     |
|`<url|text>` |text (underlined)                  |
|`:emoji:`    |Unicode emoji or `:emoji:` fallback|

-----

## 8. Commands & Keybindings

### 8.1 Command System

All user actions go through a typed command dispatcher:

```typescript
// src/core/commands/types.ts
type Command =
  | { type: 'SwitchChannel'; channelId: string }
  | { type: 'OpenThread'; channelId: string; parentTs: string }
  | { type: 'SendMessage'; channelId: string; text: string; threadTs?: string }
  | { type: 'AddReaction'; channelId: string; ts: string; emoji: string }
  | { type: 'RemoveReaction'; channelId: string; ts: string; emoji: string }
  | { type: 'EditMessage'; channelId: string; ts: string; text: string }
  | { type: 'DeleteMessage'; channelId: string; ts: string }
  | { type: 'MarkRead'; channelId: string; ts: string }
  | { type: 'Refresh' }
  | { type: 'Reconnect' };

// src/core/commands/index.ts
async function execute(cmd: Command): Promise<CommandResult> {
  switch (cmd.type) {
    case 'SendMessage':
      return handlers.sendMessage(cmd);
    // ...
  }
}
```

### 8.2 Default Keybindings

**Normal Mode:**

|Key      |Intent            |Description                 |
|---------|------------------|----------------------------|
|`j` / `↓`|`SelectNext`      |Move down                   |
|`k` / `↑`|`SelectPrev`      |Move up                     |
|`h` / `←`|`FocusSidebar`    |Focus sidebar               |
|`l` / `→`|`FocusMessages`   |Focus messages              |
|`gg`     |`GoToTop`         |Go to oldest                |
|`G`      |`GoToBottom`      |Go to newest                |
|`Enter`  |`Select`          |Open channel / expand thread|
|`Esc`    |`Back`            |Close thread / cancel       |
|`i`      |`EnterInsertMode` |Start composing             |
|`r`      |`Reply`           |Reply in thread             |
|`e`      |`Edit`            |Edit last own message       |
|`d`      |`Delete`          |Delete (with confirm)       |
|`a`      |`AddReaction`     |Open emoji picker           |
|`/`      |`Search`          |Search in channel           |
|`:`      |`EnterCommandMode`|Command mode                |
|`q`      |`Quit`            |Exit                        |
|`Ctrl+r` |`Refresh`         |Force refresh               |
|`zo`     |`ExpandThread`    |Expand thread under cursor  |
|`zc`     |`CollapseThread`  |Collapse thread             |
|`za`     |`ToggleThread`    |Toggle expand/collapse      |

**Insert Mode:**

|Key          |Intent          |Description                 |
|-------------|----------------|----------------------------|
|`Esc`        |`ExitInsertMode`|Return to normal            |
|`Enter`      |`SendMessage`   |Send message                |
|`Shift+Enter`|`InsertNewline` |Add newline                 |
|`Ctrl+c`     |`Cancel`        |Cancel message              |
|`↑`          |`EditPrevious`  |Edit last message (if empty)|

**Command Mode:**

|Command          |Action               |
|-----------------|---------------------|
|`:q`             |Quit                 |
|`:channel <n>`   |Switch channel       |
|`:dm <user>`     |Open DM              |
|`:search <query>`|Search messages      |
|`:mark-read`     |Mark channel read    |
|`:refresh`       |Force API refresh    |
|`:reconnect`     |Reconnect Socket Mode|
|`:help`          |Show keybindings     |

-----

## 9. Configuration

### 9.1 File Locations (XDG)

```
~/.config/slacktui/config.toml    # User config
~/.local/share/slacktui/cache.db  # SQLite database
~/.local/share/slacktui/logs/     # Log files
~/.cache/slacktui/                # Temporary files
```

### 9.2 Config File

```toml
# ~/.config/slacktui/config.toml

[auth]
app_token = ""    # xapp-... (Socket Mode)
bot_token = ""    # xoxb-... (Web API)

[ui]
theme = "default"                 # default | minimal | high-contrast
sidebar_width = 20
relative_time = true              # "5m ago" vs "10:32 AM"
thread_collapse_threshold = 3     # Inline expand if ≤ this
preview_length = 50               # Sidebar message preview

[cache]
retention_days = 30
max_messages_per_channel = 1000
stale_threshold_seconds = 300     # Fetch from API if older

[network]
max_inflight_requests = 4         # Parallel Web API calls
reconnect_base_delay_ms = 1000    # Backoff base
reconnect_max_delay_ms = 30000    # Backoff cap

[logging]
level = "info"                    # debug | info | warn | error
file = "~/.local/share/slacktui/logs/slacktui.log"

[keybindings]
# Override defaults
# quit = "Ctrl+q"
# send_message = "Ctrl+Enter"

[behavior]
auto_mark_read = true
confirm_delete = true
send_typing = false
```

-----

## 10. Build & Distribution

### 10.1 Development

```bash
# Install dependencies
bun install

# Run in dev mode (hot reload)
bun run dev

# Type check
bun run typecheck

# Lint
bun run lint

# Test
bun test
```

### 10.2 Production Build

```bash
# Compile to single binary (current platform)
bun build ./src/main.ts --compile --outfile slacktui

# Cross-compile targets
bun build ./src/main.ts --compile --target=bun-linux-x64 --outfile slacktui-linux-x64
bun build ./src/main.ts --compile --target=bun-linux-arm64 --outfile slacktui-linux-arm64
bun build ./src/main.ts --compile --target=bun-darwin-x64 --outfile slacktui-darwin-x64
bun build ./src/main.ts --compile --target=bun-darwin-arm64 --outfile slacktui-darwin-arm64
```

### 10.3 Deliverables

- `slacktui-{platform}` binaries
- SHA256 checksums
- Release notes

### 10.4 Doctor Command

```bash
slacktui doctor

# Output:
# ✓ Config file found
# ✓ Auth tokens present
# ✓ Bot token valid (workspace: MyCompany)
# ✓ App token valid (Socket Mode enabled)
# ✓ Database initialized (v3)
# ✓ Terminal: kitty (true color, images supported)
# ✗ Socket Mode: disconnected (will retry)
```

-----

## 11. OpenTUI Risk Gate

Because OpenTUI is explicitly "not ready for production use," we define a formal decision checkpoint.

### 11.1 Gate Criteria (End of Phase 2)

|Criterion       |Threshold                           |
|----------------|------------------------------------|
|Input handling  |Kitty/modifyOtherKeys works reliably|
|Render stability|No corruption in 2h session         |
|Resource usage  |<100MB RAM, <5% CPU when idle       |
|Focus model     |Consistent focus tracking           |

### 11.2 Evaluation Process

1. Build minimal UI (Phase 2)
1. Run smoke tests on macOS + Linux terminals
1. 2-hour soak test with busy channel
1. Document issues found

### 11.3 Fallback Plan

If gate **fails**:

- Core runtime remains unchanged
- UI adapter layer is reimplemented on Ratatui
- Timeline impact: +2-3 weeks

-----

## 12. Development Phases

### Phase 1: Core Runtime (Weeks 1-2)

- [ ] Project setup (Bun, TypeScript, ESLint)
- [ ] SQLite schema + migrations
- [ ] Socket Mode connection + event normalization
- [ ] Web API client + rate limiter
- [ ] Domain model + query API
- [ ] Command dispatcher (skeleton)
- [ ] Minimal CLI for validation (`slacktui channels`, `slacktui messages #general`)

### Phase 2: OpenTUI UI Skeleton (Weeks 2-4)

- [ ] OpenTUI + SolidJS setup
- [ ] UI adapter layer
- [ ] Layout (2-pane + status bar)
- [ ] Focus + mode state machine
- [ ] Sidebar (channel list from core queries)
- [ ] Message list (read-only)
- [ ] Live updates via event bus
- [ ] **OpenTUI gate evaluation**

### Phase 3: Interactions (Weeks 4-6)

- [ ] Send message + input handling
- [ ] Edit / delete own messages
- [ ] Reactions (view + add)
- [ ] Thread view (inline + focused)
- [ ] Emoji picker
- [ ] mrkdwn rendering
- [ ] Keybinding configuration

### Phase 4: Polish & Packaging (Weeks 6-8)

- [ ] Offline mode + outbox queue
- [ ] Reconnection handling
- [ ] Error states + user feedback
- [ ] `--compile` builds for all targets
- [ ] `doctor` command
- [ ] Documentation
- [ ] Release automation

-----

## 13. Open Questions

|#|Question                     |Current Thinking                                            |
|-|-----------------------------|------------------------------------------------------------|
|1|Emoji picker UX              |FZF-style modal with fuzzy search, recent emojis pinned     |
|2|Link handling                |`Enter` opens in browser, `y` yanks to clipboard            |
|3|Unread indicators            |Bold + count `# general (3)`                                |
|4|Terminal capability detection|Auto-detect (kitty, iTerm2), fall back gracefully           |
|5|Large workspaces             |Pagination + "joined channels only" filter                  |
|6|Image previews               |Phase 2+: kitty image protocol if detected, else placeholder|

-----

## References

- [OpenTUI](https://github.com/anomalyco/opentui) - TUI framework
- [opencode](https://github.com/anomalyco/opencode) - Architecture reference
- [slack-tui (Go)](https://github.com/espcaa/slack-tui) - UX reference
- [Ratatui](https://github.com/ratatui/ratatui) - Fallback TUI framework
- [Slack Socket Mode](https://api.slack.com/apis/socket-mode) - Real-time API
- [@slack/socket-mode](https://www.npmjs.com/package/@slack/socket-mode) - Node.js SDK
- [Slack Web API Rate Limits](https://api.slack.com/docs/rate-limits)
- [Bun Single-File Executables](https://bun.sh/docs/bundler/executables)
