# MCP Server Setup

kg_builder ships an MCP server that exposes 12 knowledge graph tools to any MCP-compatible coding agent. The agent can search entities, traverse relationships, extract code context, diff graphs, and generate edit plans — all as native tool calls.

## Setup requires three things

1. **Install kg_builder** with the MCP dependency
2. **Configure the MCP server** in your project so the agent can connect to it
3. **Add a CLAUDE.md** telling the agent to use the KG tools (without this, the agent will ignore them and use grep/read instead)

## Step 1: Install

```bash
pip install -e "/path/to/kg_builder[mcp]"
```

**Important**: Use the full path to the Python binary in all MCP configs below. A bare `python` will use whatever's on your PATH, which may not have kg_builder installed. Find your path with:

```bash
which python
# e.g., /Users/you/miniforge3/envs/kg_builder/bin/python
```

## Step 2: Configure the MCP server

### Claude Code

Create `.mcp.json` in your **project root** (the directory you open Claude Code in):

```json
{
  "mcpServers": {
    "kg-builder": {
      "type": "stdio",
      "command": "/full/path/to/python",
      "args": ["-m", "kg_builder.mcp_server"]
    }
  }
}
```

Claude Code checks multiple locations for MCP config. If `.mcp.json` in the project root doesn't work, also create `.claude/mcp.json`:

```bash
mkdir -p .claude
cp .mcp.json .claude/mcp.json
```

After creating the config, **restart Claude Code** (exit and re-enter). Verify the server connected by running `/mcp` — you should see `kg-builder` listed with 12 tools.

### Cursor

Create `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "kg-builder": {
      "command": "/full/path/to/python",
      "args": ["-m", "kg_builder.mcp_server"]
    }
  }
}
```

Or add via Cursor Settings > MCP.

### Windsurf

Add to your Windsurf MCP configuration (Settings > MCP Servers):

```json
{
  "mcpServers": {
    "kg-builder": {
      "command": "/full/path/to/python",
      "args": ["-m", "kg_builder.mcp_server"]
    }
  }
}
```

### Codex (OpenAI)

Codex does not support MCP. Use the CLI tools directly:

```bash
kg_builder build . --output kg.json
kg_builder diff existing.json proposed.json --output changes.json
kg_builder plan changes.json --codebase .
```

## Step 3: Add a CLAUDE.md (required)

**This step is critical.** Even with the MCP server connected, the agent will default to its built-in tools (Grep, Read, Glob) for code exploration unless you tell it to use the KG tools instead.

Create a `CLAUDE.md` in your project root:

```markdown
# CLAUDE.md

## Knowledge Graph Tools

This project has a knowledge graph MCP server connected. The KG has
parsed every Python file in this repository into a graph of entities
(classes, functions, variables, imports) and their relationships
(calls, contains, inherits, imports).

**Use the KG tools instead of grep/read for code discovery:**

- `kg_find_entity("name")` — find classes/functions by name
- `kg_get_neighbors(entity_id)` — see what an entity calls/inherits/contains
- `kg_get_callers(entity_id)` — find what calls a given function
- `kg_extract_context(entity_id)` — load source code for an entity and neighbors
- `kg_impact_analysis("name")` — understand dependencies before modifying code
- `kg_understand_function("name")` — get full context for a function

**Before writing code, query the KG first** to understand which existing
classes, methods, and models you should use.
```

Adapt the content to your project — add notes about your project structure, which directories matter, etc.

### Why is CLAUDE.md necessary?

The agent has dozens of built-in tools it already trusts. MCP tools are new and unfamiliar. Without explicit instructions, the agent will choose what it knows (grep for "options" across 300 files) over what it doesn't (call `kg_find_entity("options")` and get a precise answer). The CLAUDE.md bridges this gap.

## Available Tools

Once connected, the agent has access to these tools:

| Tool | What it does |
|------|-------------|
| `kg_rebuild` | Parse the codebase and rebuild the knowledge graph |
| `kg_find_entity` | Search for classes, functions, variables by name |
| `kg_get_neighbors` | Get entities connected to a given entity |
| `kg_get_callers` | Find all code that calls a function |
| `kg_extract_context` | Load source code for an entity and its neighbors |
| `kg_traverse` | BFS traversal from starting entities |
| `kg_resolve_import` | Resolve an import to its actual definition |
| `kg_diff` | Compare two KG JSON files |
| `kg_generate_plan` | Generate an edit plan from a change spec |
| `kg_impact_analysis` | Assess risk of changing an entity |
| `kg_understand_function` | Get full context for a function (code, callers, dependencies) |
| `kg_export` | Export the current KG as JSON |

## How the Agent Uses These

The KG is built lazily on first tool call and cached in memory for the session. Call `kg_rebuild` to refresh after file changes.

### Typical agent workflow

1. **Before editing**: `kg_find_entity("UserService")` → `kg_impact_analysis("UserService")` → sees risk level and affected files
2. **Understanding context**: `kg_extract_context("auth.py::login", max_hops=1)` → loads the function and its direct dependencies
3. **Planning changes**: `kg_diff("existing.json", "proposed.json")` → `kg_generate_plan("change_spec.json")` → structured edit plan
4. **After editing**: `kg_rebuild()` to refresh the graph

### Example conversation

```
Human: Add email verification to the registration flow

Agent: Let me understand the current registration code.
[calls kg_find_entity("register")]
[calls kg_get_neighbors("auth.py::register_user", direction="outgoing")]
[calls kg_extract_context("auth.py::register_user", max_hops=1)]

Agent: I can see register_user calls User.create() and send_welcome_email().
I'll need to:
1. Add a verify_email() function in auth.py
2. Modify register_user to call verify_email
3. Add an EmailVerification model

[calls kg_impact_analysis("register_user")]
Risk: LOW (2 direct callers: routes.py::register_endpoint, tests/test_auth.py::test_register)

Shall I proceed with these changes?
```

## Verify the Server Works

```bash
# Test that the server starts and tools are available
python -c "
from kg_builder.mcp_server import mcp
tools = mcp._tool_manager._tools
print(f'{len(tools)} tools registered:')
for name in sorted(tools):
    print(f'  {name}')
"
```

## Troubleshooting

**Agent says "KG tools aren't available" or ignores them entirely**: Two possible causes:
1. The MCP server isn't connected. Run `/mcp` in Claude Code to check. If `kg-builder` isn't listed, the config file is in the wrong location or the Python path is wrong. Try all three locations: `.mcp.json` (project root), `.claude/mcp.json`, and `.claude/settings.json`.
2. The agent doesn't know it should use them. Add a `CLAUDE.md` (see Step 3 above). Without it, the agent will default to grep/read.

**Server doesn't start**: Make sure `pip install -e ".[mcp]"` was run in the right environment. The `mcp` package must be installed. Test manually:
```bash
/full/path/to/python -c "from kg_builder.mcp_server import mcp; print(f'{len(mcp._tool_manager._tools)} tools')"
```

**`/mcp` shows the server but tools aren't used**: The CLAUDE.md is missing or too vague. The agent needs explicit instructions like "Use kg_find_entity instead of grep for code discovery." See the template in Step 3.

**Tools return errors about missing KG**: The KG is built on first tool call. If parsing fails, check that the codebase path contains Python files and isn't excluded by the default patterns (`**/venv/*`, `**/node_modules/*`).

**KG is stale after edits**: Call `kg_rebuild` to re-parse. The KG is cached in memory and doesn't auto-refresh when files change.

**Python path issues**: The MCP server runs in whatever Python environment the `command` points to. A bare `python` may resolve to the wrong environment. Always use the full path:
```bash
# Find your path
which python  # or: conda run -n your_env which python
```
