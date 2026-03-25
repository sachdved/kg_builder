# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`kg_builder` extracts knowledge graphs from Python codebases using AST parsing. It identifies entities (classes, functions, variables, imports) and captures relationships between them (CONTAINS, CALLS, INHERITS, IMPORTS, INSTANTIATES, DEFINES_IN).

---

## ⚠️ Before Modifying Code - Query the Knowledge Graph First

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

# Before modifying a function
info = understand_function("parse_file")
if info["success"]:
    print(f"Found at: {info['function']['file_path']}")
    print(f"Called by: {info['called_by']}")

# Before refactoring
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

# Use the CLI to extract a knowledge graph
kg_builder /path/to/repo --output output.json
kg_builder /path/to/file.py --verbose
kg_builder . --exclude "**/tests/*" --exclude "**/venv/*"
```

## Architecture

### Core Module Structure

```
kg_builder/
├── __init__.py           # Public API: build_knowledge_graph(), agent helpers
├── cli.py                # argparse-based CLI entry point
├── models.py             # Entity, Relationship, KnowledgeGraph dataclasses
├── parser.py             # AST traversal for entity extraction
├── relationship_finder.py # Relationship detection from AST
├── query_engine.py       # KGQueryEngine: graph traversal and search
├── symbol_resolver.py    # SymbolResolver: cross-file import/call resolution
├── agent_helper.py       # High-level helper functions for agents
└── utils.py              # File traversal, entity ID generation
```

### Entity Extraction (`parser.py`)

Uses a recursive AST walker with scope tracking:
- `_walk_ast()` processes nodes and maintains `scope_stack` for nested contexts
- Classes/functions have dedicated handlers that update the scope stack
- Scope-aware entity IDs use `::` separator: `file.py::OuterClass::method_name`
- Returns early after processing class/function bodies to avoid duplicate processing

### Relationship Detection (`relationship_finder.py`)

Two-phase approach:
1. **Scope-based relationships**: `_find_contains()` parses entity IDs to infer hierarchy
2. **AST-based relationships**: `_walk_for_relationships()` detects CALLS, INHERITS, INSTANTIATES from AST nodes

### Cross-File Resolution (`symbol_resolver.py`)

The `SymbolResolver` class builds symbol tables and creates resolved relationships:
- `build_symbol_table()`: Maps entity names to their definitions
- `create_resolved_relationships()`: Adds IMPORTS_RESOLVED_TO and CALLS_RESOLVED relationships that link imports/calls across files

### Query Engine (`query_engine.py`)

The `KGQueryEngine` class provides graph traversal capabilities:
- `get_neighbors(entity_id, direction)`: Get connected entities (outgoing/incoming/both)
- `traverse_hops(start_ids, max_hops)`: BFS traversal with relationship filtering
- `search_by_name(name, fuzzy)`: Case-insensitive name search
- `get_callers(entity_id)`: Find all entities that call the given entity
- `get_code_context(entity_id, max_hops)`: Extract code snippets for context

### Models (`models.py`)

**EntityType enum**: FILE, MODULE, CLASS, FUNCTION, ASYNC_FUNCTION, CONSTANT, VARIABLE, IMPORT, DIRECTORY, DECORATOR, EXCEPTION, EXTERNAL_REF

**RelationshipType enum**: CONTAINS, DEFINES_IN, CALLS, IMPORTS, INHERITS, INSTANTIATES, USES, LOCATED_IN, IMPORTS_RESOLVED_TO, CALLS_RESOLVED, DEFINES_SYMBOL

**KnowledgeGraph**: Stores entities as dict and relationships as list. Builds indices for fast lookups:
- `_by_name`: Case-insensitive name lookup
- `_by_file`: File-based entity lookup
- `_adjacency`: Outgoing relationship index
- `_reverse_adjacency`: Incoming relationship index (for finding callers)

### Key Design Patterns

- **Scope Stack**: Passed through recursive AST walks to track nesting depth for proper entity IDs
- **Early Returns**: ClassDef/FunctionDef handlers return after processing body to prevent double-walking
- **Synthetic Target IDs**: External references (unresolved imports, external classes) use simple names as targets
- **Two-Pass Resolution**: First pass extracts entities and relationships per-file; second pass resolves cross-file references via SymbolResolver
