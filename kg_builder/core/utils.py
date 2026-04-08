"""Utility functions for file traversal and entity ID generation."""

import fnmatch
from pathlib import Path
from typing import Iterator


def generate_entity_id(file_path: str, *scopes: str) -> str:
    """Generate a unique entity ID.

    The ID format is: "file.py::OuterClass::InnerClass::method_name"

    Args:
        file_path: The path to the source file.
        *scopes: Optional scope names (class names, etc.) to append.

    Returns:
        A unique identifier string for the entity.
    """
    if scopes:
        return f"{file_path}::{ '::'.join(scopes) }"
    return file_path


def get_python_files(
    root_path: str | Path, exclude_patterns: list[str] | None = None
) -> Iterator[Path]:
    """Recursively find all Python files in a directory or yield a single file.

    Args:
        root_path: Path to a file or directory.
        exclude_patterns: Optional list of glob patterns to exclude.

    Yields:
        Path objects for each Python file found.
    """
    path = Path(root_path) if isinstance(root_path, str) else root_path

    # If it's a single file, yield it directly
    if path.is_file():
        if path.suffix == ".py":
            yield path
        return

    # Otherwise, recursively find all Python files
    for py_file in path.rglob("*.py"):
        # Check against exclusion patterns
        if exclude_patterns and should_exclude(py_file, exclude_patterns):
            continue
        yield py_file


def should_exclude(file_path: Path, exclude_patterns: list[str]) -> bool:
    """Check if a file path matches any of the exclusion patterns.

    Args:
        file_path: The file path to check.
        exclude_patterns: List of glob patterns to match against.

    Returns:
        True if the file should be excluded, False otherwise.
    """
    # Check against the full path and just the filename
    path_str = str(file_path)
    for pattern in exclude_patterns:
        if fnmatch.fnmatch(path_str, pattern):
            return True
        if fnmatch.fnmatch(file_path.name, pattern):
            return True
    return False


def read_file_safely(file_path: str | Path) -> str | None:
    """Read a file with error handling.

    Args:
        file_path: Path to the file to read.

    Returns:
        The file contents as a string, or None if reading failed.
    """
    path = Path(file_path) if isinstance(file_path, str) else file_path

    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        # Return None for unreadable files
        return None


def is_constant_name(name: str) -> bool:
    """Check if a name follows the constant naming convention (UPPERCASE).

    Args:
        name: The identifier name to check.

    Returns:
        True if the name appears to be a constant.
    """
    # Constants are typically all uppercase with underscores
    return name.isupper() or (name.replace("_", "").isupper() and len(name) > 1)


def get_relative_path(file_path: str | Path, base_path: str | Path | None = None) -> str:
    """Get the relative path from a base directory.

    Args:
        file_path: The file path to make relative.
        base_path: Optional base path (defaults to current working directory).

    Returns:
        The relative path as a string.
    """
    path = Path(file_path) if isinstance(file_path, str) else file_path

    if base_path is None:
        base_path = Path.cwd()
    elif isinstance(base_path, str):
        base_path = Path(base_path)

    try:
        return str(path.relative_to(base_path))
    except ValueError:
        # If path is not relative to base_path, return absolute path
        return str(path)
