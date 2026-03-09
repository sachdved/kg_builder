  ## Before Making Changes

  1. **Understand the target**:
     ```python
     from kg_builder import understand_function
     info = understand_function("function_name")
     print(info)  # Shows file location, callers, context

  2. Check impact:
  from kg_builder import analyze_impact
  impact = analyze_impact("ClassName", depth=2)
  if impact["risk_level"] == "HIGH":
      print("Warning! Need thorough testing.")
  3. List files to read based on the above output, then proceed with changes.

  ---

  ## For Complex Tasks: Create a Planning Step

  For larger refactors or new features, I'd recommend this pattern:

  ```python
  # planning_helper.py
  from kg_builder import understand_function, analyze_impact, find_all_by_pattern

  def create_change_plan(task_description: str, target_entity: str) -> dict:
      """Generate a plan for making code changes."""

      # Understand the target
      target_info = understand_function(target_entity)

      # Find related entities (if refactoring pattern)
      if "extract" in task_description.lower():
          related = find_all_by_pattern(target_entity, "FUNCTION")
      else:
          related = []

      # Assess impact
      impact = analyze_impact(target_entity, depth=2)

      return {
          "target": target_info["function"] if target_info["success"] else None,
          "files_to_read": list(set([
              target_info["function"]["file_path"],
              *(info["function"]["file_path"] for info in related),
          ])),
          "callers_to_check": target_info.get("called_by", []),
          "risk_level": impact["risk_level"],
          "warnings": impact["reasons"] if impact["success"] else [],
      }

  Then agents use this plan to know exactly which files to read before editing.

  ---
  Key Principle

  Query KG → Plan specific files → Read those files → Make changes
