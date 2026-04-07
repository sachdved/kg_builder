# KG Builder - Python Knowledge Graph Visualizer

Build and visualize knowledge graphs from Python codebases directly in VS Code. Understand dependencies, refactor safely, and explore code structure with interactive graph visualization.

## Features

- **Knowledge Graph Building**: Parse Python files using AST to extract classes, functions, variables, imports, and their relationships
- **Interactive Graph View**: Visualize the codebase as an interactive knowledge graph (placeholder - full Cytoscape.js integration coming)
- **Entity Tree Browser**: Navigate entities organized by file/directory in the sidebar
- **Search & Navigation**: Find classes, functions, and variables with fuzzy search
- **Impact Analysis**: Understand the impact of changing a function or class before refactoring
- **Function Context**: View what a function calls and what calls it
- **Export KG JSON**: Export the knowledge graph for external analysis

## Requirements

- Python 3.8+ installed
- `kg_builder` package available in your PATH
- VS Code 1.90.0 or later

## Installation

### Development Installation

```bash
# Clone and install dependencies
cd kg-builder-vscode
npm install

# Build the extension
npm run build
```

### Using the Extension

1. Open VS Code in a Python project directory
2. The extension will automatically try to build the knowledge graph on activation
3. Use the "KG Builder" sidebar to browse entities
4. Click on entities to navigate to their definitions

## Commands

| Command | Description |
|---------|-------------|
| `kgBuilder.buildWorkspace` | Build knowledge graph for entire workspace |
| `kgBuilder.buildCurrentFile` | Build KG for currently open file |
| `kgBuilder.searchEntities` | Search for classes, functions, variables |
| `kgBuilder.analyzeImpact` | Analyze impact of changing current entity |
| `kgBuilder.extractContext` | Extract function context (calls/called-by) |
| `kgBuilder.openGraphView` | Open the graph visualization panel |
| `kgBuilder.exportKgJson` | Export KG to JSON file |
| `kgBuilder.invalidateCache` | Clear cached KG data |

## Context Menu Actions

Right-click in a Python file:
- **KG Builder: Analyze Impact** - See what depends on the current entity
- **KG Builder: Extract Function Context** - View function's call relationships

## Configuration

```json
{
  "kgBuilder.autoBuildOnSave": false,
  "kgBuilder.excludePatterns": ["**/venv/**", "**/.venv/**", "**/node_modules/**"],
  "kgBuilder.maxEntityCount": 5000
}
```

## Usage Examples

### Building the Knowledge Graph

1. Open a Python workspace in VS Code
2. Right-click on the "KG Builder" icon in the activity bar
3. Click "Build Workspace Knowledge Graph" or press Ctrl+Shift+P and select the command

### Searching for Entities

1. Press Ctrl+P and type `>kgBuilder.searchEntities`
2. Type the name of a class, function, or variable
3. Select from the results to navigate to its definition

### Analyzing Impact Before Refactoring

1. Place cursor on a function or class name
2. Right-click and select "KG Builder: Analyze Impact"
3. Review the risk assessment and affected files

## Known Limitations

- Graph visualization is currently a placeholder (full Cytoscape.js integration in development)
- Single-file KG building stores data temporarily in memory
- Auto-rebuild on save needs debouncing implementation

## Development

```bash
# Watch for changes while developing
npm run watch

# Build for production
npm run build

# Package as VSIX file
npx vsce package

# Publish to marketplace (requires vsce login)
npx vsce publish
```

## License

MIT

## Related Projects

- [kg-builder](https://github.com/your-org/kg-builder) - The core Python knowledge graph extractor
