"""Shared pytest fixtures for kg_builder tests.

This module provides common fixtures used across test files:
- sample_kg: A KnowledgeGraph with test entities and relationships
- sample_code_with_calls: Python code string with function calls
- tmp_cache_dir: Temporary directory for cache tests
"""

import pytest
from pathlib import Path
from tempfile import TemporaryDirectory

from kg_builder.core.models import (
    Entity, EntityType, KnowledgeGraph, Relationship, RelationshipType,
)


@pytest.fixture
def sample_kg() -> KnowledgeGraph:
    """Create a sample KnowledgeGraph with test entities and relationships.

    This graph includes:
    - 2 files (file_a.py, file_b.py)
    - Several classes and functions
    - Various relationship types (CONTAINS, CALLS, IMPORTS)

    Returns:
        A populated KnowledgeGraph for testing.
    """
    kg = KnowledgeGraph()

    # Add FILE entities
    file_a = Entity(
        id="file_a.py",
        name="file_a.py",
        type=EntityType.FILE,
        file_path="test_dir/file_a.py",
        line_number=1,
    )
    file_b = Entity(
        id="file_b.py",
        name="file_b.py",
        type=EntityType.FILE,
        file_path="test_dir/file_b.py",
        line_number=1,
    )
    kg.add_entity(file_a)
    kg.add_entity(file_b)

    # Add CLASS entities
    class_a = Entity(
        id="file_a.py::ClassA",
        name="ClassA",
        type=EntityType.CLASS,
        file_path="test_dir/file_a.py",
        line_number=5,
        end_line=20,
    )
    kg.add_entity(class_a)

    # Add FUNCTION entities
    def_func = Entity(
        id="file_a.py::helper_function",
        name="helper_function",
        type=EntityType.FUNCTION,
        file_path="test_dir/file_a.py",
        line_number=25,
        end_line=30,
    )
    kg.add_entity(def_func)

    call_site = Entity(
        id="file_b.py::caller_function",
        name="caller_function",
        type=EntityType.FUNCTION,
        file_path="test_dir/file_b.py",
        line_number=10,
        end_line=15,
    )
    kg.add_entity(call_site)

    # Add relationships
    # File A contains ClassA
    kg.add_relationship(Relationship(
        source_id="file_a.py",
        target_id="file_a.py::ClassA",
        type=RelationshipType.CONTAINS,
        line_number=1,
    ))

    # File A contains helper_function
    kg.add_relationship(Relationship(
        source_id="file_a.py",
        target_id="file_a.py::helper_function",
        type=RelationshipType.CONTAINS,
        line_number=1,
    ))

    # ClassA contains a method
    class_method = Entity(
        id="file_a.py::ClassA::process",
        name="process",
        type=EntityType.FUNCTION,
        file_path="test_dir/file_a.py",
        line_number=8,
        end_line=15,
    )
    kg.add_entity(class_method)

    kg.add_relationship(Relationship(
        source_id="file_a.py::ClassA",
        target_id="file_a.py::ClassA::process",
        type=RelationshipType.CONTAINS,
        line_number=8,
    ))

    # ClassA.process calls helper_function
    kg.add_relationship(Relationship(
        source_id="file_a.py::ClassA::process",
        target_id="file_a.py::helper_function",
        type=RelationshipType.CALLS,
        line_number=12,
    ))

    # caller_function in file_b calls helper_function
    kg.add_relationship(Relationship(
        source_id="file_b.py::caller_function",
        target_id="file_a.py::helper_function",
        type=RelationshipType.CALLS,
        line_number=12,
    ))

    # Build indices
    kg._build_indices()

    return kg


@pytest.fixture
def sample_code_with_calls() -> str:
    """Return a Python code string with function calls for parsing tests.

    Returns:
        A code string containing classes, functions, and calls.
    """
    return '''
"""Module docstring."""

class DataProcessor:
    """Process data."""

    def __init__(self, config):
        self.config = config
        self.items = []

    def process(self, data):
        """Process input data."""
        result = self._transform(data)
        return self._validate(result)

    def _transform(self, data):
        """Transform the data."""
        return [x * 2 for x in data]

    def _validate(self, data):
        """Validate transformed data."""
        return all(x > 0 for x in data)


def main():
    """Entry point."""
    processor = DataProcessor({"debug": True})
    results = processor.process([1, 2, 3])
    print(results)


if __name__ == "__main__":
    main()
'''


@pytest.fixture
def tmp_cache_dir() -> TemporaryDirectory:
    """Return a temporary directory for cache tests.

    Returns:
        A TemporaryDirectory that will be cleaned up after the test.
    """
    return TemporaryDirectory()


@pytest.fixture
def kg_with_imports() -> KnowledgeGraph:
    """Create a KG with import relationships.

    Returns:
        A KnowledgeGraph with IMPORT entities and resolved relationships.
    """
    kg = KnowledgeGraph()

    # Add files
    main_file = Entity(
        id="main.py",
        name="main.py",
        type=EntityType.FILE,
        file_path="test_dir/main.py",
        line_number=1,
    )
    utils_file = Entity(
        id="utils.py",
        name="utils.py",
        type=EntityType.FILE,
        file_path="test_dir/utils.py",
        line_number=1,
    )
    kg.add_entity(main_file)
    kg.add_entity(utils_file)

    # Add import entity
    import_entity = Entity(
        id="main.py::IMPORT::helper",
        name="helper",
        type=EntityType.IMPORT,
        file_path="test_dir/main.py",
        line_number=1,
        properties={
            "module": "test_dir.utils",
            "original_name": "helper",
        },
    )
    kg.add_entity(import_entity)

    # Add the imported function
    helper_func = Entity(
        id="utils.py::helper",
        name="helper",
        type=EntityType.FUNCTION,
        file_path="test_dir/utils.py",
        line_number=5,
        end_line=10,
    )
    kg.add_entity(helper_func)

    # Add resolved relationship
    kg.add_relationship(Relationship(
        source_id="main.py::IMPORT::helper",
        target_id="utils.py::helper",
        type=RelationshipType.IMPORTS_RESOLVED_TO,
        line_number=1,
        is_resolved=True,
    ))

    kg._build_indices()
    return kg
