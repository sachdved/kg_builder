# Knowledge Graph Builder

A tool to extract knowledge graphs from Python codebases. It parses Python files using the AST module and generates a structured JSON representation of entities (classes, functions, variables, etc.) and their relationships.

## Features

- **Entity Extraction**: Identifies classes, functions, constants, variables, imports, decorators, and more
- **Relationship Detection**: Captures CONTAINS, CALLS, INHERITS, IMPORTS, USES, and other relationships
- **Structured Output**: Outputs knowledge graphs in JSON format
- **CLI & Library**: Use as a command-line tool or import as a library

## Installation

```bash
pip install -e .
```

## Usage

### Command-Line Interface

```bash
# Parse a single file
kg_builder /path/to/file.py --output output.json

# Parse an entire repository
kg_builder /path/to/repo --output kg.json

# Exclude certain patterns
kg_builder /path/to/repo --exclude "**/tests/*" --exclude "**/venv/*"

# Verbose mode with progress
kg_builder /path/to/repo --verbose
```

### As a Library

```python
from kg_builder import build_knowledge_graph, KnowledgeGraph

# Build knowledge graph from a path
kg: KnowledgeGraph = build_knowledge_graph("/path/to/code")

# Output as JSON
print(kg.to_json())

# Access entities and relationships
for entity in kg.entities.values():
    print(f"{entity.type}: {entity.name}")

for rel in kg.relationships:
    print(f"{rel.source_id} --{rel.type}--> {rel.target_id}")
```

## Entity Types

| Type | Description |
|------|-------------|
| FILE | Top-level file container |
| MODULE | Python module |
| CLASS | Class definition |
| FUNCTION | Function/method definition |
| CONSTANT | UPPERCASE assignments |
| VARIABLE | Local/function-scoped variables |
| IMPORT | Import statements |
| DIRECTORY | Folder organization |
| DECORATOR | Decorator definitions |

## Relationship Types

| Type | Description |
|------|-------------|
| CONTAINS | Parent contains child entity |
| DEFINES_IN | Scope defines a variable |
| CALLS | Function invocation |
| IMPORTS | Import statement |
| INHERITS | Class inheritance |
| INSTANTIATES | Object creation |
| USES | Reference usage |
| LOCATED_IN | File system hierarchy |

## Output Format

The knowledge graph is output as JSON:

```json
{
  "entities": {
    "repo/file.py::MyClass": {
      "id": "repo/file.py::MyClass",
      "name": "MyClass",
      "type": "CLASS",
      "file_path": "repo/file.py",
      "line_number": 10,
      "properties": {
        "docstring": "A sample class"
      }
    }
  },
  "relationships": [
    {
      "source_id": "repo/file.py",
      "target_id": "repo/file.py::MyClass",
      "type": "CONTAINS",
      "line_number": 10
    }
  ]
}
```

## Development

### Running Tests

```bash
pytest tests/
```

### Building the Package

```bash
python -m build
```
