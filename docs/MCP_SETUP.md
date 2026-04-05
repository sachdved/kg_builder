# MCP Server Setup

kg_builder ships an MCP server that exposes 12 knowledge graph tools to any MCP-compatible coding agent. The agent can search entities, traverse relationships, extract code context, diff graphs, and generate edit plans — all as native tool calls.

## Install

```bash
pip install -e ".[mcp]"
```

## Configure

### Claude Code

Add to your project's `.claude/settings.json`:

```json
{
  "mcpServers": {
    "kg-builder": {
      "type": "stdio",
      "command": "python",
      "args": ["-m", "kg_builder.mcp_server"]
    }
  }
}
```

Or for a specific project directory:

```json
{
  "mcpServers": {
    "kg-builder": {
      "type": "stdio",
      "command": "python",
      "args": ["-m", "kg_builder.mcp_server", "/path/to/project"]
    }
  }
}
```

Restart Claude Code. The tools will appear in Claude's toolkit automatically.

### Cursor

Open Cursor Settings > MCP. Add a new server:

- **Name**: kg-builder
- **Type**: stdio
- **Command**: `python -m kg_builder.mcp_server`

Or edit `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "kg-builder": {
      "command": "python",
      "args": ["-m", "kg_builder.mcp_server"]
    }
  }
}
```

### Windsurf

Add to your Windsurf MCP configuration (Settings > MCP Servers):

```json
{
  "mcpServers": {
    "kg-builder": {
      "command": "python",
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

Or use the Python API in a custom OpenAI function-calling wrapper.

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

**Server doesn't start**: Make sure `pip install -e ".[mcp]"` was run in the right environment. The `mcp` package must be installed.

**Tools return errors about missing KG**: The KG is built on first tool call. If parsing fails, check that the codebase path contains Python files and isn't excluded by the default patterns (`**/venv/*`, `**/node_modules/*`).

**KG is stale after edits**: Call `kg_rebuild` to re-parse. The KG is cached in memory and doesn't auto-refresh when files change.

**Python path issues**: The MCP server runs in whatever Python environment the `command` points to. If you're using conda/venv, use the full path:

```json
{
  "mcpServers": {
    "kg-builder": {
      "type": "stdio",
      "command": "/path/to/conda/envs/kg_builder/bin/python",
      "args": ["-m", "kg_builder.mcp_server"]
    }
  }
}
```
