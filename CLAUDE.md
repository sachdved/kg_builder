# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`kg_builder` extracts knowledge graphs from Python codebases using AST parsing. It identifies entities (classes, functions, variables, imports) and captures relationships between them (CONTAINS, CALLS, INHERITS, IMPORTS, INSTANTIATES, DEFINES_IN). Includes an interactive React/Cytoscape.js visualizer (`viz/`).

---

## Before Modifying Code - Query the Knowledge Graph First

Always use the agent helper functions to understand code structure before making changes.

### Helper Functions Quick Reference

| Task | Function |
|------|----------|
| Before modifying a function | `understand_function(name)` |
| Before refactoring/deleting | `analyze_impact(name, depth=2)` |
| Extract common patterns | `find_all_by_pattern(pattern, entity_type)` |
| Check module dependencies | `get_import_deps(file_path)` |

### Example Usage

```python
from kg_builder.agent_helper import understand_function, analyze_impact

info = understand_function("parse_file")
if info["success"]:
    print(f"Found at: {info['function']['file_path']}")
    print(f"Called by: {info['called_by']}")

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
├── cli.py                   # argparse-based CLI entry point
├── models.py                # Entity, Relationship, KnowledgeGraph dataclasses
├── parser.py                # AST traversal for entity extraction
├── relationship_finder.py   # Relationship detection from AST
├── query_engine.py          # KGQueryEngine: graph traversal and search
├── symbol_resolver.py       # SymbolResolver: cross-file import/call resolution
├── agent_helper.py          # High-level helper functions for agents
├── utils.py                 # File traversal, entity ID generation
├── tools/                   # LLM-invocable tool functions (structured dict returns)
│   ├── cache_manager.py     # KGCacheManager: caches built KGs for repeated queries
│   ├── find_entity.py       # kg_find_entity: search entities by name
│   ├── get_neighbors.py     # kg_get_neighbors: adjacent entities
│   ├── get_callers.py       # kg_get_callers: reverse call graph
│   ├── extract_context.py   # kg_extract_context: code snippets around entities
│   ├── traverse.py          # kg_traverse: BFS traversal
│   └── resolve_import.py    # kg_resolve_import: cross-file import resolution
└── skills/                  # User-invocable /command handlers (formatted output)
    ├── base.py              # BaseSkill abstract class
    ├── explore.py           # /explore: entity relationship exploration
    ├── impact.py            # /impact: change impact analysis
    └── context.py           # /context: load code context
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

React + Vite app using Cytoscape.js for interactive graph rendering. Loads KG JSON files via upload. Supports multiple layouts (force-directed, hierarchical, dagre, fcose), search, filtering by entity type, and node/edge inspection. Key utils: `kgParser.js` (JSON-to-Cytoscape conversion), `styler.js` (visual encoding), `undoRedo.js` (edit history).

### Key Design Patterns

- **Scope Stack**: Passed through recursive AST walks to track nesting depth for proper entity IDs
- **Synthetic Target IDs**: External references (unresolved imports, external classes) use simple names as targets
- **Two-Pass Resolution**: Per-file extraction first, then cross-file resolution via SymbolResolver
