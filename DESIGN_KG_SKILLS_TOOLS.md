# Claude Code Skills & Tools Design for kg_builder Knowledge Graph

A comprehensive specification for enabling knowledge-graph-guided agentic coding through the `kg_builder` knowledge graph infrastructure.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Use Case Analysis](#use-case-analysis)
3. [Skill Specifications](#skill-specifications)
4. [Tool Specifications](#tool-specifications)
5. [Workflow Transformations](#workflow-transformations)
6. [Implementation Plan](#implementation-plan)
7. [Technical Architecture](#technical-architecture)
8. [Open Questions](#open-questions)

---

## 1. Executive Summary

This document specifies the design for **Claude Code skills and tools** that leverage `kg_builder`'s knowledge graph capabilities to enable context-aware, intelligent code understanding before agents write or modify code.

### Core Philosophy

> **"Understand before you change."**

Agents should query the knowledge graph FIRST to understand:
- What entities exist and how they relate
- What will be affected by proposed changes
- What code context is relevant for the task

### Capability Mapping

| kg_builder Capability | Enabling Feature | Agent Action |
|----------------------|------------------|--------------|
| `KGQueryEngine.search_by_name()` | Entity discovery | Find functions, classes, variables |
| `KGQueryEngine.get_neighbors()` | Relationship traversal | Understand dependencies |
| `KGQueryEngine.traverse_hops()` | N-hop exploration | Map code flow impact |
| `KGQueryEngine.get_callers()` | Reverse dependency | Identify consumers |
| `KGQueryEngine.get_code_context()` | Code extraction | Load relevant snippets |
| `SymbolResolver` | Cross-file resolution | Trace imports & calls |

---

## 2. Use Case Analysis

### 2.1 Feature Implementation

**Scenario**: "Add rate limiting to the API authentication endpoint"

**KG-Enabled Discovery**:
```
1. Find: search_by_name("authenticate") -> kg_builder/cli.py::authenticate()
2. Impact: traverse_hops() to find dependencies
3. Context: get_code_context() to load auth logic
4. Callers: get_callers() to understand who uses this
```

**Value**: Agent understands the full authentication flow before adding rate limiting, avoiding breaking changes.

---

### 2.2 Refactoring

**Scenario**: "Extract validation logic into a separate module"

**KG-Enabled Discovery**:
```
1. Find all validation patterns: search_by_name("validate", fuzzy=True)
2. Map relationships: get_neighbors() for each match
3. Identify callers: get_callers() to understand consumption
4. Extract affected code: get_code_context(max_hops=2)
```

**Value**: Agent identifies ALL places that will be affected by extraction, ensuring complete refactoring.

---

### 2.3 Bug Fixing

**Scenario**: "Fix the import resolution bug in kg_builder"

**KG-Enabled Discovery**:
```
1. Find: search_by_name("resolve_import") -> symbol_resolver.py
2. Trace callers: get_callers() recursively to find who uses it
3. Map call graph: traverse_hops(include_relationships=[CALLS])
4. Load context: get_code_context() for all affected entities
```

**Value**: Agent sees the full impact chain before fixing, preventing regression bugs.

---

### 2.4 Test Generation

**Scenario**: "Add unit tests for KGQueryEngine"

**KG-Enabled Discovery**:
```
1. Find class: search_by_name("KGQueryEngine")
2. Get methods: traverse_hops(max_hops=1) -> CONTAINS relationships
3. Identify dependencies: get_neighbors() to understand required mocks
4. Map external refs: filter EXTERNAL_REF entities for mocking
```

**Value**: Agent generates comprehensive tests covering all methods and edge cases.

---

### 2.5 Code Review

**Scenario**: "Review changes before committing"

**KG-Enabled Analysis**:
```
1. Load changed files from git diff
2. Find affected entities: search_by_file() for each changed file
3. Map impact: traverse_hops() to find consumers
4. Highlight risks: identify high-weight relationships (frequently called)
```

**Value**: Agent provides context-aware review highlighting potential breaking changes.

---

## 3. Skill Specifications

Skills are **user-initiated** via `/skill-name` commands. They provide interactive exploration interfaces.

### 3.1 `/explore` - Entity Discovery and Visualization

**Purpose**: Find an entity and explore its relationships in the knowledge graph.

```yaml
name: explore
description: |
  Discover an entity in the knowledge graph and show its relationships,
  callers, and code context.

usage: /explore <entity_name> [--hops N] [--show-code] [--type TYPE]

parameters:
  entity_name:
    type: string
    required: true
    description: "Name of function, class, or variable to explore"
    examples: ["process_order", "KGQueryEngine", "parse_file"]

  hops:
    type: integer
    default: 1
    min: 0
    max: 3
    description: "Number of relationship hops to traverse (default: 1)"

  show_code:
    type: boolean
    default: false
    description: "Include source code snippets in output"

  type_filter:
    type: string
    enum: ["CLASS", "FUNCTION", "ASYNC_FUNCTION", "CONSTANT", "VARIABLE", "IMPORT"]
    description: "Filter results by entity type"
```

**KG Operations**:
```python
# Pseudocode for skill handler
def handle_explore(entity_name, hops=1, show_code=False, type_filter=None):
    # 1. Search for entity
    matches = engine.search_by_name(entity_name, fuzzy=True)

    if not matches:
        return {"error": f"No entities matching '{entity_name}' found"}

    # 2. Get primary match details
    primary_id = matches[0]
    primary_entity = kg.entities[primary_id]

    # 3. Traverse relationships
    neighbors = engine.get_neighbors(primary_id, direction="both")
    visited = engine.traverse_hops([primary_id], max_hops=hops)

    # 4. Get callers
    callers = engine.get_callers(primary_id)

    # 5. Optional code extraction
    code_context = {}
    if show_code:
        code_context = engine.get_code_context(primary_id, max_hops=hops)

    return format_explore_response(
        entity=primary_entity,
        neighbors=neighbors,
        callers=callers,
        visited_count=len(visited),
        code=code_context
    )
```

**Output Format** (structured for agent consumption):
```json
{
  "entity": {
    "id": "kg_builder/query_engine.py::KGQueryEngine",
    "name": "KGQueryEngine",
    "type": "CLASS",
    "file_path": "kg_builder/query_engine.py",
    "line_number": 9,
    "end_line": 189
  },
  "relationships": {
    "outgoing": [
      {"type": "CONTAINS", "target": "get_neighbors"},
      {"type": "CONTAINS", "target": "traverse_hops"}
    ],
    "incoming": [
      {"type": "IMPORTS", "source": "agent_demo.py"}
    ]
  },
  "callers": ["examples/agent_demo.py::demo_find_function_context"],
  "traversal_stats": {
    "entities_within_1_hop": 8,
    "entities_within_2_hops": 23
  },
  "code_snippets": {...}  // Only if --show-code
}
```

---

### 3.2 `/impact` - Change Impact Analysis

**Purpose**: Analyze what will be affected by changing a specific entity.

```yaml
name: impact
description: |
  Analyze the impact of modifying an entity by finding all entities
  that depend on it (directly or transitively).

usage: /impact <entity_name> [--depth N] [--include-code]

parameters:
  entity_name:
    type: string
    required: true
    description: "Name of the entity to analyze impact for"

  depth:
    type: integer
    default: 2
    min: 1
    max: 4
    description: "Maximum transitive depth for impact analysis"

  include_code:
    type: boolean
    default: false
    description: "Include code snippets of affected entities"
```

**KG Operations**:
```python
def handle_impact(entity_name, depth=2, include_code=False):
    # Find the target entity
    matches = engine.search_by_name(entity_name)
    if not matches:
        return {"error": "Entity not found"}

    target_id = matches[0]

    # 1. Get direct callers (reverse CALLS relationships)
    direct_callers = engine.get_callers(target_id)

    # 2. Traverse incoming relationships to find all dependents
    all_dependents = engine.traverse_hops(
        start_ids=[target_id],
        max_hops=depth,
        include_relationships=[RelationshipType.CALLS]
    )

    # Filter: only entities that CAN reach target via CALLS
    impact_set = {eid for eid in all_dependents if eid != target_id}

    # 3. Categorize by relationship type
    impact_by_type = categorize_impact(kg, impact_set, target_id)

    # 4. Extract code if requested
    affected_code = {}
    if include_code:
        for eid in list(impact_set)[:10]:  # Limit extraction
            affected_code[eid] = engine.get_code_context(eid, max_hops=0)

    return {
        "target": target_id,
        "direct_callers": direct_callers,
        "transitive_dependents": list(impact_set),
        "impact_summary": {
            "total_affected": len(impact_set),
            "by_type": impact_by_type
        },
        "affected_code": affected_code
    }
```

**Output Format**:
```json
{
  "target_entity": "kg_builder/query_engine.py::KGQueryEngine",
  "impact_analysis": {
    "direct_impact": {
      "callers_count": 3,
      "entities": [
        "examples/agent_demo.py::demo_find_function_context",
        "kg_builder/__init__.py::build_knowledge_graph"
      ]
    },
    "transitive_impact": {
      "total_reach": 12,
      "files_affected": [
        "examples/agent_demo.py",
        "kg_builder/cli.py",
        "tests/test_parser.py"
      ]
    },
    "risk_assessment": {
      "level": "MEDIUM",
      "reasons": [
        "Affects test files (3)",
        "Central utility class with wide reach"
      ]
    }
  }
}
```

---

### 3.3 `/context` - Smart Code Context Loading

**Purpose**: Load relevant code context for an entity, including dependencies and related code.

```yaml
name: context
description: |
  Load comprehensive code context for an entity including its own code,
  callers, callees, and imported modules.

usage: /context <entity_name> [--hops N] [--exclude-types TYPES]

parameters:
  entity_name:
    type: string
    required: true
    description: "Name of the entity to load context for"

  hops:
    type: integer
    default: 1
    min: 0
    max: 3
    description: "Relationship traversal depth for context"

  exclude_types:
    type: array[string]
    items: ["IMPORT", "VARIABLE", "CONSTANT", "EXTERNAL_REF"]
    description: "Entity types to exclude from context loading"
```

**KG Operations**:
```python
def handle_context(entity_name, hops=1, exclude_types=None):
    matches = engine.search_by_name(entity_name, fuzzy=True)
    if not matches:
        return {"error": "Entity not found"}

    target_id = matches[0]

    # Use the existing get_code_context method
    context = engine.get_code_context(
        entity_id=target_id,
        max_hops=hops,
        include_self=True
    )

    # Organize by file for efficient token usage
    organized = organize_context_by_file(context, kg)

    return {
        "entity": target_id,
        "context_files": organized,
        "total_tokens": estimate_tokens(context),
        "entities_included": list(context.keys())
    }
```

**Output Format**:
```json
{
  "target_entity": "kg_builder/query_engine.py::KGQueryEngine",
  "code_context": {
    "/home/sachdved/Documents/kg_builder/kg_builder/query_engine.py": {
      "entity_code": "class KGQueryEngine:\n    ...",
      "related_code": [
        {"entity": "get_neighbors", "code": "def get_neighbors(...)"},
        {"entity": "traverse_hops", "code": "def traverse_hops(...)"}
      ]
    }
  },
  "summary": {
    "files_loaded": 3,
    "entities_loaded": 12,
    "estimated_tokens": 850
  }
}
```

---

### 3.4 `/dependencies` - Dependency Graph Visualization

**Purpose**: Show the dependency graph for a file or entity.

```yaml
name: dependencies
description: |
  Visualize the import and call dependencies for a file or entity.

usage: /dependencies <file_path_or_entity> [--direction DIR] [--format FORMAT]

parameters:
  target:
    type: string
    required: true
    description: "File path or entity name to analyze"

  direction:
    type: string
    enum: ["incoming", "outgoing", "both"]
    default: "both"
    description: "Which dependency direction to show"

  format:
    type: string
    enum: ["text", "mermaid", "dot"]
    default: "text"
    description: "Output format for dependency graph"
```

**KG Operations**:
```python
def handle_dependencies(target, direction="both", format="text"):
    # Try to find as entity first
    matches = engine.search_by_name(target)
    if not matches:
        # Fall back to file search
        matches = list(kg._by_file.get(target.lower(), []))

    if not matches:
        return {"error": "Target not found"}

    target_id = matches[0]

    # Get neighbors based on direction
    neighbors = engine.get_neighbors(
        entity_id=target_id,
        direction=direction
    )

    # Build dependency graph structure
    graph = build_dependency_graph(kg, target_id, neighbors)

    # Format output
    if format == "mermaid":
        return {"graph": generate_mermaid(graph)}
    elif format == "dot":
        return {"graph": generate_dot(graph)}
    else:
        return {"graph": format_text_graph(graph)}
```

**Output Format** (Mermaid example):
```json
{
  "target": "kg_builder/query_engine.py",
  "format": "mermaid",
  "graph": "graph TD\n    KGQueryEngine --> get_neighbors\n    KGQueryEngine --> traverse_hops\n    agent_demo -->|imports| KGQueryEngine"
}
```

---

### 3.5 `/search` - Flexible Knowledge Graph Search

**Purpose**: Search the knowledge graph with various criteria.

```yaml
name: search
description: |
  Search the knowledge graph for entities matching various criteria.

usage: /search <query> [--type TYPE] [--file FILE] [--fuzzy]

parameters:
  query:
    type: string
    required: true
    description: "Search query (entity name, pattern, or description)"

  type:
    type: string
    enum: ["CLASS", "FUNCTION", "ASYNC_FUNCTION", "CONSTANT",
            "VARIABLE", "IMPORT", "FILE", "EXTERNAL_REF"]
    description: "Filter by entity type"

  file:
    type: string
    description: "Filter to specific file path"

  fuzzy:
    type: boolean
    default: false
    description: "Enable fuzzy/substring matching"
```

---

## 4. Tool Specifications

Tools are **auto-invoked** by the LLM when relevant. They provide programmatic access to KG capabilities.

### 4.1 `kg_find_entity` - Entity Lookup

```python
def kg_find_entity(
    query: str,
    entity_type: Optional[str] = None,
    fuzzy: bool = True,
    max_results: int = 5
) -> dict:
    """
    Find entities matching a query string.

    Args:
        query: Name or partial name to search for.
        entity_type: Optional type filter (CLASS, FUNCTION, etc.)
        fuzzy: If True, use substring matching; if False, exact match.
        max_results: Maximum number of results to return.

    Returns:
        {
            "success": bool,
            "results": [
                {
                    "id": str,
                    "name": str,
                    "type": str,
                    "file_path": str,
                    "line_number": int
                }
            ],
            "count": int
        }

    When to invoke:
        - User references a function/class by name
        - Need to locate code before modification
        - Disambiguating between similarly-named entities

    Example output:
    {
        "success": true,
        "results": [
            {"id": "kg_builder/parser.py::parse_file", "name": "parse_file", ...},
            {"id": "tests/test_parser.py::test_parse_file", "name": "test_parse_file", ...}
        ],
        "count": 2
    }
```

---

### 4.2 `kg_get_neighbors` - Relationship Traversal

```python
def kg_get_neighbors(
    entity_id: str,
    direction: str = "both",
    relationship_types: Optional[list[str]] = None,
    max_results: int = 20
) -> dict:
    """
    Get neighboring entities connected to the given entity.

    Args:
        entity_id: The entity ID to get neighbors for.
        direction: "outgoing", "incoming", or "both".
        relationship_types: Optional filter (e.g., ["CALLS", "IMPORTS"]).
        max_results: Maximum neighbors to return.

    Returns:
        {
            "success": bool,
            "entity_id": str,
            "neighbors": [
                {
                    "entity_id": str,
                    "name": str,
                    "type": str,
                    "relationship_type": str,
                    "direction": "outgoing" | "incoming"
                }
            ]
        }

    When to invoke:
        - Understanding what an entity depends on
        - Finding related code before making changes
        - Exploring codebase structure

    Example output:
    {
        "success": true,
        "entity_id": "kg_builder/query_engine.py::KGQueryEngine",
        "neighbors": [
            {"entity_id": "...::get_neighbors", "relationship_type": "CONTAINS", ...},
            {"entity_id": "...::RelationshipType", "relationship_type": "IMPORTS", ...}
        ]
    }
```

---

### 4.3 `kg_extract_context` - Code Context Extraction

```python
def kg_extract_context(
    entity_id: str,
    max_hops: int = 1,
    exclude_types: Optional[list[str]] = None
) -> dict:
    """
    Extract source code for an entity and its neighbors.

    Args:
        entity_id: The entity ID to extract context for.
        max_hops: Number of relationship hops to include (default: 1).
        exclude_types: Entity types to skip (e.g., ["IMPORT", "VARIABLE"]).

    Returns:
        {
            "success": bool,
            "entity_id": str,
            "context": {
                "file_path": {
                    "entities": [
                        {
                            "id": str,
                            "name": str,
                            "code": str,  # Source code snippet
                            "line_range": [start, end]
                        }
                    ]
                }
            },
            "total_files": int,
            "total_entities": int
        }

    When to invoke:
        - Before writing/modified code to understand context
        - Generating tests (need related code)
        - Code reviews (understand full scope)

    Example output:
    {
        "success": true,
        "entity_id": "kg_builder/parser.py::parse_file",
        "context": {
            "/home/.../kg_builder/parser.py": {
                "entities": [
                    {"id": "...::parse_file", "code": "def parse_file(...)\n    ..."}
                ]
            },
            "/home/.../kg_builder/models.py": {
                "entities": [..., Entity class definition...]
            }
        },
        "total_files": 2,
        "total_entities": 8
    }
```

---

### 4.4 `kg_get_callers` - Caller Discovery

```python
def kg_get_callers(
    entity_id: str,
    max_depth: int = 1
) -> dict:
    """
    Find all entities that call the given entity.

    Args:
        entity_id: The entity ID to find callers for.
        max_depth: Transitive depth (1 = direct callers only).

    Returns:
        {
            "success": bool,
            "entity_id": str,
            "direct_callers": [str],  # List of caller entity IDs
            "transitive_callers": [str],  # If max_depth > 1
            "call_graph": [
                {
                    "caller": str,
                    "callee": str,
                    "line_number": int,
                    "relationship_type": str
                }
            ]
        }

    When to invoke:
        - Before refactoring (find all consumers)
        - Debugging (trace execution flow)
        - Impact analysis (what breaks if I change this?)

    Example output:
    {
        "success": true,
        "entity_id": "kg_builder/query_engine.py::get_neighbors",
        "direct_callers": [
            "examples/agent_demo.py::demo_find_function_context"
        ],
        "transitive_callers": [],
        "call_graph": [...]
    }
```

---

### 4.5 `kg_traverse` - Multi-Hop Traversal

```python
def kg_traverse(
    start_entity_ids: list[str],
    max_hops: int = 2,
    include_relationships: Optional[list[str]] = None,
    exclude_types: Optional[list[str]] = None
) -> dict:
    """
    Perform breadth-first traversal from starting entities.

    Args:
        start_entity_ids: List of entity IDs to start from.
        max_hops: Maximum hop distance (default: 2).
        include_relationships: Only traverse these types (e.g., ["CALLS"]).
        exclude_types: Entity types to skip during traversal.

    Returns:
        {
            "success": bool,
            "traversal_result": {
                entity_id: {
                    "hops": int,  # Distance from start
                    "path": str   # Path description
                }
            },
            "entity_details": [
                {
                    "id": str,
                    "name": str,
                    "type": str,
                    "file_path": str,
                    "hops_from_start": int
                }
            ],
            "stats": {
                "total_entities": int,
                "files_touched": int,
                "max_depth_reached": int
            }
        }

    When to invoke:
        - Impact analysis (what's affected?)
        - Understanding code flow
        - Finding all related entities for a task

    Example output:
    {
        "success": true,
        "traversal_result": {...},
        "entity_details": [...],
        "stats": {"total_entities": 23, "files_touched": 5, ...}
    }
```

---

### 4.6 `kg_resolve_import` - Import Resolution

```python
def kg_resolve_import(
    import_entity_id: str
) -> dict:
    """
    Resolve an import to its actual definition.

    Args:
        import_entity_id: The IMPORT entity ID to resolve.

    Returns:
        {
            "success": bool,
            "import_entity_id": str,
            "resolved_to": str | None,  # Resolved entity ID or null
            "is_external": bool,
            "resolution_details": {
                "module": str,
                "original_name": str,
                "target_file": str | None
            }
        }

    When to invoke:
        - Understanding where imports come from
        - Tracing external dependencies
        - Resolving qualified names (module.func)

    Example output:
    {
        "success": true,
        "import_entity_id": "kg_builder/parser.py::IMPORT	ast",
        "resolved_to": null,
        "is_external": true,
        "resolution_details": {
            "module": "ast",
            "original_name": "ast",
            "target_file": null
        }
    }
```

---

## 5. Workflow Transformations

### 5.1 Feature Implementation Workflow

**OLD WORKFLOW (without KG):**
```
1. User: "Add validation to process_order()"
2. Agent: Opens file containing process_order()
3. Agent: Reads entire file
4. Agent: Makes changes without knowing impact
5. REGRESSION: Breaking change in caller that relied on old behavior
```

**NEW WORKFLOW (with KG):**
```
1. User: "Add validation to process_order()"
2. Agent: kg_find_entity("process_order") -> finds entity_id
3. Agent: kg_get_callers(entity_id) -> discovers 3 callers
4. Agent: kg_extract_context(entity_id, max_hops=1) -> loads context
5. Agent: Reviews validation patterns in related code
6. Agent: Implements validation with backward compatibility
7. SUCCESS: No regressions, proper interface maintained
```

---

### 5.2 Refactoring Workflow

**OLD WORKFLOW:**
```
1. User: "Extract common validation into a utility function"
2. Agent: Finds validation code in multiple files (by searching)
3. Agent: Creates new function manually
4. Agent: Updates some call sites
5. BUG FORGOTTEN: One call site not updated, inconsistency
```

**NEW WORKFLOW:**
```
1. User: "Extract common validation into a utility function"
2. Agent: kg_search("validate", type="FUNCTION") -> finds all validations
3. Agent: kg_traverse(results, max_hops=1) -> maps relationships
4. Agent: Identifies patterns and commonalities
5. Agent: Creates utility with proper signature
6. Agent: kg_get_callers() ensures ALL usages updated
7. SUCCESS: Complete refactoring, no inconsistencies
```

---

### 5.3 Test Generation Workflow

**OLD WORKFLOW:**
```
1. User: "Write tests for the Parser class"
2. Agent: Reads parser.py
3. Agent: Writes basic tests
4. MISSING: Tests don't cover edge cases in dependencies
```

**NEW WORKFLOW:**
```
1. User: "Write tests for the Parser class"
2. Agent: kg_find_entity("Parser") -> finds class
3. Agent: kg_get_neighbors("Parser", outgoing) -> finds all methods
4. Agent: kg_extract_context(max_hops=1) -> loads dependencies
5. Agent: Identifies edge cases from dependency types
6. Agent: Writes comprehensive tests with proper mocks
7. SUCCESS: High coverage, handles edge cases
```

---

### 5.4 Bug Fix Workflow

**OLD WORKFLOW:**
```
1. User: "Fix the crash in parse_file()"
2. Agent: Reads parse_file() implementation
3. Agent: Fixes obvious bug
4. REGRESSION: Fix breaks another code path not examined
```

**NEW WORKFLOW:**
```
1. User: "Fix the crash in parse_file()"
2. Agent: kg_find_entity("parse_file") -> entity_id
3. Agent: kg_get_callers(entity_id) -> finds all usage sites
4. Agent: kg_traverse(entity_id, max_hops=2) -> maps full call graph
5. Agent: kg_extract_context() -> loads all affected code
6. Agent: Fixes bug with awareness of all usage patterns
7. SUCCESS: Fix is complete and doesn't break other paths
```

---

### 5.5 Code Review Workflow

**OLD WORKFLOW:**
```
1. User: "Review my changes"
2. Agent: Reads changed files
3. Agent: Checks syntax, style
4. MISS: Doesn't catch that change breaks downstream code
```

**NEW WORKFLOW:**
```
1. User: "Review my changes"
2. Agent: Parses git diff for changed entities
3. Agent: kg_impact(changed_entity) -> finds affected code
4. Agent: kg_get_callers() -> identifies consumers
5. Agent: Checks if changes are backward compatible
6. Agent: Flags potential breaking changes in review
7. SUCCESS: Comprehensive review with impact awareness
```

---

## 6. Implementation Plan

### 6.1 Phase 1: Core Infrastructure (Week 1)

**Files to Create:**
```
kg_builder/
├── skills/              # NEW directory for skill handlers
│   ├── __init__.py
│   ├── base.py          # Base skill class with KG access
│   ├── explore.py       # /explore skill implementation
│   ├── impact.py        # /impact skill implementation
│   ├── context.py       # /context skill implementation
│   ├── dependencies.py  # /dependencies skill implementation
│   └── search.py        # /search skill implementation
│
├── tools/               # NEW directory for tool functions
│   ├── __init__.py      # Tool registration
│   ├── find_entity.py   # kg_find_entity()
│   ├── get_neighbors.py # kg_get_neighbors()
│   ├── extract_context.py # kg_extract_context()
│   ├── get_callers.py   # kg_get_callers()
│   ├── traverse.py      # kg_traverse()
│   └── resolve_import.py # kg_resolve_import()
│
├── cache/               # NEW directory for KG caching
│   └── manager.py       # Caching strategy implementation
│
└── cli_tools.py         # NEW: CLI entry points for tools
```

**Dependencies:**
- `dataclasses` (Python stdlib) - already used
- `json` (stdlib) - already used
- `pathlib` (stdlib) - already used
- `cachetools` or `diskcache` - optional caching enhancement

---

### 6.2 Phase 2: KG Caching Strategy (Week 1-2)

**Problem**: Building the knowledge graph on every tool call is expensive.

**Solution**: Implement smart caching with incremental updates.

```python
# kg_builder/cache/manager.py

class KGCacheManager:
    """Manage cached knowledge graphs with invalidation."""

    def __init__(self, cache_dir: str = ".kg_cache"):
        self.cache_dir = Path(cache_dir)
        self.kg_by_path: dict[str, tuple[KnowledgeGraph, datetime]] = {}

    def get_or_build(
        self,
        codebase_path: str,
        exclude_patterns: list[str] | None = None
    ) -> KnowledgeGraph:
        """Get cached KG or build if needed."""
        path_hash = self._hash_codebase(codebase_path)

        # Check cache
        cached = self._load_from_cache(path_hash)
        if cached and not self._is_stale(cached, codebase_path):
            return cached.kg

        # Build fresh
        kg = build_knowledge_graph(codebase_path, exclude_patterns)
        self._save_to_cache(path_hash, kg)
        return kg

    def invalidate(self, changed_files: list[str]) -> None:
        """Invalidate cache for changed files."""
        pass  # Incremental invalidation logic

    def _hash_codebase(self, path: str) -> str:
        """Generate hash from file mtimes."""
        pass
```

**Caching Strategy Options:**

| Strategy | Pros | Cons |
|----------|------|------|
| **File-based cache** (pickle/kg.json) | Fast loads, persistent | Invalidates on any change |
| **In-memory only** | Simplest | Rebuilds per session |
| **Incremental updates** | Most efficient for edits | Complex implementation |

**Recommendation**: Start with file-based cache, add incremental later.

---

### 6.3 Phase 3: Tool Registration (Week 2)

**Tool registration for Claude Code CLI:**

```python
# kg_builder/tools/__init__.py

from anthropic.types import ToolUnion

def get_registered_tools() -> list[ToolUnion]:
    """Return all registered kg_builder tools."""
    return [
        # Entity lookup
        {
            "name": "kg_find_entity",
            "description": "Find entities in the knowledge graph by name or pattern.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                    "entity_type": {"type": "string", "enum": [...]},
                    "fuzzy": {"type": "boolean"},
                    "max_results": {"type": "integer"}
                },
                "required": ["query"]
            }
        },
        # ... other tools
    ]
```

---

### 6.4 Phase 4: Skill Handlers (Week 2-3)

**Skill handler structure:**

```python
# kg_builder/skills/base.py

class BaseSkill:
    """Base class for knowledge graph skills."""

    def __init__(self, kg: KnowledgeGraph):
        self.kg = kg
        self.engine = KGQueryEngine(kg)
        self.resolver = SymbolResolver(kg)

    def handle(self, **args) -> dict:
        raise NotImplementedError


# kg_builder/skills/explore.py

class ExploreSkill(BaseSkill):
    """Handle /explore <entity_name> commands."""

    def handle(
        self,
        entity_name: str,
        hops: int = 1,
        show_code: bool = False,
        type_filter: str | None = None
    ) -> dict:
        # Implementation here
        pass
```

---

### 6.5 Phase 5: Integration & Testing (Week 3-4)

**Test structure:**
```
tests/
├── test_skills/
│   ├── test_explore.py
│   ├── test_impact.py
│   ├── test_context.py
│   └── test_dependencies.py
├── test_tools/
│   ├── test_find_entity.py
│   ├── test_get_neighbors.py
│   ├── test_extract_context.py
│   └── test_traverse.py
└── test_cache/
    └── test_manager.py
```

**Integration tests:**
- End-to-end workflow tests (find → traverse → extract)
- Caching invalidation tests
- Large codebase performance tests

---

## 7. Technical Architecture

### 7.1 System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Claude Code Agent                        │
│                     (qwen3.5)                               │
├─────────────────────────────────────────────────────────────┤
│  User Input: "/explore KGQueryEngine"                       │
│           OR "Add validation to process_order()"            │
└─────────────────────────┬───────────────────────────────────┘
                          │
              ┌───────────▼───────────┐
              │  Skill/Tool Dispatcher │
              │  (kg_builder CLI)      │
              └───────────┬───────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────────┐
│    Skills   │  │    Tools    │  │   Cache Manager │
│ (user-init) │  │(LLM-autocall)│  │  (file-based)   │
└──────┬──────┘  └──────┬──────┘  └────────┬────────┘
       │                │                   │
       └────────────────┼───────────────────┘
                        │
              ┌─────────▼─────────┐
              │  KGQueryEngine    │
              │  SymbolResolver   │
              └─────────┬─────────┘
                        │
              ┌─────────▼─────────┐
              │ KnowledgeGraph    │
              │ (entities + rels) │
              └───────────────────┘
```

### 7.2 Data Flow Examples

**Tool Invocation Flow:**
```
1. LLM decides it needs KG context
   ↓
2. LLM calls kg_find_entity("process_order")
   ↓
3. Tool handler receives parameters
   ↓
4. Cache manager provides cached or fresh KG
   ↓
5. KGQueryEngine performs search
   ↓
6. Results formatted as structured dict
   ↓
7. LLM receives results, decides next action
```

**Skill Invocation Flow:**
```
1. User types: /explore parse_file --hops 2 --show-code
   ↓
2. CLI parses skill name and arguments
   ↓
3. Cache manager loads KG for current codebase
   ↓
4. ExploreSkill.handle() executes query
   ↓
5. Formatted output displayed to user
```

### 7.3 Performance Considerations

| Operation | Typical Cost | Caching Benefit |
|-----------|-------------|-----------------|
| `build_knowledge_graph()` | 2-10s for medium codebase | Huge (avoid on every query) |
| `search_by_name()` | <1ms with index | Minimal |
| `traverse_hops(max_hops=2)` | 50-200ms | Moderate |
| `get_code_context()` | IO-bound, varies | Moderate |

**Optimization Strategies:**
1. **KG Persistence**: Save/load KG from disk (pickle or JSON)
2. **Incremental Updates**: Only rebuild changed files
3. **Lazy Loading**: Build indices on-demand
4. **Query Batching**: Combine multiple lookups

---

## 8. Open Questions

### 8.1 Architecture Questions

| Question | Options | Recommendation |
|----------|---------|----------------|
| How to handle KG rebuild triggers? | File watcher, git hooks, manual | Start with manual (`--refresh` flag) |
| Cache file format? | Pickle (fast), JSON (portable) | Pickle for speed, JSON export option |
| Global vs per-project cache? | Single cache, per-project dirs | Per-project in `.kg_cache/` |
| Tool invocation mode? | MCP server, CLI wrapper, Python import | MCP server for native Claude Code integration |

### 8.2 Skill Design Questions

| Question | Options | Recommendation |
|----------|---------|----------------|
| Skill output format? | Plain text, JSON, Markdown | Structured text with optional `--json` |
| Should skills have state? | Stateless per-call, persistent session | Stateless for simplicity |
| Error handling approach? | Return error dict, raise exceptions | Return structured errors |

### 8.3 Integration Questions

| Question | Options | Recommendation |
|----------|---------|----------------|
| How does agent know KG is available? | Document in CLAUDE.md, auto-detect | Document + tool registration |
| Should tools be always-on or opt-in? | Always loaded, flag-controlled | Opt-in via `kg_builder init` |
| Multi-repo support? | Single repo at a time, composite KGs | Start single, extend later |

### 8.4 Future Enhancements (Not MVP)

1. **Vector Search**: Semantic search across code using embeddings
2. **Graph Visualization**: Interactive UI for exploration
3. **Change Diff Integration**: Highlight what changed in KG terms
4. **Type Information**: Extract and query type relationships
5. **Documentation Links**: Connect entities to docs/stubs
6. **ML-Based Ranking**: Score relevance of traversal results

---

## Appendix A: Example Session Transcripts

### Transcript 1: Using `/explore` Skill

```
$ /explore KGQueryEngine --hops 2

Found entity: KGQueryEngine (CLASS)
Location: kg_builder/query_engine.py:9-189

Outgoing Relationships (1-hop):
  CONTAINS → get_neighbors
  CONTAINS → traverse_hops
  CONTAINS → search_by_name
  CONTAINS → get_callers
  CONTAINS → get_code_context

Entities within 2 hops: 47 entities across 8 files
  - kg_builder/models.py (EntityType, RelationshipType)
  - kg_builder/parser.py (parse_file)
  - examples/agent_demo.py (demo_find_function_context)

Callers of KGQueryEngine:
  1. kg_builder/__init__.py::build_knowledge_graph
  2. examples/agent_demo.py::main
  3. kg_builder/cli.py (import only)

Press 'c' to show code context, 'q' to quit.
```

### Transcript 2: Using Tools for Feature Implementation

```
[User] Add input validation to the parse_file function

[Agent thinking]
1. Need to understand parse_file first
   → kg_find_entity("parse_file")
2. See what calls it and how
   → kg_get_callers(result.entity_id)
3. Load related code for context
   → kg_extract_context(entity_id, max_hocs=1)

[Tool: kg_find_entity]
{
  "success": true,
  "results": [
    {
      "id": "kg_builder/parser.py::parse_file",
      "name": "parse_file",
      "type": "FUNCTION",
      "file_path": "kg_builder/parser.py",
      "line_number": 45
    }
  ]
}

[Tool: kg_get_callers]
{
  "success": true,
  "direct_callers": [
    "kg_builder/__init__.py::build_knowledge_graph"
  ],
  ...
}

[Agent] Based on the KG analysis, I'll add validation that checks for...
```

---

## Appendix B: Configuration Options

**Sample config file (`.kg_builder.toml`):**

```toml
[cache]
enabled = true
directory = ".kg_cache"
ttl_seconds = 3600  # 1 hour

[exclusions]
patterns = ["**/tests/*", "**/venv/*", "**/node_modules/*"]

[tools]
max_results = 20
default_hops = 1
auto_refresh = false

[skills]
output_format = "text"  # or "json"
verbose = true
```

---

## Summary

This design provides a comprehensive foundation for **knowledge-graph-guided agentic coding** through `kg_builder`. The specification includes:

1. **5 Skills**: `/explore`, `/impact`, `/context`, `/dependencies`, `/search`
2. **6 Tools**: `kg_find_entity`, `kg_get_neighbors`, `kg_extract_context`, `kg_get_callers`, `kg_traverse`, `kg_resolve_import`
3. **Workflow Transformations**: Before/after comparisons showing KG value
4. **Implementation Plan**: 5-phase approach with file structure
5. **Technical Architecture**: System design and data flows
6. **Open Questions**: Ambiguities requiring clarification

The key insight is that **KG guidance before code changes** prevents regressions, improves test coverage, and enables more confident refactoring by providing agents with a structural understanding of the codebase that goes beyond simple file reading.
