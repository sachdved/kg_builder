# KG-Guided Agentic Coding: Evaluation and Implementation Plan

## Executive Summary

This document evaluates the proposal to use the `kg_builder` knowledge graph for guiding agentic coding workflows. We analyze two primary use cases: (1) context-aware code loading via graph traversal, and (2) feature planning through proposed-vs-existing KG comparison. While promising, significant gaps exist in the current implementation that must be addressed before this approach can be reliably deployed.

---

## Phase 1: Critical Evaluation

### 1.1 Use Case: Context-Aware Code Loading

**Concept**: Instead of loading entire files or relying on semantic search, agents query the KG to load only relevant code sections (n-hop neighbors of target entities).

#### Strengths

| Strength | Description |
|----------|-------------|
| **Precision** | Graph structure captures actual code dependencies (imports, calls, inheritance) rather than lexical/semantic similarity. |
| **Bounded Context** | N-hop traversal naturally limits context size, preventing token overflow in LLM interactions. |
| **Deterministic** | Unlike RAG/semantic search which can be probabilistic, graph traversal yields consistent, reproducible results. |
| **Compositional** | Agents can compose multiple queries (e.g., "load callers of X" + "load implementations of Y"). |
| **Explainable** | The path through the graph provides traceable reasoning for why code was loaded. |

#### Weaknesses & Limitations

| Limitation | Impact | Example |
|------------|--------|---------|
| **No cross-file import resolution** | Cannot traverse from `import X` to X's actual definition in another file. | `from utils import helper` creates no edge to `utils.py::helper()`. |
| **Unresolved external references** | Calls to libraries/stdlib appear as dead-end edges with no target entity. | `json.loads()` has no entity for the `loads` function. |
| **No dynamic behavior modeling** | AST is static; cannot capture runtime polymorphism, monkey-patching, or reflection. | `getattr(obj, method_name)()` produces no edge. |
| **Shallow semantic understanding** | Only captures syntactic relationships, not semantic intent or conceptual similarity. | Two functions doing "validation" won't be connected unless they call each other. |
| **No usage frequency/context weighting** | All edges are equal; cannot prioritize hot paths or critical code. | Cannot distinguish core business logic from rarely-used edge cases. |

#### Edge Cases That Break the Assumption

1. **Indirect Dependencies**: A 2-hop neighbor might be irrelevant if the path is incidental.
   - Example: `feature() -> log()` calls a logging utility. Logging code loaded but irrelevant for understanding feature logic.

2. **Highly Connected Hubs**: Functions like `print()`, `logging.info()`, or framework methods create many edges, diluting relevance.
   - Example: Django view calls `request.user.is_authenticated` - 2-hop might pull in all of Django auth code.

3. **Circular Dependencies**: Graph traversal without cycle detection creates infinite loops or redundant loading.
   - Common in metaprogramming, factory patterns, and event-driven architectures.

4. **Abstract/Base Classes**: Inheritance edges point to abstract methods with no implementation context.
   - Example: `class MyWorker(BaseWorker)` - INHERITS edge doesn't show where work actually happens.

5. **Metaprogramming & DSLs**: Decorators, descriptors, and AST transformations create implicit relationships not captured by static analysis.
   - `@database.transaction()` decorator implies DB context but no explicit relationship exists.

#### Comparison to Existing Approaches

| Approach | Strengths | Weaknesses vs. KG |
|----------|-----------|-------------------|
| **Semantic Search / Code Embeddings** | Finds conceptually similar code across files; language-agnostic. | Probabilistic (top-k varies); no deterministic dependency graph; hallucination-prone. |
| **RAG with Vector DB** | Fast retrieval; scales to large codebases. | Loses structural information; chunks may be semantically incomplete. |
| **LSP-based Tooling** | Real-time, IDE-integrated; provides full cross-reference resolution. | Complex to integrate; not graph-structured by default. |
| **Call Graph Analysis (e.g., pyan)** | More complete call resolution with type inference. | Often requires type stubs; can be slow on large codebases. |
| **N-Hop KG Traversal** | Structured, explainable, bounded context. | Incomplete without import resolution; static-only. |

**Verdict**: KG-guided loading is orthogonal to semantic search. A hybrid approach (KG for dependencies + embeddings for conceptual similarity) would be strongest.

#### Problems with "1-Hop or 2-Hop" Heuristics

The N-hop heuristic is simplistic and fails in several ways:

```
PROBLEM 1: Depth doesn't equal relevance
┌─────────────────────────────────────────┐
│ modify_user() (target)                  │
│   ├─ CONTAINS → validation() [hop 1] ✓  │
│   ├─ CALLS → logger.info() [hop 1] ✗    │ (irrelevant)
│   └─ CALLS → db.query() [hop 1]         │
│         └─ CALLS → connection_pool() [hop 2] ✗ (too deep for context)
└─────────────────────────────────────────┘

PROBLEM 2: Breadth explosion
user_service.py (50 functions)
   ↓ CONTAINS (50 edges at hop 1)
   All 50 functions loaded even if only 3 are relevant.

PROBLEM 3: Missing transitive imports
file_a.py imports X from file_b.py
→ No edge exists to resolve X's definition
→ Hop traversal stops prematurely.
```

**Better Approach**: Use **type-weighted** traversal where relationship types have different costs:
- `CALLS` = cost 1 (high relevance)
- `CONTAINS` = cost 2 (contextual, loads whole scope)
- `INHERITS` = cost 1 (implementation detail)
- `IMPORTS` = cost 0.5 but requires resolution

---

### 1.2 Use Case: Feature Planning via KG Diffing

**Concept**: Compare a "proposed" KG (from requirements/specs) against the "existing" KG to determine what needs to be built.

#### Strengths

| Strength | Description |
|----------|-------------|
| **Gap Analysis** | Automatically identifies missing entities/functions needed for feature. |
| **Impact Assessment** | Shows which existing code will be modified or extended. |
| **Dependency Awareness** | Reveals upstream/downstream effects of proposed changes. |

#### Weaknesses & Critical Gaps

| Gap | Impact |
|-----|--------|
| **No "proposed KG" format** | How do requirements translate to KG entities? Natural language → structured graph is non-trivial. |
| **Fuzzy matching required** | `user_login()` vs `authenticate_user()` - are these the same entity? Requires semantic comparison. |
| **No implementation detail guidance** | Knowing "Class X is missing" doesn't help write X's internals. |
| **Relationship directionality ambiguity** | Should new feature call existing code or vice versa? Diff doesn't specify. |

#### Example: What's Missing for Effective Feature Planning

```python
# User wants: "Add user registration with email verification"

# Proposed KG (from spec):
entities = [
    Entity("register_user", FUNCTION, properties={"args": ["email", "password"]}),
    Entity("send_verification_email", FUNCTION),
    Entity("verify_email", FUNCTION, properties={"args": ["token"]}),
]

# Current KG might have:
entities = [
    Entity("user_login", FUNCTION),
    Entity("User", CLASS),
]

# Diff should produce:
- MISSING: register_user function
- MISSING: send_verification_email function
- MISSING: verify_email function
- EXTEND: User class needs email_verified field
- ADD_RELATIONSHIP: register_user CALLS send_verification_email
- ADD_RELATIONSHIP: register_user INSTANTIATES User
```

The above requires **semantic matching** to recognize that requirements mention "user" which maps to the existing `User` class. Current KG provides no mechanism for this.

---

## Phase 2: Identify Critical Gaps in Current kg_builder Output

### 2.1 Missing Data for Agentic Coding

#### Gap 1: No Import Resolution

**Current state**:
```json
{
  "id": "app/views.py::import:request",
  "type": "IMPORT",
  "properties": {"original_name": "django.http.request"}
}
```
No edge exists to the actual `HttpRequest` class in Django.

**Required addition**:
- Resolve imports to their source files (within project boundaries)
- Create cross-file `IMPORTS_RESOLVED_TO` relationships
- Handle relative imports correctly

#### Gap 2: No Cross-File Call Resolution

**Current state**:
```json
{
  "source_id": "app/views.py::login",
  "target_id": "authenticate",  // Just a string!
  "type": "CALLS"
}
```
No entity exists for `authenticate` - it's an unresolved dangling reference.

**Required addition**:
- Name resolution across files (symbol table construction)
- Link calls to actual function/class definitions
- Handle built-in/stdlib functions gracefully (mark as external)

#### Gap 3: Insufficient Relationship Semantics

**Current state**: All relationships are binary (exists/doesn't exist).

**Required additions**:
```python
@dataclass
class Relationship:
    source_id: str
    target_id: str
    type: RelationshipType
    line_number: int
    # MISSING:
    weight: float = 1.0           # Importance/criticality score
    is_direct: bool = True        # vs. transitive/inferred
    context: str | None = None    # Additional semantic context
```

#### Gap 4: No Usage Frequency or Hotness Data

**Why it matters**: Agents should prioritize core business logic over peripheral code.

**Missing**:
- Coverage data integration (which functions are tested/hit?)
- Git history integration (which files change frequently?)
- Call frequency estimation (static analysis)

#### Gap 5: No Code Snippet Extraction by Entity ID

**Current state**: KG has line numbers but no mechanism to extract the actual code span.

**Required addition**:
```python
def extract_code_span(file_path: str, start_line: int, end_line: int | None = None) -> str
# Given an entity, extract its full implementation text
def get_entity_code(entity_id: str, kg: KnowledgeGraph) -> str
```

#### Gap 6: Missing Type Information on Relationships

**Current state**: Function arguments have types, but CALLS edges don't capture what's passed.

**Required addition**:
```python
# When function A calls function B with argument x:
Relationship(
    source_id="file.py::A",
    target_id="file.py::B",
    type=CALLS,
    properties={"arg_mappings": {"param1": "source_var_x"}}
)
```

### 2.2 Missing Query Capabilities

Current KG has no query interface. Agents need:

```python
# Required queries:
kg.get_neighbors(entity_id, direction="outgoing", types=[CALLS, USES], max_hops=2)
kg.reverse_lookup(name="authenticate")  # Find all entities named "authenticate"
kg.get_callers(entity_id)  # Reverse CALLS edges
kg.get_called_by(entity_id)  # Forward CALLS edges
kg.search_semantically(query, top_k=5)  # Hybrid: KG + embeddings
kg.get_subgraph(root_ids, max_hops=2)  # For context loading
kg.diff(other_kg)  # For feature planning
```

---

## Phase 3: Design Plan for Enabling Agentic Coding

### 3.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Orchestrator                       │
│  (receives coding task, decomposes into KG queries)        │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
              ┌───────────────────────┐
              │   KG Query Engine     │
              │ - Neighbor traversal  │
              │ - Semantic search     │
              │ - Diff computation    │
              └───────────┬───────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  Enriched KG Store    │
              │ - Entities + Code     │
              │ - Resolved Edges      │
              │ - Index for lookup    │
              └───────────┬───────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  kg_builder Core      │
              │ (AST parsing, base KG)│
              └───────────────────────┘
```

### 3.2 Specific Modifications to kg_builder

#### Module 1: Enhanced Models (`models.py`)

Add new fields and types:

```python
from enum import Enum
from dataclasses import dataclass, field
from typing import Any, Optional

class EntityType(Enum):
    # Existing types...
    FILE = "FILE"
    MODULE = "MODULE"
    CLASS = "CLASS"
    FUNCTION = "FUNCTION"
    # ... etc

    # NEW: External references that couldn't be resolved
    EXTERNAL_REF = "EXTERNAL_REF"

class RelationshipType(Enum):
    # Existing types...
    CONTAINS = "CONTAINS"
    CALLS = "CALLS"
    # ... etc

    # NEW: Resolved relationships
    IMPORTS_RESOLVED_TO = "IMPORTS_RESOLVED_TO"  # Import → actual definition
    CALLS_RESOLVED = "CALLS_RESOLVED"            # Call with resolved target
    DEFINES_SYMBOL = "DEFINES_SYMBOL"            # Entity defines a symbol name


@dataclass
class Relationship:
    """Enhanced relationship with semantic metadata."""
    source_id: str
    target_id: str
    type: RelationshipType
    line_number: int

    # NEW fields for agentic coding
    weight: float = 1.0              # Edge importance (for traversal scoring)
    is_resolved: bool = False        # True if cross-file resolution succeeded
    properties: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "source_id": self.source_id,
            "target_id": self.target_id,
            "type": self.type.value,
            "line_number": self.line_number,
            "weight": self.weight,
            "is_resolved": self.is_resolved,
            "properties": self.properties,
        }


@dataclass
class Entity:
    """Enhanced entity with code span tracking."""
    id: str
    name: str
    type: EntityType
    file_path: str
    line_number: int
    properties: dict[str, Any] = field(default_factory=dict)

    # NEW: For code extraction
    end_line: Optional[int] = None   # Span end for code extraction


class KnowledgeGraph:
    """Knowledge graph with query capabilities."""

    def __init__(self) -> None:
        self.entities: dict[str, Entity] = {}
        self.relationships: list[Relationship] = []
        # NEW: Indices for fast lookup
        self._by_name: dict[str, list[str]] = {}  # name → [entity_ids]
        self._by_file: dict[str, list[str]] = {}  # file_path → [entity_ids]
        self._adjacency: dict[str, list[Relationship]] = {}  # entity_id → outgoing edges
        self._reverse_adjacency: dict[str, list[Relationship]] = {}  # entity_id → incoming edges

    def _build_indices(self) -> None:
        """Build lookup indices after all entities/relationships are added."""
        for entity in self.entities.values():
            name = entity.name.lower()
            if name not in self._by_name:
                self._by_name[name] = []
            self._by_name[name].append(entity.id)

            if entity.file_path not in self._by_file:
                self._by_file[entity.file_path] = []
            self._by_file[entity.file_path].append(entity.id)

        for rel in self.relationships:
            if rel.source_id not in self._adjacency:
                self._adjacency[rel.source_id] = []
            self._adjacency[rel.source_id].append(rel)

            if rel.target_id not in self._reverse_adjacency:
                self._reverse_adjacency[rel.target_id] = []
            self._reverse_adjacency[rel.target_id].append(rel)
```

#### Module 2: Symbol Resolver (`symbol_resolver.py`) - NEW MODULE

Cross-file resolution engine:

```python
"""Symbol resolution across files in a codebase."""

import ast
from pathlib import Path
from typing import Optional
from kg_builder.models import Entity, EntityType, Relationship, RelationshipType


class SymbolResolver:
    """Resolve symbol references to their definitions across files."""

    def __init__(self, knowledge_graph):
        self.kg = knowledge_graph
        self._symbol_table: dict[str, str] = {}  # "file.py::SymbolName" → entity_id
        self._import_cache: dict[str, str] = {}  # module_name → file_path

    def build_symbol_table(self) -> None:
        """Build a symbol table from all entities."""
        for entity in self.kg.entities.values():
            if entity.type in (EntityType.CLASS, EntityType.FUNCTION, EntityType.CONSTANT):
                # Create fully qualified name
                fq_name = f"{entity.file_path}::{entity.name}"
                self._symbol_table[fq_name] = entity.id

    def resolve_import(self, import_entity: Entity) -> Optional[str]:
        """
        Resolve an IMPORT entity to its actual definition.

        Args:
            import_entity: The import statement entity.

        Returns:
            Resolved entity_id if found, None otherwise.
        """
        module = import_entity.properties.get("module", "")
        name = import_entity.name

        # Try to find the module in our file list
        resolved_path = self._find_module_file(module)
        if not resolved_path:
            return None

        # Look for the symbol in that module
        fq_name = f"{resolved_path}::{name}"
        if fq_name in self._symbol_table:
            return self._symbol_table[fq_name]

        return None

    def resolve_call(self, call_target: str, source_file: str) -> Optional[str]:
        """
        Resolve a function/method call to its definition.

        Handles:
        - Simple calls: func() → look in local scope, then imports
        - Method calls: obj.method() → find obj's class, then method
        - Qualified calls: module.func() → look in module

        Args:
            call_target: The name being called (e.g., "helper", "obj.method")
            source_file: The file where the call originates.

        Returns:
            Resolved entity_id or None.
        """
        # Try local scope first
        local_key = f"{source_file}::{call_target.split('.')[0]}"
        if local_key in self._symbol_table:
            return self._symbol_table[local_key]

        # Try to find in imported modules
        # (requires tracking imports per file)
        return None

    def _find_module_file(self, module_name: str) -> Optional[str]:
        """Find the file path for a given module name."""
        # Convert "pkg.submodule" to "pkg/submodule.py"
        possible_paths = [
            f"{module_name.replace('.', '/')}.py",
            f"{module_name.replace('.', '/')}/__init__.py",
        ]

        for entity in self.kg.entities.values():
            if entity.type == EntityType.FILE:
                for path in possible_paths:
                    if path in entity.file_path or entity.file_path.endswith(path):
                        return entity.file_path

        return None

    def create_resolved_relationships(self) -> list[Relationship]:
        """Create resolved relationships for all imports and calls."""
        resolved = []

        # Resolve imports
        for entity in self.kg.entities.values():
            if entity.type == EntityType.IMPORT:
                target_id = self.resolve_import(entity)
                if target_id:
                    resolved.append(Relationship(
                        source_id=entity.id,
                        target_id=target_id,
                        type=RelationshipType.IMPORTS_RESOLVED_TO,
                        line_number=entity.line_number,
                        is_resolved=True,
                    ))

        # Resolve calls (more complex, requires AST re-analysis)
        # ... implementation ...

        return resolved
```

#### Module 3: Query Engine (`query_engine.py`) - NEW MODULE

```python
"""Query engine for knowledge graph traversal and search."""

from collections import deque
from typing import Optional
from kg_builder.models import KnowledgeGraph, RelationshipType


class KGQueryEngine:
    """Query interface for the knowledge graph."""

    def __init__(self, kg: KnowledgeGraph):
        self.kg = kg

    def get_neighbors(
        self,
        entity_id: str,
        direction: str = "both",  # "outgoing", "incoming", "both"
        relationship_types: list[RelationshipType] | None = None,
        include_self: bool = False,
    ) -> list[tuple[Relationship, str]]:
        """
        Get all neighbors of an entity.

        Returns:
            List of (relationship, neighbor_entity_id) tuples.
        """
        neighbors = []

        if direction in ("outgoing", "both"):
            neighbors.extend(
                (rel, rel.target_id) for rel in self.kg._adjacency.get(entity_id, [])
            )

        if direction in ("incoming", "both"):
            neighbors.extend(
                (rel, rel.source_id) for rel in self.kg._reverse_adjacency.get(entity_id, [])
            )

        if relationship_types:
            neighbors = [(r, e) for r, e in neighbors if r.type in relationship_types]

        return neighbors

    def traverse_hops(
        self,
        start_ids: list[str],
        max_hops: int,
        include_relationships: list[RelationshipType] | None = None,
        exclude_types: list[str] | None = None,  # Entity types to exclude
        weight_threshold: float = 0.0,
    ) -> dict[str, tuple[int, str]]:
        """
        Breadth-first traversal from starting entities.

        Args:
            start_ids: Starting entity IDs.
            max_hops: Maximum hop distance.
            include_relationships: Only traverse these relationship types (None = all).
            exclude_types: Entity type values to skip (e.g., ["IMPORT", "VARIABLE"]).
            weight_threshold: Minimum edge weight to include.

        Returns:
            Dict mapping entity_id → (hop_distance, path_from_start)
        """
        result: dict[str, tuple[int, str]] = {sid: (0, sid) for sid in start_ids}
        queue = deque([(entity_id, 0, entity_id) for entity_id in start_ids])

        while queue:
            current_id, hops, path = queue.popleft()

            if hops >= max_hops:
                continue

            neighbors = self.get_neighbors(current_id, direction="outgoing")

            for rel, neighbor_id in neighbors:
                # Filter by relationship type
                if include_relationships and rel.type not in include_relationships:
                    continue

                # Filter by weight
                if rel.weight < weight_threshold:
                    continue

                # Filter by entity type
                if neighbor_id in self.kg.entities:
                    entity_type = self.kg.entities[neighbor_id].type.value
                    if exclude_types and entity_type in exclude_types:
                        continue

                if neighbor_id not in result:
                    new_path = f"{path} --{rel.type.value}→ {neighbor_id}"
                    result[neighbor_id] = (hops + 1, new_path)
                    queue.append((neighbor_id, hops + 1, new_path))

        return result

    def get_code_context(
        self,
        entity_id: str,
        max_hops: int = 2,
        include_self: bool = True,
    ) -> dict[str, str]:
        """
        Extract code context for an entity and its neighbors.

        Returns:
            Dict mapping entity_id → code snippet (actual source text).
        """
        visited = self.traverse_hops([entity_id], max_hops=max_hops)
        context = {}

        # Group by file for efficient reading
        files_to_read: dict[str, list[str]] = {}
        for eid in visited:
            if eid in self.kg.entities:
                fp = self.kg.entities[eid].file_path
                if fp not in files_to_read:
                    files_to_read[fp] = []
                files_to_read[fp].append(eid)

        # Extract code for each file
        for filepath, entity_ids in files_to_read.items():
            try:
                with open(filepath, "r") as f:
                    lines = f.readlines()

                for eid in entity_ids:
                    entity = self.kg.entities[eid]
                    start = entity.line_number - 1  # 0-indexed
                    end = entity.end_line if entity.end_line else start + 10
                    code = "".join(lines[start:end])
                    context[eid] = code

            except (OSError, IndexError):
                context[eid] = "# Could not extract code"

        return context

    def search_by_name(self, name: str, fuzzy: bool = False) -> list[str]:
        """Search for entities by name."""
        name_lower = name.lower()

        if fuzzy:
            # Fuzzy match (contains substring)
            results = [eid for eid, ent in self.kg.entities.items() if name_lower in ent.name.lower()]
        else:
            # Exact match (case-insensitive)
            results = self.kg._by_name.get(name_lower, [])

        return results

    def get_callers(self, entity_id: str) -> list[str]:
        """Get all entities that call the given entity."""
        callers = []
        for rel in self.kg._reverse_adjacency.get(entity_id, []):
            if rel.type == RelationshipType.CALLS:
                callers.append(rel.source_id)
        return callers

    def reverse_lookup(self, symbol_name: str) -> list[str]:
        """Find all entities with a given symbol name."""
        # Search across all files for matching names
        results = []
        for entity in self.kg.entities.values():
            if entity.name == symbol_name:
                results.append(entity.id)
        return results
```

#### Module 4: KG Diff Engine (`kg_diff.py`) - NEW MODULE

```python
"""Knowledge graph comparison and diffing."""

from dataclasses import dataclass
from kg_builder.models import KnowledgeGraph, Entity, Relationship


@dataclass
class DiffEntity:
    """Represents a difference for an entity."""
    entity_id: str | None  # None for new entities
    name: str
    entity_type: str
    status: str  # "added", "removed", "modified"
    details: dict


@dataclass
class DiffRelationship:
    """Represents a difference for a relationship."""
    source_id: str | None
    target_id: str | None
    rel_type: str
    status: str  # "added", "removed"


@dataclass
class KnowledgeGraphDiff:
    """Complete diff between two knowledge graphs."""
    entity_diffs: list[DiffEntity]
    relationship_diffs: list[DiffRelationship]
    missing_entities_by_name: dict[str, list[str]]  # Name → list of IDs that exist in other KG


def compute_diff(existing_kg: KnowledgeGraph, proposed_kg: KnowledgeGraph) -> KnowledgeGraphDiff:
    """
    Compute the difference between existing and proposed knowledge graphs.

    The proposed KG represents what we want to build; the diff tells us
    what's missing or needs modification.

    Args:
        existing_kg: Current state of the codebase.
        proposed_kg: Desired state from requirements/spec.

    Returns:
        KnowledgeGraphDiff with all differences.
    """
    entity_diffs = []
    relationship_diffs = []

    # Find entities that exist in proposed but not in existing (by name matching)
    existing_names = {e.name.lower(): eid for eid, e in existing_kg.entities.items()}
    missing_by_name: dict[str, list[str]] = {}

    for prop_id, prop_entity in proposed_kg.entities.items():
        name_lower = prop_entity.name.lower()

        if name_lower not in existing_names:
            # Entity is missing - needs to be created
            entity_diffs.append(DiffEntity(
                entity_id=None,
                name=prop_entity.name,
                entity_type=prop_entity.type.value,
                status="added",
                details={"proposed_id": prop_id}
            ))

            if name_lower not in missing_by_name:
                missing_by_name[name_lower] = []
            missing_by_name[name_lower].append(prop_id)
        else:
            # Entity exists - check for modifications
            existing_entity = existing_kg.entities[existing_names[name_lower]]
            if _entities_differ(existing_entity, prop_entity):
                entity_diffs.append(DiffEntity(
                    entity_id=existing_names[name_lower],
                    name=prop_entity.name,
                    entity_type=prop_entity.type.value,
                    status="modified",
                    details=_compute_entity_diff(existing_entity, prop_entity)
                ))

    # Find relationships that need to be added
    existing_rels = {(r.source_id, r.target_id, r.type): r for r in existing_kg.relationships}

    for rel in proposed_kg.relationships:
        key = (rel.source_id, rel.target_id, rel.type)
        if key not in existing_rels:
            relationship_diffs.append(DiffRelationship(
                source_id=rel.source_id,
                target_id=rel.target_id,
                rel_type=rel.type.value,
                status="added"
            ))

    return KnowledgeGraphDiff(
        entity_diffs=entity_diffs,
        relationship_diffs=relationship_diffs,
        missing_entities_by_name=missing_by_name
    )


def _entities_differ(e1: Entity, e2: Entity) -> bool:
    """Check if two entities have meaningful differences."""
    # Compare properties that matter for diffing
    return (e1.type != e2.type or
            e1.properties.get("args") != e2.properties.get("args") or
            e1.properties.get("return_type") != e2.properties.get("return_type"))


def _compute_entity_diff(e1: Entity, e2: Entity) -> dict:
    """Compute detailed differences between two entities."""
    return {
        "property_changes": {
            k: {"before": e1.properties.get(k), "after": e2.properties.get(k)}
            for k in set(e1.properties) | set(e2.properties)
            if e1.properties.get(k) != e2.properties.get(k)
        }
    }
```

### 3.3 How an Agent Would Use the KG (Pseudocode Examples)

#### Example 1: Understanding a Function Before Modification

```python
# Task: "Add error handling to process_payment() function"

def agent_understand_function(kg_query_engine, target_name: str):
    # Step 1: Find the function
    candidates = kg_query_engine.search_by_name(target_name)
    if not candidates:
        return "Function not found"

    func_id = candidates[0]  # Or use disambiguation logic

    # Step 2: Load the function's code
    context = kg_query_engine.get_code_context(func_id, max_hops=0)
    function_code = context.get(func_id, "")

    # Step 3: Find what this function calls (dependencies)
    neighbors = kg_query_engine.get_neighbors(func_id, direction="outgoing")
    calls = [(eid, r.type) for r, eid in neighbors if r.type == RelationshipType.CALLS]

    # Step 4: Load code for called functions (1-hop context)
    call_context = kg_query_engine.get_code_context(func_id, max_hops=1)

    # Step 5: Find who calls this function (reverse dependencies)
    callers = kg_query_engine.get_callers(func_id)

    return {
        "function_code": function_code,
        "dependencies": calls,
        "dependency_code": {eid: call_context.get(eid) for eid in calls},
        "callers": callers,
    }

# Agent then uses this context to plan and generate modifications
```

#### Example 2: Feature Planning with KG Diff

```python
# Task: "Add user profile update endpoint"

def agent_plan_feature(existing_kg, requirements_spec):
    from kg_builder.query_engine import KGQueryEngine
    from kg_diff import compute_diff, create_proposed_kg_from_spec

    # Step 1: Parse requirements into a proposed KG structure
    proposed_kg = create_proposed_kg_from_spec(requirements_spec)
    # Proposed KG contains:
    # - Entity(profile_update, FUNCTION, args=[user_id, data])
    # - Entity(Profile, CLASS)
    # - Relationship(profile_update CALLS Profile.get)

    # Step 2: Compute the diff
    diff = compute_diff(existing_kg, proposed_kg)

    # Step 3: Analyze what needs to be built
    plan = []

    for entity_diff in diff.entity_diffs:
        if entity_diff.status == "added":
            plan.append(f"CREATE {entity_diff.entity_type}: {entity_diff.name}")
        elif entity_diff.status == "modified":
            plan.append(f"MODIFY {entity_diff.name}: {diff.details}")

    for rel_diff in diff.relationship_diffs:
        if rel_diff.status == "added":
            plan.append(f"ADD {rel_diff.rel_type}: {rel_diff.source_id} → {rel_diff.target_id}")

    # Step 4: Check for reusable existing code
    query_engine = KGQueryEngine(existing_kg)
    for missing_name in diff.missing_entities_by_name.keys():
        similar = query_engine.search_by_name(missing_name, fuzzy=True)
        if similar:
            plan.append(f"NOTE: Found similar entity: {similar[0]}")

    return plan
```

#### Example 3: Safe Refactoring with Impact Analysis

```python
def agent_refactor_safely(kg_query_engine, function_to_change: str):
    # Find all code that will be affected by this change
    func_id = kg_query_engine.search_by_name(function_to_change)[0]

    # Get 2-hop context to understand full impact
    affected = kg_query_engine.traverse_hops(
        [func_id],
        max_hops=2,
        include_relationships=[RelationshipType.CALLS, RelationshipType.INHERITS]
    )

    # Find all callers (code that might break)
    callers = kg_query_engine.get_callers(func_id)

    # Generate impact report
    return {
        "directly_affected": [eid for eid in affected if affected[eid][0] == 1],
        "indirectly_affected": [eid for eid in affected if affected[eid][0] == 2],
        "callers_that_may_break": callers,
        "recommended_tests": f"Ensure tests cover {len(callers)} call sites"
    }
```

### 3.4 Handling "Proposed vs Existing" KG Comparison

The key insight is that **proposed KGs come from natural language specs**, not existing code. We need a translation layer:

```python
# Proposed KG creation pipeline:

from kg_builder.models import KnowledgeGraph, Entity, Relationship, EntityType, RelationshipType


def parse_spec_to_kg(requirements_text: str) -> KnowledgeGraph:
    """
    Parse a requirements/spec into a proposed KG structure.

    This is a simplified example - in practice, this would use an LLM
    or structured spec format (e.g., OpenAPI for APIs).
    """
    # Example spec: "Add endpoint /api/users/{id}/update that accepts JSON body"
    # Parsed into:
    proposed = KnowledgeGraph()

    # Entities from spec
    proposed.add_entity(Entity(
        id="proposed::update_user_endpoint",
        name="update_user",
        type=EntityType.FUNCTION,
        file_path="TBD",  # To be determined
        line_number=0,
        properties={
            "path": "/api/users/{id}/update",
            "method": "PUT",
            "args": [{"name": "user_id", "type": "int"}, {"name": "data", "type": "dict"}]
        }
    ))

    # Implicit relationships from spec structure
    proposed.add_relationship(Relationship(
        source_id="proposed::update_user_endpoint",
        target_id="User",  # Will need to be matched to existing User class
        type=RelationshipType.USES,
        line_number=0
    ))

    return proposed


def match_proposed_to_existing(proposed_kg: KnowledgeGraph, existing_kg: KnowledgeGraph) -> dict[str, str]:
    """
    Match entities from proposed KG to existing KG for diffing.

    Returns mapping of proposed_entity_id → existing_entity_id (if found).
    """
    matches = {}
    query_engine = KGQueryEngine(existing_kg)

    for prop_id, prop_entity in proposed_kg.entities.items():
        # Try exact match first
        exact = query_engine.search_by_name(prop_entity.name, fuzzy=False)
        if exact:
            matches[prop_id] = exact[0]
            continue

        # Try fuzzy match
        fuzzy = query_engine.search_by_name(prop_entity.name, fuzzy=True)
        if fuzzy and len(fuzzy) == 1:
            matches[prop_id] = fuzzy[0]

    return matches
```

---

## Phase 4: MVP Prioritization

### 4.1 MVP Scope: Context-Aware Code Loading

**Rationale**: Feature planning via KG diffing requires significant additional work (LLM-based spec parsing, fuzzy matching, semantic comparison). Context loading can deliver immediate value with core improvements only.

### 4.2 MVP Implementation Plan

#### Milestone 1: Enhanced Query Engine (Week 1-2)

**Deliverables**:
- Add `_build_indices()` method to `KnowledgeGraph`
- Implement `KGQueryEngine` with:
  - `get_neighbors()` - basic graph traversal
  - `traverse_hops()` - N-hop BFS traversal
  - `search_by_name()` - entity lookup by name
  - `get_callers()` - reverse edge lookup

**Files to modify**:
- `kg_builder/models.py` - Add indices to KnowledgeGraph class
- `kg_builder/query_engine.py` - NEW FILE

#### Milestone 2: Code Extraction (Week 2)

**Deliverables**:
- Extract code spans for entities
- Track end_line in Entity for accurate extraction
- `get_code_context()` method that returns actual source text

**Files to modify**:
- `kg_builder/models.py` - Add end_line tracking
- `kg_builder/parser.py` - Track function/class end lines during parsing
- `kg_builder/query_engine.py` - Add code extraction method

#### Milestone 3: Basic Import Resolution (Week 2-3)

**Deliverables**:
- `SymbolResolver` class for same-project import resolution
- Handle simple `import X` and `from X import Y` patterns
- Mark unresolved imports as EXTERNAL_REF entities

**Files to modify**:
- `kg_builder/models.py` - Add EXTERNAL_REF type, IMPORTS_RESOLVED_TO relationship
- `kg_builder/symbol_resolver.py` - NEW FILE
- `kg_builder/__init__.py` - Integrate resolver into build pipeline

#### Milestone 4: Agent Integration Demo (Week 3)

**Deliverables**:
- Simple CLI/Python demo showing agent-like KG queries
- End-to-end example: "Find function X, load its context with 1-hop neighbors"

**Files to add**:
- `examples/agent_demo.py` - Demonstration script

### 4.3 MVP Success Criteria

| Criterion | Measurement |
|-----------|-------------|
| Query latency | N-hop traversal on 100-file codebase < 1 second |
| Code extraction accuracy | >95% of entities have correct code span extracted |
| Import resolution rate | >80% of internal imports resolved (excludes stdlib/third-party) |
| Context relevance | Manual review confirms loaded context is useful for understanding target entity |

### 4.4 Out of Scope for MVP

- Full cross-file call resolution (requires type inference/data flow analysis)
- Relationship weighting/scoring
- Semantic search integration (embeddings)
- Feature planning / KG diffing
- External library documentation linking

---

## Appendix A: Current vs. Required Output Comparison

### Current Entity Output (from kg_builder):

```json
{
  "id": "app/views.py::login",
  "name": "login",
  "type": "FUNCTION",
  "file_path": "app/views.py",
  "line_number": 42,
  "properties": {
    "description": "No docstring",
    "args": [{"name": "request"}],
    "return_type": null
  }
}
```

### Required Entity Output (for agentic coding):

```json
{
  "id": "app/views.py::login",
  "name": "login",
  "type": "FUNCTION",
  "file_path": "app/views.py",
  "line_number": 42,
  "end_line": 78,  // ADDED: for code extraction
  "properties": {
    "description": "Authenticate user login",
    "args": [{"name": "request", "type": "HttpRequest"}],
    "return_type": "HttpResponse",
    "code_span": "def login(request):\n    ...",  // ADDED: inline code
    "is_public_api": true,  // ADDED: semantic tag
    "test_coverage": 0.85  // ADDED: optional quality metric
  }
}
```

### Current Relationship Output:

```json
{
  "source_id": "app/views.py::login",
  "target_id": "authenticate",  // Just a string - NOT RESOLVED
  "type": "CALLS",
  "line_number": 45
}
```

### Required Relationship Output:

```json
{
  "source_id": "app/views.py::login",
  "target_id": "app/auth.py::authenticate",  // RESOLVED to entity ID
  "type": "CALLS",
  "line_number": 45,
  "is_resolved": true,  // ADDED: resolution status
  "weight": 1.0,  // ADDED: for traversal scoring
  "properties": {
    "argument_at_call_site": {"user": "request.POST.get('username')"}  // ADDED: call context
  }
}
```

---

## Appendix B: Recommended Tool Dependencies

For the full vision (beyond MVP), consider these tools:

| Tool | Purpose | Integration Point |
|------|---------|-------------------|
| `pyan` or `sourmace` | Call graph generation with cross-file resolution | Enhancement to relationship_finder |
| `radon` | Code complexity metrics | Entity properties (complexity scores) |
| `coverage.py` | Test coverage data | Relationship/entity weighting |
| `tree-sitter` | More accurate AST with error recovery | Parser enhancement |
| `sentence-transformers` | Code embeddings for semantic search | Hybrid query engine |
| `networkx` | Graph algorithms (centrality, clustering) | Advanced query patterns |

---

## Conclusion

The KG-guided agentic coding approach has strong potential but requires significant enhancements to the current kg_builder implementation. The **context-aware code loading** use case is achievable as an MVP with focused work on query interfaces and basic import resolution. The **feature planning via diffing** use case requires additional infrastructure for spec-to-KG translation and semantic matching.

**Recommended path forward**:
1. Implement MVP (Milestones 1-4) to validate the context loading approach
2. Measure real-world utility with agent workloads
3. Expand to import/call resolution based on observed gaps
4. Tackle feature planning as a separate phase once core KG query infrastructure is proven

**File paths referenced in this document**:
- `/home/sachdved/Documents/kg_builder/kg_builder/models.py`
- `/home/sachdved/Documents/kg_builder/kg_builder/parser.py`
- `/home/sachdved/Documents/kg_builder/kg_builder/relationship_finder.py`
- `/home/sachdved/Documents/kg_builder/kg_builder/__init__.py`
