"""Unit tests for the knowledge graph builder."""

import json
import tempfile
from pathlib import Path

import pytest

from kg_builder.core.models import Entity, EntityType, KnowledgeGraph, Relationship, RelationshipType
from kg_builder.core.parser import parse_file


# Sample Python code for testing
SAMPLE_CLASS_CODE = '''
"""Module docstring for testing."""

CONSTANT = 42


class MyClass:
    """A sample class for testing."""

    class_attr = "I am a class attribute"

    def __init__(self, name: str) -> None:
        """Initialize the class."""
        self.name = name
        self._private = 0

    def my_method(self, x: int, y: int = 10) -> int:
        """A method that returns a value."""
        return x + y

    @staticmethod
    def static_method() -> str:
        """A static method."""
        return "static"

    @property
    def my_property(self) -> str:
        """A property."""
        return self.name


class ChildClass(MyClass):
    """A child class that inherits from MyClass."""

    def override_method(self) -> None:
        """Override a parent method."""
        pass


def standalone_function(a: int, b: int = 5) -> int:
    """A standalone function."""
    result = a + b
    return result


async def async_function(value: str) -> str:
    """An async function."""
    return value.upper()


import os
from typing import List, Dict
'''

SAMPLE_CALLS_CODE = '''
"""Module with function calls for testing."""


def helper(x: int) -> int:
    """Helper function."""
    return x * 2


def main_function(data: list) -> None:
    """Function that calls other functions."""
    result = []
    for item in data:
        processed = helper(item)
        result.append(processed)
    print(result)


class Calculator:
    """A class with method calls."""

    def add(self, a: int, b: int) -> int:
        """Add two numbers."""
        return a + b

    def compute(self, values: list) -> int:
        """Compute sum using add method."""
        total = 0
        for v in values:
            total = self.add(total, v)
        return total
'''


class TestEntityCreation:
    """Tests for entity extraction from Python code."""

    def test_parse_simple_class(self, tmp_path: Path) -> None:
        """Test parsing a file with a simple class and method."""
        test_file = tmp_path / "simple.py"
        test_file.write_text(SAMPLE_CLASS_CODE)

        entities, file_entity = parse_file(str(test_file))

        # Should have FILE entity
        assert file_entity is not None
        assert file_entity.type == EntityType.FILE

        # Should find multiple entities
        assert len(entities) > 5

        # Find MyClass
        class_entities = [e for e in entities if e.type == EntityType.CLASS]
        assert any(e.name == "MyClass" for e in class_entities)

        # Find methods
        func_entities = [e for e in entities if e.type == EntityType.FUNCTION]
        assert any(e.name == "my_method" for e in func_entities)

    def test_parse_standalone_function(self, tmp_path: Path) -> None:
        """Test parsing standalone functions."""
        test_file = tmp_path / "functions.py"
        test_file.write_text(SAMPLE_CLASS_CODE)

        entities, _ = parse_file(str(test_file))

        func_entities = [e for e in entities if e.type == EntityType.FUNCTION]
        assert any(e.name == "standalone_function" for e in func_entities)

    def test_parse_async_function(self, tmp_path: Path) -> None:
        """Test parsing async functions."""
        test_file = tmp_path / "async.py"
        test_file.write_text(SAMPLE_CLASS_CODE)

        entities, _ = parse_file(str(test_file))

        async_funcs = [e for e in entities if e.type == EntityType.ASYNC_FUNCTION]
        assert any(e.name == "async_function" for e in async_funcs)

    def test_parse_constants(self, tmp_path: Path) -> None:
        """Test parsing constants (UPPERCASE variables)."""
        test_file = tmp_path / "constants.py"
        test_file.write_text(SAMPLE_CLASS_CODE)

        entities, _ = parse_file(str(test_file))

        const_entities = [e for e in entities if e.type == EntityType.CONSTANT]
        assert any(e.name == "CONSTANT" for e in const_entities)

    def test_parse_imports(self, tmp_path: Path) -> None:
        """Test parsing import statements."""
        test_file = tmp_path / "imports.py"
        test_file.write_text(SAMPLE_CLASS_CODE)

        entities, _ = parse_file(str(test_file))

        import_entities = [e for e in entities if e.type == EntityType.IMPORT]

        # Should find 'os' and imports from typing
        names = [e.name for e in import_entities]
        assert "os" in names
        assert "List" in names or "Dict" in names

    def test_entity_id_format(self, tmp_path: Path) -> None:
        """Test that entity IDs follow the expected format."""
        test_file = tmp_path / "test.py"
        test_file.write_text(SAMPLE_CLASS_CODE)

        entities, _ = parse_file(str(test_file))

        # Check that MyClass has the right ID format
        myclass = [e for e in entities if e.name == "MyClass"][0]
        assert str(test_file) in myclass.id
        assert "::" in myclass.id or myclass.id.endswith("test.py")


class TestEntityProperties:
    """Tests for entity properties extraction."""

    def test_docstring_extraction(self, tmp_path: Path) -> None:
        """Test that docstrings are extracted correctly."""
        test_file = tmp_path / "docstrings.py"
        test_file.write_text(SAMPLE_CLASS_CODE)

        entities, _ = parse_file(str(test_file))

        # Find MyClass and check its docstring
        myclass = [e for e in entities if e.name == "MyClass"][0]
        desc = myclass.properties.get("description", "")
        assert desc != "No docstring"  # Should have a real docstring
        assert "sample class" in desc.lower()

    def test_decorator_extraction(self, tmp_path: Path) -> None:
        """Test that decorators are extracted."""
        test_file = tmp_path / "decorators.py"
        test_file.write_text(SAMPLE_CLASS_CODE)

        entities, _ = parse_file(str(test_file))

        # Find static_method and check decorators
        static_method = [
            e for e in entities if e.name == "static_method"
        ][0]
        decorators = static_method.properties.get("decorators", [])
        assert "@staticmethod" in str(decorators) or "staticmethod" in str(
            decorators
        )

    def test_argument_extraction(self, tmp_path: Path) -> None:
        """Test that function arguments are extracted."""
        test_file = tmp_path / "args.py"
        test_file.write_text(SAMPLE_CLASS_CODE)

        entities, _ = parse_file(str(test_file))

        # Find my_method and check arguments
        my_method = [e for e in entities if e.name == "my_method"][0]
        args = my_method.properties.get("args", [])
        assert len(args) >= 2  # x and y parameters


class TestRelationshipDetection:
    """Tests for relationship detection."""

    def test_contains_relationship(self, tmp_path: Path) -> None:
        """Test CONTAINS relationships between class and methods."""
        from kg_builder.core.relationship_finder import find_all_relationships

        import ast

        test_file = tmp_path / "contains.py"
        test_file.write_text(SAMPLE_CLASS_CODE)

        entities, _ = parse_file(str(test_file))
        tree = ast.parse(SAMPLE_CLASS_CODE)
        relationships = find_all_relationships(str(test_file), entities, tree)

        # Find CONTAINS relationships
        contains_rels = [r for r in relationships if r.type == RelationshipType.CONTAINS]
        assert len(contains_rels) > 0

    def test_inherits_relationship(self, tmp_path: Path) -> None:
        """Test INHERITS relationships."""
        from kg_builder.core.relationship_finder import find_all_relationships

        import ast

        test_file = tmp_path / "inherits.py"
        test_file.write_text(SAMPLE_CLASS_CODE)

        entities, _ = parse_file(str(test_file))
        tree = ast.parse(SAMPLE_CLASS_CODE)
        relationships = find_all_relationships(str(test_file), entities, tree)

        inherits_rels = [r for r in relationships if r.type == RelationshipType.INHERITS]
        assert any(r.source_id.endswith("ChildClass") for r in inherits_rels)

    def test_calls_relationship(self, tmp_path: Path) -> None:
        """Test CALLS relationships."""
        from kg_builder.core.relationship_finder import find_all_relationships

        import ast

        test_file = tmp_path / "calls.py"
        test_file.write_text(SAMPLE_CALLS_CODE)

        entities, _ = parse_file(str(test_file))
        tree = ast.parse(SAMPLE_CALLS_CODE)
        relationships = find_all_relationships(str(test_file), entities, tree)

        calls_rels = [r for r in relationships if r.type == RelationshipType.CALLS]
        assert len(calls_rels) > 0


class TestKnowledgeGraph:
    """Tests for the KnowledgeGraph class."""

    def test_kg_creation(self) -> None:
        """Test creating an empty knowledge graph."""
        kg = KnowledgeGraph()
        assert kg.entities == {}
        assert kg.relationships == []

    def test_add_entity(self) -> None:
        """Test adding entities to the knowledge graph."""
        kg = KnowledgeGraph()
        entity = Entity(
            id="test.py::MyClass",
            name="MyClass",
            type=EntityType.CLASS,
            file_path="test.py",
            line_number=1,
        )
        kg.add_entity(entity)
        assert len(kg.entities) == 1

    def test_add_relationship(self) -> None:
        """Test adding relationships to the knowledge graph."""
        kg = KnowledgeGraph()
        rel = Relationship(
            source_id="test.py",
            target_id="test.py::MyClass",
            type=RelationshipType.CONTAINS,
            line_number=1,
        )
        kg.add_relationship(rel)
        assert len(kg.relationships) == 1

    def test_to_dict(self) -> None:
        """Test converting knowledge graph to dictionary."""
        kg = KnowledgeGraph()
        entity = Entity(
            id="test.py::MyClass",
            name="MyClass",
            type=EntityType.CLASS,
            file_path="test.py",
            line_number=1,
            properties={"docstring": "test"},
        )
        kg.add_entity(entity)

        result = kg.to_dict()
        assert "entities" in result
        assert "relationships" in result
        assert "test.py::MyClass" in result["entities"]

    def test_to_json(self) -> None:
        """Test converting knowledge graph to JSON."""
        kg = KnowledgeGraph()
        entity = Entity(
            id="test.py::MyClass",
            name="MyClass",
            type=EntityType.CLASS,
            file_path="test.py",
            line_number=1,
        )
        kg.add_entity(entity)

        json_str = kg.to_json()
        # Should be valid JSON
        data = json.loads(json_str)
        assert "entities" in data


class TestIntegration:
    """Integration tests for the full pipeline."""

    def test_full_pipeline(self, tmp_path: Path) -> None:
        """Test building a complete knowledge graph from code."""
        from kg_builder import build_knowledge_graph

        # Create test files
        test_dir = tmp_path / "test_project"
        test_dir.mkdir()

        main_file = test_dir / "main.py"
        main_file.write_text(SAMPLE_CLASS_CODE)

        utils_file = test_dir / "utils.py"
        utils_file.write_text(SAMPLE_CALLS_CODE)

        # Build the knowledge graph
        kg = build_knowledge_graph(str(test_dir))

        # Verify structure
        assert len(kg.entities) > 0
        assert len(kg.relationships) >= 0

        # Should have entities from both files
        file_paths = {e.file_path for e in kg.entities.values()}
        assert str(main_file) in file_paths or "main.py" in str(file_paths)


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    def test_empty_file(self, tmp_path: Path) -> None:
        """Test parsing an empty file."""
        test_file = tmp_path / "empty.py"
        test_file.write_text("")

        entities, _ = parse_file(str(test_file))
        # Empty file still has FILE and MODULE entities
        assert len(entities) == 2  # FILE and MODULE entities

    def test_syntax_error(self, tmp_path: Path) -> None:
        """Test parsing a file with syntax errors."""
        test_file = tmp_path / "error.py"
        test_file.write_text("def broken(\n")  # Incomplete function

        entities, _ = parse_file(str(test_file))
        assert len(entities) == 0  # Syntax errors return empty

    def test_nonexistent_file(self) -> None:
        """Test parsing a nonexistent file."""
        entities, _ = parse_file("/nonexistent/path/file.py")
        assert len(entities) == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
