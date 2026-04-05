"""Command-line interface for the knowledge graph builder.

Supports subcommands:
    kg_builder build <path> [--output FILE] [--exclude PATTERN...] [--verbose]
    kg_builder diff <existing.json> <proposed.json> [--output FILE] [--summary-only]
    kg_builder plan <change_spec.json> --codebase <path> [--existing-kg FILE] [--format markdown|json]

For backwards compatibility, a bare path (not a subcommand) defaults to 'build':
    kg_builder /path/to/repo --output kg.json
"""

import argparse
import json
import sys
from pathlib import Path

from kg_builder.models import KnowledgeGraph
from kg_builder.parser import parse_file
from kg_builder.relationship_finder import find_all_relationships
from kg_builder.utils import get_python_files


SUBCOMMANDS = {"build", "diff", "plan"}


def main() -> None:
    """Main entry point for the CLI."""
    # Backwards compatibility: if first arg looks like a path, prepend 'build'
    if len(sys.argv) > 1 and sys.argv[1] not in SUBCOMMANDS and not sys.argv[1].startswith("-"):
        candidate = Path(sys.argv[1])
        if candidate.exists():
            sys.argv.insert(1, "build")

    parser = argparse.ArgumentParser(
        prog="kg_builder",
        description="Extract and diff knowledge graphs from Python codebases",
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    _setup_build_parser(subparsers)
    _setup_diff_parser(subparsers)
    _setup_plan_parser(subparsers)

    args = parser.parse_args()

    if args.command is None:
        parser.print_help()
        sys.exit(0)

    if args.command == "build":
        _run_build(args)
    elif args.command == "diff":
        _run_diff(args)
    elif args.command == "plan":
        _run_plan(args)


# --- Subcommand setup ---


def _setup_build_parser(subparsers) -> None:
    p = subparsers.add_parser(
        "build",
        help="Build a knowledge graph from a Python codebase",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  kg_builder build /path/to/file.py
  kg_builder build /path/to/repo --output kg.json
  kg_builder build . --exclude "**/tests/*" --verbose
        """,
    )
    p.add_argument("target", help="Path to a Python file or directory to parse")
    p.add_argument("--output", "-o", metavar="FILE", help="Output JSON file (default: stdout)")
    p.add_argument("--exclude", nargs="*", metavar="PATTERN", help="Glob patterns to exclude")
    p.add_argument("--verbose", "-v", action="store_true", help="Show progress")


def _setup_diff_parser(subparsers) -> None:
    p = subparsers.add_parser(
        "diff",
        help="Compute diff between two knowledge graphs",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  kg_builder diff existing.json proposed.json
  kg_builder diff existing.json proposed.json --output change_spec.json
  kg_builder diff existing.json proposed.json --summary-only
        """,
    )
    p.add_argument("existing", help="Path to the existing/base KG JSON file")
    p.add_argument("proposed", help="Path to the proposed KG JSON file")
    p.add_argument("--output", "-o", metavar="FILE", help="Output change spec JSON file (default: stdout)")
    p.add_argument("--summary-only", action="store_true", help="Print only the summary counts")


def _setup_plan_parser(subparsers) -> None:
    p = subparsers.add_parser(
        "plan",
        help="Generate an edit plan from a change spec",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  kg_builder plan change_spec.json --codebase /path/to/repo
  kg_builder plan change_spec.json --codebase . --existing-kg existing.json
  kg_builder plan change_spec.json --codebase . --format json
        """,
    )
    p.add_argument("change_spec", help="Path to the change spec JSON file")
    p.add_argument("--codebase", required=True, help="Path to the codebase root directory")
    p.add_argument("--existing-kg", metavar="FILE", help="Path to the existing KG JSON (for context loading)")
    p.add_argument("--format", choices=["markdown", "json"], default="markdown", help="Output format (default: markdown)")
    p.add_argument("--output", "-o", metavar="FILE", help="Output file (default: stdout)")


# --- Subcommand handlers ---


def _run_build(args: argparse.Namespace) -> None:
    target_path = Path(args.target)
    if not target_path.exists():
        print(f"Error: Target path does not exist: {args.target}", file=sys.stderr)
        sys.exit(1)

    from kg_builder import build_knowledge_graph

    if args.verbose:
        print(f"Building knowledge graph from: {args.target}")

    kg = build_knowledge_graph(str(target_path), exclude_patterns=args.exclude)
    output_json = kg.to_json()

    if args.output:
        _write_output(output_json, args.output, args.verbose)
    else:
        print(output_json)


def _run_diff(args: argparse.Namespace) -> None:
    from kg_builder.kg_diff import diff_knowledge_graphs, save_change_spec

    existing_path = Path(args.existing)
    proposed_path = Path(args.proposed)

    if not existing_path.is_file():
        print(f"Error: Existing KG file not found: {args.existing}", file=sys.stderr)
        sys.exit(1)
    if not proposed_path.is_file():
        print(f"Error: Proposed KG file not found: {args.proposed}", file=sys.stderr)
        sys.exit(1)

    try:
        with open(existing_path, "r", encoding="utf-8") as f:
            existing_kg = json.load(f)
        with open(proposed_path, "r", encoding="utf-8") as f:
            proposed_kg = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        print(f"Error reading input files: {e}", file=sys.stderr)
        sys.exit(1)

    spec = diff_knowledge_graphs(existing_kg, proposed_kg)

    if args.summary_only:
        for key, count in spec.summary.items():
            print(f"{key}: {count}")
        return

    if args.output:
        save_change_spec(spec, args.output)
        print(f"Change spec written to: {args.output}", file=sys.stderr)
    else:
        print(spec.to_json())


def _run_plan(args: argparse.Namespace) -> None:
    from kg_builder.agent_planner import generate_edit_plan
    from kg_builder.kg_diff import ChangeSpec

    spec_path = Path(args.change_spec)
    if not spec_path.is_file():
        print(f"Error: Change spec file not found: {args.change_spec}", file=sys.stderr)
        sys.exit(1)

    codebase_path = Path(args.codebase)
    if not codebase_path.exists():
        print(f"Error: Codebase path not found: {args.codebase}", file=sys.stderr)
        sys.exit(1)

    try:
        with open(spec_path, "r", encoding="utf-8") as f:
            spec = ChangeSpec.from_json(f.read())
    except (json.JSONDecodeError, OSError) as e:
        print(f"Error reading change spec: {e}", file=sys.stderr)
        sys.exit(1)

    existing_kg = None
    if args.existing_kg:
        existing_kg_path = Path(args.existing_kg)
        if not existing_kg_path.is_file():
            print(f"Error: Existing KG file not found: {args.existing_kg}", file=sys.stderr)
            sys.exit(1)
        try:
            with open(existing_kg_path, "r", encoding="utf-8") as f:
                existing_kg = json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            print(f"Error reading existing KG: {e}", file=sys.stderr)
            sys.exit(1)

    plan = generate_edit_plan(spec, str(codebase_path), existing_kg)

    if args.format == "json":
        output = plan.to_json()
    else:
        output = plan.to_markdown()

    if args.output:
        _write_output(output, args.output)
    else:
        print(output)


# --- Helpers ---


def _write_output(content: str, output_path: str, verbose: bool = False) -> None:
    try:
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(content)
        if verbose:
            print(f"Output written to: {output_path}", file=sys.stderr)
    except IOError as e:
        print(f"Error writing output file: {e}", file=sys.stderr)
        sys.exit(1)


def build_knowledge_graph_from_cli(args: argparse.Namespace) -> KnowledgeGraph:
    """Build a knowledge graph from CLI arguments.

    Args:
        args: Parsed CLI arguments with 'target', 'exclude', 'verbose'.

    Returns:
        The constructed KnowledgeGraph.
    """
    kg = KnowledgeGraph()
    exclude_patterns = args.exclude or []

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

            with open(file_path, "r", encoding="utf-8") as f:
                source = f.read()

            try:
                tree = __import__("ast").parse(source, filename=str(file_path))
                relationships = find_all_relationships(
                    str(file_path), entities, tree
                )
            except SyntaxError:
                relationships = []

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
