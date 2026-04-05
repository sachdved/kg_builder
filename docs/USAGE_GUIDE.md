# KG-Guided Agentic Coding: Usage Guide

## What This Is

kg_builder lets you **see your codebase as a graph** and use that graph to **control what an AI coding agent edits**. Instead of telling an agent "add feature X" and hoping it touches the right files, you:

1. Parse your codebase into a knowledge graph
2. Propose changes on the graph (add nodes, edit edges, or load an agent's proposal)
3. The system diffs your proposal against the current graph
4. An edit plan tells the agent exactly which files and functions to touch — and why

The graph is the contract between you and the agent.

---

## Quick Start

### Install

```bash
pip install -e .
```

### 1. Build a knowledge graph from your codebase

```bash
kg_builder build /path/to/your/project --output existing.json
```

This parses all Python files and produces a JSON file containing every class, function, variable, import, and the relationships between them (calls, contains, inherits, imports, etc.).

### 2. Visualize and edit the graph

```bash
cd viz && npm install && npm run dev
```

Open `http://localhost:3000`. Upload `existing.json`. You'll see your codebase as an interactive graph.

### 3. Propose changes

**Option A — Human edits:**
- Press `Ctrl+N` to add a new entity (class, function, etc.)
- Press `Ctrl+E` to add a new relationship (calls, inherits, etc.)
- Click any node → edit its properties in the sidebar
- Right-click → Delete to remove nodes/edges

**Option B — Agent proposal:**
- Click the **Diff** button in the toolbar
- Click **Load Agent Proposal** and upload a second KG JSON (the agent's proposed state)
- The graph immediately shows what changed: green = added, yellow = modified, red dashed = removed
- You can further edit the agent's proposal before exporting

### 4. Export the change spec

With changes visible in the viz, click **Export Change Spec** in the Diff panel. This downloads a `change_spec_*.json` file describing exactly what changed.

Or from the CLI:

```bash
kg_builder diff existing.json proposed.json --output change_spec.json
```

### 5. Generate an edit plan

```bash
kg_builder plan change_spec.json --codebase /path/to/project --existing-kg existing.json
```

This outputs a markdown plan like:

```
## Edit Plan — 2 file(s), 3 change(s)

### 1. MODIFY: `auth.py`
**Action**: Add function `verify_email`; Modify `register_user` (add parameter)

- **ADDED** `auth.py::verify_email` (FUNCTION)
- **MODIFIED** `auth.py::register_user` (properties)

**Neighbor context loaded**:
- `auth.py::User` (CALLS target) — lines 12-45
- `auth.py::send_email` (CALLS target) — lines 80-95

### Warnings
- ⚠ `old_handler` is being removed but `routes.py::main` references it
```

### 6. Feed the plan to an agent

The markdown plan is designed to be consumed by an agentic coding tool. For example, with Claude Code:

```bash
kg_builder plan change_spec.json --codebase . --existing-kg existing.json | pbcopy
# Paste into Claude Code: "Execute this edit plan..."
```

The agent knows:
- Which files to create/modify/delete
- Which specific entities are changing and how
- What the neighboring code looks like (for context)
- What might break (warnings)

---

## CLI Reference

### `kg_builder build`

Build a knowledge graph from Python source files.

```
kg_builder build <path> [--output FILE] [--exclude PATTERN...] [--verbose]
```

| Flag | Description |
|------|-------------|
| `<path>` | Python file or directory to parse |
| `--output, -o` | Output JSON file (default: stdout) |
| `--exclude` | Glob patterns to skip (e.g., `"**/tests/*"` `"**/venv/*"`) |
| `--verbose, -v` | Print progress |

Backwards compatible: `kg_builder /path/to/repo` works without the `build` keyword.

### `kg_builder diff`

Compare two knowledge graphs and produce a change specification.

```
kg_builder diff <existing.json> <proposed.json> [--output FILE] [--summary-only]
```

| Flag | Description |
|------|-------------|
| `<existing.json>` | Base/current KG JSON |
| `<proposed.json>` | Proposed KG JSON (from viz export or agent) |
| `--output, -o` | Write change spec to file (default: stdout) |
| `--summary-only` | Print only the counts (entities added/removed/modified) |

### `kg_builder plan`

Generate an edit plan from a change spec.

```
kg_builder plan <change_spec.json> --codebase <path> [--existing-kg FILE] [--format markdown|json] [--output FILE]
```

| Flag | Description |
|------|-------------|
| `<change_spec.json>` | Change spec from `kg_builder diff` or viz export |
| `--codebase` | Path to the codebase root (required) |
| `--existing-kg` | Existing KG JSON for loading neighbor code context |
| `--format` | `markdown` (default, for humans/agents) or `json` (for programmatic use) |
| `--output, -o` | Write plan to file (default: stdout) |

---

## Python API

```python
from kg_builder import (
    build_knowledge_graph,
    diff_knowledge_graphs,
    generate_edit_plan,
    ChangeSpec,
)

# Build KG
kg = build_knowledge_graph("/path/to/project")
existing = kg.to_dict()

# Load proposed (from viz export, agent, or manual construction)
import json
with open("proposed.json") as f:
    proposed = json.load(f)

# Diff
change_spec = diff_knowledge_graphs(existing, proposed)
print(change_spec.summary)
# {'entities_added': 2, 'entities_removed': 0, 'entities_modified': 1, ...}

# Plan
plan = generate_edit_plan(change_spec, "/path/to/project", existing)
print(plan.to_markdown())
```

---

## Workflow Patterns

### Pattern 1: Human-driven feature planning

You know what you want to build. You draw it on the graph.

```
Parse codebase → Open viz → Add nodes/edges for new feature
  → Export change spec → Generate plan → Hand to agent
```

Best for: small, surgical changes where you know exactly what entities are involved.

### Pattern 2: Agent-proposes, human-reviews

The agent figures out what to build. You review on the graph.

```
Parse codebase → Agent generates proposed KG → Load in viz
  → Review diff (green/yellow/red) → Edit if needed
  → Export change spec → Agent executes approved plan
```

Best for: larger features where you want the agent to do the architectural thinking but you want to review before any code is written.

### Pattern 3: Impact analysis before refactoring

Before changing something, see what will break.

```
Parse codebase → Open viz → Delete or modify the entity you want to change
  → Diff panel shows warnings about broken references
  → Export plan to see all affected files
```

Best for: refactoring, deprecation, understanding blast radius.

---

## Visualizer Features

| Feature | How |
|---------|-----|
| Upload KG | Click **Upload** or drag JSON file |
| Add entity | `Ctrl+N` |
| Add relationship | `Ctrl+E` |
| Delete | Right-click → Delete, or select + `Delete` key |
| Edit entity | Click node → edit in right sidebar |
| Undo/Redo | `Ctrl+Z` / `Ctrl+Y` |
| Toggle diff mode | Click **Diff** button |
| Load agent proposal | Diff panel → **Load Agent Proposal** |
| Export change spec | Diff panel → **Export Change Spec** |
| Export edited KG | Click **Save** (downloads full KG JSON) |
| Reset to base | Diff panel → **Reset to Base KG** |
| Search | Type in search bar |
| Filter by type | Checkboxes in left sidebar |
| Focus on node | Click any node (shows 1-5 hop neighbors) |
| Change layout | Dropdown: Force-Directed, Hierarchical, Circular, Grid |

### Diff colors

| Color | Meaning |
|-------|---------|
| Green border | Entity/edge added in proposal |
| Yellow border | Entity modified (type, properties, etc.) |
| Red dashed border | Entity/edge removed (ghost node, still visible) |

---

## What the Change Spec Contains

The change spec JSON captures everything needed to understand and execute the diff:

```json
{
  "version": "1.0",
  "timestamp": "2026-04-04T12:00:00Z",
  "summary": {
    "entities_added": 2,
    "entities_removed": 1,
    "entities_modified": 1,
    "relationships_added": 3,
    "relationships_removed": 1
  },
  "entity_changes": [
    {
      "action": "added",
      "entity_id": "auth.py::verify_email",
      "file_path": "auth.py",
      "entity_type": "FUNCTION",
      "after": { "...full entity dict..." },
      "neighbor_ids": ["auth.py::User", "auth.py::send_email"]
    }
  ],
  "relationship_changes": [
    {
      "action": "added",
      "source_id": "auth.py::register_user",
      "target_id": "auth.py::verify_email",
      "relationship_type": "CALLS"
    }
  ]
}
```

Each entity change includes `neighbor_ids` — the 1-hop neighbors that provide context for the agent.

---

## Measuring Effectiveness

We have no data yet on whether KG-guided coding is better than unguided agentic coding. The metrics below define what to measure. The numbers in the target column don't exist — they need to be established by running the experiment described at the end of this section.

### What to Measure

#### Metric 1: Edit Precision and Recall

Did the agent edit the right files — and only the right files?

```
Precision = (files correctly edited) / (total files edited by agent)
Recall    = (files correctly edited) / (files that actually needed editing)
```

**Why this matters:** An agent that edits 20 files when only 3 needed changing wastes time, risks introducing bugs in unrelated code, and is hard for a human to review. Precision captures this. An agent that misses files that needed editing produces incomplete features. Recall captures this.

**How to measure:** You need ground truth — a human-verified list of which files should be touched for each task. Then compare what the agent actually touched.

#### Metric 2: Test Pass Rate After Edits

Did the changes break anything?

```
Pass Rate = (tests passing after edits) / (tests passing before edits)
```

**Why this matters:** This is the most objective metric. If tests pass, the edit was at least mechanically correct. If they fail, something broke.

**How to measure:** Run the project's test suite before and after each approach. Requires a benchmark repo with decent test coverage.

#### Metric 3: Human Correction Count

How many times did the human need to intervene after the agent's first attempt?

```
Corrections = number of follow-up prompts needed to fix the agent's output
```

**Why this matters:** Every correction is wasted time. An agent that gets it right on the first try (or close to it) is dramatically more useful than one that needs 5 rounds of "no, not that file" or "you forgot to update the import."

**How to measure:** Count follow-up messages in the conversation after the initial implementation attempt. Both approaches get the same starting prompt.

#### Metric 4: Context Tokens Consumed

How much code did the agent need to read?

**Why this matters:** More context = more cost, more latency, and more risk of the agent getting confused by irrelevant code. If KG-guided loading reads 2 files instead of 15, that's a concrete advantage even if the final output is the same.

**How to measure:** Log file reads during the agent's execution. KG-guided: count tokens from changed nodes + 1-hop neighbors. Unguided: count tokens from whatever the agent chose to read on its own.

#### Metric 5: Wall-Clock Time

How long from task description to working code?

**Why this matters:** KG-guided adds upfront work (parse, propose, diff, plan). If that upfront time is never recovered through fewer corrections downstream, the approach isn't worth it.

**How to measure:** Time both phases separately:
- **Planning time:** parse + propose + diff + plan generation
- **Execution time:** agent coding + human corrections + verification
- **Total time:** sum of both

The hypothesis is that KG-guided has higher planning time but lower execution time. Whether total time is lower is an empirical question.

### The Experiment

#### Benchmark Repository

Build (or choose) a Python project with these properties:
- 15-25 files across 3-4 packages
- At least 50 functions/classes (enough graph structure to matter)
- Test suite with >70% coverage (so breakage is detectable)
- Realistic complexity: models, services, routes, utilities, some cross-file dependencies

A small Flask or FastAPI app with user auth, CRUD operations, and a service layer would work. Or use an existing open-source project of that size.

#### Task Set

Define 10 tasks. For each task, a human expert writes:
- The natural language prompt (same for both conditions)
- The ground-truth file set (which files should be edited)
- The expected test outcome (which tests should pass after)

Task types:
- **3 "add feature"** — new function/class that integrates with existing code
- **3 "modify existing"** — change behavior of an existing function, update callers
- **2 "refactor"** — rename, extract method, move function between files
- **2 "cross-cutting"** — changes spanning 4+ files (e.g., add a new field that propagates through model → service → route → tests)

#### Conditions

Each task is run under two conditions:

**Condition A — Baseline (unguided Claude Code):**
1. Give Claude Code the task prompt
2. Let it work autonomously (read files, edit code, run tests)
3. Record: files touched, tokens read, corrections needed, time, test results

**Condition B — KG-guided:**
1. `kg_builder build` on the repo
2. Generate the edit plan for the task's change spec
3. Give Claude Code the task prompt + the edit plan markdown
4. Let it work, but with the plan constraining its scope
5. Record the same metrics

#### Controls

- Same model, same temperature, same system prompt (except the plan addition in Condition B)
- Run each task 3 times per condition (agents are non-deterministic) and report median
- Randomize task order between conditions
- Human expert reviews all outputs blind (doesn't know which condition produced it)

#### Analysis

For each metric, report:
- Median and interquartile range across tasks and runs
- Per-task-type breakdown (the hypothesis is that KG-guided helps more on cross-cutting tasks than single-file tasks)
- Statistical significance if sample size allows (paired Wilcoxon signed-rank test, since n=10 tasks is small)

#### What Would Prove the Approach Works

There are no predetermined targets. The experiment establishes baselines for both conditions. The approach is validated if:

1. **Edit precision is measurably higher** — the agent touches fewer irrelevant files
2. **Test pass rate is equal or higher** — the plan doesn't cause the agent to miss things
3. **Human corrections are fewer** — the plan reduces back-and-forth
4. **Total wall-clock time is competitive** — planning overhead doesn't exceed correction savings

If precision is higher but total time is worse, the approach might still be valuable for high-stakes codebases where correctness matters more than speed. If none of the metrics improve, the approach isn't useful and the graph is just overhead.

#### What Would Disprove It

- KG-guided has **lower recall** (the plan missed files that needed editing) — means the graph doesn't capture real dependencies
- KG-guided has **more corrections** — means the plan constrains the agent too much or gives it wrong context
- KG-guided has **significantly higher total time** with no quality improvement — means the planning overhead isn't justified

These failure modes are informative. Low recall means the symbol resolver needs work. More corrections means the 1-hop neighbor heuristic is wrong. High time means the workflow has too much friction.

#### Running the Experiment

This experiment doesn't exist yet. It needs:
1. A benchmark repo (build or select one)
2. Ground-truth annotations for 10 tasks (human expert work)
3. An instrumented harness that logs file reads, edits, and timing
4. ~60 agent runs (10 tasks x 2 conditions x 3 repetitions)
5. A human reviewer for output quality

Estimated effort: 2-3 days to set up, 1-2 days to run, 1 day to analyze. The benchmark repo and task annotations are the bottleneck — the agent runs themselves are fast.
