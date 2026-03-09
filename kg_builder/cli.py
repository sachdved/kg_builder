"""Command-line interface for the knowledge graph builder."""

import argparse
import json
import sys
from pathlib import Path

from kg_builder.models import KnowledgeGraph
from kg_builder.parser import parse_file
from kg_builder.relationship_finder import find_all_relationships
from kg_builder.utils import get_python_files


def main() -> None:
    """Main entry point for the CLI."""
    parser = argparse.ArgumentParser(
        description="Extract knowledge graphs from Python codebases",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  kg_builder /path/to/file.py                 # Parse a single file
  kg_builder /path/to/repo --output kg.json   # Parse entire repository
  kg_builder . --exclude "**/tests/*"         # Exclude test files
  kg_builder /path/to/repo --verbose          # Show progress
        """,
    )

    parser.add_argument(
        "target",
        help="Path to a Python file or directory to parse",
    )

    parser.add_argument(
        "--output", "-o",
        metavar="FILE",
        help="Output JSON file path (default: stdout)",
    )

    parser.add_argument(
        "--exclude",
        nargs="*",
        metavar="PATTERN",
        help="Glob patterns for files to exclude (e.g., '**/tests/*' '**/venv/*')",
    )

    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Show progress during parsing",
    )

    args = parser.parse_args()

    # Validate target path
    target_path = Path(args.target)
    if not target_path.exists():
        print(f"Error: Target path does not exist: {args.target}", file=sys.stderr)
        sys.exit(1)

    # Build the knowledge graph
    kg = build_knowledge_graph_from_cli(args)

    # Output the result
    output_json = kg.to_json()

    if args.output:
        output_file = Path(args.output)
        try:
            with open(output_file, "w", encoding="utf-8") as f:
                f.write(output_json)
            if args.verbose:
                print(f"Knowledge graph written to: {output_file}")
        except IOError as e:
            print(f"Error writing output file: {e}", file=sys.stderr)
            sys.exit(1)
    else:
        print(output_json)


def build_knowledge_graph_from_cli(args: argparse.Namespace) -> KnowledgeGraph:
    """Build a knowledge graph from CLI arguments.

    Args:
        args: Parsed CLI arguments.

    Returns:
        The constructed KnowledgeGraph.
    """
    kg = KnowledgeGraph()
    exclude_patterns = args.exclude or []

    # Get all Python files to process
    files = list(get_python_files(args.target, exclude_patterns))

    if args.verbose:
        print(f"Found {len(files)} Python file(s) to parse")

    for i, file_path in enumerate(files):
        if args.verbose:
            print(f"[{i+1}/{len(files)}] Processing: {file_path}")

        try:
            entities, _ = parse_file(str(file_path))
            if not entities:
                continue

            # Parse the file to get AST for relationship finding
            with open(file_path, "r", encoding="utf-8") as f:
                source = f.read()

            try:
                tree = __import__("ast").parse(source, filename=str(file_path))
                relationships = find_all_relationships(
                    str(file_path), entities, tree
                )
            except SyntaxError:
                relationships = []

            # Add entities and relationships to the graph
            for entity in entities:
                kg.add_entity(entity)

            for relationship in relationships:
                kg.add_relationship(relationship)

        except Exception as e:
            if args.verbose:
                print(f"  Error processing {file_path}: {e}", file=sys.stderr)
            continue

    return kg


if __name__ == "__main__":
    main()
