"""Symbol resolution across files in a codebase.

Handles three levels of resolution:
1. Import resolution — links IMPORT entities to their definitions
2. Inheritance resolution — resolves bare class names in INHERITS edges to actual entity IDs
3. Call resolution — resolves method calls (obj.method()) through type inference and class hierarchies
"""

import ast
from pathlib import Path
from typing import Optional

from kg_builder.models import Entity, EntityType, Relationship, RelationshipType


class SymbolResolver:
    """Resolve symbol references to their definitions across files."""

    def __init__(self, kg) -> None:
        self.kg = kg
        # "file.py::SymbolName" -> entity_id
        self._symbol_table: dict[str, str] = {}
        # "ClassName" -> [entity_id, ...] (may be ambiguous)
        self._class_by_name: dict[str, list[str]] = {}
        # "FunctionName" -> [entity_id, ...] for top-level functions
        self._func_by_name: dict[str, list[str]] = {}
        # class_entity_id -> set of method names defined on that class
        self._class_methods: dict[str, dict[str, str]] = {}
        # class_entity_id -> [parent_class_entity_id, ...] (resolved inheritance)
        self._class_parents: dict[str, list[str]] = {}
        # class_entity_id -> full MRO method table {method_name: defining_entity_id}
        self._class_mro_methods: dict[str, dict[str, str]] = {}

    def build_symbol_table(self) -> None:
        """Build symbol table, class index, and method tables."""
        for entity in self.kg.entities.values():
            if entity.type in (EntityType.CLASS, EntityType.FUNCTION,
                               EntityType.ASYNC_FUNCTION, EntityType.CONSTANT):
                fq_name = f"{entity.file_path}::{entity.name}"
                self._symbol_table[fq_name] = entity.id

            if entity.type == EntityType.CLASS:
                name = entity.name
                if name not in self._class_by_name:
                    self._class_by_name[name] = []
                self._class_by_name[name].append(entity.id)

            if entity.type in (EntityType.FUNCTION, EntityType.ASYNC_FUNCTION):
                # Only index top-level functions (one :: separator = file::func)
                parts = entity.id.split("::")
                if len(parts) == 2:
                    name = entity.name
                    if name not in self._func_by_name:
                        self._func_by_name[name] = []
                    self._func_by_name[name].append(entity.id)

        # Build class method tables from CONTAINS relationships
        for rel in self.kg.relationships:
            if rel.type == RelationshipType.CONTAINS:
                parent = rel.source_id
                child = rel.target_id
                if parent in self.kg.entities and child in self.kg.entities:
                    parent_entity = self.kg.entities[parent]
                    child_entity = self.kg.entities[child]
                    if (parent_entity.type == EntityType.CLASS and
                            child_entity.type in (EntityType.FUNCTION, EntityType.ASYNC_FUNCTION)):
                        if parent not in self._class_methods:
                            self._class_methods[parent] = {}
                        self._class_methods[parent][child_entity.name] = child

    def _resolve_class_name(self, bare_name: str, context_file: str = "") -> Optional[str]:
        """Resolve a bare class name to an entity ID.

        Tries:
        1. Imports in the same file that match the name
        2. Direct class_by_name lookup (unambiguous)
        3. Class defined in the same file
        """
        # Check if there's an import in the context file that resolves this name
        if context_file:
            for entity in self.kg.entities.values():
                if (entity.type == EntityType.IMPORT and
                        entity.name == bare_name and
                        entity.file_path == context_file):
                    # Follow the import to its resolved target
                    resolved = self.resolve_import(entity)
                    if resolved:
                        return resolved

        # Direct lookup by class name
        candidates = self._class_by_name.get(bare_name, [])
        if len(candidates) == 1:
            return candidates[0]

        # If multiple candidates, prefer one in the same file
        if context_file and len(candidates) > 1:
            for cid in candidates:
                if self.kg.entities[cid].file_path == context_file:
                    return cid

        # If still multiple, just return first (imperfect but better than nothing)
        if candidates:
            return candidates[0]

        return None

    def _resolve_inheritance(self) -> list[Relationship]:
        """Resolve INHERITS edges from bare names to actual class entity IDs."""
        resolved_rels = []

        for rel in self.kg.relationships:
            if rel.type != RelationshipType.INHERITS:
                continue

            # target_id is currently a bare name like "EtfGlobalClient"
            if rel.target_id in self.kg.entities:
                # Already resolved
                parent_id = rel.target_id
            else:
                source_file = ""
                if rel.source_id in self.kg.entities:
                    source_file = self.kg.entities[rel.source_id].file_path
                parent_id = self._resolve_class_name(rel.target_id, source_file)

            if parent_id and parent_id in self.kg.entities:
                # Record the resolved parent
                if rel.source_id not in self._class_parents:
                    self._class_parents[rel.source_id] = []
                self._class_parents[rel.source_id].append(parent_id)

                # Create a resolved INHERITS relationship if the original was unresolved
                if rel.target_id != parent_id:
                    resolved_rels.append(Relationship(
                        source_id=rel.source_id,
                        target_id=parent_id,
                        type=RelationshipType.INHERITS,
                        line_number=rel.line_number,
                        is_resolved=True,
                        properties={"original_target": rel.target_id},
                    ))

        return resolved_rels

    def _build_mro_methods(self) -> None:
        """Build method resolution order tables for all classes.

        For each class, collect all methods: own methods first, then
        inherited methods (depth-first through parents, no duplicates).
        """
        visited: set[str] = set()

        def _collect_methods(class_id: str) -> dict[str, str]:
            if class_id in self._class_mro_methods:
                return self._class_mro_methods[class_id]

            if class_id in visited:
                return {}  # Circular inheritance guard
            visited.add(class_id)

            methods: dict[str, str] = {}

            # Collect parent methods first (so own methods override)
            for parent_id in self._class_parents.get(class_id, []):
                parent_methods = _collect_methods(parent_id)
                for name, eid in parent_methods.items():
                    if name not in methods:
                        methods[name] = eid

            # Own methods override inherited
            for name, eid in self._class_methods.get(class_id, {}).items():
                methods[name] = eid

            self._class_mro_methods[class_id] = methods
            visited.discard(class_id)
            return methods

        for class_id in self._class_by_name.values():
            for cid in class_id:
                _collect_methods(cid)

    def _infer_variable_types(self) -> dict[str, dict[str, str]]:
        """Infer variable types from assignments across all files.

        Scans for patterns like:
            x = ClassName(...)          -> x has type ClassName
            x: ClassName = ...          -> x has type ClassName
            x = module.ClassName(...)   -> x has type ClassName

        Returns:
            {file_path: {var_name: class_entity_id}}
        """
        file_var_types: dict[str, dict[str, str]] = {}

        # Collect all file paths (FILE and MODULE entities both represent parseable files)
        file_paths = set()
        for entity in self.kg.entities.values():
            if entity.type in (EntityType.FILE, EntityType.MODULE):
                file_paths.add(entity.file_path)

        for file_path in file_paths:
            try:
                source = Path(file_path).read_text(encoding="utf-8")
                tree = ast.parse(source, filename=file_path)
            except (OSError, SyntaxError):
                continue

            var_types: dict[str, str] = {}

            for node in ast.walk(tree):
                # Pattern: x = ClassName(...)
                if isinstance(node, ast.Assign):
                    if (len(node.targets) == 1 and
                            isinstance(node.targets[0], ast.Name) and
                            isinstance(node.value, ast.Call)):
                        var_name = node.targets[0].id
                        class_name = self._extract_class_from_call(node.value)
                        if class_name:
                            resolved = self._resolve_class_name(class_name, file_path)
                            if resolved:
                                var_types[var_name] = resolved

                # Pattern: x: ClassName = ...
                elif isinstance(node, ast.AnnAssign):
                    if (isinstance(node.target, ast.Name) and
                            isinstance(node.annotation, ast.Name)):
                        var_name = node.target.id
                        class_name = node.annotation.id
                        resolved = self._resolve_class_name(class_name, file_path)
                        if resolved:
                            var_types[var_name] = resolved

            if var_types:
                file_var_types[file_path] = var_types

        return file_var_types

    def _extract_class_from_call(self, call_node: ast.Call) -> Optional[str]:
        """Extract the class name from a Call node if it looks like instantiation."""
        func = call_node.func
        if isinstance(func, ast.Name) and func.id[0:1].isupper():
            return func.id
        if isinstance(func, ast.Attribute) and func.attr[0:1].isupper():
            return func.attr
        return None

    def _resolve_calls(self, file_var_types: dict[str, dict[str, str]]) -> list[Relationship]:
        """Resolve method calls using inferred variable types and class MRO.

        For each unresolved CALLS edge like `func -> obj.method`:
        1. Look up obj's type in file_var_types
        2. Look up method in the class's MRO method table
        3. Create a CALLS_RESOLVED edge to the actual method entity
        """
        resolved_rels = []
        seen = set()  # Avoid duplicates

        for rel in self.kg.relationships:
            if rel.type != RelationshipType.CALLS:
                continue

            # Only process unresolved targets (not already entity IDs)
            if rel.target_id in self.kg.entities:
                continue

            target = rel.target_id
            source_file = ""
            if rel.source_id in self.kg.entities:
                source_file = self.kg.entities[rel.source_id].file_path

            resolved_target = None

            # Case 1: obj.method() — method call on a typed variable
            if "." in target:
                parts = target.split(".", 1)
                obj_name = parts[0]
                method_name = parts[1]

                # Skip chained calls like a.b.c
                if "." in method_name:
                    continue

                # Look up obj's type
                var_types = file_var_types.get(source_file, {})
                class_id = var_types.get(obj_name)

                if class_id and class_id in self._class_mro_methods:
                    method_entity_id = self._class_mro_methods[class_id].get(method_name)
                    if method_entity_id:
                        resolved_target = method_entity_id

            # Case 2: simple_func() — unresolved function call
            else:
                # Try same-file lookup
                fq = f"{source_file}::{target}"
                if fq in self._symbol_table:
                    resolved_target = self._symbol_table[fq]
                else:
                    # Try via imports in the same file
                    for entity in self.kg.entities.values():
                        if (entity.type == EntityType.IMPORT and
                                entity.name == target and
                                entity.file_path == source_file):
                            imp_resolved = self.resolve_import(entity)
                            if imp_resolved:
                                resolved_target = imp_resolved
                            break

                    # Try global function lookup (unambiguous)
                    if not resolved_target:
                        candidates = self._func_by_name.get(target, [])
                        if len(candidates) == 1:
                            resolved_target = candidates[0]

            if resolved_target and resolved_target in self.kg.entities:
                key = (rel.source_id, resolved_target)
                if key not in seen:
                    seen.add(key)
                    resolved_rels.append(Relationship(
                        source_id=rel.source_id,
                        target_id=resolved_target,
                        type=RelationshipType.CALLS_RESOLVED,
                        line_number=rel.line_number,
                        is_resolved=True,
                        properties={"original_target": target},
                    ))

        return resolved_rels

    def resolve_import(self, import_entity: Entity, _depth: int = 0) -> Optional[str]:
        """Resolve an IMPORT entity to its actual definition.

        Follows re-exports: if module/__init__.py imports the symbol from
        a submodule, we follow that chain (up to 3 levels deep).
        """
        if _depth > 3:
            return None  # Prevent infinite loops

        module = import_entity.properties.get("module", "")
        name = import_entity.name
        original_name = import_entity.properties.get("original_name", name)

        # Try resolving the module, using the importing file's directory
        # as context for relative imports
        resolved_path = self._find_module_file(module, context_file=import_entity.file_path)
        if not resolved_path:
            return None

        # Direct lookup: symbol defined in the target module
        for lookup_name in (name, original_name):
            fq_name = f"{resolved_path}::{lookup_name}"
            if fq_name in self._symbol_table:
                return self._symbol_table[fq_name]

        # Re-export check: the target module's __init__.py may import
        # the symbol from a submodule (e.g., `from .rest import RESTClient`)
        for entity in self.kg.entities.values():
            if (entity.type == EntityType.IMPORT and
                    entity.file_path == resolved_path and
                    entity.name in (name, original_name)):
                # Recursively resolve this re-export
                result = self.resolve_import(entity, _depth + 1)
                if result:
                    return result

        return None

    def resolve_call(self, call_target: str, source_file: str) -> Optional[str]:
        """Resolve a function/method call to its definition."""
        parts = call_target.split('.')

        if len(parts) == 1:
            local_key = f"{source_file}::{parts[0]}"
            if local_key in self._symbol_table:
                return self._symbol_table[local_key]
        elif len(parts) == 2:
            module_path = self._find_module_file(parts[0])
            if module_path:
                fq_name = f"{module_path}::{parts[1]}"
                if fq_name in self._symbol_table:
                    return self._symbol_table[fq_name]

        return None

    def _find_module_file(self, module_name: str, context_file: str = "") -> Optional[str]:
        """Find the file path for a given module name.

        For relative-looking module names (short names like 'rest' that could
        be relative imports), first tries resolving relative to the context
        file's directory before falling back to global search.
        """
        if not module_name:
            return None

        rel_path = module_name.replace(".", "/")
        candidates = [f"{rel_path}.py", f"{rel_path}/__init__.py"]

        # Build set of all file paths for fast lookup
        all_file_paths: dict[str, str] = {}
        for entity in self.kg.entities.values():
            if entity.type in (EntityType.FILE, EntityType.MODULE):
                all_file_paths[entity.file_path] = entity.file_path

        # Try relative to context file's directory first
        if context_file:
            import posixpath
            context_dir = posixpath.dirname(context_file)
            if context_dir:
                for candidate in candidates:
                    relative_path = posixpath.join(context_dir, candidate)
                    # Normalize (handle ../)
                    relative_path = posixpath.normpath(relative_path)
                    if relative_path in all_file_paths:
                        return relative_path

        # Global search with path-boundary matching
        best = None
        for fp in all_file_paths:
            for candidate in candidates:
                if fp == candidate:
                    return fp
                if fp.endswith("/" + candidate):
                    if best is None or len(fp) < len(best):
                        best = fp

        return best

    def create_resolved_relationships(self) -> list[Relationship]:
        """Create all resolved relationships: imports, inheritance, and calls.

        This is the main entry point. Call after build_symbol_table().
        """
        if not self._symbol_table:
            self.build_symbol_table()

        resolved = []

        # Phase 1: Resolve imports
        unresolved_imports = []
        for entity in self.kg.entities.values():
            if entity.type == EntityType.IMPORT:
                target_id = self.resolve_import(entity)
                if target_id and target_id in self.kg.entities:
                    resolved.append(Relationship(
                        source_id=entity.id,
                        target_id=target_id,
                        type=RelationshipType.IMPORTS_RESOLVED_TO,
                        line_number=entity.line_number,
                        is_resolved=True,
                    ))
                else:
                    unresolved_imports.append(entity)

        # Create EXTERNAL_REF entities for unresolved imports
        for import_entity in unresolved_imports:
            module = import_entity.properties.get("module", "")
            original_name = import_entity.properties.get("original_name", import_entity.name)

            if module and not any(
                prefix in module for prefix in ['kg_builder', 'tests']
            ):
                ext_id = f"external::{module}::{original_name}"
                if ext_id not in self.kg.entities:
                    ext_entity = Entity(
                        id=ext_id,
                        name=original_name,
                        type=EntityType.EXTERNAL_REF,
                        file_path=f"external/{module}/{original_name}.py",
                        line_number=0,
                        properties={
                            "description": f"External reference: {module}.{original_name}",
                            "module": module,
                        },
                    )
                    self.kg.add_entity(ext_entity)

                resolved.append(Relationship(
                    source_id=import_entity.id,
                    target_id=ext_id,
                    type=RelationshipType.IMPORTS_RESOLVED_TO,
                    line_number=import_entity.line_number,
                    is_resolved=False,
                ))

        # Phase 2: Resolve inheritance targets
        inheritance_rels = self._resolve_inheritance()
        resolved.extend(inheritance_rels)

        # Phase 3: Build MRO method tables (needs resolved inheritance)
        self._build_mro_methods()

        # Phase 4: Infer variable types and resolve method calls
        file_var_types = self._infer_variable_types()
        call_rels = self._resolve_calls(file_var_types)
        resolved.extend(call_rels)

        return resolved
