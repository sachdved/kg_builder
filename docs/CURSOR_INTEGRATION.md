# Cursor Integration Guide for kg_builder

Get kg_builder working with Cursor in under 5 minutes. This guide covers setup, usage patterns, and troubleshooting.

---

## Prerequisites

- **Cursor**: Version 0.45+ (with MCP support)
- **Python**: 3.10 or higher
- **kg_builder**: Installed locally (`pip install -e ".[mcp]"`)

---

## Step-by-Step Setup

### 1. Install kg_builder

```bash
# Navigate to the kg_builder repository
cd /path/to/kg_builder

# Install in editable mode with MCP support
pip install -e ".[mcp]"
```

Verify installation:
```bash
python -c "import kg_builder; print('kg_builder installed:', kg_builder.__version__)"
```

### 2. Get Your Python Path

Find the full path to your Python interpreter:

```bash
which python
# Example output: /Users/yourname/.venv/kg_builder/bin/python
```

### 3. Create Cursor MCP Configuration

Create `~/.cursor/mcp.json` (create the `.cursor` directory if it doesn't exist):

```bash
mkdir -p ~/.cursor
cat > ~/.cursor/mcp.json << 'EOF'
{
  "mcpServers": {
    "kg-builder": {
      "type": "stdio",
      "command": "/your/python/path/from/step2",
      "args": ["-m", "kg_builder.mcp_server"]
    }
  }
}
EOF
```

**Replace `/your/python/path/from/step2` with your actual Python path from step 2.**

### 4. Restart Cursor

Completely quit Cursor and reopen it:
- **Mac**: `Cmd+Q`, then reopen
- **Linux/Windows**: Close all windows and restart

### 5. Verify the Connection

In a new Cursor chat, ask:

```
List the kg_builder tools available to me.
```

Expected response should include: `kg_find_entity`, `kg_get_neighbors`, `kg_get_callers`, etc.

---

## Project-Specific Configuration (Optional)

For projects that need custom settings, create `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "kg-builder": {
      "type": "stdio",
      "command": "python",
      "args": ["-m", "kg_builder.mcp_server", "/absolute/path/to/your/project"],
      "cwd": "."
    }
  }
}
```

This overrides the global config for this specific project.

---

## Usage Patterns

### Pattern 1: Finding Code Before Editing

**Instead of:** "Add error handling to the authenticate function"

**Ask:** 
```
Find the authenticate function and show me its context including what it calls.
Then add error handling.
```

Cursor will:
1. Call `kg_find_entity("authenticate", entity_type="FUNCTION")`
2. Call `kg_extract_context("path.py::authenticate", max_hops=1)`
3. Read the actual code from the extraction
4. Make precise edits with full context

### Pattern 2: Understanding Impact Before Refactoring

**Before refactoring a shared utility:**

```
Analyze the impact of changing the parse_file function before I modify it.
```

Cursor will call `kg_impact_analysis("parse_file", depth=2)` and show you:
- Which files depend on this function
- Risk level (LOW/MEDIUM/HIGH)
- Specific callers that might break

### Pattern 3: Navigating Unknown Codebases

**When starting on a new codebase:**

```
Show me the main entry points of this application and their dependencies.
```

Cursor will:
1. Call `kg_find_entity("main", fuzzy=true)` or search for entry patterns
2. Use `kg_get_neighbors()` to map out the call graph
3. Give you a structural overview without reading hundreds of files

### Pattern 4: Tracing Function Calls Across Files

**To understand how a feature flows through the code:**

```
Find UserService.create_user and trace all functions it calls, including cross-file imports.
```

Cursor will use `kg_get_neighbors()` with resolved relationships to show the complete call chain.

---

## Adding Cursor Rules (Recommended)

Create a `.cursorrules` file in your project root to guide Cursor's behavior:

```markdown
# kg_builder Knowledge Graph Project

This project uses kg_builder for codebase understanding. The MCP server provides these tools:

- `kg_find_entity(query, entity_type)` — Find classes/functions/variables
- `kg_get_neighbors(entity_id, direction)` — Get adjacent entities  
- `kg_get_callers(entity_id, max_depth)` — Find what calls this entity
- `kg_extract_context(entity_id, max_hops)` — Load code with neighbor context
- `kg_impact_analysis(name, depth)` — Assess change risk
- `kg_understand_function(name)` — Full function context
- `kg_rebuild()` — Refresh the graph after changes

## Workflow Guidelines

1. **Always query the KG first** before reading files or suggesting edits
2. Use `kg_find_entity` instead of searching/grep for code discovery
3. Call `kg_impact_analysis` before proposing any refactoring
4. Use `kg_extract_context` with max_hops=1 to get code + dependencies
5. Call `kg_rebuild()` if the agent notices file changes were made

## Example Query Pattern

Task: "Add validation to User.create()"

1. `kg_find_entity("User", entity_type="CLASS")` → find the class
2. `kg_get_neighbors("user.py::User", direction="outgoing")` → find methods including create()
3. `kg_extract_context("user.py::User::create", max_hops=1)` → get code + neighbors
4. Make the edit with full context

This approach is faster and more accurate than reading files blindly.
```

---

## Troubleshooting

### Tools Not Appearing

**Symptom**: Cursor doesn't use kg_builder tools even after setup.

**Fix**:
1. Check MCP status: Settings → Extensions → MCP Servers → kg-builder should show "Connected"
2. Verify Python path is correct: Test with `/path/to/python -c "import kg_builder"`
3. Restart Cursor completely (not just the window)
4. Try a new chat session (old sessions may cache tool lists)

### ModuleNotFoundError

**Symptom**: MCP server fails with `ModuleNotFoundError: No module named 'kg_builder'`

**Fix**: The Python path in your config doesn't have kg_builder installed.
```bash
# Check which Python is being used
/path/from/config -c "import sys; print(sys.executable)"

# Install kg_builder in that environment
/path/from/config -m pip install -e "/path/to/kg_builder"
```

### Empty or Incomplete Graph

**Symptom**: `kg_find_entity` returns no results.

**Fix**:
1. Ensure Cursor is serving the correct project directory
2. Check that Python files exist in the served directory
3. Call `kg_rebuild()` to refresh the cache
4. Verify no overly aggressive exclude patterns

### Slow Initial Load

**Symptom**: First tool call takes 10+ seconds.

**Explanation**: The KG is built on first access. This is normal for large codebases.

**Optimization**: Pre-warm the cache by running:
```bash
python -m kg_builder.mcp_server /path/to/project
# Let it build, then kill with Ctrl+C
```

---

## Performance Tips

1. **One-time build cost**: First query builds the KG (seconds to minutes depending on codebase size)
2. **Cached queries**: Subsequent queries use in-memory graph (milliseconds)
3. **Smart rebuilding**: Only call `kg_rebuild()` after significant changes
4. **Focused extraction**: Use `max_hops=1` for most tasks; increase only when needed

---

## Example Sessions

### Session 1: Adding a Feature to an Unknown Codebase

```
User: I need to add password expiration to the User model.

Cursor internally calls:
- kg_find_entity("User", entity_type="CLASS") 
- kg_extract_context("models/user.py::User", max_hops=2)
- kg_impact_analysis("User", depth=1)

Cursor responds with:
"The User class is in models/user.py with 47 lines. It's used by:
- services/auth.py::authenticate (calls User.verify_password)
- api/users.py::get_user (calls User.get_by_id)
Risk level: MEDIUM - 2 files depend on this class.

Here's the current implementation and proposed changes..."
```

### Session 2: Refactoring with Confidence

```
User: Can we consolidate validate_email and check_email_format into one function?

Cursor internally calls:
- kg_find_entity("validate_email")
- kg_find_entity("check_email_format")  
- kg_get_callers("utils.py::validate_email", max_depth=1)
- kg_get_callers("utils.py::check_email_format", max_depth=1)

Cursor responds with:
"Both functions are in utils.py. They're called by:
- validate_email: 3 callers (registration.py, update_profile.py, forms.py)
- check_email_format: 1 caller (validate_email.py - it calls itself!)

These can be safely merged. Here's the refactored code..."
```

---

## Advanced: Custom MCP Server Configuration

### Adding Logging

Modify `kg_builder/mcp_server.py` to add debug output:

```python
import logging
logging.basicConfig(level=logging.INFO)

def _ensure_kg():
    logging.info(f"Building KG for {_get_codebase_path()}")
    # ... rest of function
```

### Customizing Excluded Patterns

Edit the `_ensure_kg()` function to add custom patterns:

```python
def _ensure_kg():
    codebase = _get_codebase_path()
    # Add custom excludes
    exclude_patterns = [
        "**/venv/*",
        "**/node_modules/*", 
        "**/tests/*",  # Don't parse tests
        "**/migrations/*"  # Don't parse migrations
    ]
    kg = build_knowledge_graph(codebase, exclude_patterns=exclude_patterns)
    # ... rest of function
```

---

## Next Steps

- [MCP Setup Guide](MCP_SETUP.md) — Multi-platform configuration
- [Usage Guide](USAGE_GUIDE.md) — Detailed workflow examples  
- [README](../README.md) — Benchmark results and architecture
