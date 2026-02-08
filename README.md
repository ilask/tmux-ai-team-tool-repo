# tmux-ai-team-tool

A tiny CLI that makes **tmux-based “agent collaboration”** easier.

It’s designed for workflows like:

- Pane A: Claude Code (planner / reviewer)
- Pane B: Codex CLI (implementer)

…and it reduces the annoying parts (session setup, pane naming, sending prompts, capturing output, quick handoffs).

## Requirements

- **tmux** installed and available in `PATH`
- Python **3.9+**
- Any “agent CLI” commands you want to run (examples: `claude`, `codex`)

## Install

### Option A: editable install (recommended for hacking)

```bash
cd tmux-ai-team-tool
python3 -m pip install -e .
```

You’ll get the `aiteam` command.

### Option B: run without installing

```bash
./aiteam --help

(or: `PYTHONPATH=src python3 -m tmux_ai_team --help`)
```

## Quickstart


### 0) (Recommended) Single Claude pane, start Codex **from Claude**

If you prefer to run **only one Claude Code** and spin up Codex on-demand *from inside the Claude pane*:

1) Start tmux + Claude (however you like), e.g.:

```bash
tmux new -s myproj -c /path/to/project
claude
```

2) From the same pane (Claude), start **one or more** Codex instances in new panes:

```bash
aiteam codex --name main

# You can start multiple Codex panes...
aiteam codex --name tests
aiteam codex --name refactor
```

By default, `aiteam codex`:

- detects the current tmux session
- splits **from the current pane**
- titles the new pane like `codex#<id>:<name>`
- runs the `codex` command in the same working directory
- returns focus back to your Claude pane (`--focus stay`)

Each Codex pane gets a unique **id** and a human label (**name**) and is titled like:

`codex#<id>:<name>`

You can target a specific Codex pane later using the selector:

`codex:<id>`

Example:

```bash
aiteam send --session myproj --to codex:2 --text "Please implement the plan."
```

Useful options:

```bash
aiteam codex --layout horizontal   # split top/bottom
aiteam codex --focus new           # leave focus in the new Codex pane
aiteam codex --id 10 --name perf   # choose a specific id
aiteam codex --if-exists skip      # if that id already exists, do nothing
```

### 1) Spawn a session with Claude + Codex

```bash
aiteam spawn --session myproj --cwd /path/to/project \
  --agent claude=claude \
  --agent codex=codex \
  --attach
```

If you omit agents, it defaults to `claude` and `codex`.

### 2) Send a prompt to Claude

```bash
aiteam send --session myproj --to claude --text "Design a plan for adding OAuth login. End with [PLAN_COMPLETE]."
```

### 3) Handoff Claude’s last ~120 lines to Codex

```bash
aiteam handoff --session myproj --from claude --to codex:1 --lines 120 \
  --header "Plan from Claude:"
```

### 3.5) Agent-to-agent **push** (no copy/paste)

Run a relay that watches Claude’s pane and automatically pushes **marker blocks** to Codex:

```bash
aiteam relay --session myproj --from claude --to codex:1 --header "From Claude:" --verbose
```

Then tell the agent in the source pane (Claude) to output messages like:

```text
[PUSH]
Implement the plan above. Run tests. Summarize the diff.
[/PUSH]
```

Anything between `[PUSH]` and `[/PUSH]` will be pasted into the destination pane (Codex).

You can also run the opposite direction in another terminal:

```bash
aiteam relay --session myproj --from codex:1 --to claude --header "From Codex:" --verbose
```

Advanced: use `--pattern` to extract messages via regex instead of marker blocks.

### 4) Capture Codex output for review

```bash
aiteam capture --session myproj --from codex --lines 200

# If you have multiple Codex panes, target by id:
aiteam capture --session myproj --from codex:1 --lines 200
```

### 5) Kill the session

```bash
aiteam kill --session myproj
```

## Commands

- `spawn`  : create a tmux session, create panes, run agent commands, set pane titles
- `attach` : attach to the tmux session
- `send`   : paste text into a pane (supports multiline)
- `capture`: capture the last N lines from a pane
- `handoff`: capture from one pane and paste into another (no copy/paste)
- `relay`  : watch a pane for marker blocks/regex matches and push them into another pane
- `list`   : list tmux sessions (filtered)
- `kill`   : kill a tmux session
- `doctor` : sanity checks (tmux presence, version, etc.)

## Auto error-analyzer Codex

If an `aiteam` command fails with a tmux/control error (exit code 1) **and you're inside tmux**,
`aiteam` will *best-effort* start a dedicated Codex pane named like:

`codex#err1:error`

It will paste a structured prompt containing the error and environment details.

Disable this behavior with:

```bash
aiteam --no-error-codex ...

# or
export AITEAM_DISABLE_ERROR_CODEX=1
```

## Safety notes

This tool uses tmux to **type/paste** text into panes.  
If your agent CLIs execute commands based on what you paste, you are responsible for safe prompts and guardrails.

Consider:

- using Git branches/worktrees
- running in a sandbox directory
- requiring confirmation inside your agent prompts for destructive actions

## License

MIT
