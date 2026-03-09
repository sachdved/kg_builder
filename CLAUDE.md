# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

kg_builder is a tool that extracts knowledge graphs from Python codebases using AST parsing. It identifies entities (classes, functions, variables, imports) and captures relationships between them (CONTAINS, CALLS, INHERITS, IMPORTS, INSTANTIATES, DEFINES_IN).

---

## ⚠️ BEFORE MODIFYING CODE - Use Knowledge Graph First

**Always query the knowledge graph to understand code structure and impact.**

### Quick Start: Understand a Function Before Changes

```python
from kg_builder.agent_helper import understand_function

# Get context about what you're about to modify
info = understand_function("function_name")
if info["success"]:
    print(f"Found at: {info['function']['file_path']}")
    print(f"Called by: {info['called_by']}")
```

### Before Refactoring: Check Impact

```python
from kg_builder.agent_helper import analyze_impact

impact = analyze_impact("ClassName", depth=2)
if impact["risk_level"] == "HIGH":
    print(f"Warning: {impact['reasons']}")  # Plan careful testing
```

### Finding Related Code (for extraction/refactoring)

```python
from kg_builder.agent_helper import find_all_by_pattern

# Find all functions matching a pattern
validators = find_all_by_pattern("validate", "FUNCTION")
```

### Helper Functions Reference

| Task | Use This Function |
|------|-------------------|
| Before modifying a function | `understand_function(name)` |
| Before refactoring/deleting | `analyze_impact(name, depth=2)` |
| Extract common patterns | `find_all_by_pattern(pattern, entity_type)` |
| Check module dependencies | `get_import_deps(file_path)` |

### Low-Level Tools (for fine-grained control)

```python
from kg_builder.tools import (
    KGCacheManager,      # Caches KG for fast repeated queries
    kg_find_entity,      # Search entities by name
    kg_get_neighbors,    # Get connected entities
    kg_extract_context,  # Load code snippets organized by file
    kg_get_callers,      # Find who calls this entity
    kg_traverse,         # Multi-hop traversal with stats
    kg_resolve_import,   # Resolve imports to definitions
)
```

---

## BEFORE MODIFYING CODE - Knowledge Graph Guidelines

**Always query the knowledge graph first to understand code structure and impact.**

### 1. Understanding a Function Before Changes

```python
from kg_builder.agent_helper import understand_function

# Get context about what you're about to modify
info = understand_function("function_name")
if info["success"]:
    print(f"Found at: {info['function']['file_path']}")
    print(f"Called by: {info['called_by']}")
    # Use info['context'] for actual code snippets
```

### 2. Impact Analysis Before Refactoring

```python
from kg_builder.agent_helper import analyze_impact

# Check what breaks if you change this
impact = analyze_impact("ClassName", depth=2)
if impact["risk_level"] == "HIGH":
    print(f"Warning: {impact['reasons']}")
    # Plan careful testing strategy
```

### 3. Finding Related Code for Refactoring

```python
from kg_builder.agent_helper import find_all_by_pattern

# Find all functions matching a pattern (e.g., for extraction)
validators = find_all_by_pattern("validate", "FUNCTION")
for v in validators:
    print(f"{v['name']} at {v['file_path']}")
```

### 4. Understanding Import Dependencies

```python
from kg_builder.agent_helper import get_import_deps

# See what modules a file depends on
deps = get_import_deps("kg_builder/parser.py")
print(f"Internal imports: {len(deps['internal_imports'])}")
print(f"External imports: {len(deps['external_imports'])}")
```

### When to Use Each Function

| Task | Use This Function |
|------|------------------|
| Before modifying a function | `understand_function()` |
| Before refactoring/deleting | `analyze_impact()` |
| Extracting common patterns | `find_all_by_pattern()` |
| Checking module dependencies | `get_import_deps()` |

### Tool Functions (Programmatic Access)

For fine-grained control, use the tool functions directly:

```python
from kg_builder.tools import (
    KGCacheManager,  # Caches KG for fast repeated queries
    kg_find_entity,  # Search entities by name
    kg_get_neighbors,  # Get connected entities
    kg_extract_context,  # Load code snippets
    kg_get_callers,  # Find who calls this
    kg_traverse,  # Multi-hop traversal
    kg_resolve_import,  # Resolve imports to definitions
)

# Example: Build cached KG and query
cache = KGCacheManager(".")
kg = cache.get_or_build()
result = kg_find_entity(kg, "parse_file")
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
