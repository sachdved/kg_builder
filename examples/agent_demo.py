#!/usr/bin/env python3
"""Demo of agent-like KG queries for context-aware code loading.

This script demonstrates how an AI coding agent could use the knowledge graph
to load only relevant code sections by traversing relationships from a target entity.

Usage:
    python examples/agent_demo.py <target_name> [--codebase <path>] [--hops <n>]

Examples:
    # Find 'parse_file' function and load its 1-hop context
    python examples/agent_demo.py parse_file --codebase .

    # Find 'KGQueryEngine' class with 2-hop context
    python examples/agent_demo.py KGQueryEngine --codebase . --hops 2
"""

import argparse
from pathlib import Path

from kg_builder import build_knowledge_graph, KGQueryEngine


def demo_find_function_context(
    target_name: str,
    codebase_path: str,
    max_hops: int = 1,
) -> None:
    """Find a function/class and load its N-hop context.

    Args:
        target_name: Name of the function or class to find.
        codebase_path: Path to the codebase to search.
        max_hops: Number of hops to traverse for context.
    """
    print(f"Building knowledge graph from: {codebase_path}")
    kg = build_knowledge_graph(codebase_path)

    # Create query engine for traversing the graph
    engine = KGQueryEngine(kg)

    print(f"\nSearching for: '{target_name}'")
    matches = engine.search_by_name(target_name, fuzzy=False)

    if not matches:
        print(f"No exact match found. Trying fuzzy search...")
        matches = engine.search_by_name(target_name, fuzzy=True)

    if not matches:
        print(f"Function/class '{target_name}' not found in codebase.")
        return

    # Show all matches if multiple found
    if len(matches) > 1:
        print(f"\nFound {len(matches)} matches:")
        for match_id in matches:
            entity = kg.entities[match_id]
            print(f"  - {entity.name} ({entity.type.value}) at {entity.file_path}:{entity.line_number}")

    # Use first match for demo
    target_id = matches[0]
    target_entity = kg.entities[target_id]

    print(f"\n{'=' * 60}")
    print(f"Target: {target_entity.name} ({target_entity.type.value})")
    print(f"File: {target_entity.file_path}:{target_entity.line_number}")
    if target_entity.end_line:
        print(f"Lines: {target_entity.line_number}-{target_entity.end_line}")
    print(f"{'=' * 60}\n")

    # Load code context with N-hop neighbors
    print(f"Loading {max_hops}-hop context...")
    context = engine.get_code_context(target_id, max_hops=max_hops, include_self=True)

    # Show the target's code first
    if target_id in context:
        print(f"\n>>> Target Entity Code:")
        print(f"--- {target_entity.file_path} ---")
        code = context[target_id][:1500]  # Limit output
        if len(context[target_id]) > 1500:
            code += "\n... (truncated)"
        print(code)

    # Show neighbors with their code
    visited = engine.traverse_hops(
        [target_id],
        max_hops=max_hops,
        exclude_types=["IMPORT", "VARIABLE"]  # Skip less relevant types
    )

    neighbor_ids = [eid for eid in visited if eid != target_id]

    print(f"\n>>> Found {len(neighbor_ids)} related entities:")
    for neighbor_id in neighbor_ids[:10]:  # Limit to first 10
        neighbor = kg.entities.get(neighbor_id)
        hops, path = visited[neighbor_id]
        if neighbor:
            rel_type_str = path.split("-->")[0].split(" ")[-1] if "-->" in path else "CONTAINS"
            print(f"  [{hops}-hop] {neighbor.name} ({neighbor.type.value})")
            print(f"           Path: ... {path[-80:]}")

    # Show relationship summary
    neighbors = engine.get_neighbors(target_id, direction="outgoing")
    print(f"\n>>> Outgoing relationships from {target_entity.name}:")
    for rel_type, neighbor_id in neighbors[:10]:
        neighbor = kg.entities.get(neighbor_id)
        name = neighbor.name if neighbor else neighbor_id
        print(f"  --{rel_type.value}--> {name}")

    callers = engine.get_callers(target_id)
    if callers:
        print(f"\n>>> Entities that call {target_entity.name}:")
        for caller_id in callers[:10]:
            caller = kg.entities.get(caller_id)
            name = caller.name if caller else caller_id
            print(f"  <-CALLS-- {name}")


def main() -> None:
    """Main entry point for the demo."""
    parser = argparse.ArgumentParser(
        description="KG Agent Demo - Context-aware code loading",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "target",
        help="Function or class name to find (e.g., 'parse_file', 'KGQueryEngine')",
    )
    parser.add_argument(
        "--codebase",
        default=".",
        help="Path to codebase (default: current directory)",
    )
    parser.add_argument(
        "--hops",
        type=int,
        default=1,
        help="Number of hops for context traversal (default: 1)",
    )

    args = parser.parse_args()

    # Validate codebase path
    codebase = Path(args.codebase).resolve()
    if not codebase.exists():
        print(f"Error: Codebase path does not exist: {codebase}")
        return

    demo_find_function_context(
        target_name=args.target,
        codebase_path=str(codebase),
        max_hops=args.hops,
    )


if __name__ == "__main__":
    main()
