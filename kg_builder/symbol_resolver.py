"""Symbol resolution across files in a codebase."""

from kg_builder.models import Entity, EntityType, Relationship, RelationshipType


class SymbolResolver:
    """Resolve symbol references to their definitions across files."""

    def __init__(self, kg) -> None:
        """Initialize the symbol resolver with a knowledge graph.

        Args:
            kg: The knowledge graph containing entities to resolve.
        """
        self.kg = kg
        self._symbol_table: dict[str, str] = {}  # "file.py::SymbolName" -> entity_id
        self._import_cache: dict[str, str] = {}  # module_name -> file_path

    def build_symbol_table(self) -> None:
        """Build a symbol table from all entities."""
        for entity in self.kg.entities.values():
            if entity.type in (EntityType.CLASS, EntityType.FUNCTION, EntityType.CONSTANT):
                # Create fully qualified name
                fq_name = f"{entity.file_path}::{entity.name}"
                self._symbol_table[fq_name] = entity.id

    def resolve_import(self, import_entity: Entity) -> str | None:
        """Resolve an IMPORT entity to its actual definition.

        Args:
            import_entity: The import statement entity.

        Returns:
            Resolved entity_id if found, None otherwise.
        """
        module = import_entity.properties.get("module", "")
        name = import_entity.name

        # Try to find the module in our file list
        resolved_path = self._find_module_file(module)
        if not resolved_path:
            return None

        # Look for the symbol in that module
        fq_name = f"{resolved_path}::{name}"
        if fq_name in self._symbol_table:
            return self._symbol_table[fq_name]

        # Try with just the original name (for aliased imports)
        original_name = import_entity.properties.get("original_name", name)
        fq_name = f"{resolved_path}::{original_name}"
        if fq_name in self._symbol_table:
            return self._symbol_table[fq_name]

        return None

    def resolve_call(self, call_target: str, source_file: str) -> str | None:
        """Resolve a function/method call to its definition.

        Handles:
        - Simple calls: func() -> look in local scope, then imports
        - Method calls: obj.method() -> find obj's class, then method
        - Qualified calls: module.func() -> look in module

        Args:
            call_target: The name being called (e.g., "helper", "obj.method").
            source_file: The file where the call originates.

        Returns:
            Resolved entity_id or None.
        """
        # Split qualified names
        parts = call_target.split('.')

        if len(parts) == 1:
            # Simple call: look in local scope first
            local_key = f"{source_file}::{parts[0]}"
            if local_key in self._symbol_table:
                return self._symbol_table[local_key]
        elif len(parts) == 2:
            # Could be module.func or obj.method
            # Try as module.func
            module_path = self._find_module_file(parts[0])
            if module_path:
                fq_name = f"{module_path}::{parts[1]}"
                if fq_name in self._symbol_table:
                    return self._symbol_table[fq_name]

        return None

    def _find_module_file(self, module_name: str) -> str | None:
        """Find the file path for a given module name.

        Args:
            module_name: The module name (e.g., "pkg.submodule").

        Returns:
            File path if found, None otherwise.
        """
        if not module_name:
            return None

        # Convert "pkg.submodule" to possible file paths
        possible_paths = [
            f"{module_name.replace('.', '/')}.py",
            f"{module_name.replace('.', '/')}/__init__.py",
        ]

        # Search through FILE entities
        for entity in self.kg.entities.values():
            if entity.type == EntityType.FILE:
                for path in possible_paths:
                    if path in entity.file_path or entity.file_path.endswith(path):
                        return entity.file_path

        return None

    def create_resolved_relationships(self) -> list[Relationship]:
        """Create resolved relationships for all imports.

        Resolves IMPORT entities to their actual definitions and creates
        IMPORTS_RESOLVED_TO relationships. For unresolved imports, creates
        EXTERNAL_REF entities.

        Returns:
            List of newly created relationships.
        """
        # First build the symbol table if not already built
        if not self._symbol_table:
            self.build_symbol_table()

        resolved = []
        unresolved_imports = []  # Track imports we couldn't resolve

        # Resolve imports
        for entity in self.kg.entities.values():
            if entity.type == EntityType.IMPORT:
                target_id = self.resolve_import(entity)
                if target_id and target_id in self.kg.entities:
                    # Create resolved relationship
                    resolved.append(Relationship(
                        source_id=entity.id,
                        target_id=target_id,
                        type=RelationshipType.IMPORTS_RESOLVED_TO,
                        line_number=entity.line_number,
                        is_resolved=True,
                    ))
                else:
                    # Track unresolved for external ref creation
                    unresolved_imports.append(entity)

        # Create EXTERNAL_REF entities for unresolved imports
        for import_entity in unresolved_imports:
            module = import_entity.properties.get("module", "")
            original_name = import_entity.properties.get("original_name", import_entity.name)

            # Only create external refs for third-party/stdlib (not local modules)
            if module and not any(
                prefix in module for prefix in ['kg_builder', 'tests']
            ):
                ext_id = f"external::{module}::{original_name}"
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

                # Create relationship to external entity
                resolved.append(Relationship(
                    source_id=import_entity.id,
                    target_id=ext_id,
                    type=RelationshipType.IMPORTS_RESOLVED_TO,
                    line_number=import_entity.line_number,
                    is_resolved=False,  # Mark as not fully resolved
                ))

        return resolved
