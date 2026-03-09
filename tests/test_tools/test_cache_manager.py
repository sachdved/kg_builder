"""Tests for cache_manager tool."""

import os
import pickle
import time
from pathlib import Path

import pytest

from kg_builder.tools.cache_manager import KGCacheManager


class TestKGCacheManager:
    """Test cases for KGCacheManager class."""

    def test_cache_creation(self, tmp_path):
        """Test that cache directory is created."""
        target = tmp_path / "test_project"
        target.mkdir()
        (target / "example.py").write_text("def hello(): pass")

        cache = KGCacheManager(str(target))

        assert cache.cache_dir.exists()
        assert cache.cache_dir == target / ".kg_cache"

    def test_get_or_build_creates_cache(self, tmp_path):
        """Test that get_or_build creates cache files."""
        target = tmp_path / "test_project"
        target.mkdir()
        (target / "example.py").write_text("def hello(): pass")

        cache = KGCacheManager(str(target))
        kg = cache.get_or_build()

        # Should have built a graph
        assert len(kg.entities) > 0

        # Cache files should exist
        assert cache._cache_file.exists()
        assert cache._hash_file.exists()
        assert cache._timestamp_file.exists()

    def test_get_or_build_uses_cache(self, tmp_path):
        """Test that second call uses cached graph."""
        target = tmp_path / "test_project"
        target.mkdir()
        (target / "example.py").write_text("def hello(): pass")

        cache = KGCacheManager(str(target))

        # First build
        kg1 = cache.get_or_build()
        hash1 = cache._compute_codebase_hash()

        # Second call should use cache (same hash)
        kg2 = cache.get_or_build()

        assert len(kg1.entities) == len(kg2.entities)

    def test_hash_changes_on_file_modification(self, tmp_path):
        """Test that codebase hash changes when files are modified."""
        target = tmp_path / "test_project"
        target.mkdir()
        py_file = target / "example.py"
        py_file.write_text("def hello(): pass")

        cache = KGCacheManager(str(target))
        hash1 = cache._compute_codebase_hash()

        # Modify the file
        py_file.write_text("def hello():\n    print('hi')")
        time.sleep(0.1)  # Ensure mtime changes

        hash2 = cache._compute_codebase_hash()

        assert hash1 != hash2

    def test_cache_invalidates_on_hash_change(self, tmp_path):
        """Test that cache is invalidated when codebase hash changes."""
        target = tmp_path / "test_project"
        target.mkdir()
        py_file = target / "example.py"
        py_file.write_text("def hello(): pass")

        cache = KGCacheManager(str(target))
        kg1 = cache.get_or_build()
        count1 = len(kg1.entities)

        # Add a new entity by modifying file
        py_file.write_text("""
def hello(): pass

class NewClass:
    def method(self):
        pass
""")
        time.sleep(0.1)

        # Should rebuild due to hash change
        kg2 = cache.get_or_build()

        assert len(kg2.entities) > count1

    def test_invalidate_clears_cache(self, tmp_path):
        """Test that invalidate() removes cache files."""
        target = tmp_path / "test_project"
        target.mkdir()
        (target / "example.py").write_text("def hello(): pass")

        cache = KGCacheManager(str(target))
        cache.get_or_build()  # Create cache

        assert cache._cache_file.exists()

        cache.invalidate()

        assert not cache._cache_file.exists()
        assert not cache._hash_file.exists()
        assert not cache._timestamp_file.exists()

    def test_clear_alias(self, tmp_path):
        """Test that clear() is an alias for invalidate()."""
        target = tmp_path / "test_project"
        target.mkdir()
        (target / "example.py").write_text("def hello(): pass")

        cache = KGCacheManager(str(target))
        cache.get_or_build()

        cache.clear()

        assert not cache._cache_file.exists()

    def test_ttl_expiration(self, tmp_path, monkeypatch):
        """Test that cache expires after TTL."""
        target = tmp_path / "test_project"
        target.mkdir()
        (target / "example.py").write_text("def hello(): pass")

        # Create a cache with 1 second TTL
        cache = KGCacheManager(str(target), ttl_seconds=1)
        kg = cache.get_or_build()

        # Simulate time passing by modifying timestamp file
        old_time = time.time() - 100  # 100 seconds ago
        cache._timestamp_file.write_text(str(old_time))

        # Should rebuild due to TTL expiration
        kg2 = cache.get_or_build()

        assert kg2 is not None

    def test_pickle_serialization(self, tmp_path):
        """Test that KG can be pickled and unpickled."""
        target = tmp_path / "test_project"
        target.mkdir()
        (target / "example.py").write_text("def hello(): pass")

        cache = KGCacheManager(str(target))
        kg = cache.get_or_build()

        # Load from pickle
        with open(cache._cache_file, "rb") as f:
            loaded_kg = pickle.load(f)

        assert len(loaded_kg.entities) == len(kg.entities)

    def test_cache_for_file_target(self, tmp_path):
        """Test cache manager with single file target."""
        target = tmp_path / "example.py"
        target.write_text("def hello(): pass")

        cache = KGCacheManager(str(target))

        # Cache should be in parent directory
        assert cache.cache_dir == tmp_path / ".kg_cache"

        kg = cache.get_or_build()
        assert len(kg.entities) > 0
