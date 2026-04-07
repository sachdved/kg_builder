# MCP Server Setup for kg_builder

This guide explains how to configure the MCP (Model Context Protocol) server for `kg_builder` to work with Claude Code and other IDEs.

## Overview

The `kg_builder` MCP server exposes 13 tools that allow LLM agents to:
- Query and explore Python knowledge graphs
- Find entities, callers, and relationships
- Extract code context from knowledge graphs
- Diff knowledge graphs and generate edit plans
- Perform impact analysis

Three configuration files are involved in the setup process.

---

## Configuration Files

### 1. `.mcp.json` (Global/User-Level)

**Location:** `~/.claude/mcp.json` (home directory)

**Purpose:** Global MCP server configuration that applies to all projects when using Claude Code.

**Content:**
```json
{
  "mcpServers": {
    "kg-builder": {
      "type": "stdio",
      "command": "/path/to/python",
      "args": ["-m", "kg_builder.mcp_server"]
    }
  }
}
```

**When to use:** 
- You want kg_builder tools available across all your projects
- You have a stable Python environment with kg_builder installed globally or in a conda/virtualenv

**Example:**
```json
{
  "mcpServers": {
    "kg-builder": {
      "type": "stdio",
      "command": "/home/user/miniconda3/envs/kg_codebase/bin/python",
      "args": ["-m", "kg_builder.mcp_server"]
    }
  }
}
```

---

### 2. `.claude/mcp.json` (Project-Level)

**Location:** `<project-root>/.claude/mcp.json`

**Purpose:** Project-specific MCP configuration that overrides or supplements the global config for a specific repository.

**Content:**
```json
{
  "mcpServers": {
    "kg-builder": {
      "type": "stdio",
      "command": "/path/to/python",
      "args": ["-m", "kg_builder.mcp_server"]
    }
  }
}
```

**When to use:**
- You want kg_builder tools available only for specific projects
- Different projects use different Python environments
- You're working on the kg_builder codebase itself and need to test changes

**Example:**
```json
{
  "mcpServers": {
    "kg-builder": {
      "type": "stdio",
      "command": "/home/user/miniconda3/envs/kg_codebase/bin/python",
      "args": ["-m", "kg_builder.mcp_server"]
    }
  }
}
```

---

### 3. `settings.json` (Claude Code Settings)

**Location:** `<project-root>/.claude/settings.json` or `~/.claude/settings.json`

**Purpose:** Configures Claude Code behavior, including hooks and tool preferences. The MCP server configuration itself goes in `mcp.json`, but settings.json can control when/how tools are used.

**Content (for hook-based behaviors):**
```json
{
  "hooks": {
    "sessionStart": [
      {
        "command": "python -m kg_builder.mcp_server --check",
        "mode": "background"
      }
    ]
  },
  "toolPreferences": {
    "mcpToolPriority": ["kg_find_entity", "kg_get_neighbors", "kg_extract_context"]
  }
}
```

**Note:** The primary MCP server configuration belongs in `mcp.json`, not `settings.json`. Use `settings.json` only for:
- Hook configurations (automated behaviors)
- Tool preferences
- Other Claude Code settings

---

## Setup Instructions

### Option A: Global Setup (Recommended for Most Users)

1. **Install kg_builder:**
   ```bash
   cd /path/to/kg_builder
   pip install -e .
   ```

2. **Find your Python interpreter path:**
   ```bash
   which python
   # or for conda environments:
   which python3
   ```

3. **Create/edit `~/.claude/mcp.json`:**
   ```bash
   mkdir -p ~/.claude
   cat > ~/.claude/mcp.json << 'EOF'
   {
     "mcpServers": {
       "kg-builder": {
         "type": "stdio",
         "command": "/path/to/your/python",
         "args": ["-m", "kg_builder.mcp_server"]
       }
     }
   }
   EOF
   ```

4. **Restart Claude Code** to load the new configuration.

---

### Option B: Project-Level Setup

1. **Create `.claude` directory in project root:**
   ```bash
   mkdir -p .claude
   ```

2. **Create `.claude/mcp.json`:**
   ```bash
   cat > .claude/mcp.json << 'EOF'
   {
     "mcpServers": {
       "kg-builder": {
         "type": "stdio",
         "command": "/path/to/your/python",
         "args": ["-m", "kg_builder.mcp_server"]
       }
     }
   }
   EOF
   ```

3. **Restart Claude Code** in that project.

---

### Option C: Using Relative Paths (for Portability)

If you want the configuration to work across different machines:

```json
{
  "mcpServers": {
    "kg-builder": {
      "type": "stdio",
      "command": "python3",
      "args": ["-m", "kg_builder.mcp_server"],
      "cwd": "${workspaceFolder}"
    }
  }
}
```

**Note:** The `${workspaceFolder}` variable may not be supported in all MCP clients. Test to ensure it works with your setup.

---

## Available Tools

Once configured, these tools are available in Claude Code conversations:

| Tool | Purpose |
|------|---------|
| `kg_find_entity(query, entity_type)` | Search entities by name |
| `kg_get_neighbors(entity_id, direction)` | Get adjacent entities |
| `kg_get_callers(entity_id, max_depth)` | Find what calls a function |
| `kg_extract_context(entity_id, max_hops)` | Load code with context |
| `kg_traverse(start_ids, max_hops)` | BFS traversal |
| `kg_resolve_import(import_entity_id)` | Resolve cross-file imports |
| `kg_diff(existing_kg_path, proposed_kg_path)` | Compare two KGs |
| `kg_generate_plan(change_spec_path)` | Generate edit plan |
| `kg_impact_analysis(entity_name, depth)` | Risk assessment |
| `kg_understand_function(name)` | Full function context |
| `kg_rebuild()` | Refresh cached KG |
| `kg_export(output_path)` | Export KG to JSON |

---

## Troubleshooting

### Tools not appearing in Claude Code

1. **Check MCP configuration syntax:**
   ```bash
   cat ~/.claude/mcp.json | python -m json.tool
   ```

2. **Verify kg_builder is installed:**
   ```bash
   python -c "import kg_builder; print(kg_builder.__file__)"
   ```

3. **Test MCP server directly:**
   ```bash
   python -m kg_builder.mcp_server
   ```

4. **Check Python path in config matches your environment:**
   ```bash
   /path/to/python -c "import kg_builder"
   ```

### Server won't start

- Ensure the Python interpreter path is absolute (not `~` or `$HOME`)
- Check that kg_builder is installed in that specific Python environment
- Verify the `.claude` directory has correct permissions

### Conda Environment Setup

If using conda:

```bash
# Create environment
conda create -n kg_codebase python=3.11
conda activate kg_codebase

# Install kg_builder
cd /path/to/kg_builder
pip install -e .

# Get the full path to Python
which python
# Output: /home/user/miniconda3/envs/kg_codebase/bin/python

# Use this path in mcp.json
```

---

## File Comparison Summary

| File | Location | Scope | Primary Use |
|------|----------|-------|-------------|
| `.mcp.json` | `~/.claude/` | Global | Available kg_builder tools across all projects |
| `.claude/mcp.json` | `<project>/` | Project-specific | Override or add tools for specific repo |
| `settings.json` | Either location | Claude Code behavior | Hooks, preferences (not MCP config) |

**Priority:** Project-level `.claude/mcp.json` overrides global `~/.claude/mcp.json` for the same server name.
