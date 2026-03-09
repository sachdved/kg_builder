/**
 * Undo/Redo stack management for graph modifications
 */

// Maximum history size to prevent memory issues
const MAX_HISTORY_SIZE = 50;

/**
 * Create a deep copy of the KG data structure
 */
export const cloneKGData = (kgData) => {
  if (!kgData) return null;
  return JSON.parse(JSON.stringify(kgData));
};

/**
 * Initialize undo/redo state
 */
export const createUndoRedoState = () => ({
  history: [],     // Stack of previous states
  future: [],      // Stack for redo
  current: null    // Current state reference (not stored in history)
});

/**
 * Save current state to history
 */
export const saveToHistory = (state, newKgData) => {
  const history = [...state.history];
  const future = []; // Clear redo stack on new action

  // Deep clone the previous kgData before modification
  const previousState = state.current ? cloneKGData(state.current) : null;

  if (previousState) {
    history.push(previousState);
    // Limit history size
    if (history.length > MAX_HISTORY_SIZE) {
      history.shift();
    }
  }

  return {
    history,
    future,
    current: newKgData
  };
};

/**
 * Undo the last action
 */
export const undo = (state) => {
  if (state.history.length === 0) {
    return { ...state, error: 'Nothing to undo' };
  }

  const history = [...state.history];
  const previousState = history.pop();
  const future = [state.current ? cloneKGData(state.current) : null, ...state.future];

  return {
    history,
    future,
    current: previousState,
    error: null
  };
};

/**
 * Redo the last undone action
 */
export const redo = (state) => {
  if (state.future.length === 0) {
    return { ...state, error: 'Nothing to redo' };
  }

  const future = [...state.future];
  const nextState = future.shift();
  const history = [...state.history, state.current ? cloneKGData(state.current) : null];

  return {
    history,
    future,
    current: nextState,
    error: null
  };
};

/**
 * Check if undo is available
 */
export const canUndo = (state) => state.history.length > 0;

/**
 * Check if redo is available
 */
export const canRedo = (state) => state.future.length > 0;
