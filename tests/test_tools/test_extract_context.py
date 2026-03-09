"""Tests for extract_context tool."""

import pytest
from kg_builder.tools.extract_context import kg_extract_context


class TestKgExtractContext:
    """Test cases for kg_extract_context function."""

    def test_extract_single_entity(self, sample_kg):
        """Test extracting context for a single entity."""
        result = kg_extract_context(
            sample_kg,
            "file_a.py::ClassA",
            max_hops=0,
        )

        assert result["success"] is True
        assert result["entity_id"] == "file_a.py::ClassA"
        assert "context" in result

    def test_extract_with_hops(self, sample_kg):
        """Test extracting context with relationship traversal."""
        result = kg_extract_context(
            sample_kg,
            "file_a.py::ClassA",
            max_hops=1,
        )

        assert result["success"] is True
        # Context structure should be present (even if files don't exist)
        assert "context" in result
        assert "total_files" in result
        assert "total_entities" in result

    def test_exclude_types(self, sample_kg):
        """Test excluding certain entity types."""
        result = kg_extract_context(
            sample_kg,
            "file_a.py::ClassA",
            max_hops=2,
            exclude_types=["FILE"],
        )

        assert result["success"] is True
        # Should not include FILE entities
        for filepath, data in result["context"].items():
            for entity in data.get("entities", []):
                if "type" in entity:
                    assert entity["type"] != "FILE"

    def test_nonexistent_entity(self, sample_kg):
        """Test extracting context for non-existent entity."""
        result = kg_extract_context(
            sample_kg,
            "nonexistent::entity",
        )

        assert result["success"] is False
        assert "error" in result
        assert result["context"] == {}

    def test_result_structure(self, sample_kg):
        """Test that results have correct structure."""
        result = kg_extract_context(
            sample_kg,
            "file_a.py::ClassA",
            max_hops=1,
        )

        assert result["success"] is True
        assert "entity_id" in result
        assert "context" in result
        assert "total_files" in result
        assert "total_entities" in result

    def test_context_organized_by_file(self, sample_kg):
        """Test that context is organized by file path."""
        result = kg_extract_context(
            sample_kg,
            "file_a.py::ClassA",
            max_hops=1,
        )

        assert result["success"] is True

        for filepath, data in result["context"].items():
            assert isinstance(filepath, str)
            assert "entities" in data
            assert isinstance(data["entities"], list)

    def test_code_extraction_structure(self, sample_kg):
        """Test that extracted code has correct structure."""
        result = kg_extract_context(
            sample_kg,
            "file_a.py::ClassA",
            max_hops=0,
        )

        assert result["success"] is True

        for filepath, data in result["context"].items():
            for entity in data.get("entities", []):
                assert "id" in entity or "error" in entity
                if "id" in entity:
                    assert "name" in entity
                    assert "code" in entity
                    assert "line_range" in entity
