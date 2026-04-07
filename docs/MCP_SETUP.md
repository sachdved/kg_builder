# MCP Setup Guide for AI Coding Assistants

Configure kg_builder as an MCP server for Cursor, Claude Code, or Windsurf.

---

## Quick Start (Cursor)

### Step 1: Install kg_builder

```bash
pip install -e ".[mcp]"
```

### Step 2: Configure Cursor

Open your Cursor settings and add kg_builder to the MCP servers:

**Via Settings UI:**
1. Open Settings (`,`) in Cursor
2. Go to **Extensions** > **MCP Servers**
3. Click **+ Add New Server**
4. Enter the configuration below

**Via JSON config file (~/.cursor/mcp.json):**

```json
{
  "mcpServers": {
    "kg-builder": {
      "type": "stdio",
      "command": "/full/path/to/python",
      "args": ["-m", "kg_builder.mcp_server"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

**Important:** Replace `/full/path/to/python` with your actual Python path:
```bash
which python
# e.g., /Users/you/.venv/kg_builder/bin/python or /usr/bin/python3
```

### Step 3: Verify Connection

1. Restart Cursor after adding the MCP server
2. Open a new chat and type: `What KG tools are available?`
3. The agent should respond with the list of kg_builder tools

If the tools don't appear, check:
- The Python path is correct and executable
- kg_builder is installed in that Python environment (`python -c "import kg_builder"`)
- The `.mcp.json` file is valid JSON (use a validator)

---

## Cursor-Specific Configuration

### Using Project-Specific MCP Config

Create a `.cursor/mcp.json` in your project root for project-specific settings:

```json
{
  "mcpServers": {
    "kg-builder": {
      "type": "stdio",
      "command": "python",
      "args": ["-m", "kg_builder.mcp_server", "/absolute/path/to/project"],
      "cwd": "."
    }
  }
}
```

### Using Cursor Rules

Add this to your `.cursorrules` file to remind the agent to use KG tools:

```
## Knowledge Graph Tools Available

This project has kg_builder MCP tools connected. Always query the knowledge graph before reading files or making changes:

1. Use `kg_find_entity("name")` to find classes/functions by name (instead of grep)
2. Use `kg_get_neighbors(entity_id)` to see relationships and dependencies
3. Use `kg_get_callers(entity_id)` to find what calls a function
4. Use `kg_extract_context(entity_id, max_hops=1)` to load code with neighbors
5. Use `kg_impact_analysis("name")` before modifying any entity
6. Use `kg_rebuild()` after file changes to refresh the graph

Query the KG first for faster, more precise edits.
```

### Troubleshooting Cursor Integration

**Issue: Tools not showing up in agent responses**
- Ensure you've restarted Cursor completely (not just reopened the window)
- Check the MCP server status in Settings > Extensions > MCP Servers
- Try typing `/mcp` in a chat to force tool discovery

**Issue: "kg_builder module not found"**
- The Python path in your config must point to the environment where kg_builder is installed
- Test with: `/full/path/to/python -c "import kg_builder; print('OK')"`

**Issue: Graph doesn't include recent changes**
- Call `kg_rebuild()` tool explicitly, or
- Configure auto-rebuild on save in Cursor settings

---

## Claude Code Setup

### Configure in `.claude/settings.json`

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

### Verify Connection

Run `/mcp list` in Claude Code to see available tools. You should see:
- kg_find_entity
- kg_get_neighbors
- kg_get_callers
- kg_extract_context
- kg_traverse
- kg_impact_analysis
- kg_understand_function
- kg_diff
- kg_generate_plan
- kg_resolve_import
- kg_rebuild
- kg_export

---

## Windsurf Setup

### Configure in `.windsurf/mcp.json`

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

Restart Windsurf after configuration.

---

## Available MCP Tools

| Tool | Description |
|------|-------------|
| `kg_find_entity(query, entity_type)` | Search for classes, functions, variables by name |
| `kg_get_neighbors(entity_id, direction)` | Get adjacent entities (incoming/outgoing/both) |
| `kg_get_callers(entity_id, max_depth)` | Find all code that calls a function/class |
| `kg_extract_context(entity_id, max_hops)` | Load source code for entity + neighbors |
| `kg_traverse(start_ids, max_hops)` | BFS traversal from starting entities |
| `kg_impact_analysis(entity_name, depth)` | Risk assessment for changing an entity |
| `kg_understand_function(function_name)` | Complete context: code, callers, dependencies |
| `kg_diff(existing_kg_path, proposed_kg_path)` | Compare two KG JSON files |
| `kg_generate_plan(change_spec_path, existing_kg_path)` | Generate edit plan from change spec |
| `kg_resolve_import(import_entity_id)` | Resolve imports to actual definitions |
| `kg_rebuild()` | Re-parse the codebase after file changes |
| `kg_export(output_path)` | Export current graph as JSON |

---

## Advanced Configuration

### Excluding Patterns

The MCP server excludes these patterns by default:
- `**/venv/*`
- `**/.venv/*`
- `**/node_modules/*`
- `**/__pycache__/*`

To customize exclusions, modify the `_ensure_kg()` function in `kg_builder/mcp_server.py`.

### Environment Variables

Set these for custom behavior:

```bash
export KG_BUILDER_CACHE_DIR=/path/to/cache  # Cache KG builds
export KG_BUILDER_VERBOSE=1                 # Enable debug logging
```

### Performance Tips

1. **Build once, reuse**: The MCP server caches the KG in memory across sessions
2. **Rebuild selectively**: Use `kg_rebuild()` only after significant changes
3. **Use max_hops wisely**: Start with `max_hops=1` for context extraction, increase if needed
4. **Filter entity types**: When searching, specify `entity_type="CLASS"` or `"FUNCTION"` to narrow results

---

## Testing Your Setup

### Test Script

Run this in your project to verify MCP connectivity:

```bash
python -c "
from kg_builder import build_knowledge_graph
kg = build_knowledge_graph('.', exclude_patterns=['**/venv/*'])
print(f'KG built: {len(kg.entities)} entities, {len(kg.relationships)} relationships')
"
```

### Interactive Test in Cursor

1. Open a Python file in your project
2. Ask Cursor: "Find the main entry point function and show me what it calls"
3. The agent should use `kg_find_entity` and `kg_get_neighbors` instead of reading files directly

---

## Common Issues

| Issue | Solution |
|-------|----------|
| ModuleNotFoundError | Verify Python path points to environment with kg_builder installed |
| Tools not appearing | Restart the IDE completely; check MCP server status |
| Empty graph results | Ensure you're serving a directory with Python files |
| Slow initial load | First build parses all files; subsequent queries are fast from cache |
| JSON parse error in config | Validate your .mcp.json at jsonlint.com |

---

## Next Steps

1. [Usage Guide](USAGE_GUIDE.md) — Learn effective workflows with kg_builder tools
2. [README.md](../README.md) — See benchmark results and architecture overview
3. [CLAUDE.md](../CLAUDE.md) — Full architecture reference for this codebase
