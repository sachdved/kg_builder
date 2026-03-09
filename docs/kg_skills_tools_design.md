# Claude Code Skills & Tools Design for kg_builder

## Executive Summary

This document specifies a design for integrating `kg_builder` knowledge graph capabilities into Claude Code as **skills** (user-triggered via `/command`) and **tools** (auto-invoked by the LLM). The goal is to enable agents to understand code structure, relationships, and impact before writing or modifying code.

---

## 1. Use Cases Where KG Guidance Is Valuable

### 1.1 Feature Implementation
**Scenario:** "Add rate limiting to the API endpoint handler"

**KG Value:**
- Find all API handlers in the codebase
- Discover existing patterns for error handling, logging, decorators
- Identify what middleware/decorators are already applied
- Understand call hierarchy to avoid breaking changes

### 1.2 Refactoring
**Scenario:** "Extract this validation logic into a separate module"

**KG Value:**
- Find all callers of the function/class being refactored
- Understand dependencies and imports
- Identify tests that will need updates
- Detect circular dependencies before restructuring

### 1.3 Bug Fixing
**Scenario:** "Fix the race condition in the cache manager"

**KG Value:**
- Trace all code paths that access shared state
- Find related lock/semaphore patterns used elsewhere
- Identify async functions and their callers
- Understand inheritance hierarchy for inherited bugs

### 1.4 Test Creation
**Scenario:** "Write tests for the new authentication module"

**KG Value:**
- Find similar test patterns in existing codebase
- Identify mock/stub patterns already established
- Discover edge cases from related modules
- Understand what functions need coverage based on relationships

### 1.5 Code Reviews
**Scenario:** "Review this PR for potential issues"

**KG Value:**
- Load only relevant context (not entire files)
- See what upstream/downstream code might be affected
- Identify unconnected changes that should be in the same PR
- Verify consistency with existing patterns

---

## 2. Skill Specifications (User-Triggered via `/`)

### Skill 1: `/kg-explore`

**Purpose:** Explore an entity and its immediate relationships in the knowledge graph.

```
Usage: /kg-explore <entity_name> [options]
```

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `entity_name` | string | Yes | - | Name of entity to explore (function, class, etc.) |
| `--type` | enum | No | all | Filter by type: function, class, import, constant |
| `--file` | string | No | - | Restrict search to specific file |
| `--max-results` | int | No | 5 | Maximum number of results to show |

**KG Operations Performed:**
1. `engine.search_by_name(entity_name, fuzzy=True)` - Find matching entities
2. For each match: `engine.get_neighbors(entity_id, direction="both")` - Get relationships
3. Filter results by type/file if specified

**Output Format (Markdown for agent consumption):**

```markdown
## KG Explorer Results for "process_order"

### Found 2 matching entities:

#### [1] process_order (FUNCTION)
📁 File: `app/services/order_service.py:45`
🏷️ Properties: async=True, decorators=[@transactional]

**Relationships:**
- CALLS → validate_inventory() [app/services/inventory.py:23]
- CALLS → send_notification() [app/services/notify.py:67]
- CONTAINS ← OrderService class [app/services/order_service.py:12]
- IMPORTS_RESOLVED_TO → Order model [app/models/order.py:5]

---

#### [2] ProcessOrderHandler (CLASS)
📁 File: `api/handlers.py:89`
...

[Full 3-hop context available via /kg-context]
```

**Agent Use Case:** Initial exploration before any code modification.

---

### Skill 2: `/kg-impact`

**Purpose:** Analyze impact of changing a specific entity (caller/callee analysis).

```
Usage: /kg-impact <entity_name> [options]
```

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `entity_name` | string | Yes | - | Entity to analyze impact for |
| `--depth` | int | No | 2 | How many hops to trace callers/callees |
| `--show-tests` | bool | No | true | Include test files in analysis |

**KG Operations Performed:**
1. `engine.search_by_name(entity_name)` - Find target entity
2. `engine.get_callers(entity_id)` - Get direct callers
3. `engine.traverse_hops([entity_id], max_hops=depth, direction="incoming")` - Upstream impact
4. `engine.traverse_hops([entity_id], max_hops=depth, direction="outgoing")` - Downstream dependencies

**Output Format:**

```markdown
## Impact Analysis for "validate_user_input"

### ⚠️ High Impact Change
Modifying this entity will affect **8 locations** across **4 files**.

### Direct Callers (Who calls this?)
1. `UserRegistrationHandler.__init__` - api/handlers.py:34
2. `UserProfile.update()` - models/user.py:89
3. `AuthService.authenticate()` - services/auth.py:156

### Transitive Impact (via 2-hop traversal)
- UserRegistration tests → tests/test_handlers.py
- UserProfile migration scripts → migrations/001_users.py

### This Entity Calls (Dependencies)
- `sanitize_email()` - utils/validation.py
- `check_rate_limit()` - services/rate_limiter.py

### Risk Assessment
🔴 High: Called from public API handlers
🟡 Medium: Changes may require test updates in 3 test files
🟢 Low: No database schema dependencies detected

### Recommended Actions
1. Update tests in tests/test_handlers.py, tests/test_services.py
2. Check backward compatibility with UserProfile migration
3. Monitor rate_limiter.py for similar patterns to maintain consistency
```

**Agent Use Case:** Before refactoring or modifying shared utilities.

---

### Skill 3: `/kg-context`

**Purpose:** Extract code context with N-hop relationships, including actual code snippets.

```
Usage: /kg-context <entity_name> [options]
```

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `entity_name` | string | Yes | - | Target entity name |
| `--hops` | int | No | 2 | Number of relationship hops to include |
| `--exclude-types` | list | No | [] | Entity types to skip (IMPORT, VARIABLE) |
| `--max-code-lines` | int | No | 50 | Max lines per code snippet |

**KG Operations Performed:**
1. `engine.search_by_name(entity_name)` - Find target
2. `engine.get_code_context(entity_id, max_hops=hops)` - Extract with context
3. Group by file for efficient reading

**Output Format (with code snippets):**

```markdown
## Code Context for "KGQueryEngine"

### Target Entity
📁 kg_builder/query_engine.py:9-189

```python
class KGQueryEngine:
    """Query interface for the knowledge graph."""

    def __init__(self, kg: KnowledgeGraph) -> None:
        self.kg = kg
        if not self.kg._adjacency:
            self.kg._build_indices()

    def get_neighbors(self, entity_id: str, ...) -> list[tuple[...]]:
        neighbors = []
        # ... (truncated to max-code-lines)
```

### Related Entities (2-hop context)

#### 1. KnowledgeGraph (CLASS) - CONTAINS relationship
📁 kg_builder/models.py:122-209

```python
class KnowledgeGraph:
    def __init__(self) -> None:
        self.entities: dict[str, Entity] = {}
        self.relationships: list[Relationship] = []
        # ...
```

#### 2. search_by_name (FUNCTION) - DEFINES_IN relationship
📁 kg_builder/query_engine.py:100-125

```python
def search_by_name(self, name: str, fuzzy: bool = False) -> list[str]:
    name_lower = name.lower()
    if not self.kg._by_name:
        self.kg._build_indices()
    # ...
```

### Summary
- **Files to review:** 2 files with 3 related entities
- **Total code lines:** 187 lines of context extracted
- **Relationship types found:** CONTAINS (2), CALLS (5), IMPORTS_RESOLVED_TO (3)
```

**Agent Use Case:** Loading precise code context before writing changes.

---

### Skill 4: `/kg-dependencies`

**Purpose:** Visualize import and dependency relationships for a file or module.

```
Usage: /kg-dependencies <file_or_module> [options]
```

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `file_or_module` | string | Yes | - | File path or module name |
| `--format` | enum | No | tree | Output format: tree, dot, json |
| `--include-external` | bool | No | false | Show third-party imports |
| `--reverse` | bool | No | false | Show who depends on this file |

**KG Operations Performed:**
1. Search for FILE entity or module pattern
2. Get all IMPORT relationships with type IMPORTS/IMPORTS_RESOLVED_TO
3. Traverse resolved targets to find cross-file dependencies
4. Optionally traverse in reverse for dependents

**Output Format (tree):**

```markdown
## Dependencies for "kg_builder/query_engine.py"

### Imports (This file depends on:)

stdlib/external:
├── collections.deque
└── typing.Optional, list

internal:
├── kg_builder/models.py
│   ├── KnowledgeGraph ──used in──── KGQueryEngine.__init__
│   └── RelationshipType ──used in──── get_neighbors()
└── (circular dependency check: none found)

### Called by (Who depends on this file?)
├── kg_builder/__init__.py (exports KGQueryEngine)
├── examples/agent_demo.py
│   └── demo_find_function_context() uses KGQueryEngine
└── tests/test_query_engine.py

### Dependency Metrics
- Internal imports: 1 file
- External imports: 2 modules
- Used by: 3 files
- Circular dependencies: 0
```

**Agent Use Case:** Understanding module structure before adding new imports or refactoring modules.

---

### Skill 5: `/kg-symbols`

**Purpose:** Symbol resolution and cross-file reference lookup.

```
Usage: /kg-symbols <symbol_name> [options]
```

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `symbol_name` | string | Yes | - | Symbol to resolve (e.g., "List", "Entity") |
| `--show-usage` | bool | No | true | Show where symbol is used |
| `--include-imports` | bool | No | false | Also show import statements |

**KG Operations Performed:**
1. `engine.search_by_name(symbol_name)` - Find definitions
2. For each definition: trace IMPORTS_RESOLVED_TO relationships
3. Find all entities that call/contain this symbol

**Output Format:**

```markdown
## Symbol Resolution for "Entity"

### Definitions Found (2)
1. **kg_builder.models.Entity** (CLASS) - Primary definition
   📁 kg_builder/models.py:42-79
   This is the main dataclass definition

2. **typing.Entity** (IMPORT) - External type hint
   📁 external/typing/Entity.py - Third-party reference

### Usage Across Codebase

In kg_builder/query_engine.py:
- Line 6: from kg_builder.models import KnowledgeGraph, RelationshipType
- Line 18: self.kg = kg  # Uses Entity internally via KnowledgeGraph.entities

In kg_builder/__init__.py:
- Line 18: Exports Entity in __all__

### Import Chain (How Entity reaches query_engine)
query_engine.py
  ← imports from → models.py (direct import of RelationshipType, uses Entity indirectly)
```

**Agent Use Case:** Understanding symbol scoping and resolution across modules.

---

## 3. Tool Specifications (Auto-Invoked by LLM)

### Tool 1: `kg_find_entity`

```python
def kg_find_entity(
    query: str,
    entity_type: Optional[str] = None,
    file_path: Optional[str] = None,
    fuzzy: bool = True,
    max_results: int = 10
) -> dict:
    """Find entities matching a query string.

    Args:
        query: Search string (name or partial name).
        entity_type: Filter by type ('CLASS', 'FUNCTION', etc.).
        file_path: Restrict to specific file.
        fuzzy: Enable substring matching.
        max_results: Maximum results to return.

    Returns:
        {
            "matches": [
                {
                    "entity_id": "file.py::ClassName",
                    "name": "ClassName",
                    "type": "CLASS",
                    "file_path": "file.py",
                    "line_number": 42,
                    "properties": {}
                }
            ],
            "count": int,
            "truncated": bool
        }
    ```

**When to Invoke:**
- Agent needs to locate code before modifying it
- User references a function/class by name
- Verifying entity exists before other KG operations

**Example Usage (Agent Internal):**
```python
result = kg_find_entity("process_order", entity_type="FUNCTION")
if result["matches"]:
    target_id = result["matches"][0]["entity_id"]
    # Proceed with modification...
```

---

### Tool 2: `kg_get_neighbors`

```python
def kg_get_neighbors(
    entity_id: str,
    direction: str = "both",      # "outgoing", "incoming", "both"
    relationship_types: Optional[list[str]] = None,
    max_results: int = 50
) -> dict:
    """Get neighboring entities connected to the given entity.

    Args:
        entity_id: The entity ID to get neighbors for.
        direction: Which relationships to traverse.
        relationship_types: Filter by types (e.g., ["CALLS", "CONTAINS"]).
        max_results: Limit results.

    Returns:
        {
            "entity_id": str,
            "neighbors": [
                {
                    "relationship_type": "CALLS",
                    "target_entity_id": "other.py::func",
                    "target_name": "func",
                    "line_number": 45
                }
            ],
            "summary": {
                "calls": 3,
                "contains": 2,
                "imports": 5
            }
        }
    ```

**When to Invoke:**
- Understanding what an entity depends on or affects
- Finding related code for context extraction
- Before any modification to understand scope

---

### Tool 3: `kg_extract_context`

```python
def kg_extract_context(
    entity_id: str,
    max_hops: int = 2,
    include_self: bool = True,
    exclude_types: Optional[list[str]] = None,
    max_lines_per_entity: int = 50
) -> dict:
    """Extract code context for an entity and its relationship neighbors.

    Args:
        entity_id: Target entity ID.
        max_hops: Relationship traversal depth.
        include_self: Include target's own code.
        exclude_types: Skip these entity types.
        max_lines_per_entity: Truncate long entities.

    Returns:
        {
            "target_entity": {"entity_id": "...", "name": "...", ...},
            "code_context": {
                "file.py::ClassName": "class ClassName:\n    def method():\n        pass",
                "file.py::other_func": "def other_func():\n    ..."
            },
            "relationship_map": {
                "file.py::ClassName": [
                    {"type": "CALLS", "target": "file.py::other_func"}
                ]
            },
            "files_to_read": ["file.py", "other_file.py"]
        }
    ```

**When to Invoke:**
- Agent needs actual code snippets before writing changes
- Loading context for editing or generating new code
- Understanding implementation details of related entities

---

### Tool 4: `kg_get_callers`

```python
def kg_get_callers(
    entity_id: str,
    include_transitive: bool = False,
    max_depth: int = 2
) -> dict:
    """Find all entities that call the given entity.

    Args:
        entity_id: Target entity ID.
        include_transitive: Include callers of callers.
        max_depth: Depth for transitive traversal.

    Returns:
        {
            "entity_id": str,
            "direct_callers": [
                {
                    "caller_id": "file.py::calling_func",
                    "caller_name": "calling_func",
                    "call_line": 45,
                    "is_test": False
                }
            ],
            "transitive_callers": [...],
            "summary": {
                "total_callers": 8,
                "test_files": 3,
                "api_endpoints": 2
            }
        }
    ```

**When to Invoke:**
- Before modifying a function (impact assessment)
- Finding tests that might break
- Understanding public API surface

---

### Tool 5: `kg_traverse_relationships`

```python
def kg_traverse_relationships(
    start_entity_ids: list[str],
    max_hops: int = 2,
    include_relationship_types: Optional[list[str]] = None,
    exclude_entity_types: Optional[list[str]] = None,
    direction: str = "outgoing"
) -> dict:
    """Breadth-first traversal from starting entities.

    Args:
        start_entity_ids: Entity IDs to start from.
        max_hops: Maximum traversal depth.
        include_relationship_types: Only follow these relationships.
        exclude_entity_types: Skip these entity types.
        direction: "outgoing", "incoming", or "both".

    Returns:
        {
            "visited": {
                "entity_id": {"hops": 1, "path": "..."}
            },
            "traversal_tree": {
                "start_id": [
                    {"type": "CALLS", "children": [...]}
                ]
            }
        }
    ```

**When to Invoke:**
- Finding all code in a dependency chain
- Mapping complete call graphs
- Understanding complex interdependencies

---

### Tool 6: `kg_build_cache_status`

```python
def kg_build_cache_status(
    codebase_path: str
) -> dict:
    """Check if a knowledge graph cache exists and its freshness.

    Args:
        codebase_path: Path to the codebase.

    Returns:
        {
            "cache_exists": bool,
            "cache_path": str,
            "cached_at": datetime,
            "codebase_modified_after_cache": bool,
            "entity_count": int,
            "relationship_count": int,
            "needs_rebuild": bool,
            "estimated_rebuild_time_seconds": float
        }
    ```

**When to Invoke:**
- Before any KG operation (check cache first)
- Determine if rebuild is needed
- Inform user about stale cache

---

## 4. Workflow Examples

### Example 1: Adding Validation to a Function

#### OLD WORKFLOW (Without KG)

```
User: "Add input validation to process_order()"

Agent Actions:
1. Search for file containing process_order() using file search
2. Read the entire order_service.py file
3. Guess what imports might be needed
4. Write changes without knowing impact
5. Potentially break callers that don't expect validation errors
```

**Problems:**
- Reads entire file instead of just the function
- Doesn't know about existing validation patterns
- Misses impact on callers
- No awareness of related tests

---

#### NEW WORKFLOW (With KG Tools)

```
User: "Add input validation to process_order()"

Agent Actions:
1. kg_find_entity("process_order", entity_type="FUNCTION")
   → Finds: app/services/order_service.py::process_order at line 45

2. kg_extract_context(
       entity_id="app/services/order_service.py::process_order",
       max_hops=2,
       exclude_types=["IMPORT"]
   )
   → Gets function code + called functions + containing class

3. kg_get_callers(entity_id="...::process_order", include_transitive=True)
   → Discovers: Called from API handlers (needs error handling),
                Called from scheduled tasks (might need timeout)

4. kg_traverse_relationships(
       start_entity_ids=["...::process_order"],
       max_hops=1,
       include_relationship_types=["CALLS"]
   )
   → Finds existing validation functions: validate_email(), sanitize_input()

5. kg_find_entity(query="validate", entity_type="FUNCTION")
   → Discovers pattern: @validator decorator used elsewhere

6. Write changes using established patterns and add error handling for callers
```

**Benefits:**
- Precise code extraction (only needed sections)
- Impact awareness before changing
- Consistent with existing patterns
- Proactively handles edge cases

---

### Example 2: Refactoring Shared Logic

#### OLD WORKFLOW

```
User: "Extract the authentication logic into a separate module"

Agent Actions:
1. Read all files mentioning authentication
2. Manually trace imports across files
3. Create new file with extracted code
4. Update imports one by one
5. Hope tests still pass
```

#### NEW WORKFLOW

```
User: "Extract the authentication logic into a separate module"

Agent Actions:
1. kg_find_entity("authenticate", entity_type="FUNCTION")
   → Finds definition in services/auth.py

2. kg-impact authenticate --depth=2
   → Reports: 12 callers across 8 files, 5 test files affected

3. kg_dependencies "services/auth.py" --reverse
   → Maps complete dependency tree for migration planning

4. kg_extract_context(
       entity_id="services/auth.py::authenticate",
       max_hops=1
   )
   → Gets auth logic + immediate dependencies only

5. Create new module with exact extracted code

6. kg_find_entity(query=".import.*auth")  # Find all imports
   → Gets list of files to update

7. Update imports systematically using KG-resolved paths

8. kg_get_callers(...) again to verify changes
```

---

### Example 3: Bug Fix with Context

#### NEW WORKFLOW (KG-Guided)

```
User: "There's a race condition in the cache manager"

Agent Actions:
1. kg_find_entity("CacheManager")
   → Found: services/cache.py::CacheManager

2. kg-impact CacheManager --depth=3
   → Shows: Async methods, multiple callers accessing shared state

3. kg_extract_context(
       entity_id="services/cache.py::CacheManager",
       max_hops=2,
       exclude_types=["IMPORT", "VARIABLE"]
   )
   → Extracts: CacheManager class + all async methods + lock patterns used

4. kg_traverse_relationships(
       start_entity_ids=["...::CacheManager"],
       include_relationship_types=["CALLS", "CONTAINS"],
       max_hops=2
   )
   → Maps: All code paths accessing _cache dict

5. kg_find_entity(query="lock|asyncio|RLock")
   → Finds: existing lock patterns in services/database.py, services/queue.py

6. Apply fix using consistent locking pattern from other modules
```

---

## 5. Implementation Plan

### Phase 1: Core Infrastructure

#### Files to Create:

```
kg_builder/
├── tools/                    # NEW directory
│   ├── __init__.py          # Tool registration
│   ├── cache.py             # KG caching layer
│   └── state.py             # Persistent state management
│
├── skills/                   # NEW directory
│   ├── __init__.py          # Skill registration
│   ├── explore.py           # /kg-explore handler
│   ├── impact.py            # /kg-impact handler
│   ├── context.py           # /kg-context handler
│   ├── dependencies.py      # /kg-dependencies handler
│   └── symbols.py           # /kg-symbols handler
│
└── cache/                    # NEW directory (gitignored)
    └── .kg-cache/           # Cached knowledge graphs
```

#### Implementation Order:

1. **`kg_builder/tools/cache.py`** - Caching infrastructure
   - `KGCacheManager` class for loading/saving cached KGs
   - File hashing to detect code changes
   - Configurable TTL and cache location

2. **`kg_builder/tools/__init__.py`** - Tool registration
   - Implement all 6 tool functions
   - Each returns consistent dict structure
   - Error handling with clear messages

3. **`kg_builder/skills/__init__.py`** - Skill orchestration
   - Parse `/skill-name` commands
   - Dispatch to appropriate handler
   - Format output for agent consumption

4. **Individual skill handlers** (`explore.py`, `impact.py`, etc.)
   - Each implements its specification
   - Uses tools internally
   - Returns formatted markdown

### Phase 2: Claude Code Integration

#### Option A: MCP Server (Recommended)

```
kg_builder/
└── mcp_server/
    ├── __init__.py
    └── server.py  # Model Context Protocol implementation
```

Benefits: Standard integration, works with any MCP-compatible client

#### Option B: Custom CLI Hook

Modify `cli.py` to accept tool/skill commands:
```bash
kg_builder /path --tool kg_find_entity "process_order"
kg_builder /path --skill impact authenticate --depth 2
```

### Phase 3: Testing & Documentation

- Integration tests for each tool
- Skill output format validation
- Example workflows in examples/

---

## 6. Technical Requirements

### 6.1 Caching Strategy

**Problem:** Building KG from scratch is slow for large codebases.

**Solution:** Multi-level cache with change detection.

```python
class KGCacheManager:
    def __init__(self, codebase_path: str, cache_dir: str = "~/.kg_builder_cache"):
        self.codebase_hash = self._hash_codebase(codebase_path)
        self.cache_file = f"{cache_dir}/{self.codebase_hash}.json"

    def get_or_build(self, force_rebuild: bool = False) -> KnowledgeGraph:
        """Get cached KG or build if missing/stale."""
        if force_rebuild or not self._cache_valid():
            kg = build_knowledge_graph(self.codebase_path)
            self._save_cache(kg)
            return kg
        return self._load_cache()

    def _hash_codebase(self, path: str) -> str:
        """Generate hash from modified times of all .py files."""
        pass
```

### 6.2 Incremental Updates (Future Enhancement)

Track which files changed and only rebuild affected portions:

```python
def incremental_update(kg: KnowledgeGraph, changed_files: list[str]) -> KnowledgeGraph:
    """Update KG with only changed files."""
    # Remove old entities/relationships from changed files
    # Re-parse changed files
    # Rebuild cross-file relationships for affected files
    return updated_kg
```

### 6.3 Tool Registration Pattern

```python
# kg_builder/tools/__init__.py

TOOL_REGISTRY = {
    "kg_find_entity": kg_find_entity,
    "kg_get_neighbors": kg_get_neighbors,
    "kg_extract_context": kg_extract_context,
    "kg_get_callers": kg_get_callers,
    "kg_traverse_relationships": kg_traverse_relationships,
    "kg_build_cache_status": kg_build_cache_status,
}

def register_tool(name: str, func):
    TOOL_REGISTRY[name] = func
```

### 6.4 Skill Command Handler

```python
# kg_builder/skills/__init__.py

SILL_REGISTRY = {
    "kg-explore": handle_explore,
    "kg-impact": handle_impact,
    "kg-context": handle_context,
    "kg-dependencies": handle_dependencies,
    "kg-symbols": handle_symbols,
}

def parse_skill_command(command: str) -> tuple[str, dict]:
    """Parse '/kg-explore foo --depth 2' into ('kg-explore', {'foo': ..., 'depth': 2})"""
    pass
```

---

## 7. Open Questions

### 7.1 Cache Management

**Q:** Where should the cache be stored?

Options:
- In-repo `.kg_builder_cache/` (versioned with code)
- Global `~/.cache/kg_builder/` (shared across projects)
- Per-project config option

**Q:** How to handle cache invalidation?

Options:
- Hash-based (rebuild only if code changes)
- Time-based (TTL in hours)
- Explicit `/kg-refresh` command

### 7.2 Tool Invocation Model

**Q:** How should agents discover available tools?

Options:
- Automatic discovery via MCP protocol
- Documentation embedded in tool docstrings
- `/kg-help` skill listing all tools

**Q:** Should tools be auto-invoked or explicit?

Current thinking:
- Skills are always explicit (`/command`)
- Tools can be auto-discovered but require explicit invocation (safer)

### 7.3 Error Handling

**Q:** What if the KG doesn't contain the requested entity?

Options:
- Return empty results with "not found" message
- Fall back to file-based search
- Suggest similar names from fuzzy matching

### 7.4 Performance Limits

**Q:** How to prevent expensive queries?

Options:
- Hard limits in tools (max_hops=5, max_results=100)
- User-configurable limits via environment variables
- Warning before expensive operations

### 7.5 Integration Depth

**Q:** Should kg_builder be a separate tool or integrated into the agent?

Options:
- Separate CLI + MCP server (loose coupling)
- Embedded library (tight integration, direct function calls)
- Hybrid: Library for programmatic use, MCP for agent use

### 7.6 Security Considerations

**Q:** Should there be limits on what code can be extracted?

Options:
- Respect `.gitignore` patterns
- Configurable exclude patterns
- Warning before extracting large amounts of code

---

## 8. Appendix: Current kg_builder Capabilities

### Entities Extracted (EntityType enum)
- FILE, MODULE, CLASS, FUNCTION, ASYNC_FUNCTION
- CONSTANT, VARIABLE, IMPORT, DIRECTORY
- DECORATOR, EXCEPTION, EXTERNAL_REF

### Relationships Captured (RelationshipType enum)
- CONTAINS (parent-child hierarchy)
- CALLS (function invocation)
- DEFINES_IN (variable scope)
- IMPORTS, IMPORTS_RESOLVED_TO (cross-file imports)
- INHERITS, INSTANTIATES (class relationships)
- USES, LOCATED_IN (semantic relationships)

### Current Query Capabilities
- `search_by_name(name, fuzzy)` - Entity lookup
- `get_neighbors(entity_id, direction, relationship_types)` - Adjacent entities
- `traverse_hops(start_ids, max_hops, exclude_types)` - BFS traversal
- `get_callers(entity_id)` - Reverse CALLS relationships
- `get_code_context(entity_id, max_hops)` - Code extraction with context

### Symbol Resolution
- `SymbolResolver.build_symbol_table()` - Cross-file symbol index
- `resolve_import(import_entity)` - Import target resolution
- `resolve_call(call_target, source_file)` - Call resolution
- Creates EXTERNAL_REF entities for unresolved imports

---

## 9. Conclusion

This design provides a comprehensive framework for integrating kg_builder into Claude Code workflows:

1. **5 Skills** for user-triggered exploration and impact analysis
2. **6 Tools** for programmatic agent access to KG data
3. **Caching strategy** for performance at scale
4. **Implementation roadmap** with prioritized phases
5. **Open questions** to guide further design decisions

The key insight is that KG tools should be invoked **before** any code modification, providing the agent with precise context about what exists, how it's connected, and what will be affected by changes.
