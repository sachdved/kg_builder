"""Tests for find_entity tool."""

import pytest
from kg_builder.tools.find_entity import kg_find_entity


class TestKgFindEntity:
    """Test cases for kg_find_entity function."""

    def test_find_exact_match(self, sample_kg):
        """Test finding an entity with exact name match."""
        result = kg_find_entity(sample_kg, "helper_function", fuzzy=False)

        assert result["success"] is True
        assert result["count"] > 0
        assert any(m["name"] == "helper_function" for m in result["matches"])

    def test_find_fuzzy_match(self, sample_kg):
        """Test finding entities with partial name match."""
        result = kg_find_entity(sample_kg, "helper", fuzzy=True)

        assert result["success"] is True
        assert result["count"] > 0
        # Should find helper_function
        assert any("helper" in m["name"].lower() for m in result["matches"])

    def test_find_nonexistent(self, sample_kg):
        """Test searching for non-existent entity."""
        result = kg_find_entity(sample_kg, "nonexistent_xyz", fuzzy=False)

        assert result["success"] is True  # Search succeeds, just no matches
        assert result["count"] == 0
        assert result["matches"] == []

    def test_type_filter(self, sample_kg):
        """Test filtering results by entity type."""
        result = kg_find_entity(sample_kg, "process", entity_type="FUNCTION")

        assert result["success"] is True
        for match in result["matches"]:
            assert match["type"] == "FUNCTION"

    def test_class_type_filter(self, sample_kg):
        """Test filtering to find only CLASS entities."""
        result = kg_find_entity(sample_kg, "ClassA", entity_type="CLASS")

        assert result["success"] is True
        for match in result["matches"]:
            assert match["type"] == "CLASS"

    def test_max_results(self, sample_kg):
        """Test that max_results limits output."""
        # Search for something that might have multiple matches
        result = kg_find_entity(sample_kg, "", fuzzy=True, max_results=2)

        assert result["success"] is True
        assert result["count"] <= 2
        assert len(result["matches"]) <= 2

    def test_result_structure(self, sample_kg):
        """Test that results have correct structure."""
        result = kg_find_entity(sample_kg, "ClassA")

        assert result["success"] is True
        assert "matches" in result
        assert "count" in result

        if result["matches"]:
            match = result["matches"][0]
            assert "id" in match
            assert "name" in match
            assert "type" in match
            assert "file_path" in match
            assert "line_number" in match

    def test_file_path_filter(self, sample_kg):
        """Test filtering by file path."""
        result = kg_find_entity(
            sample_kg,
            "helper_function",
            file_path="file_a.py"
        )

        assert result["success"] is True
        for match in result["matches"]:
            assert "file_a.py" in match["file_path"]
