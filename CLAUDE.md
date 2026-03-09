# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

kg_builder is a tool that extracts knowledge graphs from Python codebases using AST parsing. It identifies entities (classes, functions, variables, imports) and captures relationships between them (CONTAINS, CALLS, INHERITS, IMPORTS, INSTANTIATES, DEFINES_IN).

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

### Core Components

The tool uses Python's built-in `ast` module to parse source code:

```
kg_builder/
├── __init__.py          # Public API: build_knowledge_graph()
├── cli.py               # argparse-based CLI entry point
├── models.py            # Data classes: Entity, Relationship, KnowledgeGraph
├── parser.py            # AST traversal for entity extraction
├── relationship_finder.py  # Relationship detection from AST
└── utils.py             # File traversal, entity ID generation
```

### Entity Extraction (parser.py)

Uses a recursive AST walker with scope tracking:
- `_walk_ast()` processes nodes and maintains `scope_stack` for nested contexts
- Classes/functions have dedicated handlers that update the scope stack
- Scope-aware entity IDs use `::` separator: `file.py::OuterClass::method_name`
- Returns early after processing class/function bodies to avoid duplicate processing

### Relationship Detection (relationship_finder.py)

Two-phase approach:
1. **Scope-based relationships**: `_find_contains()` parses entity IDs to infer hierarchy
2. **AST-based relationships**: `_walk_for_relationships()` detects CALLS, INHERITS, INSTANTIATES from AST nodes
- Method calls like `obj.method()` are extracted via `_extract_call_info()` which handles `ast.Attribute` with `ast.Name` values
- The fix at line 286 uses `func.value.id` (not `func.value`) for proper string interpolation

### Models (models.py)

- `Entity`: id, name, type (EntityType enum), file_path, line_number, properties dict
- `Relationship`: source_id, target_id, type (RelationshipType enum), line_number
- `KnowledgeGraph`: stores entities as dict and relationships as list; provides `to_dict()`/`to_json()`

### Key Design Patterns

- **Scope Stack**: Passed through recursive AST walks to track nesting depth for proper entity IDs
- **Early Returns**: ClassDef/FunctionDef handlers return after processing body to prevent double-walking
- **Synthetic Target IDs**: External references (unresolved imports, external classes) use simple names as targets

### Entity Types Extracted

FILE, MODULE, CLASS, FUNCTION, ASYNC_FUNCTION, CONSTANT, VARIABLE, IMPORT, DIRECTORY, DECORATOR, EXCEPTION

### Relationship Types Captured

CONTAINS (parent-child hierarchy), CALLS (function invocation), DEFINES_IN (variable scope), IMPORTS, INHERITS, INSTANTIATES, USES, LOCATED_IN
