# Knowledge Graph Builder Implementation Plan

## Context

Building a general-purpose tool to extract knowledge graphs from codebases. The tool will:
- Parse Python files and identify entities (functions, classes, constants, variables, imports)
- Capture relationships between entities (contains, calls, inherits, imports, defines_in)
- Output structured JSON representation of the knowledge graph
- Be usable both as a CLI tool and importable library

## Architecture Overview

### Core Components

```
kg_builder/
├── __init__.py          # Public API exports
├── cli.py               # Command-line interface (argparse)
├── models.py            # Data classes for Entity, Relationship, KnowledgeGraph
├── parser.py            # Python AST parsing and entity extraction
├── relationship_finder.py  # Relationship detection logic
└── utils.py             # File traversal, filtering helpers
```

### Entity Types to Extract

1. **File** - Top-level container with file metadata
2. **Module** - The Python module itself
3. **Class** - Class definitions with methods and attributes
4. **Function** - Function/method definitions (including async)
5. **Constant** - UPPERCASE assignments, class-level constants
6. **Variable** - Local/function-scoped variables
7. **Import** - Import statements (module, from...import)
8. **Directory** - Folder/container organization
9. **Decorator** - Decorator definitions (@property, @staticmethod, custom decorators)
10. **Exception** - Exception handling (try/except blocks)

### Entity Properties (MVP)

Every entity has a `description` property for documentation:

- `description` - Extracted docstring or generated description (always present)
- Type annotations stored as `properties["annotations"]` dict
- Docstrings also available as `properties["docstring"]` raw text
- Arguments as `properties["args"]` for functions
- Decorator names as `properties["decorators"]` list

### Relationship Types to Capture

| Relationship | Source | Target | Description |
|--------------|--------|--------|-------------|
| `CONTAINS` | File/Class/Function | Any entity | Parent contains child |
| `DEFINES_IN` | Class/Function | Variable | Scopes define variables |
| `CALLS` | Function | Function | Function invocation |
| `IMPORTS` | Module/File | Module string | Import statement (unresolved) |
| `INHERITS` | Class | Class | Base class inheritance |
| `INSTANTIATES` | Function | Class | Object creation |
| `DECORATES` | Decorator/Function | Function/Class | Decorator applied to target |
| `HANDLES` | Function | Exception type | Exception caught in try/except |
| `LOCATED_IN` | File | Directory | File system hierarchy |

## Implementation Details

### 1. Models (`models.py`)

```python
@dataclass
class Entity:
    id: str               # Unique identifier (e.g., "repo/file.py::MyClass")
    name: str             # Name of the entity
    type: EntityType      # Enum: FILE, CLASS, FUNCTION, etc.
    file_path: str        # Source file location
    line_number: int      # Definition line number
    properties: dict      # Additional metadata (docstring, args, etc.)

@dataclass
class Relationship:
    source_id: str
    target_id: str
    type: RelationshipType  # Enum: CONTAINS, CALLS, INHERITS, etc.
    line_number: int        # Where relationship appears

class KnowledgeGraph:
    entities: Dict[str, Entity]
    relationships: List[Relationship]

    def to_dict(self) -> dict
    def to_json(self) -> str
```

### 2. Parser (`parser.py`)

Use Python's built-in `ast` module to walk the abstract syntax tree:

- `ast.ClassDef` - Extract class name, bases, body
- `ast.FunctionDef`/`ast.AsyncFunctionDef` - Function names, arguments
- `ast.Assign`/`ast.AnnAssign` - Variable assignments
- `ast.Import`/`ast.ImportFrom` - Import statements
- `ast.Call` - Function calls (for CALLS relationships)

Key methods:
```python
def parse_file(file_path: str) -> tuple[list[Entity], list[Relationship]]
def walk_ast(tree: ast.AST, file_path: str) -> ...
def extract_class_node(node: ast.ClassDef, file_path: str) -> Entity
def extract_function_node(node: ast.FunctionDef, file_path: str) -> Entity
```

### 3. Relationship Finder (`relationship_finder.py`)

Detect relationships from AST traversal:

```python
def find_contains(file_path: str, entities: list[Entity]) -> list[Relationship]
def find_calls(function_entity: Entity, tree: ast.AST) -> list[Relationship]
def find_inherits(class_entity: Entity, bases: list[ast.expr]) -> list[Relationship]
def find_imports(module_path: str, imports: list[ast.Import | ast.ImportFrom]) -> list[Relationship]
```

### 4. CLI (`cli.py`)

Simple argparse interface:

```bash
kg_builder /path/to/repo [--output file.json] [--exclude patterns]
```

Options:
- `--target`: Path to repository or single file
- `--output`: Output JSON file path (default: stdout)
- `--exclude`: Glob patterns for files to skip
- `--verbose`: Show progress during parsing

### 5. Utils (`utils.py`)

```python
def get_python_files(root_path: str, exclude_patterns: list[str]) -> Iterator[Path]
def generate_entity_id(file_path: str, *scopes: str) -> str
    # Returns: "repo/file.py::OuterClass::InnerClass::method_name"
```

## File Structure

```
kg_builder/
├── kg_builder/
│   ├── __init__.py       # from .models import ... / def build_kg(...)
│   ├── cli.py
│   ├── models.py
│   ├── parser.py
│   ├── relationship_finder.py
│   └── utils.py
├── pyproject.toml        # Project config, dependencies, entry points
├── README.md
└── tests/
    └── test_parser.py    # Basic unit tests
```

## Verification Plan

1. **Basic parsing test**: Parse a simple Python file with one class and method
2. **Relationship test**: Verify CONTAINS relationship between class and method
3. **Call detection test**: Parse file with function calls, verify CALLS edges
4. **Inheritance test**: Parse class inheritance, verify INHERITS relationships
5. **Integration test**: Run on real codebase, validate JSON output structure

## Dependencies

- Python 3.10+ (f-string, dataclass features)
- No external dependencies for core functionality (use built-in `ast`, `pathlib`, `json`)
- Optional: `tqdm` for progress bars in verbose mode
