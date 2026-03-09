"""Query engine for knowledge graph traversal and search."""

from collections import deque
from typing import Optional

from kg_builder.models import KnowledgeGraph, RelationshipType


class KGQueryEngine:
    """Query interface for the knowledge graph."""

    def __init__(self, kg: KnowledgeGraph) -> None:
        """Initialize the query engine with a knowledge graph.

        Args:
            kg: The knowledge graph to query. Indices will be built if not already present.
        """
        self.kg = kg
        # Build indices if they haven't been built yet
        if not self.kg._adjacency:
            self.kg._build_indices()

    def get_neighbors(
        self,
        entity_id: str,
        direction: str = "both",  # "outgoing", "incoming", "both"
        relationship_types: Optional[list[RelationshipType]] = None,
    ) -> list[tuple[RelationshipType, str]]:
        """Get all neighbors of an entity.

        Args:
            entity_id: The ID of the entity to get neighbors for.
            direction: Which direction to traverse ("outgoing", "incoming", or "both").
            relationship_types: Optional filter to only include specific relationship types.

        Returns:
            List of (relationship_type, neighbor_entity_id) tuples.
        """
        neighbors = []

        if direction in ("outgoing", "both"):
            for rel in self.kg._adjacency.get(entity_id, []):
                if relationship_types is None or rel.type in relationship_types:
                    neighbors.append((rel.type, rel.target_id))

        if direction in ("incoming", "both"):
            for rel in self.kg._reverse_adjacency.get(entity_id, []):
                if relationship_types is None or rel.type in relationship_types:
                    neighbors.append((rel.type, rel.source_id))

        return neighbors

    def traverse_hops(
        self,
        start_ids: list[str],
        max_hops: int = 2,
        include_relationships: Optional[list[RelationshipType]] = None,
        exclude_types: Optional[list[str]] = None,  # Entity type values to exclude
    ) -> dict[str, tuple[int, str]]:
        """Breadth-first traversal from starting entities.

        Args:
            start_ids: List of entity IDs to start traversal from.
            max_hops: Maximum hop distance to traverse.
            include_relationships: Only traverse these relationship types (None = all).
            exclude_types: Entity type values to skip (e.g., ["IMPORT", "VARIABLE"]).

        Returns:
            Dict mapping entity_id to (hop_distance, path_from_start).
        """
        result: dict[str, tuple[int, str]] = {sid: (0, sid) for sid in start_ids}
        queue = deque([(entity_id, 0, entity_id) for entity_id in start_ids])

        while queue:
            current_id, hops, path = queue.popleft()

            if hops >= max_hops:
                continue

            # Get outgoing neighbors only
            for rel_type, neighbor_id in self.get_neighbors(current_id, direction="outgoing"):
                # Filter by relationship type
                if include_relationships and rel_type not in include_relationships:
                    continue

                # Filter by entity type
                if neighbor_id in self.kg.entities:
                    entity = self.kg.entities[neighbor_id]
                    entity_type_value = entity.type.value if hasattr(entity.type, 'value') else str(entity.type)
                    if exclude_types and entity_type_value in exclude_types:
                        continue

                if neighbor_id not in result:
                    new_path = f"{path} --{rel_type.value}--> {neighbor_id}"
                    result[neighbor_id] = (hops + 1, new_path)
                    queue.append((neighbor_id, hops + 1, new_path))

        return result

    def search_by_name(self, name: str, fuzzy: bool = False) -> list[str]:
        """Search for entities by name.

        Args:
            name: The name to search for.
            fuzzy: If True, perform substring matching; otherwise exact match.

        Returns:
            List of entity IDs matching the search criteria.
        """
        name_lower = name.lower()

        if not self.kg._by_name:
            self.kg._build_indices()

        if fuzzy:
            # Fuzzy match (contains substring)
            results = [
                eid for eid, ent in self.kg.entities.items()
                if name_lower in ent.name.lower()
            ]
        else:
            # Exact match using index (case-insensitive)
            results = self.kg._by_name.get(name_lower, [])

        return results

    def get_callers(self, entity_id: str) -> list[str]:
        """Get all entities that call the given entity.

        Args:
            entity_id: The ID of the entity to find callers for.

        Returns:
            List of caller entity IDs.
        """
        callers = []
        for rel in self.kg._reverse_adjacency.get(entity_id, []):
            if rel.type == RelationshipType.CALLS:
                callers.append(rel.source_id)
        return callers

    def get_code_context(
        self,
        entity_id: str,
        max_hops: int = 2,
        include_self: bool = True,
    ) -> dict[str, str]:
        """Extract code context for an entity and its neighbors.

        Args:
            entity_id: The ID of the target entity.
            max_hops: Maximum hop distance for context retrieval.
            include_self: Whether to include the target entity's code.

        Returns:
            Dict mapping entity_id to source code text.
        """
        start_list = [entity_id] if include_self else []
        visited = self.traverse_hops(start_list, max_hops=max_hops)

        context: dict[str, str] = {}

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
                with open(filepath, "r", encoding="utf-8") as f:
                    lines = f.readlines()

                for eid in entity_ids:
                    entity = self.kg.entities[eid]
                    start = entity.line_number - 1  # 0-indexed
                    end = entity.end_line if entity.end_line else start + 10
                    code = "".join(lines[start:end])
                    context[eid] = code

            except (OSError, IndexError, TypeError):
                context[eid] = "# Could not extract code"

        return context
