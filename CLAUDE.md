# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`kg_builder` extracts knowledge graphs from Python codebases using AST parsing. It identifies entities (classes, functions, variables, imports, etc.) and captures relationships between them (CONTAINS, CALLS, INHERITS, IMPORTS, INSTANTIATES, DEFINES_IN, USES). 

**Key Capabilities:**
- **KG Extraction**: Build knowledge graphs from Python code via AST parsing
- **KG Diffing**: Compare two KG JSON files to produce structured change specifications (`kg_diff.py`)
- **Edit Planning**: Generate file-level edit plans from diffs with neighbor code context (`agent_planner.py`)
- **Round-Trip Workflow**: Orchestrate full workflow from proposed KG → diff → edit plan (`round_trip.py`)
- **MCP Server**: Standalone MCP server exposing all KG tools to Claude Code, Cursor, Windsurf (`mcp_server.py`)
- **Interactive Visualizer**: React/Cytoscape.js app for exploring and editing KGs (`viz/`)

---

## Before Modifying Code - Query the Knowledge Graph First

Always use the MCP tools or agent helper functions to understand code structure before making changes.

### MCP Tools (Recommended — available in all agent sessions)

| Task | MCP Tool |
|------|----------|
| Rebuild KG after file changes | `kg_rebuild()` |
| Search for entities | `kg_find_entity(query, entity_type)` |
| Get adjacent entities | `kg_get_neighbors(entity_id, direction)` |
| Find callers of a function | `kg_get_callers(entity_id, max_depth)` |
| Extract code with context | `kg_extract_context(entity_id, max_hops)` |
| BFS traversal | `kg_traverse(start_entity_ids, max_hops)` |
| Resolve cross-file imports | `kg_resolve_import(import_entity_id)` |
| Diff two KG JSON files | `kg_diff(existing_kg_path, proposed_kg_path)` |
| Generate edit plan from diff | `kg_generate_plan(change_spec_path, existing_kg_path)` |
| Impact analysis | `kg_impact_analysis(entity_name, depth)` |
| Understand a function fully | `kg_understand_function(function_name)` |
| Export KG to JSON | `kg_export(output_path)` |

### Agent Helper Functions (for direct Python imports)

```python
from kg_builder import build_knowledge_graph, understand_function, analyze_impact

# Build a KG from a codebase
kg = build_knowledge_graph("/path/to/code", exclude_patterns=["**/tests/*"])

# Get complete context for a function
info = understand_function("parse_file")
if info["success"]:
    print(f"Found at: {info['function']['file_path']}")
    print(f"Called by: {info['called_by']}")

# Analyze impact of changing an entity
impact = analyze_impact("KGQueryEngine", depth=2)
if impact["risk_level"] == "HIGH":
    print(f"Warning: {impact['reasons']}")
```

## Commands

```bash
# Install the package in editable mode
pip install -e .

# Run all tests
pytest tests/

# Run a single test file
pytest tests/test_parser.py

# Run tests with coverage
pytest --cov=kg_builder tests/

# Build the package
python -m build

# CLI usage
kg_builder /path/to/repo --output output.json
kg_builder /path/to/file.py --verbose
kg_builder . --exclude "**/tests/*" --exclude "**/venv/*"

# KG diffing (compare two KG JSON files)
kg_builder diff existing_kg.json proposed_kg.json --output change_spec.json

# Generate edit plan from change spec
kg_builder plan change_spec.json --codebase /path/to/repo --output plan.md

# Round-trip workflow (proposed KG → diff → edit plan)
kg_builder round-trip /path/to/repo proposed_kg.json [--existing existing_kg.json]

# MCP Server (for Claude Code, Cursor, Windsurf)
python -m kg_builder.mcp_server                    # serves current directory
python -m kg_builder.mcp_server /path/to/project   # serves specific project

# Visualizer (React/Vite app)
cd viz && npm install && npm run dev    # Dev server at localhost:3000
cd viz && npm run build                 # Production build
```

## Architecture

### Core Pipeline

The main entry point `build_knowledge_graph()` in `__init__.py` runs a two-pass pipeline:
1. **Per-file pass**: For each Python file, `parse_file()` extracts entities via AST walking, then `find_all_relationships()` detects relationships from the same AST.
2. **Cross-file pass**: `SymbolResolver` builds a symbol table across all files and creates `IMPORTS_RESOLVED_TO` and `CALLS_RESOLVED` relationships linking imports/calls across file boundaries.

### Module Structure

```
kg_builder/
├── __init__.py              # Public API: build_knowledge_graph(), agent helpers
├── cli.py                   # argparse-based CLI entry point (build, diff, plan, round-trip)
├── models.py                # Entity, Relationship, KnowledgeGraph dataclasses
├── parser.py                # AST traversal for entity extraction
├── relationship_finder.py   # Relationship detection from AST
├── query_engine.py          # KGQueryEngine: graph traversal and search
├── symbol_resolver.py       # SymbolResolver: cross-file import/call resolution
├── agent_helper.py          # High-level helper functions (understand_function, analyze_impact)
├── kg_diff.py               # Knowledge graph diffing: EntityChange, RelationshipChange, ChangeSpec
├── agent_planner.py         # Edit plan generation from ChangeSpec with neighbor context
├── round_trip.py            # Full workflow orchestration: KG → diff → plan
├── mcp_server.py            # MCP server exposing all tools to IDEs (Claude/Cursor/Windsurf)
├── utils.py                 # File traversal, entity ID generation
├── tools/                   # LLM-invocable tool functions (structured dict returns)
│   ├── cache_manager.py     # KGCacheManager: caches built KGs for repeated queries
│   ├── find_entity.py       # kg_find_entity: search entities by name
│   ├── get_neighbors.py     # kg_get_neighbors: adjacent entities
│   ├── get_callers.py       # kg_get_callers: reverse call graph
│   ├── extract_context.py   # kg_extract_context: code snippets around entities
│   ├── traverse.py          # kg_traverse: BFS traversal
│   ├── resolve_import.py    # kg_resolve_import: cross-file import resolution
│   └── generate_plan.py     # kg_generate_plan: edit plan from change spec
└── skills/                  # User-invocable /command handlers (formatted output)
    ├── base.py              # BaseSkill abstract class
    ├── explore.py           # /explore: entity relationship exploration
    ├── impact.py            # /impact: change impact analysis
    ├── context.py           # /context: load code context
    └── plan.py              # /plan: generate edit plans from diffs
```

### Tools vs Skills vs Agent Helpers

- **Tools** (`tools/`): Return structured dicts with `{"success": bool, ...}`. Designed for LLM agents to invoke programmatically. Registered via `@register_tool()` into `TOOL_REGISTRY`.
- **Skills** (`skills/`): Return formatted text for terminal display. Invoked via `/command` syntax and `invoke_skill()`. Registered via `@register_skill()` into `SKILL_REGISTRY`.
- **Agent Helpers** (`agent_helper.py`): High-level convenience wrappers (e.g., `understand_function`, `analyze_impact`) that combine multiple query engine calls. Exported from `__init__.py`.

### Entity Extraction (`parser.py`)

Uses a recursive AST walker with scope tracking:
- `_walk_ast()` processes nodes and maintains `scope_stack` for nested contexts
- Scope-aware entity IDs use `::` separator: `file.py::OuterClass::method_name`
- ClassDef/FunctionDef handlers return early after processing body to avoid duplicate walking

### Relationship Detection (`relationship_finder.py`)

Two-phase approach:
1. **Scope-based**: `_find_contains()` parses entity IDs to infer hierarchy
2. **AST-based**: `_walk_for_relationships()` detects CALLS, INHERITS, INSTANTIATES from AST nodes

### Cross-File Resolution (`symbol_resolver.py`)

`SymbolResolver` builds symbol tables and creates resolved relationships:
- `build_symbol_table()`: Maps entity names to their definitions
- `create_resolved_relationships()`: Adds IMPORTS_RESOLVED_TO and CALLS_RESOLVED relationships

### Query Engine (`query_engine.py`)

`KGQueryEngine` provides graph traversal: `get_neighbors()`, `traverse_hops()` (BFS), `search_by_name()` (fuzzy), `get_callers()`, `get_code_context()`.

### Models (`models.py`)

**KnowledgeGraph** stores entities as dict and relationships as list. Builds four indices for fast lookups:
- `_by_name`: Case-insensitive name lookup
- `_by_file`: File-based entity lookup
- `_adjacency` / `_reverse_adjacency`: Outgoing/incoming relationship indices

### Visualizer (`viz/`)

React + Vite app using Cytoscape.js for interactive graph rendering. Features:
- **Multiple layouts**: force-directed, hierarchical (dagre/fcose), circular, grid
- **Search & filtering**: by entity type checkboxes and name search
- **Node/edge inspection**: click to view details in sidebar
- **Graph editing**: add/remove nodes and edges with undo/redo support
- **Diff viewing**: visualize KG diffs (`kg_diff.js`) with color-coded changes
- **Shortest path finding**: compute paths between entities

Key files: `kgParser.js` (JSON-to-Cytoscape), `styler.js` (visual encoding), `undoRedo.js` (edit history), `neighborTraversal.js` (expansion), `kg_diff.js` (diff utilities)

### KG Diffing (`kg_diff.py`)

Compares two KG JSON files and produces a `ChangeSpec`:
- **EntityChange**: tracks added/removed/modified entities with field-level diffs
- **RelationshipChange**: tracks added/removed relationships
- **ChangeSpec**: complete diff summary with timestamps, hashes, and neighbor IDs for context loading

### Edit Planning (`agent_planner.py`)

Generates file-level `EditPlan` from a `ChangeSpec`:
- **FileEdit**: groups changes by file with action (create/modify/delete)
- **Context loading**: loads code snippets for 1-hop neighbors from existing KG
- **Smart inference**: infers file paths for new entities based on relationships
- **Warnings**: flags removed entities with remaining callers, missing file paths

### Round-Trip Workflow (`round_trip.py`)

Orchestrates the full workflow: build/load existing KG → load proposed KG → diff → generate edit plan. Returns structured dict with ChangeSpec, EditPlan, markdown plan, and warnings.

### MCP Server (`mcp_server.py`)

Standalone stdio MCP server exposing all kg_builder tools to Claude Code, Cursor, Windsurf. Manages cached KG state and exposes 13 tools including `kg_find_entity`, `kg_diff`, `kg_generate_plan`, etc.

### Key Design Patterns

- **Scope Stack**: Passed through recursive AST walks to track nesting depth for proper entity IDs
- **Synthetic Target IDs**: External references (unresolved imports, external classes) use simple names as targets
- **Two-Pass Resolution**: Per-file extraction first, then cross-file resolution via SymbolResolver
- **ChangeSpec as Intermediate Format**: Diffs produce structured ChangeSpec that feeds EditPlan generation
- **Execution Ordering**: Creates → modifies → deletes to minimize breaking dependencies mid-edit

## Workflow Approaches

### Standard MCP Tool Workflow (Recommended)

Use MCP tools for all code discovery and planning tasks:

```
1. kg_find_entity("ClassName") → find relevant entities
2. kg_get_neighbors(entity_id) → understand relationships  
3. kg_extract_context(entity_id, max_hops=2) → load code snippets
4. Make your code changes
5. kg_rebuild() → refresh KG after changes
```

### KG Diffing & Edit Planning Workflow

For large refactors or when you have a target state:

```
1. Build current KG: kg_builder /path/to/repo --output existing.json
2. Modify KG JSON to reflect desired state (or use viz to edit)
3. Diff: kg_diff(existing.json, proposed.json) → change_spec.json
4. Plan: kg_generate_plan(change_spec.json, existing_kg_path=existing.json) → plan.md
5. Review plan.md for file-level edits with context snippets
6. Execute edits, handling warnings about missing file paths or broken callers
```

### Round-Trip Workflow (CLI)

End-to-end orchestration via CLI:

```bash
# Build existing KG and compare to proposed, output edit plan
kg_builder round-trip /path/to/repo proposed_kg.json \
  --output plan.md \
  --dry-run
```

### Visualizer-Based Workflow

Use the interactive visualizer to explore and edit KGs:

```bash
# Start viz server
cd viz && npm run dev

# In browser at localhost:3000:
# 1. Upload existing KG JSON
# 2. Explore graph, use filters/search
# 3. Add/edit nodes or edges via context menu
# 4. Export modified KG
# 5. Use kg_diff to compare before/after
```

---

## Knowledge Graph Tools Quick Reference

The MCP server exposes these tools (available in all agent sessions):

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

**Always query the KG before modifying code.** Use these tools instead of grep/find for faster, more precise discovery.
