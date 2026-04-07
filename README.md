# kg_builder

**Use a knowledge graph to make AI coding agents faster, cheaper, and more precise.**

kg_builder parses Python codebases into a graph of entities (classes, functions, variables) and their relationships (calls, inherits, imports). Agents query this graph to understand your code structurally — instead of grepping through hundreds of files, they jump directly to the right classes and functions.

## Why

When you tell an AI coding agent "add feature X," it has to figure out which files to read and which to edit. Without structural understanding, it reads too much, edits the wrong files, and burns tokens on irrelevant context.

kg_builder gives the agent a map. The agent queries the graph to find the right entry points, understands what depends on what, and edits only what needs to change.

## First benchmark results

We tested on a real task — building an options IV analysis tool against a 329-file API client library — with and without the KG tools available:

| | Without KG | With KG |
|---|---|---|
| **Total cost** | $2.74 | $1.99 |
| **API time** | 6m 10s | 4m 27s |
| **Wall-clock time** | 40m 16s | 21m 34s |
| **Code output** | 364 added, 55 removed | 368 added, 49 removed |
| **Cache writes** | 173k tokens | 104k tokens |

Same task, same model (Claude Opus 4.6), same prompt. The KG-equipped agent was **27% cheaper**, **47% faster** (wall-clock), and produced comparable code output. The cost reduction comes primarily from fewer tokens read — the agent loaded relevant context via graph queries instead of reading entire files.

This is one data point, not a comprehensive benchmark. See [docs/USAGE_GUIDE.md](docs/USAGE_GUIDE.md) for the full experiment design to run your own comparisons.

## How it works

```
Your codebase
    |
    v
kg_builder build . --output kg.json     # Parse into a knowledge graph
    |
    v
Agent queries the graph via MCP tools    # kg_find_entity, kg_get_neighbors, etc.
    |
    v
Agent understands structure, edits precisely
```

The graph is available to the agent as 12 MCP tools. The agent calls `kg_find_entity("UserService")` instead of grepping, `kg_get_callers("authenticate")` instead of searching for references, and `kg_impact_analysis("parse_file")` before making changes.

## Quick start

### Install

```bash
pip install -e ".[mcp]"
```

### Use with Claude Code (or Cursor / Windsurf)

**Quick setup for Cursor:** See [docs/CURSOR_INTEGRATION.md](docs/CURSOR_INTEGRATION.md) for a 5-minute setup guide.

**1. Create `.mcp.json` in your project root:**

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

Use the full Python path (`which python` in your kg_builder environment). Or copy `.cursor-mcp-example.json` as a starting point.

**2. Create a `CLAUDE.md` in your project root:**

```markdown
## Knowledge Graph Tools

This project has a knowledge graph MCP server connected.
Use the KG tools instead of grep/read for code discovery:

- `kg_find_entity("name")` — find classes/functions by name
- `kg_get_neighbors(entity_id)` — see what calls/inherits/contains
- `kg_get_callers(entity_id)` — find what calls a function
- `kg_extract_context(entity_id)` — load source code + neighbors
- `kg_impact_analysis("name")` — check dependencies before modifying

Before writing code, query the KG first.
```

Without CLAUDE.md, the agent will ignore the KG tools and use grep instead.

**3. Restart Claude Code.** Run `/mcp` to verify the server is connected.

### Use from the CLI

```bash
# Build a knowledge graph
kg_builder build /path/to/project --output existing.json

# Compare two graphs (existing vs proposed changes)
kg_builder diff existing.json proposed.json --output changes.json

# Generate an edit plan from the diff
kg_builder plan changes.json --codebase /path/to/project
```

### Use as a Python library

```python
from kg_builder import build_knowledge_graph, diff_knowledge_graphs, generate_edit_plan

kg = build_knowledge_graph("/path/to/project")
print(f"{len(kg.entities)} entities, {len(kg.relationships)} relationships")
```

## MCP tools

When connected via MCP, the agent has access to:

| Tool | What it does |
|------|-------------|
| `kg_find_entity` | Search for classes, functions, variables by name |
| `kg_get_neighbors` | Get entities connected through relationships |
| `kg_get_callers` | Find all code that calls a function |
| `kg_extract_context` | Load source code for an entity and its neighbors |
| `kg_traverse` | BFS traversal from starting entities |
| `kg_impact_analysis` | Assess risk of changing an entity |
| `kg_understand_function` | Full context: code, callers, dependencies |
| `kg_diff` | Compare two knowledge graph JSON files |
| `kg_generate_plan` | Generate edit plan from a change spec |
| `kg_resolve_import` | Resolve imports to actual definitions |
| `kg_rebuild` | Re-parse the codebase after changes |
| `kg_export` | Export the current graph as JSON |

## Interactive visualizer

An interactive React/Cytoscape.js graph viewer for exploring and editing knowledge graphs:

```bash
cd viz && npm install && npm run dev
```

Upload a KG JSON file to visualize entities and relationships. Supports:

- Multiple layouts (force-directed, hierarchical, circular, grid)
- Add/edit/delete nodes and edges
- Diff mode: compare two graphs with color-coded overlay (green = added, yellow = modified, red = removed)
- Export change specs for the CLI pipeline
- Dual input: edit manually OR load an agent's proposal

## The propose-diff-plan workflow

Beyond live MCP queries, kg_builder supports a structured planning workflow:

1. **Parse** your codebase into a KG
2. **Propose** changes — edit the graph in the visualizer, or let an agent generate a proposed KG
3. **Diff** the proposed graph against the existing one
4. **Plan** — generate a file-level edit plan with neighbor context
5. **Execute** — the agent follows the plan, editing only approved files

This gives you architectural review before any code is written. See [docs/USAGE_GUIDE.md](docs/USAGE_GUIDE.md) for the full workflow.

## Compatibility

| Platform | Support |
|----------|---------|
| Claude Code | MCP server (native) |
| Cursor | MCP server |
| Windsurf | MCP server |
| Codex (OpenAI) | CLI only (no MCP) |
| Any Python tool | Library API |

## Documentation

### Getting Started
- [Cursor Integration Guide](docs/CURSOR_INTEGRATION.md) — 5-minute setup for Cursor users
- [MCP Setup Guide](docs/MCP_SETUP.md) — configuration for Claude Code, Cursor, Windsurf

### Usage & Reference
- [Usage Guide](docs/USAGE_GUIDE.md) — workflows, CLI reference, measurement framework
- [CLAUDE.md](CLAUDE.md) — architecture reference for agents working on this repo

## Development

```bash
pip install -e ".[dev,mcp]"
pytest tests/                    # 90 tests
cd viz && npm run build          # Build visualizer
```
