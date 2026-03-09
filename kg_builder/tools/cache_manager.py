"""Knowledge graph caching with file-based persistence.

This module provides KGCacheManager for building and caching knowledge graphs.
The cache is stored per-project in a `.kg_cache/` directory to avoid rebuilding
the graph on every query.

Features:
- File-based pickle cache for fast serialization
- Hash-based invalidation based on file modification times
- TTL support for automatic cache expiration
"""

import hashlib
import os
import pickle
import time
from pathlib import Path
from typing import Optional

from kg_builder import build_knowledge_graph
from kg_builder.models import KnowledgeGraph


class KGCacheManager:
    """Manages cached knowledge graphs with file-based persistence.

    The cache directory is `.kg_cache/` inside the target directory,
    keeping cache isolated per project.

    Attributes:
        target_path: Path to the codebase directory or file.
        cache_dir: Directory where cache files are stored.
        ttl_seconds: Time-to-live for cached graphs in seconds (default: 1 hour).

    Example:
        >>> cache = KGCacheManager("/path/to/project")
        >>> kg = cache.get_or_build()  # Returns cached or fresh KG
        >>> cache.invalidate()  # Force rebuild next time
    """

    def __init__(
        self,
        target_path: str,
        exclude_patterns: Optional[list[str]] = None,
        ttl_seconds: int = 3600,
    ) -> None:
        """Initialize the cache manager.

        Args:
            target_path: Path to a Python file or directory.
            exclude_patterns: Optional list of glob patterns to exclude.
            ttl_seconds: Cache TTL in seconds (default: 3600 = 1 hour).
        """
        self.target_path = Path(target_path).resolve()
        self.exclude_patterns = exclude_patterns or []
        self.ttl_seconds = ttl_seconds

        # Cache directory is `.kg_cache/` inside target (or parent if file)
        if self.target_path.is_file():
            cache_parent = self.target_path.parent
        else:
            cache_parent = self.target_path
        self.cache_dir = cache_parent / ".kg_cache"
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        # Cache file paths
        self._hash_file = self.cache_dir / "codebase_hash.txt"
        self._cache_file = self.cache_dir / "knowledge_graph.pkl"
        self._timestamp_file = self.cache_dir / "cache_timestamp.txt"

    def get_or_build(self) -> KnowledgeGraph:
        """Get cached KG or build a new one if cache is invalid.

        Returns:
            A KnowledgeGraph object (from cache or freshly built).

        Example:
            >>> kg = cache.get_or_build()
            >>> print(len(kg.entities))
        """
        # Compute current hash
        current_hash = self._compute_codebase_hash()

        # Check if cache exists and is valid
        if self._cache_is_valid(current_hash):
            kg = self._load_from_cache()
            if kg is not None:
                return kg

        # Build fresh KG
        kg = build_knowledge_graph(str(self.target_path), self.exclude_patterns)

        # Save to cache
        self._save_to_cache(kg, current_hash)

        return kg

    def _cache_is_valid(self, current_hash: str) -> bool:
        """Check if the cache is valid and not expired.

        Args:
            current_hash: Current codebase hash.

        Returns:
            True if cache exists, hash matches, and TTL not exceeded.
        """
        # Check all cache files exist
        if not all(f.exists() for f in [self._cache_file, self._hash_file, self._timestamp_file]):
            return False

        # Check hash matches
        try:
            with open(self._hash_file, "r") as f:
                cached_hash = f.read().strip()
            if cached_hash != current_hash:
                return False
        except (IOError, ValueError):
            return False

        # Check TTL
        try:
            with open(self._timestamp_file, "r") as f:
                cache_time = float(f.read().strip())
            if time.time() - cache_time > self.ttl_seconds:
                return False
        except (IOError, ValueError):
            return False

        return True

    def _compute_codebase_hash(self) -> str:
        """Compute a hash of all Python files in the target.

        The hash is based on file paths and modification times,
        allowing cache invalidation when files change.

        Returns:
            Hex-encoded SHA256 hash string.
        """
        hasher = hashlib.sha256()

        def add_file_info(file_path: Path) -> None:
            try:
                # Include file path (relative to target) and mtime
                rel_path = file_path.relative_to(self.target_path.parent if self.target_path.is_file() else self.target_path)
                info = f"{rel_path}:{file_path.stat().st_mtime}"
                hasher.update(info.encode("utf-8"))
            except (OSError, ValueError):
                pass  # Skip files we can't access

        target = self.target_path if self.target_path.is_dir() else self.target_path.parent

        for py_file in target.rglob("*.py"):
            add_file_info(py_file)

        return hasher.hexdigest()

    def _save_to_cache(
        self, kg: KnowledgeGraph, codebase_hash: str
    ) -> None:
        """Save knowledge graph to cache.

        Args:
            kg: The knowledge graph to cache.
            codebase_hash: Hash of the current codebase state.
        """
        # Ensure cache directory exists
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        # Save hash
        with open(self._hash_file, "w") as f:
            f.write(codebase_hash)

        # Save timestamp
        with open(self._timestamp_file, "w") as f:
            f.write(str(time.time()))

        # Pickle the knowledge graph
        with open(self._cache_file, "wb") as f:
            pickle.dump(kg, f)

    def _load_from_cache(self) -> Optional[KnowledgeGraph]:
        """Load knowledge graph from cache.

        Returns:
            KnowledgeGraph if cache exists and is readable, None otherwise.
        """
        try:
            with open(self._cache_file, "rb") as f:
                return pickle.load(f)
        except (IOError, pickle.PickleError, EOFError):
            return None

    def invalidate(self) -> None:
        """Invalidate the cache, forcing rebuild on next get_or_build().

        This removes all cache files. Useful after bulk code changes
        or when you want to ensure a fresh graph.

        Example:
            >>> cache.invalidate()
            >>> kg = cache.get_or_build()  # Builds fresh KG
        """
        for cache_file in [self._cache_file, self._hash_file, self._timestamp_file]:
            if cache_file.exists():
                cache_file.unlink()

    def clear(self) -> None:
        """Alias for invalidate().

        Example:
            >>> cache.clear()  # Same as cache.invalidate()
        """
        self.invalidate()
