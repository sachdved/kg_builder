# Knowledge Graph Engineer - Key Patterns & Conventions

## Completed Implementation (2026-03-09)

All MVP Milestone tasks 1-6 implemented:

### Core Files Structure
- `kg_builder/models.py` - Entity, Relationship, KnowledgeGraph with indices
- `kg_builder/parser.py` - AST-based entity extraction with end_line tracking
- `kg_builder/query_engine.py` - KGQueryEngine for graph traversal and search
- `kg_builder/symbol_resolver.py` - SymbolResolver for import resolution across files
- `kg_builder/__init__.py` - Main API exports (build_knowledge_graph, KGQueryEngine, SymbolResolver)
- `examples/agent_demo.py` - CLI demo for context-aware code loading

### Key Design Patterns

**Entity Tracking:**
- Entity IDs use `::` separator for scope: `file.py::OuterClass::method_name`
- Line spans: `line_number` + optional `end_line` from AST `node.end_lineno`
- Scope stack passed through recursive AST walks to track nesting depth

**KnowledgeGraph Indices (built via `_build_indices()`):**
- `_by_name`: lowercase name → list of entity IDs (case-insensitive search)
- `_by_file`: file_path → list of entity IDs
- `_adjacency`: source_id → list of outgoing Relationship objects
- `_reverse_adjacency`: target_id → list of incoming Relationship objects

**Relationship Types:**
- Standard: CONTAINS, CALLS, DEFINES_IN, IMPORTS, INHERITS, INSTANTIATES, USES, LOCATED_IN
- Resolved: `IMPORTS_RESOLVED_TO`, `CALLS_RESOLVED`, `DEFINES_SYMBOL` (with `is_resolved=True`)

**Query Engine Methods:**
- `get_neighbors(entity_id, direction="both")` → list of (rel_type, neighbor_id)
- `traverse_hops(start_ids, max_hops=2)` → dict entity_id → (hops, path)
- `search_by_name(name, fuzzy=False)` → list of entity_ids
- `get_callers(entity_id)` → list of caller entity_ids
- `get_code_context(entity_id, max_hops=2)` → dict entity_id → source code

**Symbol Resolution:**
- Symbol table: `"file.py::Name"` → entity_id mapping
- Resolves local and cross-file imports
- Creates EXTERNAL_REF entities for unresolved third-party imports

## Testing Commands

```bash
# Run all tests
pytest tests/ -v

# Verify imports work
python -c "from kg_builder import build_knowledge_graph, KGQueryEngine; print('OK')"

# Test CLI demo
python -m examples.agent_demo "parse_file" --codebase kg_builder
```

## Common Pitfalls

- Duplicate enum values cause issues in RelationshipType (was fixed)
- `end_line` is optional on Entity - check with getattr before using
- Indices must be rebuilt if entities/relationships are added after _build_indices()
- Import resolution only works for local modules, not stdlib/third-party
