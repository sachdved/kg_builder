"""Skill handlers for user-triggered knowledge graph exploration.

This module provides skill handlers that can be invoked via /command syntax
for interactive codebase exploration using the knowledge graph.

Skills are meant for human users who want to:
- Explore entity relationships (`/explore`)
- Analyze change impact (`/impact`)
- Load code context (`/context`)

Each skill returns formatted output suitable for display in a terminal
or IDE chat interface.

Example usage:

    from kg_builder.skills import invoke_skill

    # Parse and invoke a skill command
    result = invoke_skill("/explore parse_file --hops 2", knowledge_graph)
    print(result["output"])
"""

import re
from typing import Any, Callable, Optional

from kg_builder.core.models import KnowledgeGraph


# Skill registry mapping skill names to handler classes
SKILL_REGISTRY: dict[str, type] = {}


def register_skill(name: str) -> Callable[[type], type]:
    """Register a skill class with the registry.

    Args:
        name: The name of the skill (e.g., "explore").

    Returns:
        Decorator that registers the decorated class.

    Example:
        @register_skill("my_skill")
        class MySkill(BaseSkill):
            ...
    """
    def decorator(skill_class: type) -> type:
        SKILL_REGISTRY[name] = skill_class
        return skill_class
    return decorator


def parse_skill_command(command: str) -> tuple[str, dict[str, Any]]:
    """Parse a /skill-name --arg value syntax command.

    Args:
        command: The raw command string (e.g., "/explore parse_file --hops 2").

    Returns:
        Tuple of (skill_name, args_dict).

    Example:
        >>> parse_skill_command("/explore parse_file --hops 2 --show-code")
        ('explore', {'entity_name': 'parse_file', 'hops': 2, 'show_code': True})
    """
    # Match /skill-name followed by arguments
    match = re.match(r'^/(\w+)(.*)$', command.strip())
    if not match:
        return "", {}

    skill_name = match.group(1)
    args_str = match.group(2).strip()

    # Parse arguments
    args: dict[str, Any] = {}

    # Extract positional argument (first non-flag token)
    tokens = args_str.split()
    i = 0

    # Find positional arg (before any --flags)
    while i < len(tokens) and not tokens[i].startswith('--'):
        if 'entity_name' not in args and 'query' not in args:
            # First positional arg is usually entity_name or query
            if 'target' not in args:
                args['target'] = tokens[i]
                if 'entity_name' not in args:
                    args['entity_name'] = tokens[i]
                if 'query' not in args:
                    args['query'] = tokens[i]
        i += 1

    # Parse --key value and --key (boolean flags)
    while i < len(tokens):
        token = tokens[i]
        if token.startswith('--'):
            key = token[2:].replace('-', '_')

            # Check for boolean flag (--flag with no value or =true/false)
            if '=' in token:
                # --key=value format
                _, value = token.split('=', 1)
                args[key] = _parse_value(value)
            elif i + 1 < len(tokens) and not tokens[i + 1].startswith('--'):
                # --key value format
                i += 1
                args[key] = _parse_value(tokens[i])
            else:
                # Boolean flag
                args[key] = True

        i += 1

    return skill_name, args


def _parse_value(value: str) -> Any:
    """Parse a string value to appropriate type.

    Args:
        value: The string value to parse.

    Returns:
        Parsed value (int, float, bool, or str).
    """
    # Try int
    try:
        return int(value)
    except ValueError:
        pass

    # Try float
    try:
        return float(value)
    except ValueError:
        pass

    # Try bool
    if value.lower() in ('true', 'yes', '1'):
        return True
    if value.lower() in ('false', 'no', '0'):
        return False

    # Return as string
    return value


def invoke_skill(
    command: str,
    kg: KnowledgeGraph,
    target_path: Optional[str] = None,
) -> dict:
    """Invoke a skill by command string.

    Args:
        command: The raw command string (e.g., "/explore parse_file --hops 2").
        kg: The knowledge graph to query.
        target_path: Optional path for cache/symbol resolution context.

    Returns:
        {
            "success": bool,
            "skill_name": str,
            "output": str,  # Formatted output text
            "data": dict  # Structured data (optional)
        }

    Example:
        >>> result = invoke_skill("/explore parse_file --hops 2", kg)
        >>> if result["success"]:
        ...     print(result["output"])
    """
    skill_name, args = parse_skill_command(command)

    if not skill_name:
        return {
            "success": False,
            "skill_name": "",
            "output": "Error: Invalid command syntax. Use /skill-name --arg value",
            "data": {},
        }

    if skill_name not in SKILL_REGISTRY:
        return {
            "success": False,
            "skill_name": skill_name,
            "output": f"Error: Unknown skill '{skill_name}'. Available skills: {', '.join(SKILL_REGISTRY.keys())}",
            "data": {},
        }

    # Instantiate and run the skill
    skill_class = SKILL_REGISTRY[skill_name]
    skill = skill_class(kg, args)

    try:
        output = skill.run()
        return {
            "success": True,
            "skill_name": skill_name,
            "output": output,
            "data": skill.result_data if hasattr(skill, 'result_data') else {},
        }
    except Exception as e:
        return {
            "success": False,
            "skill_name": skill_name,
            "output": f"Error running skill: {str(e)}",
            "data": {},
        }


# Import skill handlers - they will register themselves
from kg_builder.skills.explore import ExploreSkill  # noqa: E402
from kg_builder.skills.impact import ImpactSkill  # noqa: E402
from kg_builder.skills.context import ContextSkill  # noqa: E402
from kg_builder.skills.plan import PlanSkill  # noqa: E402


__all__ = [
    "SKILL_REGISTRY",
    "register_skill",
    "parse_skill_command",
    "invoke_skill",
]
