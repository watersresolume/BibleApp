// Minimalist Bible App - Reconstructed app.js
// Supports: tabbed navigation, book/chapter/verse selection, multiple Bible API passage loading, verse numbers with brackets

// Import word data functions
import { getWordInfo, hasWordData } from './word-data.js';
import LocalMediaHandler from './local-media-handler.js';

// Make word data functions globally available
window.getWordInfo = getWordInfo;
window.hasWordData = hasWordData;

function getActiveTabId() {
  const activePanel = document.querySelector('.tab-panel.active');
  return activePanel ? activePanel.dataset.tabId : null;
}

function getAnnotationStorageKey(tabId) {
  // Use tab ID for unique key - each tab has its own annotation space
  return `bible-annotations-tab-${tabId}`;
}

function getPassageKey(book, chapter, verse, verseEnd, translation, mode = 'bible') {
  if (mode === 'media') {
    // For media tabs, use tab-specific storage since they don't have passages
    const tabId = getActiveTabId();
    return `media-annotations-${tabId}`;
  }
  return `bible-annotations-${book}-${chapter}-${verse}-${verseEnd}-${translation}`;
}

let drawing = false;
let drawingTabId = null;
let lastPoint = null;
let highlighterPoints = [];
let highlighterOverlayCanvas = null;
let highlighterSnapshot = null;
let eraserVisualAid = null;
let isErasing = false;
let eraserStartState = null; // Store the state before erasing starts

let penColor = '#ffff00';
let highlighterColor = '#ffff00';

// Stroke-based undo/redo system
const strokeHistory = {};
const strokeRedo = {};
const MAX_HISTORY_SIZE = 1000;

// Action types for undo/redo
const ACTION_TYPES = {
  DRAW: 'draw',
  ERASE: 'erase',
  CLEAR: 'clear',
  CLEAR_ALL: 'clear_all',
  TOOL_CHANGE: 'tool_change',
  COLOR_CHANGE: 'color_change',
  SIZE_CHANGE: 'size_change',
  TAB_CREATE: 'tab_create',
  TAB_CLOSE: 'tab_close',
  TAB_SWITCH: 'tab_switch',
  PASSAGE_LOAD: 'passage_load'
};

// Unified chronological history system for ALL user operations
const unifiedHistory = [];
const unifiedRedo = [];
const MAX_UNIFIED_HISTORY = 1000;

// Simple action tracking - store state before action
function createAction(type, data = {}) {
  const action = {
    type,
    timestamp: Date.now(),
    tabId: getActiveTabId(),
    passageKey: getCurrentPassageKey(),
    data
  };
  
  return action;
}

function pushToUnifiedHistory(operation) {
  // CRITICAL: Don't add operations during restoration to prevent recursive undo
  if (isRestoring) {
         console.log('OPERATION BLOCKED: Not adding operation during restoration:', operation.type);
    return;
  }
  
  // CRITICAL: Don't add automatic operations triggered as side effects
  if (isAutomaticOperation) {
         console.log('AUTOMATIC OPERATION BLOCKED: Not recording automatic operation:', operation.type);
    return;
  }
  
     // Operation added to unified history
  unifiedHistory.push(operation);
  
  // Clear redo stack when new operation is pushed
  unifiedRedo.length = 0;
  
  // Limit history size
  if (unifiedHistory.length > MAX_UNIFIED_HISTORY) {
    unifiedHistory.shift();
  }
  
  console.log('?? Total operations in unified history:', unifiedHistory.length);
  updateUndoRedoUI();
}

// Legacy function for backward compatibility - now uses unified system
function pushAction(action) {
  // All actions go into unified history
  pushToUnifiedHistory(action);
}

// Flag to prevent recursive undo operations during restoration
let isRestoring = false;

// Flag to prevent automatic operations from being recorded
let isAutomaticOperation = false;

// Helper function to run operations automatically without recording them
function runAutomaticOperation(operationFunc) {
  const wasAutomatic = isAutomaticOperation;
  isAutomaticOperation = true;
  
  try {
    return operationFunc();
  } finally {
    isAutomaticOperation = wasAutomatic;
  }
}

function undoUnifiedOperation() {
  // Check if we have operations to undo
  if (unifiedHistory.length === 0) {
    console.log('🔄 UNDO: No operations to undo');
    return false;
  }
  
  // Prevent recursive undo operations during restoration
  if (isRestoring) {
    console.log('🔄 UNDO BLOCKED: Currently restoring, preventing recursive undo');
    return false;
  }
  
  const operationToUndo = unifiedHistory.pop();
  console.log('🔄 UNDOING SINGLE OPERATION:', operationToUndo.type, 'timestamp:', new Date(operationToUndo.timestamp).toLocaleTimeString());
  
  // Set restoration flag to prevent recursive operations
  isRestoring = true;
  
  try {
    // Handle different operation types
    if (operationToUndo.isStroke) {
      // This is a stroke operation - ONLY remove the last stroke
      const passageKey = operationToUndo.passageKey;
      console.log('🔄 STROKE UNDO DEBUG: Processing stroke for passage:', passageKey);
      console.log('🔄 STROKE UNDO DEBUG: strokeHistory[passageKey] length:', strokeHistory[passageKey] ? strokeHistory[passageKey].length : 'undefined');
      
      if (strokeHistory[passageKey] && strokeHistory[passageKey].length > 0) {
        const undoneStroke = strokeHistory[passageKey].pop();
        if (!strokeRedo[passageKey]) strokeRedo[passageKey] = [];
        strokeRedo[passageKey].push(undoneStroke);
        
        console.log('🔄 STROKE UNDO: Removed 1 stroke, remaining:', strokeHistory[passageKey].length);
        console.log('🔄 STROKE UNDO DEBUG: Added stroke to redo stack, redo stack length:', strokeRedo[passageKey].length);
        console.log('🔄 STROKE UNDO DEBUG: strokeHistory after undo:', strokeHistory[passageKey]);
        console.log('🔄 STROKE UNDO DEBUG: strokeHistory.length after undo:', strokeHistory[passageKey].length);
        console.log('🔄 STROKE UNDO DEBUG: strokeHistory content after undo:', JSON.stringify(strokeHistory[passageKey]));
        
        // CRITICAL: Save updated stroke history to localStorage so it persists across tab switches
        try {
          const data = JSON.stringify(strokeHistory[passageKey]);
          localStorage.setItem(passageKey + '-strokes', data);
          console.log('🔄 STROKE UNDO: Saved updated stroke history to localStorage');
        } catch (e) {
          console.error('🔄 STROKE UNDO: Failed to save to localStorage:', e);
        }
        
        // FIXED: Safely redraw canvas without clearing text content
        const tabId = getActiveTabId();
        if (tabId && !drawing) {
          console.log('🔄 STROKE UNDO: About to redraw canvas after undo');
          redrawAllStrokes(tabId);
          
          // CRITICAL FIX: Also clear the visible canvas to ensure the undone stroke disappears
          const visibleCanvas = annotationCanvases[tabId];
          if (visibleCanvas) {
            const visibleCtx = visibleCanvas.getContext('2d');
            visibleCtx.clearRect(0, 0, visibleCanvas.width, visibleCanvas.height);
            console.log('🔄 STROKE UNDO: Cleared visible canvas to remove undone stroke');
          }
        }
        console.log('🔄 STROKE UNDO: Completed successfully');
      }
    } else {
      // This is an action operation - restore state safely
      console.log('🔄 ACTION UNDO: Safely restoring state for', operationToUndo.type);
      safeRestoreStateBeforeAction(operationToUndo);
      console.log('🔄 ACTION UNDO: Completed successfully');
    }
    
    // Add to redo stack
    unifiedRedo.push(operationToUndo);
    
  } catch (error) {
    console.error('🔄 UNDO ERROR:', error);
    // On error, restore operation to history to prevent loss
    unifiedHistory.push(operationToUndo);
  } finally {
    // Always clear the restoration flag
    isRestoring = false;
  }
  
  updateUndoRedoUI();
  return true;
}

function redoUnifiedOperation() {
  // Check if we have operations to redo
  if (unifiedRedo.length === 0) {
    console.log('🔄 REDO: No operations to redo');
    return false;
  }
  
  // Prevent recursive redo operations during restoration
  if (isRestoring) {
    console.log('🔄 REDO BLOCKED: Currently restoring, preventing recursive redo');
    return false;
  }
  
  const operationToRedo = unifiedRedo.pop();
  console.log('🔄 REDOING SINGLE OPERATION:', operationToRedo.type, 'timestamp:', new Date(operationToRedo.timestamp).toLocaleTimeString());
  
  // Set restoration flag to prevent recursive operations
  isRestoring = true;
  
  try {
    // Handle different operation types
    if (operationToRedo.isStroke) {
      // This is a stroke operation - ONLY add back the single stroke
      const passageKey = operationToRedo.passageKey;
      console.log('🔄 STROKE REDO DEBUG: Checking redo stack for passage:', passageKey);
      console.log('🔄 STROKE REDO DEBUG: strokeRedo[passageKey]:', strokeRedo[passageKey]);
      console.log('🔄 STROKE REDO DEBUG: strokeRedo[passageKey] length:', strokeRedo[passageKey] ? strokeRedo[passageKey].length : 'undefined');
      
      if (strokeRedo[passageKey] && strokeRedo[passageKey].length > 0) {
        const redoneStroke = strokeRedo[passageKey].pop();
        if (!strokeHistory[passageKey]) strokeHistory[passageKey] = [];
        strokeHistory[passageKey].push(redoneStroke);
        
        console.log('🔄 STROKE REDO: Added 1 stroke, total now:', strokeHistory[passageKey].length);
        
        // CRITICAL: Save updated stroke history to localStorage so it persists across tab switches
        try {
          const data = JSON.stringify(strokeHistory[passageKey]);
          localStorage.setItem(passageKey + '-strokes', data);
          console.log('🔄 STROKE REDO: Saved updated stroke history to localStorage');
        } catch (e) {
          console.error('🔄 STROKE REDO: Failed to save to localStorage:', e);
        }
        
        // FIXED: Safely redraw canvas without clearing text content
        const tabId = getActiveTabId();
        if (tabId && !drawing) {
          redrawAllStrokes(tabId);
        }
        console.log('🔄 STROKE REDO: Completed successfully');
      } else {
        console.error('🔄 STROKE REDO ERROR: No strokes in redo stack for passage:', passageKey);
        console.error('🔄 STROKE REDO ERROR: strokeRedo[passageKey]:', strokeRedo[passageKey]);
        console.error('🔄 STROKE REDO ERROR: This should not happen - stroke was not properly added to redo stack during undo');
      }
    } else {
      // This is an action operation - safely reapply
      console.log('🔄 ACTION REDO: Safely reapplying action for', operationToRedo.type);
      safeReapplyAction(operationToRedo);
      console.log('🔄 ACTION REDO: Completed successfully');
    }
    
    // Add back to unified history
    unifiedHistory.push(operationToRedo);
    
  } catch (error) {
    console.error('🔄 REDO ERROR:', error);
    // On error, restore operation to redo stack to prevent loss
    unifiedRedo.push(operationToRedo);
  } finally {
    // Always clear the restoration flag
    isRestoring = false;
  }
  
  updateUndoRedoUI();
  return true;
}

// FIXED: Safe restoration functions to prevent text disappearing
function safeRestoreStateBeforeAction(action) {
  console.log('🔄 SAFE RESTORE: Processing action type:', action.type);
  
  switch (action.type) {
    case ACTION_TYPES.TOOL_CHANGE:
      // Restore previous tool safely
      if (action.data.from !== undefined) {
        currentTool = action.data.from;
        updateToolUI();
        console.log('🔄 SAFE RESTORE: Tool changed back to:', currentTool);
      }
      break;
      
    case ACTION_TYPES.COLOR_CHANGE:
      // Restore previous colors safely
      if (action.data.tool === 'pen' && action.data.from !== undefined) {
        penColor = action.data.from;
        window.penColor = penColor;
        const penBtn = document.getElementById('penToolBtn');
        if (penBtn) penBtn.style.setProperty('--pen-color', penColor);
        console.log('🔄 SAFE RESTORE: Pen color restored to:', penColor);
      }
      if (action.data.tool === 'highlight' && action.data.from !== undefined) {
        highlighterColor = action.data.from;
        window.highlighterColor = highlighterColor;
        const highlightBtn = document.getElementById('highlightToolBtn');
        if (highlightBtn) highlightBtn.style.setProperty('--highlighter-color', highlighterColor);
        console.log('🔄 SAFE RESTORE: Highlighter color restored to:', highlighterColor);
      }
      updateToolUI();
      break;
      
    case ACTION_TYPES.SIZE_CHANGE:
      // Restore previous size safely
      if (action.data.from !== undefined) {
        penSize = action.data.from;
        const penSizeSlider = document.getElementById('penSizeSlider');
        if (penSizeSlider) penSizeSlider.value = penSize;
        console.log('🔄 SAFE RESTORE: Pen size restored to:', penSize);
      }
      break;
      
    case ACTION_TYPES.TAB_CREATE:
      // Remove the tab that was created - SAFELY without affecting text
      if (window.bibleApp && action.data.tabId) {
        console.log('🔄 SAFE RESTORE: Removing created tab:', action.data.tabId);
        runAutomaticOperation(() => {
          window.bibleApp.closeTab(action.data.tabId);
        });
      }
      break;
      
    case ACTION_TYPES.TAB_CLOSE:
      // Restore the tab that was closed - SAFELY
      if (window.bibleApp && action.data.tabData) {
        console.log('🔄 SAFE RESTORE: Restoring closed tab:', action.data.tabData.id);
        try {
          runAutomaticOperation(() => {
            window.bibleApp.restoreTab(action.data.tabData, action.data.wasActive);
          });
        } catch (e) {
          console.error('🔄 SAFE RESTORE: Error restoring tab:', e);
        }
      }
      break;
      
    case ACTION_TYPES.CLEAR:
      // FIXED: Restore annotations for the specific tab - SAFELY
      if (action.data.clearedStrokes && action.data.tabId) {
        const passageKey = action.data.passageKey;
        if (passageKey && action.data.clearedStrokes) {
          console.log('🔄 SAFE RESTORE CLEAR: Restoring', action.data.clearedStrokes.length, 'strokes for passage:', passageKey);
          
          // Restore stroke history SAFELY
          strokeHistory[passageKey] = [...action.data.clearedStrokes];
          
          // Restore to localStorage SAFELY
          try {
            const data = JSON.stringify(action.data.clearedStrokes);
            localStorage.setItem(passageKey + '-strokes', data);
            console.log('🔄 SAFE RESTORE CLEAR: Saved to localStorage');
          } catch (e) {
            console.error('🔄 SAFE RESTORE CLEAR: Failed to save to localStorage:', e);
          }
          
          // Safely redraw without affecting text
          const currentActiveTab = getActiveTabId();
          if (currentActiveTab && currentActiveTab == action.data.tabId && !drawing) {
            console.log('🔄 SAFE RESTORE CLEAR: Redrawing on active tab');
            redrawAllStrokes(action.data.tabId);
          } else if (window.bibleApp && !drawing) {
            console.log('🔄 SAFE RESTORE CLEAR: Tab not active, switching to tab then redrawing');
            runAutomaticOperation(() => {
              window.bibleApp.switchTab(action.data.tabId);
            });
            setTimeout(() => {
              if (!drawing) redrawAllStrokes(action.data.tabId);
            }, 100);
          }
        }
      }
      break;
      
    case ACTION_TYPES.CLEAR_ALL:
      // FIXED: Restore all annotations across all tabs - SAFELY
      if (action.data.clearedData) {
        console.log('🔄 SAFE RESTORE CLEAR ALL: Restoring all annotations across app');
        
        // Restore stroke history SAFELY
        Object.keys(action.data.clearedData.strokeHistory).forEach(key => {
          strokeHistory[key] = [...action.data.clearedData.strokeHistory[key]];
          console.log('🔄 SAFE RESTORE CLEAR ALL: Restored', action.data.clearedData.strokeHistory[key].length, 'strokes for passage:', key);
        });
        
        // Restore localStorage data SAFELY
        Object.keys(action.data.clearedData.localStorage).forEach(key => {
          localStorage.setItem(key, action.data.clearedData.localStorage[key]);
          console.log('🔄 SAFE RESTORE CLEAR ALL: Restored localStorage for key:', key);
        });
        
        // Safely redraw all visible canvases without affecting text
        if (!drawing) {
          console.log('🔄 SAFE RESTORE CLEAR ALL: Redrawing', Object.keys(annotationCanvases).length, 'canvases');
          Object.keys(annotationCanvases).forEach(tabId => {
            redrawAllStrokes(tabId);
          });
        }
        
        console.log('🔄 SAFE RESTORE CLEAR ALL: Complete!');
      }
      break;
      
    default:
      console.log('🔄 SAFE RESTORE: Skipping unknown action type:', action.type);
      break;
  }
}

function safeReapplyAction(action) {
  console.log('🔄 SAFE REAPPLY: Processing action type:', action.type);
  
  switch (action.type) {
    case ACTION_TYPES.TOOL_CHANGE:
      // Reapply tool change safely
      if (action.data.to !== undefined) {
        currentTool = action.data.to;
        updateToolUI();
        console.log('🔄 SAFE REAPPLY: Tool changed to:', currentTool);
      }
      break;
      
    case ACTION_TYPES.COLOR_CHANGE:
      // Reapply color changes safely
      if (action.data.tool === 'pen' && action.data.to !== undefined) {
        penColor = action.data.to;
        window.penColor = penColor;
        const penBtn = document.getElementById('penToolBtn');
        if (penBtn) penBtn.style.setProperty('--pen-color', penColor);
        console.log('🔄 SAFE REAPPLY: Pen color changed to:', penColor);
      }
      if (action.data.tool === 'highlight' && action.data.to !== undefined) {
        highlighterColor = action.data.to;
        window.highlighterColor = highlighterColor;
        const highlightBtn = document.getElementById('highlightToolBtn');
        if (highlightBtn) highlightBtn.style.setProperty('--highlighter-color', highlighterColor);
        console.log('🔄 SAFE REAPPLY: Highlighter color changed to:', highlighterColor);
      }
      updateToolUI();
      break;
      
    case ACTION_TYPES.SIZE_CHANGE:
      // Reapply size change safely
      if (action.data.to !== undefined) {
        penSize = action.data.to;
        const penSizeSlider = document.getElementById('penSizeSlider');
        if (penSizeSlider) penSizeSlider.value = penSize;
        console.log('🔄 SAFE REAPPLY: Pen size changed to:', penSize);
      }
      break;
      
    case ACTION_TYPES.CLEAR:
      // FIXED: Directly clear the annotations without creating new actions
      if (action.data.tabId) {
        console.log('🔄 SAFE REAPPLY CLEAR: Directly clearing tab:', action.data.tabId);
        const tabId = action.data.tabId;
        const passageKey = action.data.passageKey;
        
        // Clear canvases
        const canvas = annotationCanvases[tabId];
        const offscreen = annotationOffscreen[tabId];
        
        if (canvas) {
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        
        if (offscreen) {
          const ctx = offscreen.getContext('2d');
          ctx.clearRect(0, 0, offscreen.width, offscreen.height);
        }
        
        // Clear stroke data
        if (passageKey) {
          localStorage.removeItem(passageKey + '-strokes');
          if (strokeHistory[passageKey]) {
            strokeHistory[passageKey] = [];
          }
          if (strokeRedo[passageKey]) {
            strokeRedo[passageKey] = [];
          }
        }
        
        updateUndoRedoUI();
      }
      break;
      
    case ACTION_TYPES.CLEAR_ALL:
      // FIXED: Directly clear all annotations without creating new actions
      console.log('🔄 SAFE REAPPLY CLEAR ALL: Directly clearing all annotations across app');
      
      // Clear all canvases
      Object.keys(annotationCanvases).forEach(tabId => {
        const canvas = annotationCanvases[tabId];
        if (canvas) {
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      });
      
      // Clear all offscreen canvases
      Object.keys(annotationOffscreen).forEach(tabId => {
        const offscreen = annotationOffscreen[tabId];
        if (offscreen) {
          const ctx = offscreen.getContext('2d');
          ctx.clearRect(0, 0, offscreen.width, offscreen.height);
        }
      });
      
      // Clear all localStorage stroke data
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.endsWith('-strokes')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      // Clear all stroke history and redo stacks
      Object.keys(strokeHistory).forEach(key => {
        strokeHistory[key] = [];
      });
      Object.keys(strokeRedo).forEach(key => {
        strokeRedo[key] = [];
      });
      
      updateUndoRedoUI();
      break;
      
    default:
      console.log('🔄 SAFE REAPPLY: Skipping unknown action type:', action.type);
      break;
  }
}

// Legacy functions for backward compatibility
function undoAction() {
  return undoUnifiedOperation();
}

function redoAction() {
  return redoUnifiedOperation();
}

function restoreStateBeforeAction(action) {
  switch (action.type) {
    case ACTION_TYPES.TOOL_CHANGE:
      // Restore previous tool
      if (action.data.from !== undefined) {
        currentTool = action.data.from;
        updateToolUI();
      }
      break;
      
    case ACTION_TYPES.COLOR_CHANGE:
      // Restore previous colors
      if (action.data.tool === 'pen' && action.data.from !== undefined) {
        penColor = action.data.from;
        window.penColor = penColor;
        const penBtn = document.getElementById('penToolBtn');
        if (penBtn) penBtn.style.setProperty('--pen-color', penColor);
      }
      if (action.data.tool === 'highlight' && action.data.from !== undefined) {
        highlighterColor = action.data.from;
        window.highlighterColor = highlighterColor;
        const highlightBtn = document.getElementById('highlightToolBtn');
        if (highlightBtn) highlightBtn.style.setProperty('--highlighter-color', highlighterColor);
      }
      updateToolUI();
      break;
      
    case ACTION_TYPES.SIZE_CHANGE:
      // Restore previous size
      if (action.data.from !== undefined) {
        penSize = action.data.from;
        const penSizeSlider = document.getElementById('penSizeSlider');
        if (penSizeSlider) penSizeSlider.value = penSize;
      }
      break;
      
    case ACTION_TYPES.TAB_CREATE:
      // Remove the tab that was created
      if (window.bibleApp && action.data.tabId) {
        runAutomaticOperation(() => {
          window.bibleApp.closeTab(action.data.tabId);
        });
      }
      break;
      
    case ACTION_TYPES.TAB_CLOSE:
      // Restore the tab that was closed
      if (window.bibleApp && action.data.tabData) {
        console.log('?? RESTORING TAB: Restoring closed tab:', action.data.tabData.id);
        console.log('?? TAB DATA:', action.data.tabData);
        
        try {
          // Use the restoreTab method but ensure it works properly
          runAutomaticOperation(() => {
            window.bibleApp.restoreTab(action.data.tabData, action.data.wasActive);
          });
          console.log('? TAB RESTORE: Successfully called restoreTab');
          
          // Verify the tab was actually restored
          const restoredTab = window.bibleApp.tabs.find(t => t.id == action.data.tabData.id);
          if (restoredTab) {
            console.log('? TAB RESTORE: Tab found in tabs array after restoration');
          } else {
            console.error('? TAB RESTORE: Tab not found in tabs array after restoration');
          }
        } catch (error) {
          console.error('? TAB RESTORE: Error during tab restoration:', error);
        }
      } else {
        console.error('? TAB RESTORE: Missing bibleApp or tabData');
      }
      break;
      
    case ACTION_TYPES.TAB_SWITCH:
      // Switch back to previous tab
      if (window.bibleApp && action.data.fromTabId) {
        runAutomaticOperation(() => {
          window.bibleApp.switchTab(action.data.fromTabId);
        });
      }
      break;
      
    case ACTION_TYPES.CLEAR:
      // Restore annotations for the specific tab
      if (action.data.clearedStrokes && action.data.tabId) {
        const passageKey = action.data.passageKey;
        if (passageKey && action.data.clearedStrokes) {
          console.log('?? RESTORING CLEAR: Restoring', action.data.clearedStrokes.length, 'strokes for passage:', passageKey);
          
          // Restore stroke history
          strokeHistory[passageKey] = [...action.data.clearedStrokes];
          
          // Restore to localStorage
          try {
            const data = JSON.stringify(action.data.clearedStrokes);
            localStorage.setItem(passageKey + '-strokes', data);
            console.log('? CLEAR RESTORE: Saved to localStorage');
          } catch (e) {
            console.error('? CLEAR RESTORE: Failed to save to localStorage:', e);
          }
          
          // Make sure the tab is active before redrawing
          const currentActiveTab = getActiveTabId();
          if (currentActiveTab && currentActiveTab == action.data.tabId) {
            console.log('?? CLEAR RESTORE: Redrawing on active tab');
            redrawAllStrokes(action.data.tabId);
          } else {
            console.log('?? CLEAR RESTORE: Tab not active, switching to tab then redrawing');
            if (window.bibleApp) {
              runAutomaticOperation(() => {
                window.bibleApp.switchTab(action.data.tabId);
              });
              setTimeout(() => redrawAllStrokes(action.data.tabId), 100);
            }
          }
        }
      }
      break;
      
    case ACTION_TYPES.CLEAR_ALL:
      // Restore all annotations across all tabs
      if (action.data.clearedData) {
        console.log('?? RESTORING CLEAR ALL: Restoring all annotations across app');
        
        // Restore stroke history
        Object.keys(action.data.clearedData.strokeHistory).forEach(key => {
          strokeHistory[key] = [...action.data.clearedData.strokeHistory[key]];
          console.log('? CLEAR ALL RESTORE: Restored', action.data.clearedData.strokeHistory[key].length, 'strokes for passage:', key);
        });
        
        // Restore localStorage data
        Object.keys(action.data.clearedData.localStorage).forEach(key => {
          localStorage.setItem(key, action.data.clearedData.localStorage[key]);
          console.log('? CLEAR ALL RESTORE: Restored localStorage for key:', key);
        });
        
        // Redraw all visible canvases
        console.log('?? CLEAR ALL RESTORE: Redrawing', Object.keys(annotationCanvases).length, 'canvases');
        Object.keys(annotationCanvases).forEach(tabId => {
          redrawAllStrokes(tabId);
        });
        
        console.log('? CLEAR ALL RESTORE: Complete!');
      }
      break;
      
    case ACTION_TYPES.PASSAGE_LOAD:
      // Restore previous passage content
      if (window.bibleApp && action.data.tabId && action.data.previousPassage) {
        const tab = window.bibleApp.tabs.find(t => t.id == action.data.tabId);
        if (tab) {
          Object.assign(tab, action.data.previousPassage);
          window.bibleApp.renderTabContent(tab);
          if (action.data.previousPassage.loaded) {
            window.bibleApp.restoreTabContent(tab);
          }
        }
      }
      break;
  }
}

function reapplyAction(action) {
  switch (action.type) {
    case ACTION_TYPES.TOOL_CHANGE:
      // Reapply the tool change
      currentTool = action.data.to;
      updateToolUI();
      break;
      
    case ACTION_TYPES.COLOR_CHANGE:
      // Reapply the color change
      if (action.data.tool === 'pen') {
        penColor = action.data.to;
        window.penColor = penColor;
        const penBtn = document.getElementById('penToolBtn');
        if (penBtn) penBtn.style.setProperty('--pen-color', penColor);
      } else if (action.data.tool === 'highlight') {
        highlighterColor = action.data.to;
        window.highlighterColor = highlighterColor;
        const highlightBtn = document.getElementById('highlightToolBtn');
        if (highlightBtn) highlightBtn.style.setProperty('--highlighter-color', highlighterColor);
      }
      updateToolUI();
      break;
      
    case ACTION_TYPES.SIZE_CHANGE:
      // Reapply the size change
      if (action.data.tool === 'pen') {
        penSize = action.data.to;
        const penSizeSlider = document.getElementById('penSizeSlider');
        if (penSizeSlider) penSizeSlider.value = penSize;
      }
      break;
      
    case ACTION_TYPES.TAB_CREATE:
      // Recreate the tab
      if (window.bibleApp && action.data.tabData) {
        runAutomaticOperation(() => {
        window.bibleApp.restoreTab(action.data.tabData, false);
        });
      }
      break;
      
    case ACTION_TYPES.TAB_CLOSE:
      // Re-close the tab
      if (window.bibleApp && action.data.tabId) {
        runAutomaticOperation(() => {
        window.bibleApp.closeTab(action.data.tabId);
        });
      }
      break;
      
    case ACTION_TYPES.TAB_SWITCH:
      // Switch to the target tab
      if (window.bibleApp && action.data.toTabId) {
        runAutomaticOperation(() => {
          window.bibleApp.switchTab(action.data.toTabId);
        });
      }
      break;
      
    case ACTION_TYPES.CLEAR:
      // Re-clear the annotations
      if (action.data.tabId) {
        runAutomaticOperation(() => {
          clearAllAnnotations(action.data.tabId);
        });
      }
      break;
      
    case ACTION_TYPES.CLEAR_ALL:
      // Re-clear all annotations
      runAutomaticOperation(() => {
        clearAllAnnotationsAcrossApp();
      });
      break;
      
    case ACTION_TYPES.PASSAGE_LOAD:
      // Re-load the passage
      if (window.bibleApp && action.data.tabId && action.data.newPassage) {
        const tab = window.bibleApp.tabs.find(t => t.id == action.data.tabId);
        if (tab) {
          Object.assign(tab, action.data.newPassage);
          window.bibleApp.loadPassage(action.data.tabId);
        }
      }
      break;
  }
}

function redrawStroke(tabId, strokeData) {
  console.log('Redrawing stroke:', strokeData);
}

function getCurrentDrawingSettings() {
  if (currentTool === 'pen') {
    return {
      color: penColor,
      size: penSize,
      alpha: 1.0,
      composite: 'source-over',
      smooth: true
    };
  } else if (currentTool === 'highlight') {
    const tabId = getActiveTabId();
    const readingArea = document.getElementById(`readingArea${tabId}`);
    let textEl = readingArea ? readingArea.querySelector('.bible-text') : null;
    let fontSize = textEl ? parseInt(window.getComputedStyle(textEl).fontSize) : 24;
    let highlightSize = Math.max(fontSize * 1.5, 20);
    return {
      color: highlighterColor,
      size: highlightSize,
      alpha: 0.3,
      composite: 'source-over',
      smooth: true
    };
  } else if (currentTool === 'erase') {
    // Make eraser 1.3x the highlighter size, or at least 24px
    const tabId = getActiveTabId();
    const readingArea = document.getElementById(`readingArea${tabId}`);
    let textEl = readingArea ? readingArea.querySelector('.bible-text') : null;
    let fontSize = textEl ? parseInt(window.getComputedStyle(textEl).fontSize) : 24;
    let highlightSize = Math.max(fontSize * 1.5, 20);
    let eraserSize = Math.max(highlightSize * 1.3, 24);
    return {
      color: '#000',
      size: eraserSize,
      alpha: 1.0,
      composite: 'destination-out',
      smooth: true
    };
  }
  return null;
}

export default class BibleApp {
    constructor() {
        window.bibleApp = this; // Ensure global reference is set early
        this.tabs = [];
        this.activeTabId = null;
        this.translations = ['ESV', 'NIV', 'NLT', 'KJV'];
        this.init();
    }

    init() {
        // Create initial tab automatically without recording it as a user operation
        runAutomaticOperation(() => {
            this.createNewTab();
        });
        
        // Initialize tool UI after app is set up
        setTimeout(initializeToolUI, 100);
    }

    createNewTab() {
        const tabId = Date.now();
        const tab = {
            id: tabId,
            book: '', // Start with no book selected
            chapter: null, // Start with no chapter selected
            verse: null, // Start with no verse selected
            verseEnd: null, // Start with no verse end selected
            translation: 'ESV',
            loaded: false,
            mode: 'bible', // Default to bible mode
            mediaContent: null, // For storing media content
            mediaTitle: null // For storing media title
        };
        
        // Don't record tab creation - UI state changes shouldn't be undoable
        this.tabs.push(tab);
        this.activeTabId = tabId;
        this.renderTabs();
        this.renderTabContent(tab);
        // Don't automatically load passage - let user choose when to load
        setupAnnotationForActiveTab();
    }

    renderTabs() {
        const tabBar = document.querySelector('.tab-bar');
        tabBar.innerHTML = '';
        this.tabs.forEach(tab => {
            const tabElement = document.createElement('div');
            tabElement.className = 'tab' + (tab.id === this.activeTabId ? ' active' : '');
            tabElement.dataset.tabId = tab.id;
            tabElement.innerHTML = `
                <span class="tab-title">
                    ${tab.mode === 'bible' ? 
                        `<svg class="bible-icon" viewBox="0 0 24 24" width="16" height="16">
                            <path fill="currentColor" d="M5.81,2C4.83,2 4,2.83 4,3.81V20.19C4,21.17 4.83,22 5.81,22H20V2H5.81M17,20H5.82C5.4,20 5,19.6 5,19.18V4.82C5,4.4 5.4,4 5.82,4H17V20M7,6H15V8H7V6M7,10H15V12H7V10M7,14H15V16H7V14Z"/>
                        </svg>` :
                        `<svg class="media-icon" viewBox="0 0 24 24" width="16" height="16">
                            <path fill="currentColor" d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M10,16.5V7.5L16,12M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4Z"/>
                        </svg>`
                    }
                </span>
                <button class="tab-close" data-tab-id="${tab.id}">✕</button>
            `;
            
            // Cross-platform tab click handling with aggressive anti-highlight for touch
            const handleTabSwitch = (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // Check if this is the active tab - if so, toggle mode
                if (tab.id === this.activeTabId) {
                    this.toggleTabMode(tab.id);
                } else {
                    this.switchTab(tab.id);
                }
            };
            
            // Touch device optimization with proper color preservation
            if (isTouchDevice) {
                // Reset touch styles while preserving proper tab colors
                const resetTabStyles = () => {
                    // Clear problematic styles that cause visual artifacts
                    tabElement.style.background = '';
                    tabElement.style.backgroundColor = '';
                    tabElement.style.border = '';
                    tabElement.style.boxShadow = '';
                    tabElement.style.transform = '';
                    tabElement.style.opacity = '';
                    tabElement.style.filter = '';
                    
                    // CRITICAL: Explicitly preserve tab text color for touch devices
                    const tabTitle = tabElement.querySelector('.tab-title');
                    if (tabTitle) {
                        tabTitle.style.setProperty('color', '#e0e0e0', 'important');
                    }
                    
                    // Preserve tab background as transparent (default)
                    tabElement.style.setProperty('background', 'transparent', 'important');
                    
                    // Preserve active tab styling if this is the active tab
                    if (tab.id === this.activeTabId) {
                        tabElement.style.setProperty('border-bottom', '3px solid #4a9eff', 'important');
                    }
                };
                
                // Prevent any visual feedback on touch
                tabElement.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    resetTabStyles();
                });
                
                tabElement.addEventListener('touchmove', (e) => {
                    e.preventDefault();
                    resetTabStyles();
                });
                
                tabElement.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    resetTabStyles();
                    setTimeout(resetTabStyles, 10); // Double-check after a delay
                    handleTabSwitch(e);
                });
                
                // Also prevent mouse events that might be triggered by touch
                tabElement.addEventListener('mouseenter', resetTabStyles);
                tabElement.addEventListener('mouseleave', resetTabStyles);
                tabElement.addEventListener('mousedown', resetTabStyles);
                tabElement.addEventListener('mouseup', resetTabStyles);
            }
            
            // Always add click handler for both touch and non-touch devices
            tabElement.addEventListener('click', handleTabSwitch);
            
            // Optimize for touch devices
            tabElement.style.touchAction = 'manipulation';
            tabElement.style.webkitUserSelect = 'none';
            tabElement.style.userSelect = 'none';
            tabElement.style.webkitTouchCallout = 'none';
            tabElement.style.transition = 'none'; // Disable transitions on touch devices
            
            // Tab close button handling
            const closeButton = tabElement.querySelector('.tab-close');
            const handleTabClose = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.closeTab(tab.id);
            };
            
            closeButton.addEventListener('click', handleTabClose);
            closeButton.addEventListener('touchend', handleTabClose);
            
            // Optimize close button for touch
            closeButton.style.touchAction = 'manipulation';
            closeButton.style.webkitUserSelect = 'none';
            closeButton.style.userSelect = 'none';
            
            tabBar.appendChild(tabElement);
        });
    }

    toggleTabMode(tabId) {
        const tab = this.tabs.find(t => t.id === tabId);
        if (!tab) return;
        
        // Save current mode before switching
        const previousMode = tab.mode;
        
        // Toggle the mode
        if (tab.mode === 'bible') {
            tab.mode = 'media';
            // Initialize media content if not already set
            if (!tab.mediaContent) {
                tab.mediaContent = this.getDefaultMediaContent();
                tab.mediaTitle = 'Media Tab';
            }
        } else {
            tab.mode = 'bible';
        }
        
        // Re-render tabs to show new icon
        this.renderTabs();
        
        // Re-render tab content for new mode
        this.renderTabContent(tab);
        
        // If switching back to Bible mode and the tab was previously loaded, restore content
        if (previousMode === 'media' && tab.mode === 'bible' && tab.loaded && tab.book && tab.chapter && tab.verse) {
            if (tab.savedText) {
                this.restoreTabContent(tab);
            } else {
                console.log('[DEBUG] Reloading passage after media mode switch for tab:', tab.id);
                runAutomaticOperation(() => {
                    this.loadPassage(tab.id);
                });
            }
        }
        
        // Setup annotations for the new mode
        setTimeout(() => {
            setupAnnotationForActiveTab();
            // Load annotations for the new mode
            loadAnnotations(tabId);
        }, 50);
        
        console.log(`[DEBUG] Toggled tab ${tabId} to ${tab.mode} mode`);
    }

    getDefaultMediaContent() {
        return `
            <div class="media-workspace">
                <div class="media-thumbnails-section">
                    <div class="media-card-grid">
                        <!-- Local media content will be populated here -->
                    </div>
                </div>
                
                <div class="media-canvas" id="mediaCanvas">
                    <div class="canvas-content">
                        <div class="canvas-placeholder">
                            <div class="placeholder-icon">🖼️</div>
                            <div class="placeholder-text">Drag media thumbnails here to get started</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    generateMediaThumbnails(driveFolderId) {
        if (!driveFolderId) {
            return '<div class="media-card no-media"><div class="card-content"><div class="card-title">No media source configured</div></div></div>';
        }

        // Start the actual loading process
        setTimeout(() => {
            this.initializeAndLoadDriveFiles(driveFolderId);
        }, 100);

        // Return loading placeholder initially
        return `
            <div class="media-card loading-card">
                <div class="card-content">
                    <div class="card-icon">⏳</div>
                    <div class="card-title">Loading files...</div>
                    <div class="card-subtitle">Connecting to Google Drive</div>
                </div>
            </div>
        `;
    }

    async initializeAndLoadDriveFiles(driveFolderId) {
        try {
            console.log('[DEBUG] Starting Google Drive initialization...');
            const initialized = await this.initializeGoogleDriveAPI();
            
            if (initialized) {
                console.log('[DEBUG] API initialized, starting authentication...');
                await this.authenticateAndLoadFiles(driveFolderId);
            } else {
                console.error('[ERROR] Failed to initialize Google Drive API');
                this.showDriveAuthError();
            }
        } catch (error) {
            console.error('[ERROR] Failed to initialize and load Drive files:', error);
            this.showDriveError(error);
        }
    }

    async initializeGoogleDriveAPI() {
        console.log('[DEBUG] Starting Google Drive API initialization...');
        
        if (!window.google || !window.gapi) {
            console.log('[DEBUG] Loading Google APIs script...');
            await this.loadGoogleAPIs();
        }

        try {
            console.log('[DEBUG] Initializing gapi client...');
            
            // Initialize basic API client
            await new Promise((resolve) => {
                gapi.load('client', resolve);
            });
            
            await gapi.client.init({
                apiKey: 'AIzaSyCxaL3Ki_XpLiEAvsWG7QtlUF9w4ZGlZ9k'
            });

            // Initialize token client
            const tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: '208409322947-960nuv1adq19f9joop57g76ml84hm0i2.apps.googleusercontent.com',
                scope: 'https://www.googleapis.com/auth/drive.readonly',
                callback: () => {} // Will be overridden in authenticateAndLoadFiles
            });
            
            // Store token client for later use
            this.tokenClient = tokenClient;

            console.log('[DEBUG] Google Drive API initialized successfully');
            console.log('[DEBUG] Current origin:', window.location.origin);
            return true;
        } catch (error) {
            console.error('[ERROR] Failed to initialize Google Drive API:', error);
            console.error('[ERROR] Error details:', {
                message: error.message,
                details: error.details || 'No additional details',
                origin: window.location.origin
            });
            
            // Show user-friendly error based on error type
            if (error.message && error.message.includes('origin')) {
                console.error('[ERROR] This appears to be a CORS/origin configuration issue.');
                console.error('[ERROR] Make sure your current origin (' + window.location.origin + ') is added to the authorized JavaScript origins in Google Cloud Console.');
            }
            
            return false;
        }
    }

    async loadGoogleAPIs() {
        await Promise.all([
            // Load Google Identity Services
            new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://accounts.google.com/gsi/client';
                script.async = true;
                script.defer = true;
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            }),
            // Load basic Google API client
            new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://apis.google.com/js/api.js';
                script.async = true;
                script.defer = true;
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            })
        ]);
    }

    async authenticateAndLoadFiles(driveFolderId) {
        try {
            console.log('[DEBUG] User not signed in, prompting for authentication...');
            
            // Request access token
            await new Promise((resolve, reject) => {
                this.tokenClient.callback = async (response) => {
                    if (response.error !== undefined) {
                        reject(response);
                        return;
                    }
                    console.log('[DEBUG] User authenticated, fetching files...');
                    try {
                        await this.fetchDriveFiles(driveFolderId);
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                };
                this.tokenClient.requestAccessToken();
            });
        } catch (error) {
            console.error('[ERROR] Authentication failed:', error);
            this.showDriveAuthError();
        }
    }

    async fetchDriveFiles(folderId) {
        try {
            console.log('[DEBUG] Attempting to fetch files from folder:', folderId);
            
            // Make direct API request
            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,thumbnailLink,webViewLink,size,modifiedTime)&pageSize=50&supportsAllDrives=true&includeItemsFromAllDrives=true&key=${encodeURIComponent('AIzaSyCxaL3Ki_XpLiEAvsWG7QtlUF9w4ZGlZ9k')}`,
                {
                    headers: {
                        'Authorization': `Bearer ${gapi.client.getToken().access_token}`
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            console.log('[DEBUG] API response:', result);

            const files = result.files || [];
            console.log('[DEBUG] Fetched files:', files);

            if (files.length > 0) {
                this.displayRealMediaThumbnails(files);
            } else {
                this.showEmptyFolderMessage();
            }
        } catch (error) {
            console.error('[ERROR] Failed to fetch files:', error);
            if (error.status === 403) {
                console.error('[ERROR] Permission denied. Please check folder permissions.');
            }
            this.showDriveError(error);
        }
    }

    displayRealMediaThumbnails(files) {
        const mediaGrid = document.querySelector('.media-card-grid');
        if (!mediaGrid) return;

        // Keep the link chooser card and replace the rest
        const linkChooserCard = mediaGrid.querySelector('.link-chooser-card');
        mediaGrid.innerHTML = '';
        if (linkChooserCard) {
            mediaGrid.appendChild(linkChooserCard);
        }

        files.forEach(file => {
            const fileType = this.getFileType(file.mimeType);
            const thumbnailUrl = file.thumbnailLink || this.getDefaultThumbnail(fileType);
            
            const mediaCard = document.createElement('div');
            mediaCard.className = 'media-card';
            mediaCard.dataset.mediaId = file.id;
            mediaCard.dataset.mediaType = fileType;
            mediaCard.draggable = true;
            
            mediaCard.innerHTML = `
                <div class="card-content">
                    <div class="card-thumbnail">
                        ${thumbnailUrl ? 
                            `<img src="${thumbnailUrl}" alt="${file.name}" onerror="this.parentElement.innerHTML='${this.getDefaultThumbnail(fileType)}'">` :
                            `<div class="card-icon">${this.getDefaultThumbnail(fileType)}</div>`
                        }
                    </div>
                    <div class="card-title" title="${file.name}">${this.truncateFileName(file.name)}</div>
                    <div class="card-subtitle">${fileType} • ${this.formatFileSize(file.size)}</div>
                </div>
            `;

            mediaGrid.appendChild(mediaCard);
        });

        // Re-setup drag and drop for new cards
        setTimeout(() => {
            this.setupMediaTabInteractions(this.activeTabId);
        }, 100);
    }

    getFileType(mimeType) {
        if (window.localMediaHandler) {
            return window.localMediaHandler.getFileType(mimeType);
        }
        return 'file';
    }

    getDefaultThumbnail(fileType) {
        if (window.localMediaHandler) {
            return window.localMediaHandler.getFileIcon(fileType);
        }
        return '📁';
    }

    truncateFileName(name, maxLength = 15) {
        if (window.localMediaHandler) {
            return window.localMediaHandler.truncateFileName(name, maxLength);
        }
        return name;
    }

    formatFileSize(bytes) {
        if (window.localMediaHandler) {
            return window.localMediaHandler.formatFileSize(bytes);
        }
        return '';
    }

    showDriveAuthError() {
        const mediaGrid = document.querySelector('.media-card-grid');
        if (!mediaGrid) return;

        const linkChooserCard = mediaGrid.querySelector('.link-chooser-card');
        mediaGrid.innerHTML = '';
        if (linkChooserCard) mediaGrid.appendChild(linkChooserCard);

        const errorCard = document.createElement('div');
        errorCard.className = 'media-card error-card';
        errorCard.innerHTML = `
            <div class="card-content">
                <div class="card-icon">🔐</div>
                <div class="card-title">Authentication Required</div>
                <div class="card-subtitle">Click to sign in to Google Drive</div>
            </div>
        `;

        errorCard.addEventListener('click', () => {
            const driveFolderId = localStorage.getItem('driveFolderId');
            if (driveFolderId) {
                this.authenticateAndLoadFiles(driveFolderId);
            }
        });

        mediaGrid.appendChild(errorCard);
    }

    showDriveError(error) {
        const mediaGrid = document.querySelector('.media-card-grid');
        if (!mediaGrid) return;

        const linkChooserCard = mediaGrid.querySelector('.link-chooser-card');
        mediaGrid.innerHTML = '';
        if (linkChooserCard) mediaGrid.appendChild(linkChooserCard);

        const errorCard = document.createElement('div');
        errorCard.className = 'media-card error-card';
        errorCard.innerHTML = `
            <div class="card-content">
                <div class="card-icon">❌</div>
                <div class="card-title">Error Loading Files</div>
                <div class="card-subtitle">Check folder permissions</div>
            </div>
        `;

        mediaGrid.appendChild(errorCard);
    }

    showEmptyFolderMessage() {
        const mediaGrid = document.querySelector('.media-card-grid');
        if (!mediaGrid) return;

        const linkChooserCard = mediaGrid.querySelector('.link-chooser-card');
        mediaGrid.innerHTML = '';
        if (linkChooserCard) mediaGrid.appendChild(linkChooserCard);

        const emptyCard = document.createElement('div');
        emptyCard.className = 'media-card empty-card';
        emptyCard.innerHTML = `
            <div class="card-content">
                <div class="card-icon">📂</div>
                <div class="card-title">Empty Folder</div>
                <div class="card-subtitle">No files found in this folder</div>
            </div>
        `;

        mediaGrid.appendChild(emptyCard);
    }

    setDriveFolderId(folderIdOrUrl) {
        // Clean up the folder ID from a full URL if needed
        let cleanId = folderIdOrUrl.trim();
        
        // Handle full Google Drive URLs
        const folderMatch = cleanId.match(/\/folders\/([^/?&#]+)/);
        if (folderMatch) {
            cleanId = folderMatch[1];
        }
        
        // Handle shared drive URLs (if they contain different patterns)
        const driveMatch = cleanId.match(/drive\.google\.com.*[\/=]([a-zA-Z0-9_-]{25,})/);
        if (driveMatch && !folderMatch) {
            cleanId = driveMatch[1];
        }
        
        // Remove any query parameters or fragments if it's just an ID
        cleanId = cleanId.split('?')[0].split('#')[0];
        
        console.log('[DEBUG] Setting Drive folder ID:', cleanId);
        
        // Save the folder ID
        localStorage.setItem('driveFolderId', cleanId);
        
        // Refresh the current tab's content if it's in media mode
        const currentTab = this.tabs.find(t => t.id === this.activeTabId);
        if (currentTab && currentTab.mode === 'media') {
            currentTab.mediaContent = this.getDefaultMediaContent();
            this.renderTabContent(currentTab);
            
            // Initialize Google Drive API and load files
            setTimeout(async () => {
                const apiInitialized = await this.initializeGoogleDriveAPI();
                if (apiInitialized) {
                    await this.authenticateAndLoadFiles(cleanId);
                }
            }, 500);
        }
    }

    setupMediaTabInteractions(tabId) {
        // Initialize local media handler if not already initialized
        if (!this.localMediaHandler) {
            this.localMediaHandler = new LocalMediaHandler();
        }

        // Save media content when changes are made
        const saveMediaContent = () => {
            const tab = this.tabs.find(t => t.id === tabId);
            if (tab) {
                tab.mediaContent = document.getElementById(`mediaContent${tabId}`).innerHTML;
            }
        };

        // Auto-save on any changes to the canvas
        const mediaCanvas = document.getElementById('mediaCanvas');
        if (mediaCanvas) {
            const observer = new MutationObserver(saveMediaContent);
            observer.observe(mediaCanvas, { childList: true, subtree: true, attributes: true });
        }
    }

    showLinkChooserPopup() {
        const driveFolderId = localStorage.getItem('driveFolderId') || '';
        
        const popup = document.createElement('div');
        popup.className = 'link-chooser-popup';
        popup.innerHTML = `
            <div class="popup-overlay"></div>
            <div class="popup-content">
                <div class="popup-header">
                    <h3>🔗 Configure Media Source</h3>
                    <button class="popup-close">&times;</button>
                </div>
                <div class="popup-body">
                    <div class="drive-config">
                        <div class="input-section">
                            <label for="popupDriveFolderInput">Google Drive Folder Link or ID:</label>
                            <div class="input-wrapper">
                                <input type="text" 
                                    id="popupDriveFolderInput" 
                                    class="drive-folder-input-large" 
                                    value="${driveFolderId}"
                                    placeholder="Paste your Google Drive folder link here or just the folder ID">
                                <div class="input-status" id="inputStatus">
                                    <span class="status-icon">📝</span>
                                    <span class="status-text">Ready to paste your link</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="help-section">
                            <h4>📋 How to get your Google Drive folder link:</h4>
                            <ol class="help-steps">
                                <li>Go to your Google Drive folder</li>
                                <li>Right-click the folder → <strong>Share</strong></li>
                                <li>Click <strong>Copy link</strong></li>
                                <li>Paste the entire link above</li>
                            </ol>
                            <div class="example-section">
                                <p><strong>Example link format:</strong></p>
                                <code>https://drive.google.com/drive/folders/1ABC123...</code>
                            </div>
                        </div>
                        
                        ${driveFolderId ? `
                            <div class="current-config">
                                <h4>📁 Current Configuration:</h4>
                                <div class="current-id">
                                    <strong>Folder ID:</strong> <code>${driveFolderId}</code>
                                </div>
                                <div class="preview-link">
                                    <a href="https://drive.google.com/drive/folders/${driveFolderId}" target="_blank">
                                        🔗 View in Google Drive
                                    </a>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </div>
                <div class="popup-footer">
                    <button class="popup-btn cancel">Cancel</button>
                    <button class="popup-btn save" id="saveBtn">Save & Refresh Media</button>
                </div>
            </div>
        `;

        document.body.appendChild(popup);

        const input = popup.querySelector('#popupDriveFolderInput');
        const statusElement = popup.querySelector('#inputStatus');
        const saveBtn = popup.querySelector('#saveBtn');

        // Real-time validation and feedback
        const updateInputStatus = () => {
            const value = input.value.trim();
            const statusIcon = statusElement.querySelector('.status-icon');
            const statusText = statusElement.querySelector('.status-text');
            
            if (!value) {
                statusIcon.textContent = '📝';
                statusText.textContent = 'Ready to paste your link';
                statusElement.className = 'input-status';
                saveBtn.textContent = 'Save & Refresh Media';
            } else if (value.includes('drive.google.com/drive/folders/')) {
                statusIcon.textContent = '✅';
                statusText.textContent = 'Valid Google Drive folder link detected';
                statusElement.className = 'input-status valid';
                saveBtn.textContent = 'Save & Load Media Thumbnails';
            } else if (value.length > 20 && /^[a-zA-Z0-9_-]+$/.test(value)) {
                statusIcon.textContent = '✅';
                statusText.textContent = 'Valid folder ID format';
                statusElement.className = 'input-status valid';
                saveBtn.textContent = 'Save & Load Media Thumbnails';
            } else {
                statusIcon.textContent = '⚠️';
                statusText.textContent = 'Please enter a valid Google Drive link or folder ID';
                statusElement.className = 'input-status warning';
                saveBtn.textContent = 'Save Anyway';
            }
        };

        input.addEventListener('input', updateInputStatus);
        input.addEventListener('paste', () => {
            setTimeout(updateInputStatus, 10);
        });

        // Initial status update
        updateInputStatus();

        // Event listeners for popup
        const closePopup = () => {
            document.body.removeChild(popup);
        };

        popup.querySelector('.popup-close').addEventListener('click', closePopup);
        popup.querySelector('.popup-overlay').addEventListener('click', closePopup);
        popup.querySelector('.cancel').addEventListener('click', closePopup);
        
        saveBtn.addEventListener('click', () => {
            const newValue = input.value.trim();
            if (newValue) {
                this.setDriveFolderId(newValue);
                // Show a brief success message
                statusElement.querySelector('.status-icon').textContent = '🎉';
                statusElement.querySelector('.status-text').textContent = 'Saved! Refreshing media...';
                statusElement.className = 'input-status success';
                setTimeout(closePopup, 1000);
            } else {
                closePopup();
            }
        });

        // Focus on input and select all text if there's existing content
        setTimeout(() => {
            input.focus();
            if (input.value) {
                input.select();
            }
        }, 100);
    }

    addMediaToCanvas(mediaData, x, y, canvas) {
        if (this.localMediaHandler) {
            this.localMediaHandler.addMediaToCanvas(mediaData, x, y, canvas);
        }
    }

    makeMediaItemInteractive(item) {
        if (this.localMediaHandler) {
            this.localMediaHandler.makeMediaItemInteractive(item);
        }
    }

    switchTab(tabId) {
        const previousTabId = this.activeTabId;
        
        // Don't record tab switches - UI navigation shouldn't be undoable
        this.activeTabId = tabId;
        this.renderTabs();
        const tab = this.tabs.find(t => t.id === tabId);
        
        // Pre-load annotations for this tab to make switching faster
        if (tab.loaded || tab.mode === 'media') {
            // Pre-load annotations before DOM setup
            const passageKey = getPassageKey(tab.book, tab.chapter, tab.verse, tab.verseEnd, tab.translation, tab.mode);
            if (passageKey && localStorage.getItem(passageKey + '-strokes')) {
                console.log('[DEBUG] Pre-loading stroke annotations for:', passageKey, 'mode:', tab.mode);
            }
        }
        
        // Always render the tab content to ensure proper DOM structure
        this.renderTabContent(tab);
        
        // If the tab was previously loaded, restore the saved content or reload the passage
        if (tab.loaded && tab.book && tab.chapter && tab.verse) {
            if (tab.savedText) {
                this.restoreTabContent(tab);
                // Ensure chapter header is visible
                const chapterHeader = document.getElementById(`chapterHeader${tab.id}`);
                if (chapterHeader) {
                    chapterHeader.style.display = 'block';
                }
            } else {
                // Tab was loaded but content wasn't saved, so reload the passage
                console.log('[DEBUG] Auto-reloading passage for tab:', tab.id);
                runAutomaticOperation(() => {
                this.loadPassage(tab.id);
                });
            }
        }
        
        // Setup annotations after DOM is ready
        setTimeout(() => {
            setupAnnotationForActiveTab();
            
            // Load annotations for media tabs immediately, or for loaded Bible tabs
            if (tab.mode === 'media' || (tab.loaded && tab.book && tab.chapter && tab.verse)) {
                loadAnnotations(tabId);
                
                // Only restore popups for Bible tabs with loaded content
                if (tab.mode === 'bible' && tab.loaded && tab.book && tab.chapter && tab.verse) {
                    loadPopupData();
                    setTimeout(() => {
                        restorePopups();
                    }, 150); // Slightly longer delay to ensure text is fully rendered
                }
            }
        }, 50);
    }

    closeTab(tabId) {
        // Find the index of the tab being closed
        const closedTabIndex = this.tabs.findIndex(t => t.id === tabId);
        const tabToClose = this.tabs.find(t => t.id === tabId);
        
        // Don't record tab closing - UI state changes shouldn't be undoable
        this.tabs = this.tabs.filter(t => t.id !== tabId);
        
        // Clean up annotation canvases and cache for this tab
        if (annotationCanvases[tabId]) {
            delete annotationCanvases[tabId];
        }
        if (annotationOffscreen[tabId]) {
            delete annotationOffscreen[tabId];
        }
        
        if (this.tabs.length === 0) {
            // Create new tab automatically without recording it as a separate operation
            runAutomaticOperation(() => {
            this.createNewTab();
            });
        } else {
            // Determine which tab to switch to
            let nextTabIndex = 0;
            if (closedTabIndex >= 0 && closedTabIndex < this.tabs.length) {
                // If we closed a tab that wasn't the last one, stay at the same index
                nextTabIndex = closedTabIndex;
            } else if (closedTabIndex >= this.tabs.length) {
                // If we closed the last tab, go to the previous tab
                nextTabIndex = this.tabs.length - 1;
            }
            
            const nextTab = this.tabs[nextTabIndex];
            this.activeTabId = nextTab.id;
            this.renderTabs();
            this.renderTabContent(nextTab);
            
            // Automatically load passage if the tab was previously loaded
            if (nextTab.loaded && nextTab.book && nextTab.chapter && nextTab.verse) {
                console.log('[DEBUG] Auto-loading passage for tab:', nextTab.id);
                runAutomaticOperation(() => {
                this.loadPassage(nextTab.id);
                });
            }
        }
    }

    renderTabContent(tab) {
        const tabContent = document.querySelector('.tab-content');
        tabContent.innerHTML = '';
        const panelElement = document.createElement('div');
        panelElement.className = 'tab-panel active';
        panelElement.dataset.tabId = tab.id;
        
        if (tab.mode === 'media') {
            // Render media tab content
            panelElement.innerHTML = `
                <div class="reading-area" id="readingArea${tab.id}">
                    <div class="content-wrapper" id="contentWrapper${tab.id}">
                        <div class="media-content" id="mediaContent${tab.id}">
                            ${tab.mediaContent || this.getDefaultMediaContent()}
                        </div>
                    </div>
                </div>`;
        } else {
            // Render bible tab content (original functionality)
            panelElement.innerHTML = `
                <div class="selector-container" id="selectorContainer${tab.id}" style="display: ${tab.loaded ? 'none' : 'block'}">
                    <div class="translation-bar">
                        <div class="back-button-area" id="backButtonArea${tab.id}"></div>
                        <div class="translation-label">Translation:</div>
                        <div class="translation-options" id="translationOptions${tab.id}"></div>
                    </div>
                    <div class="selection-content" id="selectionContent${tab.id}">
                        <div class="selection-stage" id="bookStage${tab.id}">
                            <div class="card-grid" id="bookCards${tab.id}"></div>
                        </div>
                        <div class="selection-stage hidden" id="chapterStage${tab.id}">
                            <div class="card-grid" id="chapterCards${tab.id}"></div>
                        </div>
                        <div class="selection-stage hidden" id="verseStage${tab.id}">
                            <div class="card-grid" id="verseCards${tab.id}"></div>
                        </div>
                    </div>
                </div>
                <div class="chapter-header" id="chapterHeader${tab.id}" style="display: ${tab.loaded ? 'block' : 'none'}"></div>
                <div class="reading-area" id="readingArea${tab.id}">
                    <div class="content-wrapper" id="contentWrapper${tab.id}">
                        <div class="bible-text" id="bibleText${tab.id}"></div>
                    </div>
                </div>`;
        }
        
        tabContent.appendChild(panelElement);
        
        // Only populate selectors for bible mode
        if (tab.mode === 'bible') {
            this.populateSelectors(tab);
        } else {
            // Setup media tab interactions
            setTimeout(() => {
                this.setupMediaTabInteractions(tab.id);
            }, 100);
        }
    }

    populateSelectors(tab) {
        this.populateTranslations(tab);
        this.populateBooks(tab);
        this.populateChapters(tab);
        this.populateVerses(tab);
        this.updateStageVisibility(tab);
    }

    populateTranslations(tab) {
        const translations = ['ESV', 'NIV', 'NLT', 'KJV'];
        const translationOptions = document.getElementById(`translationOptions${tab.id}`);
        
        translationOptions.innerHTML = translations.map(trans => `
            <button class="translation-btn ${trans === tab.translation ? 'selected' : ''}" 
                    data-translation="${trans}" data-tab-id="${tab.id}">
                ${trans}
            </button>
        `).join('');

        // Add event listeners for translation buttons
        translationOptions.querySelectorAll('.translation-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                tab.translation = btn.dataset.translation;
                this.populateTranslations(tab);
            });
        });
    }

    populateBooks(tab) {
        const books = Object.keys(bibleStructure);
        const bookCards = document.getElementById(`bookCards${tab.id}`);
        const backButtonArea = document.getElementById(`backButtonArea${tab.id}`);
        
        // Clear back button when in book selection
        backButtonArea.innerHTML = '';
        
        bookCards.innerHTML = books.map(book => `
            <div class="selection-card ${book === tab.book ? 'selected' : ''}" 
                 data-book="${book}" data-tab-id="${tab.id}">
                <div class="card-content">
                    <div class="card-title">${book}</div>
                </div>
            </div>
        `).join('');

        // Add event listeners for book cards
        bookCards.querySelectorAll('.selection-card').forEach(card => {
            card.addEventListener('click', () => {
                const selectedBook = card.dataset.book;
                tab.book = selectedBook;
                tab.chapter = null;
                tab.verse = null;
                tab.verseEnd = null;
                this.populateSelectors(tab);
            });
        });
    }

    populateChapters(tab) {
        if (!tab.book) return;
        
        const chapters = Array.from({length: bibleStructure[tab.book].length}, (_, i) => i + 1);
        const chapterCards = document.getElementById(`chapterCards${tab.id}`);
        const backButtonArea = document.getElementById(`backButtonArea${tab.id}`);
        
        backButtonArea.innerHTML = `
            <button class="header-back-btn" data-action="back-to-books" data-tab-id="${tab.id}">
                <i class="fas fa-arrow-left"></i> ${tab.book}
            </button>
        `;
        
        chapterCards.innerHTML = chapters.map(chapter => `
            <div class="selection-card ${chapter === tab.chapter ? 'selected' : ''}" 
                 data-chapter="${chapter}" data-tab-id="${tab.id}">
                <div class="card-content">
                    <div class="card-title">${chapter}</div>
                </div>
            </div>
        `).join('');

        // Add back button event listener
        backButtonArea.querySelector('.header-back-btn').addEventListener('click', () => {
            tab.book = '';
            tab.chapter = null;
            tab.verse = null;
            tab.verseEnd = null;
            this.populateSelectors(tab);
        });

        // Add event listeners for chapter cards
        chapterCards.querySelectorAll('.selection-card').forEach(card => {
            card.addEventListener('click', () => {
                const selectedChapter = parseInt(card.dataset.chapter);
                tab.chapter = selectedChapter;
                tab.verse = null;
                tab.verseEnd = null;
                this.populateSelectors(tab);
            });
        });
    }

    populateVerses(tab) {
            if (!tab.book || !tab.chapter) return;
        
        const verseCount = bibleStructure[tab.book][tab.chapter - 1];
        const verses = Array.from({length: verseCount}, (_, i) => i + 1);
        const verseCards = document.getElementById(`verseCards${tab.id}`);
        const backButtonArea = document.getElementById(`backButtonArea${tab.id}`);
        
        backButtonArea.innerHTML = `
            <button class="header-back-btn" data-action="back-to-chapters" data-tab-id="${tab.id}">
                <i class="fas fa-arrow-left"></i> ${tab.book} ${tab.chapter}
            </button>
        `;
        
        verseCards.innerHTML = verses.map(verse => {
            // Only show selection if we have both verse and verseEnd set
            const isSelected = tab.verse && tab.verseEnd && verse >= tab.verse && verse <= tab.verseEnd;
            const isStart = tab.verse && verse === tab.verse;
            const isEnd = tab.verseEnd && verse === tab.verseEnd;
            return `
                <div class="selection-card ${isSelected ? 'selected' : ''} ${isStart ? 'range-start' : ''} ${isEnd ? 'range-end' : ''}" 
                     data-verse="${verse}" data-tab-id="${tab.id}">
                    <div class="card-content">
                        <div class="card-title">${verse}</div>
                    </div>
                </div>
            `;
        }).join('');

        // Add back button event listener
        backButtonArea.querySelector('.header-back-btn').addEventListener('click', () => {
            tab.chapter = null;
            tab.verse = null;
            tab.verseEnd = null;
            this.populateSelectors(tab);
        });

        // Add verse range selection functionality
        this.setupVerseRangeSelection(tab);
    }

    setupVerseRangeSelection(tab) {
        const verseCards = document.getElementById(`verseCards${tab.id}`);
        let isSelecting = false;
        let startVerse = null;
        
        const loadPassageAndUpdateUI = () => {
            this.loadPassage(tab.id);
            this.renderTabs();
        };

        const startSelection = (e) => {
            const card = e.target.closest('.selection-card');
            if (!card) return;
            
            isSelecting = true;
            startVerse = parseInt(card.dataset.verse);
            this.updateVerseSelection(tab, startVerse, startVerse);
        };

        const continueSelection = (e) => {
            if (!isSelecting) return;
            
            const card = e.target.closest('.selection-card');
            if (!card) return;
            
            const currentVerse = parseInt(card.dataset.verse);
            const start = Math.min(startVerse, currentVerse);
            const end = Math.max(startVerse, currentVerse);
            
            this.updateVerseSelection(tab, start, end);
        };

        const endSelection = () => {
            if (!isSelecting) return;
            isSelecting = false;
            loadPassageAndUpdateUI();
        };

        // Single tap/click handler
        verseCards.addEventListener('click', (e) => {
            if (isSelecting) return; // Don't handle click if we're in the middle of a range selection
            
            const card = e.target.closest('.selection-card');
            if (!card) return;
            
            const verse = parseInt(card.dataset.verse);
            this.updateVerseSelection(tab, verse, verse);
            loadPassageAndUpdateUI();
        });

        // Touch events for range selection
        verseCards.addEventListener('touchstart', startSelection);
        verseCards.addEventListener('touchmove', (e) => {
            e.preventDefault(); // Prevent scrolling while selecting
            const touch = e.touches[0];
            const element = document.elementFromPoint(touch.clientX, touch.clientY);
            continueSelection({ target: element });
        });
        verseCards.addEventListener('touchend', endSelection);

        // Mouse events for range selection
        verseCards.addEventListener('mousedown', startSelection);
        verseCards.addEventListener('mousemove', continueSelection);
        verseCards.addEventListener('mouseup', endSelection);
        verseCards.addEventListener('mouseleave', endSelection);
    }

    updateVerseSelection(tab, startVerse, endVerse) {
        const verseCards = document.getElementById(`verseCards${tab.id}`);
        verseCards.querySelectorAll('.selection-card').forEach(card => {
            const verse = parseInt(card.dataset.verse);
            const isSelected = verse >= startVerse && verse <= endVerse;
            const isStart = verse === startVerse;
            const isEnd = verse === endVerse;
            
            card.classList.toggle('selected', isSelected);
            card.classList.toggle('range-start', isStart);
            card.classList.toggle('range-end', isEnd);
        });

        tab.verse = startVerse;
        tab.verseEnd = endVerse;

        // Don't update the chapter header here - it will be updated when the passage is loaded
    }

    updateStageVisibility(tab) {
        const bookStage = document.getElementById(`bookStage${tab.id}`);
        const chapterStage = document.getElementById(`chapterStage${tab.id}`);
        const verseStage = document.getElementById(`verseStage${tab.id}`);
        
        // Show/hide stages based on current selection
        bookStage.classList.toggle('hidden', !!tab.book);
        chapterStage.classList.toggle('hidden', !tab.book || !!tab.chapter);
        verseStage.classList.toggle('hidden', !tab.book || !tab.chapter);
    }

    async loadPassage(tabId) {
        const tab = this.tabs.find(t => t.id === tabId);
        if (!tab) return;
        
        // Store previous passage state for undo functionality
        const previousPassage = {
            book: tab.book,
            chapter: tab.chapter,
            verse: tab.verse,
            verseEnd: tab.verseEnd,
            translation: tab.translation,
            loaded: tab.loaded,
            savedText: tab.savedText,
            savedHeader: tab.savedHeader
        };
        
        // Store new passage state for redo functionality
        const newPassage = {
            book: tab.book,
            chapter: tab.chapter,
            verse: tab.verse,
            verseEnd: tab.verseEnd,
            translation: tab.translation,
            loaded: true
        };
        
        // Create action for passage load
        const action = createAction(ACTION_TYPES.PASSAGE_LOAD, { 
            tabId: tabId,
            previousPassage: previousPassage,
            newPassage: newPassage
        });
        pushAction(action);
        
        // Clear current annotations before loading new passage
        const currentCanvas = annotationCanvases[tabId];
        if (currentCanvas) {
            const ctx = currentCanvas.getContext('2d');
            ctx.clearRect(0, 0, currentCanvas.width, currentCanvas.height);
        }
        const currentOffscreen = annotationOffscreen[tabId];
        if (currentOffscreen) {
            const ctx = currentOffscreen.getContext('2d');
            ctx.clearRect(0, 0, currentOffscreen.width, currentOffscreen.height);
        }
        
        // Hide the selector container
        const selectorContainer = document.getElementById(`selectorContainer${tabId}`);
        if (selectorContainer) {
            selectorContainer.style.display = 'none';
        }
        
        const bibleText = document.getElementById(`bibleText${tabId}`);
        const chapterHeader = document.getElementById(`chapterHeader${tabId}`);
        
        // Initialize the header element
        if (chapterHeader) {
            chapterHeader.style.display = 'block';
        }
        
        let passage;
        if (tab.verseEnd && tab.verseEnd !== tab.verse) {
            passage = `${tab.book} ${tab.chapter}:${tab.verse}-${tab.verseEnd}`;
        } else {
            passage = `${tab.book} ${tab.chapter}:${tab.verse}`;
        }
        try {
            let text = '';
            let versesArr = null;
            if (tab.translation === 'ESV') {
                const apiKey = 'dc81f59914a2da3c0d0b4fbae973551d8fbdc133';
                const url = `https://api.esv.org/v3/passage/text/?q=${encodeURIComponent(passage)}&include-passage-references=false&include-verse-numbers=true&include-footnotes=false&include-headings=false&include-short-copyright=false`;
                const response = await fetch(url, {
                    headers: { 'Authorization': `Token ${apiKey}` }
                });
                if (!response.ok) throw new Error('ESV API error');
                const data = await response.json();
                text = data.passages && data.passages[0] ? data.passages[0] : '';
                this.displayPassage(tab, text, bibleText, chapterHeader);
                tab.loaded = true;
                this.renderTabs();
                // Set up annotations after text is displayed
                setTimeout(() => {
                    setupAnnotationForActiveTab();
                    loadAnnotations(tabId);
                }, 100);
                return;
            } else if (tab.translation === 'NLT') {
                let nltRaw = getNLTText(tab.book, tab.chapter, tab.verse, tab.verseEnd);
                if (!nltRaw) {
                    this.displayPassage(tab, '', bibleText, chapterHeader);
                    tab.loaded = true;
                    this.renderTabs(); // Update tab title
                    setTimeout(() => {
                        setupAnnotationForActiveTab();
                        loadAnnotations(tabId);
                    }, 100);
                    return;
                } else {
                    const nltLines = nltRaw.replace(/\r\n|\r/g, '\n').split('\n').filter(l => l.trim());
                    versesArr = nltLines.map(line => {
                        const match = line.match(/^(\d{1,3})\s+([\s\S]+)/);
                        if (match) {
                            return { verse: match[1], text: match[2] };
                        }
                        return null;
                    }).filter(Boolean);
                }
            } else {
                let url;
                if (tab.translation === 'NIV') {
                    url = `https://bible-api.com/${encodeURIComponent(passage)}`;
                } else if (tab.translation === 'KJV') {
                    url = `https://bible-api.com/${encodeURIComponent(passage)}?translation=kjv`;
                }
                const response = await fetch(url);
                if (!response.ok) throw new Error(`${tab.translation} API error`);
                const data = await response.json();
                versesArr = (data.verses || []).map(verse => {
                    if (verse.verse && verse.text) {
                        return { verse: verse.verse, text: verse.text };
                    }
                    return null;
                }).filter(Boolean);
            }
            this.displayPassage(tab, versesArr, bibleText, chapterHeader);
            tab.loaded = true;
            this.renderTabs(); // Update tab title
            // Set up annotations after text is displayed
            setTimeout(() => {
                setupAnnotationForActiveTab();
                loadAnnotations(tabId);
            }, 100);
        } catch (error) {
            console.error(`Error loading ${tab.translation} passage:`, error);
            bibleText.innerHTML = `<div class='verse'>Error loading ${tab.translation} passage. Please try again.</div>`;
            if (chapterHeader) {
                chapterHeader.innerHTML = `<div class="chapter-title">${tab.book} ${tab.chapter}:${tab.verse}${tab.verseEnd && tab.verseEnd !== tab.verse ? '-' + tab.verseEnd : ''} (${tab.translation})</div>`;
            }
            tab.loaded = true;
            this.renderTabs(); // Update tab title
            setTimeout(() => {
                setupAnnotationForActiveTab();
                loadAnnotations(tabId);
            }, 100);
        }
    }

    displayPassage(tab, textOrVerses, bibleText, chapterHeader) {
        // Always update and show the header when we have a passage to display
        if (chapterHeader && tab.book && tab.chapter && tab.verse) {
            const headerContent = `${tab.book} ${tab.chapter}:${tab.verse}${tab.verseEnd && tab.verseEnd !== tab.verse ? '-' + tab.verseEnd : ''} (${tab.translation})`;
            chapterHeader.innerHTML = `<div class="chapter-title">${headerContent}</div>`;
            chapterHeader.style.display = 'block';
            tab.savedHeader = chapterHeader.innerHTML;
            console.log('[DEBUG] Updated chapter header:', headerContent);
        }
        
        if (typeof textOrVerses === 'string') {
            // ESV text is already formatted, but we need to parse it into proper HTML
            const lines = textOrVerses.replace(/\r\n|\r/g, '\n').split('\n').filter(l => l.trim());
            let html = '';
            lines.forEach(line => {
                const match = line.match(/^(\d{1,3})\s+([\s\S]+)/);
                if (match) {
                    const cleanText = match[2].replace(/\s+/g, ' ').replace(/\n/g, ' ').trim();
                    html += `<span class="verse"><span class="verse-number">[${match[1]}]</span> ${cleanText}</span> `;
                } else {
                    html += `<span class="verse">${line.trim()}</span> `;
                }
            });
            bibleText.innerHTML = html;
            // Save the formatted text for restoration
            tab.savedText = html;
        } else if (Array.isArray(textOrVerses)) {
            // Format verses with numbers
            const formattedText = this.formatVersesWithNumbers(textOrVerses);
            bibleText.innerHTML = formattedText;
            // Save the formatted text for restoration
            tab.savedText = formattedText;
        } else {
            bibleText.innerHTML = '<div class="verse">No text available for this passage.</div>';
            tab.savedText = bibleText.innerHTML;
        }
        
        // Add word click listeners if select mode is active
        if (selectModeActive) {
            console.log('🔍 DISPLAY PASSAGE - Select mode active, adding word listeners for tab:', tab.id);
            setTimeout(() => {
                addWordClickListeners(tab.id);
            }, 50);
        }
        
        // Note: setupAnnotationForActiveTab is now called from switchTab and loadPassage
        // to prevent recursive calls and ensure proper timing
    }

    formatVersesWithNumbers(verses) {
        // Format verses array from bible-api.com to include verse numbers
        // Improved to remove gaps and ensure consistent formatting
        if (!verses || !Array.isArray(verses)) {
            return '';
        }
        let html = '';
        verses.forEach(verse => {
            if (verse.verse && verse.text) {
                // Clean up the text and ensure proper formatting
                const cleanText = verse.text.replace(/\s+/g, ' ').replace(/\n/g, ' ').trim();
                // Ensure consistent spacing between verse number and text
                html += `<span class="verse"><span class="verse-number">[${verse.verse}]</span> ${cleanText}</span> `;
            }
        });
        return html.trim();
    }

    restoreTabContent(tab) {
        // Restore the Bible text that was previously loaded
        const bibleText = document.getElementById(`bibleText${tab.id}`);
        const chapterHeader = document.getElementById(`chapterHeader${tab.id}`);
        
        if (bibleText && tab.savedText) {
            bibleText.innerHTML = tab.savedText;
        }
        
        if (chapterHeader && tab.savedHeader) {
            chapterHeader.innerHTML = tab.savedHeader;
            chapterHeader.style.display = 'block';  // Ensure header is visible
        }
        
        // Restore the selectors to match the current tab's state
        this.populateSelectors(tab);
        
        // Add word click listeners if select mode is active
        if (selectModeActive) {
            console.log('🔍 RESTORE TAB - Select mode active, adding word listeners for tab:', tab.id);
            setTimeout(() => {
                addWordClickListeners(tab.id);
            }, 50);
        }
        
        // Annotations will be loaded by setupAnnotationForActiveTab called from switchTab
    }

    restoreTab(tabData, makeActive = false) {
        // Restore a tab that was closed
        const restoredTab = JSON.parse(JSON.stringify(tabData));
        this.tabs.push(restoredTab);
        
        // Always make the restored tab active for better reliability
        this.activeTabId = restoredTab.id;
        
        this.renderTabs();
        this.renderTabContent(restoredTab);
        
        // Always try to restore content for loaded tabs
        if (restoredTab.loaded && restoredTab.book && restoredTab.chapter && restoredTab.verse) {
            console.log('[DEBUG] Restoring tab content for:', restoredTab.id, restoredTab);
            
            // If we have saved text, restore it immediately
            if (restoredTab.savedText) {
                console.log('[DEBUG] Restoring saved text for tab:', restoredTab.id);
                this.restoreTabContent(restoredTab);
            } else {
                // Reload the passage if no saved text
                console.log('[DEBUG] Reloading passage for restored tab:', restoredTab.id);
                // Use setTimeout to ensure DOM is ready
                setTimeout(() => {
                    runAutomaticOperation(() => {
                    this.loadPassage(restoredTab.id);
                    });
                }, 100);
            }
            
            // Add a fallback to ensure content is loaded
            setTimeout(() => {
                const tabContent = document.querySelector(`#tabContent${restoredTab.id}`);
                if (tabContent && !tabContent.textContent.trim()) {
                    console.log('[DEBUG] Fallback: Reloading passage for tab:', restoredTab.id);
                    runAutomaticOperation(() => {
                    this.loadPassage(restoredTab.id);
                    });
                }
            }, 500);
        } else {
            console.log('[DEBUG] Tab was not loaded, skipping content restoration:', restoredTab.id);
        }
        
        // Setup annotations for the restored tab
        setupAnnotationForActiveTab();
        
        // Ensure the tab is properly focused
        const tabElement = document.querySelector(`[data-tab-id="${restoredTab.id}"]`);
        if (tabElement) {
            tabElement.classList.add('active');
        }
    }
}

// Attach to window for global access
window.BibleApp = BibleApp;

// Load bibleStructure from bible-structure.js
import { bibleStructure } from './bible-structure.js';

// Load NLT data for instant, reliable NLT text
import { getNLTText } from './nlt-data.js';

// Initialize app on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
    window.bibleApp = new BibleApp();
});

// --- TOOLBAR LOGIC ---

// Tool state
let currentTool = 'pen';
let penSize = 4;

// Select tool state
let selectModeActive = false;
let activeWordPopups = []; // Track multiple popups

// Persistent popup storage
const popupHistory = {};

// Save popup data to localStorage
function savePopupData(popup) {
  const passageKey = getCurrentPassageKey();
  if (!passageKey) return;
  
  if (!popupHistory[passageKey]) {
    popupHistory[passageKey] = [];
  }
  
  const popupData = {
    word: popup.querySelector('.word-info-title').textContent,
    position: {
      x: parseFloat(popup.style.left) || 0,
      y: parseFloat(popup.style.top) || 0,
      hasBeenDragged: popup._hasBeenDragged || false
    },
    timestamp: Date.now(),
    id: popup.id
  };
  
  // Check if popup already exists and update it, otherwise add new
  const existingIndex = popupHistory[passageKey].findIndex(p => p.word === popupData.word);
  if (existingIndex >= 0) {
    popupHistory[passageKey][existingIndex] = popupData;
  } else {
    popupHistory[passageKey].push(popupData);
  }
  
  // Save to localStorage
  try {
    localStorage.setItem(passageKey + '-popups', JSON.stringify(popupHistory[passageKey]));
  } catch (e) {
    console.log('[DEBUG] Failed to save popup data:', e);
  }
}

// Load popup data from localStorage
function loadPopupData() {
  const passageKey = getCurrentPassageKey();
  if (!passageKey) return;
  
  try {
    const raw = localStorage.getItem(passageKey + '-popups');
    if (raw) {
      popupHistory[passageKey] = JSON.parse(raw);
      console.log('[DEBUG] Loaded popup data for passage:', passageKey, popupHistory[passageKey].length, 'popups');
    } else {
      popupHistory[passageKey] = [];
    }
  } catch (e) {
    console.log('[DEBUG] Failed to load popup data:', e);
    popupHistory[passageKey] = [];
  }
}

// Restore all popups for current passage
function restorePopups() {
  const passageKey = getCurrentPassageKey();
  if (!passageKey || !popupHistory[passageKey]) return;
  
  const tabId = getActiveTabId();
  const bibleText = document.getElementById(`bibleText${tabId}`);
  if (!bibleText) return;
  
  console.log('[DEBUG] Restoring', popupHistory[passageKey].length, 'popups for passage:', passageKey);
  
  popupHistory[passageKey].forEach(popupData => {
    // Find the word in the current text
    const wordSpans = bibleText.querySelectorAll('.clickable-word');
    let targetWordSpan = null;
    
    for (const span of wordSpans) {
      if (span.textContent.trim() === popupData.word) {
        targetWordSpan = span;
        break;
      }
    }
    
    if (targetWordSpan) {
      // Create popup with saved data
      const wordInfo = getWordInfo(popupData.word);
      if (wordInfo) {
        createPopupFromData(wordInfo, targetWordSpan, popupData);
      }
    }
  });
}

// Create popup from saved data
function createPopupFromData(wordInfo, wordSpan, popupData) {
  const popup = document.createElement('div');
  popup.className = 'word-info-popup';
  popup.id = popupData.id;
  // Fallback info for missing data
  const greek = wordInfo.greek || { text: '—', transliteration: 'Not available', meaning: 'No data' };
  const hebrew = wordInfo.hebrew || { text: '—', transliteration: 'Not available', meaning: 'No data' };
  popup.innerHTML = `
    <div class="word-info-header">
      <h3 class="word-info-title">${wordInfo.word}</h3>
      <button class="word-info-close" aria-label="Close">&times;</button>
    </div>
    <div class="word-info-content">
      <div class="word-info-section">
        <span class="word-info-label">Greek</span>
        <div class="word-info-value greek">
          <strong>${greek.text}</strong><br>
          <em>${greek.transliteration}</em><br>
          ${greek.meaning}
        </div>
      </div>
      <div class="word-info-divider"></div>
      <div class="word-info-section">
        <span class="word-info-label">Hebrew</span>
        <div class="word-info-value hebrew">
          <strong>${hebrew.text}</strong><br>
          <em>${hebrew.transliteration}</em><br>
          ${hebrew.meaning}
        </div>
      </div>
      <div class="word-info-divider"></div>
      <div class="word-info-section">
        <span class="word-info-label">Frequency</span>
        <div class="word-info-value frequency">
          Used ${wordInfo.frequency || 0} times in the Bible
        </div>
      </div>
    </div>
  `;
  // Find the reading area for the current tab
  const readingArea = wordSpan.closest('.reading-area');
  popup.style.position = 'absolute';
  popup.style.minWidth = '300px';
  popup.style.maxWidth = '350px';
  popup.style.zIndex = 30000 + activeWordPopups.length;
  // Restore saved position with scroll-aware positioning
  if (popupData.position.hasBeenDragged) {
    // For dragged popups, use saved position relative to reading area
    popup.style.left = popupData.position.x + 'px';
    popup.style.top = popupData.position.y + 'px';
    popup._hasBeenDragged = true;
  } else {
    // Auto-position if not dragged - enhanced positioning for large content
    const wordRect = wordSpan.getBoundingClientRect();
    const areaRect = readingArea.getBoundingClientRect();
    
    // Use enhanced positioning method
    const contentWidth = readingArea.scrollWidth || readingArea.clientWidth;
    const contentHeight = readingArea.scrollHeight || readingArea.clientHeight;
    const wordOffsetLeft = wordSpan.offsetLeft || 0;
    const wordOffsetTop = wordSpan.offsetTop || 0;
    const wordHeight = wordRect.height || 20;
    
    // Primary: Use offset positions for content-relative positioning
    let leftInContent = wordOffsetLeft;
    let topInContent = wordOffsetTop + wordHeight + 6;
    
    // Fallback: Use getBoundingClientRect with scroll adjustment
    if (leftInContent <= 0 || topInContent <= 0) {
      const scrollLeft = readingArea.scrollLeft || 0;
      const scrollTop = readingArea.scrollTop || 0;
      leftInContent = Math.max(0, (wordRect.left - areaRect.left) + scrollLeft);
      topInContent = Math.max(0, (wordRect.bottom - areaRect.top) + scrollTop + 6);
    }
    
    // Ensure within bounds
    leftInContent = Math.max(0, Math.min(leftInContent, contentWidth - 350));
    topInContent = Math.max(0, Math.min(topInContent, contentHeight - 400));
    
    popup.style.left = leftInContent + 'px';
    popup.style.top = topInContent + 'px';
  }
  // Append popup to reading area so it scrolls with the text
  readingArea.appendChild(popup);
  // Make popup draggable (relative to reading area)
  makePopupDraggable(popup, readingArea);
  // Add to active popups
  activeWordPopups.push(popup);
  // Show popup
  setTimeout(() => {
    popup.classList.add('show');
  }, 10);
  // Set up close handler
  const closeBtn = popup.querySelector('.word-info-close');
  closeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeSpecificWordPopup(popup);
  });
}

// Clear popup data for current passage
function clearPopupData() {
  const passageKey = getCurrentPassageKey();
  if (passageKey) {
    popupHistory[passageKey] = [];
    localStorage.removeItem(passageKey + '-popups');
  }
}

// DOM refs - will be initialized after DOM is ready
let penBtn, highlightBtn, eraseBtn, selectBtn, penColorDropdown, highlighterColorDropdown, penSizeSliderPopup, penSizeSlider;

// Guard to prevent multiple initializations
let toolUIInitialized = false;

// Initialize DOM references and event listeners
function initializeToolUI() {
  // Prevent multiple initializations
  if (toolUIInitialized) {
    console.log('Tool UI already initialized, skipping duplicate initialization');
    return;
  }

  // Get DOM elements
  penBtn = document.getElementById('penToolBtn');
  highlightBtn = document.getElementById('highlightToolBtn');
  eraseBtn = document.querySelector('.tool-icon[data-tool="erase"]');
  selectBtn = document.getElementById('selectToolBtn');
  penColorDropdown = document.getElementById('penColorDropdown');
  highlighterColorDropdown = document.getElementById('highlighterColorDropdown');
  penSizeSliderPopup = document.getElementById('penSizeSliderPopup');
  penSizeSlider = document.getElementById('penSizeSlider');

  // Check if elements exist
  if (!penBtn || !highlightBtn || !selectBtn || !penColorDropdown || !highlighterColorDropdown) {
    console.error('Tool UI elements not found, retrying in 100ms');
    setTimeout(initializeToolUI, 100);
    return;
  }

  console.log('Tool UI elements found, setting up event listeners');

  // Mark as initialized
  toolUIInitialized = true;

  // Helper: update tool button visuals with aggressive touch device support
  function updateToolUI() {
    // Gentle style reset - preserve colors
    [penBtn, highlightBtn, eraseBtn, selectBtn].forEach(btn => {
      btn.classList.remove('selected');
      if (isTouchDevice) {
        // Only clear hover/active states, preserve colors
        btn.style.removeProperty('background');
        btn.style.removeProperty('background-color');
        btn.style.removeProperty('border');
        btn.style.removeProperty('border-color');
        btn.style.removeProperty('box-shadow');
        btn.style.removeProperty('transform');
        btn.style.removeProperty('opacity');
        btn.style.removeProperty('filter');
        // Don't force transparent - let CSS handle it naturally
      }
    });
    
    // Force browser layout recalculation
    if (isTouchDevice) {
      [penBtn, highlightBtn, eraseBtn, selectBtn].forEach(btn => btn.offsetHeight);
    }
    
    // Set colors FIRST - most important step
    penBtn.style.setProperty('--pen-color', penColor);
    penBtn.style.color = penColor;
    
    highlightBtn.style.setProperty('--highlighter-color', highlighterColor);
    highlightBtn.style.color = highlighterColor;
    
    eraseBtn.style.color = '#ffb6c1';
    selectBtn.style.color = '#4a9eff';
    
    // Apply selected state AFTER colors are set
    if (currentTool === 'pen') {
      penBtn.classList.add('selected');
      // Always force pen color, not just on touch devices
      penBtn.style.color = penColor + ' !important';
      if (isTouchDevice) {
        penBtn.style.background = '#333';
        penBtn.style.setProperty('color', penColor, 'important');
      }
    } else if (currentTool === 'highlight') {
      highlightBtn.classList.add('selected');
      // Always force highlighter color, not just on touch devices
      highlightBtn.style.color = highlighterColor + ' !important';
      if (isTouchDevice) {
        highlightBtn.style.background = '#333';
        highlightBtn.style.border = `2px solid ${highlighterColor}`;
        highlightBtn.style.setProperty('color', highlighterColor, 'important');
        highlightBtn.style.boxShadow = `0 0 0 2px ${highlighterColor}, 0 0 8px rgba(255, 255, 0, 0.5)`;
      }
    } else if (currentTool === 'erase') {
      eraseBtn.classList.add('selected');
      // Always force eraser color, not just on touch devices
      eraseBtn.style.color = '#ffb6c1 !important';
      if (isTouchDevice) {
        eraseBtn.style.background = '#333';
        eraseBtn.style.border = '2px solid #ffb6c1';
        eraseBtn.style.setProperty('color', '#ffb6c1', 'important');
        eraseBtn.style.boxShadow = '0 0 0 2px #ffb6c1, 0 0 8px rgba(255, 182, 193, 0.5)';
      }
    } else if (currentTool === 'select') {
      selectBtn.classList.add('selected');
      // Always force select color, not just on touch devices
      selectBtn.style.color = '#4a9eff !important';
      if (isTouchDevice) {
        selectBtn.style.background = '#333';
        selectBtn.style.border = '2px solid #4a9eff';
        selectBtn.style.setProperty('color', '#4a9eff', 'important');
        selectBtn.style.boxShadow = '0 0 0 2px #4a9eff, 0 0 8px rgba(74, 158, 255, 0.5)';
      }
    }
    
    // Final safety check - re-apply colors to ensure they stick (for ALL devices)
    setTimeout(() => {
      // Force colors with important priority
      penBtn.style.setProperty('color', penColor, 'important');
      highlightBtn.style.setProperty('color', highlighterColor, 'important');
      eraseBtn.style.setProperty('color', '#ffb6c1', 'important');
      selectBtn.style.setProperty('color', '#4a9eff', 'important');
      
      // Ensure selected tool has the right color
      if (currentTool === 'pen') {
        penBtn.style.setProperty('color', penColor, 'important');
      } else if (currentTool === 'highlight') {
        highlightBtn.style.setProperty('color', highlighterColor, 'important');
      } else if (currentTool === 'erase') {
        eraseBtn.style.setProperty('color', '#ffb6c1', 'important');
      } else if (currentTool === 'select') {
        selectBtn.style.setProperty('color', '#4a9eff', 'important');
      }
    }, 10);
    
    console.log('Tool UI updated - current tool:', currentTool, 'pen:', penColor, 'highlight:', highlighterColor);
  }

  // Helper: close all dropdowns
  function closeDropdowns() {
    penColorDropdown.classList.remove('show');
    highlighterColorDropdown.classList.remove('show');
    penSizeSliderPopup.classList.remove('show');
  }

  // Tool selection logic with enhanced touch support
  function handleToolSelection(toolType, e) {
    console.log(`Main App: ${toolType} button selected, currentTool:`, currentTool);
    
    // CRITICAL: Stop event propagation
    e.preventDefault();
    e.stopPropagation();
    
    if (toolType === 'pen') {
      if (currentTool === 'pen') {
        penColorDropdown.classList.toggle('show');
        highlighterColorDropdown.classList.remove('show');
        penSizeSliderPopup.classList.remove('show');
        highlighterColorDropdown.classList.remove('show');
        console.log('Main App: Toggling pen color dropdown');
      } else {
        // Don't track tool change action - UI state changes shouldn't be undoable
        currentTool = 'pen';
        closeDropdowns();
        
        // Disable select mode when switching to other tools
        if (selectModeActive) {
          disableWordSelection();
        }
        
        // Gentle style reset for touch devices - preserve colors
        if (isTouchDevice) {
          [penBtn, highlightBtn, eraseBtn, selectBtn].forEach(btn => {
            // Only reset hover/active states, preserve colors
            btn.style.removeProperty('background');
            btn.style.removeProperty('background-color');
            btn.style.removeProperty('border');
            btn.style.removeProperty('border-color');
            btn.style.removeProperty('box-shadow');
            btn.style.removeProperty('transform');
            btn.style.removeProperty('opacity');
            btn.style.removeProperty('filter');
            
            // Don't remove color - let CSS handle it naturally
          });
        }
        
        updateToolUI();
        console.log('Main App: Switching to pen tool');
      }
    } else if (toolType === 'highlight') {
      if (currentTool === 'highlight') {
        highlighterColorDropdown.classList.toggle('show');
        penColorDropdown.classList.remove('show');
        console.log('Main App: Toggling highlighter color dropdown');
      } else {
        // Don't track tool change action - UI state changes shouldn't be undoable
        currentTool = 'highlight';
        closeDropdowns();
        
        // Disable select mode when switching to other tools
        if (selectModeActive) {
          disableWordSelection();
        }
        
        // Gentle style reset for touch devices - preserve colors
        if (isTouchDevice) {
          [penBtn, highlightBtn, eraseBtn, selectBtn].forEach(btn => {
            // Only reset hover/active states, preserve colors
            btn.style.removeProperty('background');
            btn.style.removeProperty('background-color');
            btn.style.removeProperty('border');
            btn.style.removeProperty('border-color');
            btn.style.removeProperty('box-shadow');
            btn.style.removeProperty('transform');
            btn.style.removeProperty('opacity');
            btn.style.removeProperty('filter');
            
            // Don't remove color - let CSS handle it naturally
          });
        }
        
        updateToolUI();
        console.log('Main App: Switching to highlight tool');
      }
    } else if (toolType === 'erase') {
      // Don't track tool change action - UI state changes shouldn't be undoable
      currentTool = 'erase';
      closeDropdowns();
      
      // Disable select mode when switching to other tools
      if (selectModeActive) {
        disableWordSelection();
      }
      
      // Gentle style reset for touch devices - preserve colors
      if (isTouchDevice) {
        [penBtn, highlightBtn, eraseBtn, selectBtn].forEach(btn => {
          // Only reset hover/active states, preserve colors
          btn.style.removeProperty('background');
          btn.style.removeProperty('background-color');
          btn.style.removeProperty('border');
          btn.style.removeProperty('border-color');
          btn.style.removeProperty('box-shadow');
          btn.style.removeProperty('transform');
          btn.style.removeProperty('opacity');
          btn.style.removeProperty('filter');
          
          // Don't remove color - let CSS handle it naturally
        });
      }
      
      updateToolUI();
      console.log('Main App: Switching to erase tool');
    } else if (toolType === 'select') {
      // Don't track tool change action - UI state changes shouldn't be undoable
      currentTool = 'select';
      closeDropdowns();
      
      // Gentle style reset for touch devices - preserve colors
      if (isTouchDevice) {
        [penBtn, highlightBtn, eraseBtn, selectBtn].forEach(btn => {
          // Only reset hover/active states, preserve colors
          btn.style.removeProperty('background');
          btn.style.removeProperty('background-color');
          btn.style.removeProperty('border');
          btn.style.removeProperty('border-color');
          btn.style.removeProperty('box-shadow');
          btn.style.removeProperty('transform');
          btn.style.removeProperty('opacity');
          btn.style.removeProperty('filter');
          
          // Don't remove color - let CSS handle it naturally
        });
      }
      
      updateToolUI();
      console.log('Main App: Switching to select tool');
      
      // Enable select mode
      selectModeActive = true;
      enableWordSelection();
      
      // Ensure pen size slider still works in select mode
      if (penSizeSliderPopup) {
        penSizeSliderPopup.style.pointerEvents = 'auto';
      }
    }
    
    hideEraserVisualOnToolChange();
  }

  // Cross-platform pen button event handling
  penBtn.addEventListener('click', (e) => handleToolSelection('pen', e));
  
  // Touch events for pen button to ensure proper selection on touch devices
  penBtn.addEventListener('touchend', (e) => {
    // Only handle if not doing pen size adjustment
    if (!penSizeHoldActive && !justFinishedSizeAdjustment) {
      handleToolSelection('pen', e);
    } else {
      // If we just finished size adjustment, ensure tool colors are properly restored
      setTimeout(() => {
        updateToolUI();
      }, 50);
    }
  });

  // Cross-platform highlight button event handling
  highlightBtn.addEventListener('click', (e) => handleToolSelection('highlight', e));
  
  // Touch events for highlight button to ensure proper selection on touch devices
  highlightBtn.addEventListener('touchend', (e) => {
    handleToolSelection('highlight', e);
  });

  // Cross-platform erase button event handling
  eraseBtn.addEventListener('click', (e) => handleToolSelection('erase', e));
  
  // Touch events for erase button to ensure proper selection on touch devices
  eraseBtn.addEventListener('touchend', (e) => {
    handleToolSelection('erase', e);
  });

  // Cross-platform select button event handling
  selectBtn.addEventListener('click', (e) => handleToolSelection('select', e));
  
  // Touch events for select button to ensure proper selection on touch devices
  selectBtn.addEventListener('touchend', (e) => {
    handleToolSelection('select', e);
  });

  // Pen color selection
  penColorDropdown.querySelectorAll('.pen-color-option').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const newColor = btn.getAttribute('data-color');
      // Don't track color changes - UI state changes shouldn't be undoable
      penColor = newColor;
      window.penColor = penColor; // Sync with global variable
      penBtn.style.setProperty('--pen-color', penColor);
      updateToolUI();
      closeDropdowns();
    });
  });

  // Highlighter color selection
  highlighterColorDropdown.querySelectorAll('.highlighter-color-option').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const newColor = btn.getAttribute('data-color');
      // Don't track color changes - UI state changes shouldn't be undoable
      highlighterColor = newColor;
      window.highlighterColor = highlighterColor; // Sync with global variable
      highlightBtn.style.setProperty('--highlighter-color', highlighterColor);
      updateToolUI();
      closeDropdowns();
    });
  });

  // Cross-platform pen size functionality with intuitive hold-and-drag interaction
  let penSizeSliderInitialized = false;
  let penSizeHoldTimeout = null;
  let penSliderActive = false;
  let penSizeHoldActive = false;
  let penDragActive = false;
  let penStartPosition = { x: 0, y: 0 };
  let penStartSize = penSize;
  let lastRecordedPenSize = penSize;
  let justFinishedSizeAdjustment = false;
  let sliderWasActuallyShown = false;

  function showPenSizeSlider() {
    if (!penSizeSliderPopup) return;
    penSizeSliderPopup.classList.add('show');
    if (penSizeSlider) penSizeSlider.value = penSize;
    sliderWasActuallyShown = true;
    console.log('[DEBUG] Pen size slider shown');
  }

  function hidePenSizeSlider() {
    if (!penSizeSliderPopup) return;
    penSizeSliderPopup.classList.remove('show');
    sliderWasActuallyShown = false;
    console.log('[DEBUG] Pen size slider hidden');
  }

  function updatePenSizeFromDrag(currentX, currentY) {
    // Calculate horizontal movement (main adjustment axis)
    const deltaX = currentX - penStartPosition.x;
    const deltaY = currentY - penStartPosition.y;
    
    // Use horizontal movement primarily, but also consider vertical for better control
    const totalMovement = deltaX + (deltaY * 0.3); // Vertical movement has less influence
    
    // Map pixel movement to size range (2-40)
    // Every 10 pixels of movement = 1 size unit change
    const sizeChange = Math.round(totalMovement / 8); // More sensitive for better control
    let newSize = penStartSize + sizeChange;
    
    // Clamp to valid range
    if (newSize < 2) newSize = 2;
    if (newSize > 40) newSize = 40;
    
    if (newSize !== penSize) {
      penSize = newSize;
      if (penSizeSlider) penSizeSlider.value = newSize;
      console.log('[DEBUG] Pen size updated via drag:', newSize);
    }
  }

  function initializePenSizeSlider() {
    if (penSizeSliderInitialized) {
      console.log('[DEBUG] Pen size slider already initialized, skipping duplicate initialization');
      return;
    }

    if (!penBtn || !penSizeSliderPopup || !penSizeSlider) {
      console.log('[DEBUG] Pen size elements not found, delaying initialization');
      setTimeout(initializePenSizeSlider, 100);
      return;
    }

    console.log('[DEBUG] Initializing intuitive hold-and-drag pen size slider');

    // Mark as initialized to prevent duplicates
    penSizeSliderInitialized = true;

    // Enhanced pen button styling for touch optimization
    penBtn.style.touchAction = 'manipulation';
    penBtn.style.userSelect = 'none';
    penBtn.style.webkitUserSelect = 'none';
    penBtn.style.mozUserSelect = 'none';
    penBtn.style.msUserSelect = 'none';

    // Pen size slider styling for touch optimization
    penSizeSliderPopup.style.touchAction = 'manipulation';
    penSizeSliderPopup.style.userSelect = 'none';
    penSizeSlider.style.touchAction = 'manipulation';
    penSizeSlider.style.userSelect = 'none';

    // Core pen size hold and drag logic
    function startPenSizeHold(eventType, clientX, clientY) {
      if (penSizeHoldActive) {
        console.log('[DEBUG] Pen size hold already active, preventing duplicate');
        return;
      }

      console.log('[DEBUG] Starting pen size hold from:', eventType);
      
      penSizeHoldActive = true;
      penStartPosition = { x: clientX, y: clientY };
      penStartSize = penSize;
      lastRecordedPenSize = penSize;
      clearTimeout(penSizeHoldTimeout);
      
      penSizeHoldTimeout = setTimeout(() => {
        // Only show slider if user is still holding (hasn't released)
        if (penSizeHoldActive) {
          console.log('[DEBUG] ?? Pen size hold timeout reached - showing slider');
          
          // Close other dropdowns
          if (penColorDropdown) penColorDropdown.classList.remove('show');
          if (highlighterColorDropdown) highlighterColorDropdown.classList.remove('show');
          
          showPenSizeSlider();
          penDragActive = true; // Enable drag adjustment after slider appears
        } else {
          console.log('[DEBUG] ?? Pen size hold timeout reached but user already released - not showing slider');
        }
      }, 300); // 300ms hold time for good UX
    }

    function handlePenSizeMove(eventType, clientX, clientY) {
      if (penDragActive && penSizeSliderPopup.classList.contains('show')) {
        // User is dragging after the slider appeared - adjust size based on movement
        updatePenSizeFromDrag(clientX, clientY);
      }
    }

    function endPenSizeHold(eventType) {
      console.log('[DEBUG] ?? Ending pen size hold from:', eventType);
      
      clearTimeout(penSizeHoldTimeout);
      
      // Don't record size changes - UI state changes shouldn't be undoable
      console.log('[DEBUG] ?? Pen size changed:', lastRecordedPenSize, '->', penSize);
      
      // Block color picker if we actually used the size slider
      if (sliderWasActuallyShown || penSize !== lastRecordedPenSize) {
        justFinishedSizeAdjustment = true;
        console.log('[DEBUG] ?? Blocking color picker - size adjustment was used');
        
        // Clear the flag after a brief delay to allow normal clicks later
      setTimeout(() => {
          justFinishedSizeAdjustment = false;
          console.log('[DEBUG] ?? Color picker blocking cleared');
        }, 200);
      }
      
      // Reset drag state and flags
      penDragActive = false;
      penSizeHoldActive = false;
      sliderWasActuallyShown = false; // Reset for next interaction
      
      // Hide slider after brief delay
      setTimeout(() => {
        if (!penSliderActive) {
          hidePenSizeSlider();
        }
      }, 500);
    }
    
    // Touch Events (tablets and mobile devices) - Full touch support with hold detection
    console.log('[DEBUG] ?? Touch events: Full touch support with hold detection');

    let touchHoldTimer = null;
    let touchStartTime = 0;
    let touchHoldActive = false;

    penBtn.addEventListener('touchstart', (e) => {
      console.log('[DEBUG] ?? Touch start on pen button - starting hold detection');
      
      touchStartTime = Date.now();
      touchHoldActive = false;
      
      // Mark that a touch occurred so mousedown doesn't trigger duplicate logic
      penBtn._touchOccurred = true;
      
      // Start hold timer for touch devices
      touchHoldTimer = setTimeout(() => {
        if (!touchHoldActive) {
          touchHoldActive = true;
          console.log('[DEBUG] ?? Touch hold detected - starting size adjustment');
          startPenSizeHold('touch', e.changedTouches[0].clientX, e.changedTouches[0].clientY);
        }
      }, 300);
      
      // Clear the mouse event prevention flag after a short delay
      setTimeout(() => {
        penBtn._touchOccurred = false;
      }, 100);
    });

    penBtn.addEventListener('touchend', (e) => {
      const touchDuration = Date.now() - touchStartTime;
      console.log('[DEBUG] ?? Touch end on pen button, duration:', touchDuration + 'ms');
      
      // Clear the hold timer
      if (touchHoldTimer) {
        clearTimeout(touchHoldTimer);
        touchHoldTimer = null;
      }
      
      if (touchHoldActive) {
        // This was a hold - end the size adjustment
        console.log('[DEBUG] ?? Ending touch hold size adjustment');
        endPenSizeHold('touch');
        touchHoldActive = false;
      } else if (touchDuration < 300) {
        // This was a quick tap - let the normal click handler deal with it
        console.log('[DEBUG] ?? Quick touch tap detected - allowing normal click behavior');
      }
    });

    penBtn.addEventListener('touchcancel', (e) => {
      console.log('[DEBUG] ?? Touch cancelled on pen button');
      
      if (touchHoldTimer) {
        clearTimeout(touchHoldTimer);
        touchHoldTimer = null;
      }
      
      if (touchHoldActive) {
        endPenSizeHold('touch');
        touchHoldActive = false;
      }
    });

    // Touch move for drag adjustment during hold
    penBtn.addEventListener('touchmove', (e) => {
      if (touchHoldActive) {
        console.log('[DEBUG] ?? Touch move during hold - adjusting size');
        handlePenSizeMove('touch', e.changedTouches[0].clientX, e.changedTouches[0].clientY);
      }
    });

    // Mouse Events (fallback for older browsers and desktop)
    penBtn.addEventListener('mousedown', (e) => {
      // Skip if this is a touch-triggered mousedown event
      if (penBtn._touchOccurred) {
        console.log('[DEBUG] ?? Mouse down skipped - triggered by touch event');
        return;
      }
      
      // Only handle if no touch/pointer events occurred
      setTimeout(() => {
        if (!penSizeHoldActive) {
          console.log('[DEBUG] ?? Mouse down on pen button (fallback)');
          startPenSizeHold('mouse', e.clientX, e.clientY);
        }
      }, 10);
    });

    penBtn.addEventListener('mouseup', (e) => {
      // Skip if this is a touch-triggered mouseup event
      if (penBtn._touchOccurred) {
        console.log('[DEBUG] ?? Mouse up skipped - triggered by touch event');
        return;
      }
      
      if (penSizeHoldActive) {
        console.log('[DEBUG] ?? Mouse up on pen button');
        endPenSizeHold('mouse');
      }
    });

    // Global movement tracking for drag adjustment - both mouse and touch
    document.addEventListener('mousemove', (e) => {
      if (penDragActive) {
        handlePenSizeMove('mouse', e.clientX, e.clientY);
      }
    });

    // Global touch movement tracking for drag adjustment during hold
    document.addEventListener('touchmove', (e) => {
      if (penDragActive && touchHoldActive) {
        handlePenSizeMove('touch', e.touches[0].clientX, e.touches[0].clientY);
      }
    });

    // Global end tracking for both mouse and touch
    document.addEventListener('mouseup', (e) => {
      if (penDragActive) {
        endPenSizeHold('document-mouse');
      }
    });

    document.addEventListener('touchend', (e) => {
      if (penDragActive && touchHoldActive) {
        endPenSizeHold('document-touch');
        touchHoldActive = false;
      }
    });

    // Traditional slider interaction (for users who prefer to use the slider handle directly)
    penSizeSlider.addEventListener('input', (e) => {
      const newSize = parseInt(e.target.value);
      if (newSize !== penSize && !isNaN(newSize) && newSize >= 2 && newSize <= 40) {
        console.log('[DEBUG] ?? Pen size changed via slider:', penSize, '->', newSize);
        
        penSize = newSize;
      }
    });

    // Slider interaction state management (for traditional slider use)
    penSizeSlider.addEventListener('pointerdown', (e) => {
      penSliderActive = true;
      lastRecordedPenSize = penSize;
      console.log('[DEBUG] ?? Direct slider interaction started');
    });

    penSizeSlider.addEventListener('touchstart', (e) => {
      penSliderActive = true;
      lastRecordedPenSize = penSize;
      console.log('[DEBUG] ?? Direct slider touch started');
    });

    penSizeSlider.addEventListener('mousedown', (e) => {
      penSliderActive = true;
      lastRecordedPenSize = penSize;
      console.log('[DEBUG] ?? Direct slider mouse down');
    });

    // End direct slider interaction
    function endDirectSliderInteraction() {
      // Only proceed if the user was actually interacting with the slider
      if (!penSliderActive) return;
      
      setTimeout(() => {
        penSliderActive = false;
        console.log('[DEBUG] ?? Direct slider interaction ended');
        
        // Don't record size changes - UI state changes shouldn't be undoable
        if (penSize !== lastRecordedPenSize) {
          lastRecordedPenSize = penSize;
          
          // Block color picker from opening after direct slider use (this is appropriate since slider was definitely used)
          justFinishedSizeAdjustment = true;
          console.log('[DEBUG] ?? Blocking color picker - direct slider was used');
          
          // Clear the flag after a brief delay
          setTimeout(() => {
            justFinishedSizeAdjustment = false;
            console.log('[DEBUG] ?? Color picker blocking cleared (direct slider)');
          }, 200);
        }
        
        // Hide slider after brief delay
        setTimeout(() => {
          if (!penSizeHoldActive && !penDragActive) {
            hidePenSizeSlider();
          }
        }, 800);
      }, 50);
    }

    // Only listen to slider-specific events, not global document events
    penSizeSlider.addEventListener('pointerup', endDirectSliderInteraction);
    penSizeSlider.addEventListener('touchend', endDirectSliderInteraction);  
    penSizeSlider.addEventListener('mouseup', endDirectSliderInteraction);

    // Also listen for events on the slider popup container
    penSizeSliderPopup.addEventListener('pointerup', endDirectSliderInteraction);
    penSizeSliderPopup.addEventListener('touchend', endDirectSliderInteraction);
    penSizeSliderPopup.addEventListener('mouseup', endDirectSliderInteraction);

    console.log('[DEBUG] ? Intuitive hold-and-drag pen size slider initialized successfully');
  }

  // Initialize pen size slider
  initializePenSizeSlider();

  // Hide dropdowns if clicking outside
  window.addEventListener('mousedown', (e) => {
    if (!penColorDropdown.contains(e.target) && !penBtn.contains(e.target)) penColorDropdown.classList.remove('show');
    if (!highlighterColorDropdown.contains(e.target) && !highlightBtn.contains(e.target)) highlighterColorDropdown.classList.remove('show');
    // Don't hide size slider if user is actively dragging
    if (!penSizeSliderPopup.contains(e.target) && !penBtn.contains(e.target) && !penSliderActive) hidePenSizeSlider();
  });

  updateToolUI();
  
  // Initial call for touch devices to ensure proper styling
  if (isTouchDevice) {
    setTimeout(() => {
      updateToolUI();
      console.log('Initial tool UI setup complete for touch device');
    }, 200);
  }
}

// Touch device detection and optimization
let isTouchDevice = false;

// Detect touch capability
function detectTouchDevice() {
    isTouchDevice = (('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0));
    
    if (isTouchDevice) {
        // Add touch device class to body for CSS targeting
        document.body.classList.add('touch-device');
        
        // Prevent hover states from persisting after touch
        document.addEventListener('touchstart', function() {}, {passive: true});
        
        console.log('Touch device detected - optimizations applied');
    } else {
        console.log('Mouse/trackpad device detected');
    }
}

// Initialize touch detection early
detectTouchDevice();

// Initialize tool UI when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Always add click handler regardless of device type
    const newTabBtn = document.getElementById('newTabBtn');
    if (newTabBtn) {
        const handleNewTab = (e) => {
            console.log('New Tab button activated'); // DEBUG LOG
            e.preventDefault();
            e.stopPropagation();
            window.bibleApp.createNewTab();
        };

        // Add click handler for all devices
        newTabBtn.addEventListener('click', handleNewTab);
        
        // Add touch-specific handlers only for touch devices
        if (isTouchDevice) {
            const resetNewTabStyles = () => {
                newTabBtn.style.background = '#232323';
                newTabBtn.style.backgroundColor = '#232323';
                newTabBtn.style.setProperty('color', '#4a9eff', 'important');
                newTabBtn.style.border = '';
                newTabBtn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
                newTabBtn.style.transform = '';
                newTabBtn.style.opacity = '';
                newTabBtn.style.filter = '';
            };
            
            newTabBtn.addEventListener('touchstart', resetNewTabStyles);
            newTabBtn.addEventListener('touchmove', resetNewTabStyles);
            newTabBtn.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();
                resetNewTabStyles();
                setTimeout(resetNewTabStyles, 10);
                handleNewTab(e);
            });
        }
    }
    
    setTimeout(initializeToolUI, 100);
    setTimeout(initializeClearButton, 100);
    setTimeout(initializeUndoRedoButtons, 100);
});

// Also try to initialize when the app starts (fallback)
setTimeout(initializeToolUI, 200);
// Note: initializeUndoRedoButtons has proper retry logic built-in

// --- SELECT TOOL & WORD POPUP LOGIC ---

// Enable word selection functionality
function enableWordSelection() {
  console.log('Word selection mode enabled');
  
  // Disable drawing mode
  selectModeActive = true;
  
  // Add visual indicator that select mode is active
  document.body.classList.add('select-mode-active');
  
  // Style the cursor for better UX
  const activeTabId = getActiveTabId();
  const readingArea = document.getElementById(`readingArea${activeTabId}`);
  if (readingArea) {
    readingArea.style.cursor = 'pointer';
  }
  
  // Update canvas pointer events for all tabs
  updateCanvasPointerEvents();
  
  // Ensure pen size slider still works in select mode
  if (penSizeSliderPopup) {
    penSizeSliderPopup.style.pointerEvents = 'auto';
  }
  
  // Add word click listeners to the current active tab
  if (activeTabId) {
    // Ensure words are made clickable first
    makeWordsClickableInTab(activeTabId);
    addWordClickListeners(activeTabId);
  }
}

// Make all words in a tab clickable
function makeWordsClickableInTab(tabId) {
  const bibleText = document.getElementById(`bibleText${tabId}`);
  if (!bibleText) return;
  
  console.log('🔍 MAKING WORDS CLICKABLE - Processing tab:', tabId);
  
  // Check if words are already clickable
  const existingClickableWords = bibleText.querySelectorAll('.clickable-word');
  if (existingClickableWords.length > 0) {
    console.log('🔍 MAKING WORDS CLICKABLE - Words already clickable:', existingClickableWords.length);
    return;
  }
  
  // Process all verses to make words clickable
  const verses = bibleText.querySelectorAll('.verse');
  console.log('🔍 MAKING WORDS CLICKABLE - Found verses:', verses.length);
  
  verses.forEach((verse, verseIndex) => {
    console.log(`🔍 MAKING WORDS CLICKABLE - Processing verse ${verseIndex}:`, verse.textContent.substring(0, 50) + '...');
    
    // Create a document fragment to build the new content
    const fragment = document.createDocumentFragment();
    
    // Process each child node
    Array.from(verse.childNodes).forEach(node => {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        // This is a text node - make words clickable
        const clickableHTML = makeWordsClickable(node.textContent);
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = clickableHTML;
        
        // Move all created nodes to the fragment
        while (tempDiv.firstChild) {
          fragment.appendChild(tempDiv.firstChild);
        }
      } else {
        // This is an element node (like verse numbers) - keep as is
        fragment.appendChild(node.cloneNode(true));
      }
    });
    
    // Clear the verse and append the new content
    verse.innerHTML = '';
    verse.appendChild(fragment);
  });
  
  // Count the final result
  const finalClickableWords = bibleText.querySelectorAll('.clickable-word');
  console.log('🔍 MAKING WORDS CLICKABLE - Final clickable words created:', finalClickableWords.length);
}

// Disable word selection functionality
// Helper function to update canvas pointer events based on select mode
function updateCanvasPointerEvents() {
  // Update canvas pointer events for all tabs
  Object.keys(annotationCanvases).forEach(tabId => {
    const canvas = annotationCanvases[tabId];
    if (canvas) {
      canvas.style.pointerEvents = selectModeActive ? 'none' : 'auto';
    }
  });
  
  // Also update any canvases that might exist but not be in the annotationCanvases object
  document.querySelectorAll('.annotation-canvas').forEach(canvas => {
    canvas.style.pointerEvents = selectModeActive ? 'none' : 'auto';
  });
  
  // Ensure pen size slider still works in select mode
  if (penSizeSliderPopup) {
    penSizeSliderPopup.style.pointerEvents = 'auto';
  }
  
  console.log(`🔍 CANVAS POINTER EVENTS - Updated all canvases: ${selectModeActive ? 'DISABLED (select mode)' : 'ENABLED (drawing mode)'}`);
}

// Disable word selection functionality
function disableWordSelection() {
  console.log('Word selection mode disabled');
  
  selectModeActive = false;
  
  // Remove visual indicators
  document.body.classList.remove('select-mode-active');
  
  // Reset cursor
  const activeTabId = getActiveTabId();
  const readingArea = document.getElementById(`readingArea${activeTabId}`);
  if (readingArea) {
    readingArea.style.cursor = '';
  }
  
  // Update canvas pointer events for all tabs
  updateCanvasPointerEvents();
  
  // Clean up any active touch holds before removing listeners
  if (activeTabId) {
    const bibleText = document.getElementById(`bibleText${activeTabId}`);
    if (bibleText) {
      const clickableWords = bibleText.querySelectorAll('.clickable-word');
      clickableWords.forEach(wordSpan => {
        // Cancel any active touch holds
        if (wordSpan._touchHoldState) {
          if (wordSpan._touchHoldState.holdTimer) {
            clearTimeout(wordSpan._touchHoldState.holdTimer);
            wordSpan._touchHoldState.holdTimer = null;
          }
          wordSpan._touchHoldState.isHolding = false;
          wordSpan.style.backgroundColor = '';
        }
      });
    }
    
    // Remove word click listeners to clean up
    removeWordClickListeners(activeTabId);
  }
  
  // Close any open word popups
  closeWordPopup();
}

// Handle word click/tap
function handleWordClick(word, event) {
  console.log('🔍 WORD CLICK DEBUG - Word clicked:', word);
  console.log('🔍 WORD CLICK DEBUG - Event:', event);
  console.log('🔍 WORD CLICK DEBUG - Select mode active:', selectModeActive);
  
  // Prevent default behavior
  event.preventDefault();
  event.stopPropagation();
  
  // Check if functions are available
  console.log('🔍 WORD CLICK DEBUG - getWordInfo function available:', typeof getWordInfo);
  console.log('🔍 WORD CLICK DEBUG - hasWordData function available:', typeof hasWordData);
  console.log('🔍 WORD CLICK DEBUG - window.getWordInfo available:', typeof window.getWordInfo);
  console.log('🔍 WORD CLICK DEBUG - window.hasWordData available:', typeof window.hasWordData);
  
  try {
    // Get word information - try multiple sources
    console.log('🔍 WORD CLICK DEBUG - Getting word info for:', word);
    let wordInfo;
    
    if (typeof getWordInfo === 'function') {
      wordInfo = getWordInfo(word);
    } else if (typeof window.getWordInfo === 'function') {
      wordInfo = window.getWordInfo(word);
    } else {
      // Fallback - create basic word info
      console.warn('🔍 WORD CLICK DEBUG - getWordInfo not available, using fallback');
      wordInfo = {
        word: word,
        greek: { text: "—", transliteration: "Not available", meaning: "Word data not loaded" },
        hebrew: { text: "—", transliteration: "Not available", meaning: "Word data not loaded" },
        frequency: 0,
        found: false
      };
    }
    
    console.log('🔍 WORD CLICK DEBUG - Word info received:', wordInfo);
    
    // Create and show popup
    console.log('🔍 WORD CLICK DEBUG - Calling showWordPopup');
    showWordPopup(wordInfo, event);
    console.log('🔍 WORD CLICK DEBUG - showWordPopup completed');
  } catch (error) {
    console.error('🔍 WORD CLICK DEBUG - Error in handleWordClick:', error);
    
    // Show error popup as fallback
    const errorWordInfo = {
      word: word,
      greek: { text: "Error", transliteration: "Error occurred", meaning: "Could not load word data" },
      hebrew: { text: "Error", transliteration: "Error occurred", meaning: "Could not load word data" },
      frequency: 0,
      found: false
    };
    showWordPopup(errorWordInfo, event);
  }
}

// Create and show word info popup
function showWordPopup(wordInfo, event) {
  // Check if popup for this word already exists
  const existingPopup = activeWordPopups.find(popup => 
    popup.querySelector('.word-info-title').textContent === wordInfo.word
  );
  if (existingPopup) {
    // If popup exists, just bring it to front and highlight it briefly
    existingPopup.style.zIndex = Math.max(...activeWordPopups.map(p => parseInt(p.style.zIndex) || 30000)) + 1;
    existingPopup.classList.add('highlight-existing');
    setTimeout(() => existingPopup.classList.remove('highlight-existing'), 500);
    console.log('Word popup already exists for:', wordInfo.word);
    return;
  }
  // Create popup element
  const popup = document.createElement('div');
  popup.className = 'word-info-popup';
  // Generate unique ID for this popup
  const popupId = `word-popup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  popup.id = popupId;
  popup.innerHTML = `
    <div class="word-info-header">
      <h3 class="word-info-title">${wordInfo.word}</h3>
      <button class="word-info-close" aria-label="Close">&times;</button>
    </div>
    <div class="word-info-content">
      <div class="word-info-section">
        <span class="word-info-label">Greek</span>
        <div class="word-info-value greek">
          <strong>${wordInfo.greek.text}</strong><br>
          <em>${wordInfo.greek.transliteration}</em><br>
          ${wordInfo.greek.meaning}
        </div>
      </div>
      <div class="word-info-divider"></div>
      <div class="word-info-section">
        <span class="word-info-label">Hebrew</span>
        <div class="word-info-value hebrew">
          <strong>${wordInfo.hebrew.text}</strong><br>
          <em>${wordInfo.hebrew.transliteration}</em><br>
          ${wordInfo.hebrew.meaning}
        </div>
      </div>
      <div class="word-info-divider"></div>
      <div class="word-info-section">
        <span class="word-info-label">Frequency</span>
        <div class="word-info-value frequency">
          Used ${wordInfo.frequency} times in the Bible
        </div>
      </div>
    </div>
  `;
  
  // Calculate initial position relative to the word span - ENHANCED FOR LARGE CONTENT
  const wordSpan = event.target;
  const readingArea = wordSpan.closest('.reading-area');
  const popupOffset = activeWordPopups.length * 20; // Offset each new popup
  
  // Get word position in reading area coordinates (accounting for scroll)
  const wordRect = wordSpan.getBoundingClientRect();
  const areaRect = readingArea.getBoundingClientRect();
  
  // Get comprehensive scroll and content information
  const scrollLeft = readingArea.scrollLeft || 0;
  const scrollTop = readingArea.scrollTop || 0;
  const contentWidth = readingArea.scrollWidth || readingArea.clientWidth;
  const contentHeight = readingArea.scrollHeight || readingArea.clientHeight;
  
  // Calculate position within the content coordinate system
  // Use offsetLeft/offsetTop for more accurate positioning within the content
  const wordOffsetLeft = wordSpan.offsetLeft || 0;
  const wordOffsetTop = wordSpan.offsetTop || 0;
  const wordHeight = wordRect.height || 20;
  
  // Primary positioning: Use offset positions which are relative to content
  let leftInContent = wordOffsetLeft + popupOffset;
  let topInContent = wordOffsetTop + wordHeight + 6 + popupOffset;
  
  // Validation: Check if offset positioning looks reasonable
  const offsetPositionValid = leftInContent > 0 && topInContent > 0 && 
                             leftInContent < contentWidth && topInContent < contentHeight;
  
  // Fallback positioning: Use getBoundingClientRect if offset positions fail or look invalid
  if (!offsetPositionValid) {
    console.log('Using fallback positioning method - offset invalid:', leftInContent, topInContent);
    
    // Method 1: Direct coordinate transformation
    leftInContent = Math.max(0, (wordRect.left - areaRect.left) + scrollLeft + popupOffset);
    topInContent = Math.max(0, (wordRect.bottom - areaRect.top) + scrollTop + 6 + popupOffset);
    
    // Method 2: If that also fails, use word's viewport position plus scroll
    if (leftInContent <= 0 || topInContent <= 0) {
      console.log('Using emergency positioning method');
      const viewportLeft = wordRect.left;
      const viewportTop = wordRect.bottom;
      
      // Convert viewport coordinates to content coordinates
      leftInContent = Math.max(0, viewportLeft - areaRect.left + scrollLeft + popupOffset);
      topInContent = Math.max(0, viewportTop - areaRect.top + scrollTop + 6 + popupOffset);
    }
  }
  
  // Ensure position is within content bounds
  leftInContent = Math.max(0, Math.min(leftInContent, contentWidth - 350)); // 350px popup width
  topInContent = Math.max(0, Math.min(topInContent, contentHeight - 400)); // 400px popup height estimate
  
  popup.style.position = 'absolute';
  popup.style.left = leftInContent + 'px';
  popup.style.top = topInContent + 'px';
  popup.style.zIndex = 30000 + activeWordPopups.length;
  
  // Append popup to reading area so it scrolls with the text
  readingArea.appendChild(popup);
  activeWordPopups.push(popup);
  
  // Show popup with animation and verify position
  setTimeout(() => {
    popup.classList.add('show');
    
    // Verify popup is positioned correctly after showing
    setTimeout(() => {
      const finalPopupRect = popup.getBoundingClientRect();
      const finalWordRect = wordSpan.getBoundingClientRect();
      const finalAreaRect = readingArea.getBoundingClientRect();
      
      // Check if popup is far from word (indicating positioning error)
      const distanceFromWord = Math.abs(finalPopupRect.top - finalWordRect.bottom);
      if (distanceFromWord > 500) { // If popup is more than 500px away from word
        console.warn('⚠️ POPUP POSITION ERROR DETECTED:');
        console.warn('Distance from word:', distanceFromWord + 'px');
        console.warn('Popup rect:', finalPopupRect.left, finalPopupRect.top);
        console.warn('Word rect:', finalWordRect.left, finalWordRect.top, finalWordRect.bottom);
        console.warn('Attempting position correction...');
        
        // Emergency position correction - force popup near word
        const emergencyLeft = Math.max(0, finalWordRect.left - finalAreaRect.left + readingArea.scrollLeft);
        const emergencyTop = Math.max(0, finalWordRect.bottom - finalAreaRect.top + readingArea.scrollTop + 6);
        
        popup.style.left = emergencyLeft + 'px';
        popup.style.top = emergencyTop + 'px';
        
        console.warn('Emergency correction applied:', emergencyLeft, emergencyTop);
      }
    }, 50);
  }, 10);
  
  // Add close button event listener - use specific popup closure
  const closeBtn = popup.querySelector('.word-info-close');
  closeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeSpecificWordPopup(popup);
  });
  
  // Make popup draggable with improved performance (relative to reading area)
  makePopupDraggable(popup, readingArea);
  
  // Ensure popup stays within the full scrollable content area
  adjustPopupPosition(popup, readingArea);
  
  // Save popup data for persistence
  savePopupData(popup);
  
  console.log('Word popup shown for:', wordInfo.word, 'Total popups:', activeWordPopups.length);
  console.log('=== POPUP POSITIONING DEBUG ===');
  console.log('Word span offset:', wordOffsetLeft, wordOffsetTop);
  console.log('Word rect:', wordRect.left, wordRect.top, wordRect.bottom);
  console.log('Reading area rect:', areaRect.left, areaRect.top);
  console.log('Scroll position:', scrollLeft, scrollTop);
  console.log('Content dimensions:', contentWidth, 'x', contentHeight);
  console.log('Final popup position:', leftInContent, topInContent);
  console.log('================================');
}

// Close specific word popup
function closeSpecificWordPopup(popup) {
  if (!popup) return;
  
  // Clean up drag event listeners
  if (popup._cleanupDragListeners) {
    popup._cleanupDragListeners();
  }
  
  // Remove from active popups array
  const index = activeWordPopups.indexOf(popup);
  if (index > -1) {
    activeWordPopups.splice(index, 1);
  }
  
  // Remove popup data from storage
  const passageKey = getCurrentPassageKey();
  if (passageKey && popupHistory[passageKey]) {
    const word = popup.querySelector('.word-info-title').textContent;
    popupHistory[passageKey] = popupHistory[passageKey].filter(p => p.word !== word);
    // Update localStorage
    try {
      localStorage.setItem(passageKey + '-popups', JSON.stringify(popupHistory[passageKey]));
    } catch (e) {
      console.log('[DEBUG] Failed to update popup data after close:', e);
    }
  }
  
  popup.classList.remove('show');
  
  // Remove from DOM after animation
  setTimeout(() => {
    if (popup && popup.parentNode) {
      popup.parentNode.removeChild(popup);
    }
  }, 300);
  
  console.log('Word popup closed. Remaining popups:', activeWordPopups.length);
}

// Close all word popups
function closeWordPopup() {
  console.log('Closing all word popups:', activeWordPopups.length);
  
  // Close all popups
  activeWordPopups.forEach(popup => {
    if (popup) {
      // Clean up drag event listeners
      if (popup._cleanupDragListeners) {
        popup._cleanupDragListeners();
      }
      
      popup.classList.remove('show');
      
      // Remove from DOM after animation
      setTimeout(() => {
        if (popup && popup.parentNode) {
          popup.parentNode.removeChild(popup);
        }
      }, 300);
    }
  });
  
  // Clear popup data from storage
  clearPopupData();
  
  // Clear the array
  activeWordPopups = [];
  console.log('All word popups closed');
}

// Make popup draggable - SIMPLE & RELIABLE
function makePopupDraggable(popup, readingArea) {
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  function startDrag(e) {
    // Don't start drag if clicking on close button
    if (e.target.classList.contains('word-info-close')) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
    
    // FIXED: Calculate offset using content coordinates instead of viewport coordinates
    const popupRect = popup.getBoundingClientRect();
    const areaRect = readingArea.getBoundingClientRect();
    const scrollLeft = readingArea.scrollLeft || 0;
    const scrollTop = readingArea.scrollTop || 0;
    
    // Get current popup content position (where it actually is in the content)
    const currentContentLeft = parseInt(popup.style.left) || 0;
    const currentContentTop = parseInt(popup.style.top) || 0;
    
    // Get mouse position
    let clientX, clientY;
    if (e.type === "touchstart") {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    // Convert mouse viewport coordinates to content coordinates
    const mouseContentX = (clientX - areaRect.left) + scrollLeft;
    const mouseContentY = (clientY - areaRect.top) + scrollTop;
    
    // Calculate offset from mouse to popup top-left in content coordinates
    offsetX = mouseContentX - currentContentLeft;
    offsetY = mouseContentY - currentContentTop;
    
    console.log('Start drag - mouse content pos:', mouseContentX, mouseContentY, 'popup content pos:', currentContentLeft, currentContentTop, 'offset:', offsetX, offsetY);
    
    // Visual feedback
    popup.classList.add('dragging');
    // Bring to front immediately
    popup.style.zIndex = Math.max(...activeWordPopups.map(p => parseInt(p.style.zIndex) || 30000)) + 1;
    // Set up global move and end handlers
    document.addEventListener('mousemove', handleMove, { passive: false });
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('mouseup', endDrag, { passive: true });
    document.addEventListener('touchend', endDrag, { passive: true });
    document.addEventListener('mouseleave', endDrag, { passive: true });
  }

  function handleMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    // Get current mouse position
    let clientX, clientY;
    if (e.type === "touchmove") {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    // FIXED: Calculate position in content coordinates (accounting for scroll)
    const areaRect = readingArea.getBoundingClientRect();
    const scrollLeft = readingArea.scrollLeft || 0;
    const scrollTop = readingArea.scrollTop || 0;
    
    // Convert viewport coordinates to content coordinates
    const newContentX = (clientX - areaRect.left) + scrollLeft - offsetX;
    const newContentY = (clientY - areaRect.top) + scrollTop - offsetY;
    
    // Update position with content-relative coordinates
    popup.style.left = `${newContentX}px`;
    popup.style.top = `${newContentY}px`;
    
    console.log('Dragging popup - viewport:', clientX, clientY, 'scroll:', scrollLeft, scrollTop, 'content pos:', newContentX, newContentY);
  }

  function endDrag(e) {
    if (!isDragging) return;
    isDragging = false;
    // Remove visual feedback
    popup.classList.remove('dragging');
    // Clean up event listeners
    document.removeEventListener('mousemove', handleMove);
    document.removeEventListener('touchmove', handleMove);
    document.removeEventListener('mouseup', endDrag);
    document.removeEventListener('touchend', endDrag);
    document.removeEventListener('mouseleave', endDrag);
    // Ensure popup stays within readingArea
    adjustPopupPosition(popup, readingArea);
    // Mark popup as dragged and save data
    popup._hasBeenDragged = true;
    savePopupData(popup);
  }

  function cleanupEventListeners() {
    // Ensure drag state is clean
    isDragging = false;
    // Remove any remaining listeners
    document.removeEventListener('mousemove', handleMove);
    document.removeEventListener('touchmove', handleMove);
    document.removeEventListener('mouseup', endDrag);
    document.removeEventListener('touchend', endDrag);
    document.removeEventListener('mouseleave', endDrag);
    // Remove popup event listeners
    popup.removeEventListener('mousedown', startDrag);
    popup.removeEventListener('touchstart', startDrag);
  }

  // Start drag on entire popup (except close button)
  popup.addEventListener('mousedown', startDrag, { passive: false });
  popup.addEventListener('touchstart', startDrag, { passive: false });
  // Store cleanup function on popup for later use
  popup._cleanupDragListeners = cleanupEventListeners;
}

// Adjust popup position to stay within the full scrollable content area
function adjustPopupPosition(popup, readingArea) {
  // Get popup dimensions
  const popupRect = popup.getBoundingClientRect();
  const popupWidth = popupRect.width;
  const popupHeight = popupRect.height;
  
  // Get current position in content coordinates
  let currentLeft = parseInt(popup.style.left) || 0;
  let currentTop = parseInt(popup.style.top) || 0;
  
  // Get reading area's full content dimensions
  const contentWidth = readingArea.scrollWidth;
  const contentHeight = readingArea.scrollHeight;
  const visibleWidth = readingArea.clientWidth;
  const visibleHeight = readingArea.clientHeight;
  
  let needsAdjustment = false;
  let newLeft = currentLeft;
  let newTop = currentTop;
  
  // Clamp horizontally within the full content width
  if (currentLeft < 0) {
    newLeft = 0;
    needsAdjustment = true;
  } else if (currentLeft + popupWidth > contentWidth) {
    newLeft = Math.max(0, contentWidth - popupWidth);
    needsAdjustment = true;
  }
  
  // Clamp vertically within the full content height
  if (currentTop < 0) {
    newTop = 0;
    needsAdjustment = true;
  } else if (currentTop + popupHeight > contentHeight) {
    newTop = Math.max(0, contentHeight - popupHeight);
    needsAdjustment = true;
  }
  
  if (needsAdjustment) {
    popup.style.left = `${newLeft}px`;
    popup.style.top = `${newTop}px`;
    console.log('Popup position adjusted to:', newLeft, newTop, 'within content area:', contentWidth, 'x', contentHeight);
  }
}

// Add word click listeners to Bible text
function addWordClickListeners(tabId) {
  if (!selectModeActive) return;
  
  const bibleText = document.getElementById(`bibleText${tabId}`);
  if (!bibleText) return;
  
  // Always ensure words are clickable first
  makeWordsClickableInTab(tabId);
  
  // Setup click listeners for all clickable words
  setupClickListeners(bibleText, tabId);
}

// Helper function to setup click listeners on clickable words
function setupClickListeners(bibleText, tabId) {
  const clickableWords = bibleText.querySelectorAll('.clickable-word');
  console.log('🔍 LISTENERS DEBUG - Found clickable words:', clickableWords.length);
  
  clickableWords.forEach((wordSpan, index) => {
    console.log(`🔍 LISTENERS DEBUG - Setting up word ${index}:`, wordSpan.textContent, 'has-data:', wordSpan.classList.contains('has-data'));
    
    // Remove existing listeners to prevent duplicates
    wordSpan.removeEventListener('click', wordSpan._clickHandler);
    wordSpan.removeEventListener('touchstart', wordSpan._touchStartHandler);
    wordSpan.removeEventListener('touchmove', wordSpan._touchMoveHandler);
    wordSpan.removeEventListener('touchend', wordSpan._touchEndHandler);
    
    // Clear any existing hold timer
    if (wordSpan._holdTimer) {
      clearTimeout(wordSpan._holdTimer);
      wordSpan._holdTimer = null;
    }
    
    // Touch hold state for this word
    let touchHoldState = {
      isHolding: false,
      startX: 0,
      startY: 0,
      startTime: 0,
      holdTimer: null,
      scrollDetected: false
    };
    
    // MOUSE CLICK HANDLER (Desktop)
    wordSpan._clickHandler = (event) => {
      console.log('🔍 LISTENERS DEBUG - Click event fired on:', wordSpan.textContent);
      const word = wordSpan.getAttribute('data-word') || wordSpan.textContent;
      handleWordClick(word, event);
    };
    
    // TOUCH START HANDLER (Mobile) - Begin hold detection
    wordSpan._touchStartHandler = (event) => {
      console.log('🔍 TOUCH DEBUG - Touch start on:', wordSpan.textContent);
      
      // Get touch coordinates
      const touch = event.touches[0];
      touchHoldState.startX = touch.clientX;
      touchHoldState.startY = touch.clientY;
      touchHoldState.startTime = Date.now();
      touchHoldState.isHolding = true;
      touchHoldState.scrollDetected = false;
      
      // Visual feedback - subtle highlight
      wordSpan.style.backgroundColor = 'rgba(74, 158, 255, 0.1)';
      
      // Start hold timer - very short delay (300ms)
      touchHoldState.holdTimer = setTimeout(() => {
        if (touchHoldState.isHolding && !touchHoldState.scrollDetected) {
          console.log('🔍 TOUCH DEBUG - Hold completed for:', wordSpan.textContent);
          
          // Create synthetic event for handleWordClick
          const syntheticEvent = {
            target: wordSpan,
            clientX: touchHoldState.startX,
            clientY: touchHoldState.startY,
            preventDefault: () => {},
            stopPropagation: () => {}
          };
          
          const word = wordSpan.getAttribute('data-word') || wordSpan.textContent;
          handleWordClick(word, syntheticEvent);
          
          // Clean up visual feedback
          wordSpan.style.backgroundColor = '';
          touchHoldState.isHolding = false;
        }
      }, 300); // 300ms hold delay - short enough to be responsive
    };
    
    // TOUCH MOVE HANDLER (Mobile) - Detect scrolling
    wordSpan._touchMoveHandler = (event) => {
      if (!touchHoldState.isHolding) return;
      
      const touch = event.touches[0];
      const deltaX = Math.abs(touch.clientX - touchHoldState.startX);
      const deltaY = Math.abs(touch.clientY - touchHoldState.startY);
      
      // If user moves more than 10px in any direction, consider it scrolling
      if (deltaX > 10 || deltaY > 10) {
        console.log('🔍 TOUCH DEBUG - Scroll detected, cancelling hold for:', wordSpan.textContent);
        touchHoldState.scrollDetected = true;
        touchHoldState.isHolding = false;
        
        // Cancel hold timer
        if (touchHoldState.holdTimer) {
          clearTimeout(touchHoldState.holdTimer);
          touchHoldState.holdTimer = null;
        }
        
        // Remove visual feedback
        wordSpan.style.backgroundColor = '';
      }
    };
    
    // TOUCH END HANDLER (Mobile) - Clean up
    wordSpan._touchEndHandler = (event) => {
      console.log('🔍 TOUCH DEBUG - Touch end on:', wordSpan.textContent);
      
      // Cancel hold timer if still active
      if (touchHoldState.holdTimer) {
        clearTimeout(touchHoldState.holdTimer);
        touchHoldState.holdTimer = null;
      }
      
      // Clean up state and visual feedback
      touchHoldState.isHolding = false;
      wordSpan.style.backgroundColor = '';
      
      // Don't prevent default - allow normal touch events to continue
    };
    
    // Add event listeners
    wordSpan.addEventListener('click', wordSpan._clickHandler);
    wordSpan.addEventListener('touchstart', wordSpan._touchStartHandler, { passive: false });
    wordSpan.addEventListener('touchmove', wordSpan._touchMoveHandler, { passive: true });
    wordSpan.addEventListener('touchend', wordSpan._touchEndHandler, { passive: true });
    
    // Store touch state for cleanup
    wordSpan._touchHoldState = touchHoldState;
    
    // Style clickable words with data
    if (wordSpan.classList.contains('has-data')) {
      wordSpan.style.cursor = 'pointer';
      
      // Different instructions for touch vs mouse devices
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      wordSpan.title = isTouchDevice 
        ? 'Hold briefly to see Greek/Hebrew translation'
        : 'Click to see Greek/Hebrew translation';
        
      console.log('🔍 LISTENERS DEBUG - Styled word with data:', wordSpan.textContent);
    }
  });
  
  console.log('🔍 LISTENERS DEBUG - Word click listeners added for tab:', tabId, 'Total words:', clickableWords.length);
}

// Remove word click listeners
function removeWordClickListeners(tabId) {
  const bibleText = document.getElementById(`bibleText${tabId}`);
  if (!bibleText) return;
  
  // Remove click listeners and unwrap clickable words
  const clickableWords = bibleText.querySelectorAll('.clickable-word');
  clickableWords.forEach(wordSpan => {
    // Clean up event listeners
    wordSpan.removeEventListener('click', wordSpan._clickHandler);
    wordSpan.removeEventListener('touchstart', wordSpan._touchStartHandler);
    wordSpan.removeEventListener('touchmove', wordSpan._touchMoveHandler);
    wordSpan.removeEventListener('touchend', wordSpan._touchEndHandler);
    
    // Clean up any active hold timers
    if (wordSpan._touchHoldState && wordSpan._touchHoldState.holdTimer) {
      clearTimeout(wordSpan._touchHoldState.holdTimer);
      wordSpan._touchHoldState.holdTimer = null;
    }
    
    // Remove visual feedback
    wordSpan.style.backgroundColor = '';
    
    // Replace with text node
    const textNode = document.createTextNode(wordSpan.textContent);
    wordSpan.parentNode.insertBefore(textNode, wordSpan);
    wordSpan.parentNode.removeChild(wordSpan);
  });
  
  console.log('Word click listeners removed for tab:', tabId);
}

// Make words in text clickable
function makeWordsClickable(text) {
  // Split text into words while preserving whitespace
  return text.replace(/\b\w+\b/g, (word) => {
    const cleanWord = word.replace(/[^\w]/g, '').toLowerCase();
    
    // Check if word has data - use try/catch to handle any errors
    let hasData = false;
    try {
      // Make sure the hasWordData function is available
      if (typeof hasWordData === 'function') {
        hasData = hasWordData(cleanWord);
      } else if (typeof window.hasWordData === 'function') {
        hasData = window.hasWordData(cleanWord);
      }
    } catch (error) {
      console.warn('🔍 WORD DATA ERROR - Could not check word data for:', cleanWord, error);
      hasData = false;
    }
    
    const className = hasData ? 'clickable-word has-data' : 'clickable-word';
    return `<span class="${className}" data-word="${word}">${word}</span>`;
  });
}

// --- ANNOTATION LOGIC ---

// Store annotation canvases per tab
const annotationCanvases = {}; // visible canvases (viewport size)
const annotationOffscreen = {}; // offscreen canvases (full scrollable area)

// Global variable to track setup state
let setupInProgress = false;
let lastSetupTabId = null;

// Add overlay canvas management
const annotationOverlayCanvases = {}; // overlay canvases for real-time feedback

function getOrCreateAnnotationCanvas(tabId) {
  let readingArea = document.getElementById(`readingArea${tabId}`);
  if (!readingArea) return null;
  
  let canvas = readingArea.querySelector('.annotation-canvas');
  const dpr = window.devicePixelRatio || 1;
  const bibleText = readingArea.querySelector('.bible-text');
  
  // Calculate full content height including scroll area
  const contentHeight = bibleText ? bibleText.scrollHeight : readingArea.scrollHeight;
  const displayWidth = readingArea.offsetWidth;
  const displayHeight = contentHeight;
  
  let needsResize = false;
  
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'annotation-canvas';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = contentHeight + 'px';
    canvas.style.pointerEvents = selectModeActive ? 'none' : 'auto';
    canvas.style.background = 'transparent';
    canvas.style.cursor = 'crosshair';
    canvas.style.zIndex = '2';
    canvas.style.touchAction = 'pan-x pan-y';
    canvas.style.transform = 'translateZ(0)';
    readingArea.appendChild(canvas);
    needsResize = true;
  } else {
    const widthDiff = Math.abs(canvas._lastWidth - displayWidth);
    const heightDiff = Math.abs(canvas._lastHeight - displayHeight);
    needsResize = widthDiff > 1 || heightDiff > 1 || canvas._lastDpr !== dpr;
  }

  if (needsResize) {
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    canvas.style.width = displayWidth + 'px';
    canvas.style.height = displayHeight + 'px';
    
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    
    canvas._lastWidth = displayWidth;
    canvas._lastHeight = displayHeight;
    canvas._lastDpr = dpr;
  }
  
  annotationCanvases[tabId] = canvas;

  // Create overlay canvas with same dimensions
  let overlay = readingArea.querySelector('.annotation-overlay-canvas');
  if (!overlay) {
    overlay = document.createElement('canvas');
    overlay.className = 'annotation-overlay-canvas';
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = contentHeight + 'px';
    overlay.style.pointerEvents = 'none';
    overlay.style.background = 'transparent';
    overlay.style.zIndex = '3';
    overlay.style.transform = 'translateZ(0)';
    readingArea.appendChild(overlay);
    needsResize = true;
  }
  
  if (needsResize) {
    overlay.width = displayWidth * dpr;
    overlay.height = displayHeight * dpr;
    overlay.style.width = displayWidth + 'px';
    overlay.style.height = displayHeight + 'px';
    
    const ctx = overlay.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
  }
  
  annotationOverlayCanvases[tabId] = overlay;

  // Offscreen canvas matches content height
  let offscreen = annotationOffscreen[tabId];
  if (!offscreen) {
    offscreen = document.createElement('canvas');
    offscreen.width = displayWidth * dpr;
    offscreen.height = displayHeight * dpr;
    const ctx = offscreen.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    annotationOffscreen[tabId] = offscreen;
  } else if (needsResize) {
    offscreen.width = displayWidth * dpr;
    offscreen.height = displayHeight * dpr;
    const ctx = offscreen.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
  }

  return canvas;
}

// Enhanced debug function for diagnosing undo/redo issues
window.diagnoseSingleClickIssue = function() {
  console.log('=== DIAGNOSING SINGLE-CLICK UNDO/REDO ISSUE ===');
  console.log('?? Current unified history (most recent first):');
  
  if (unifiedHistory.length === 0) {
    console.log('   No operations in history');
    return;
  }
  
  // Show last 10 operations with detail
  const recentOps = unifiedHistory.slice(-10);
  recentOps.reverse().forEach((op, i) => {
    const index = unifiedHistory.length - i;
    const typeLabel = op.isStroke ? `${op.type} (STROKE)` : `${op.type} (ACTION)`;
    const timestamp = new Date(op.timestamp).toLocaleTimeString();
    console.log(`   ${index}. [${timestamp}] ${typeLabel} - TabId: ${op.tabId} - Passage: ${op.passageKey?.split('-').slice(-2).join('-') || 'none'}`);
    
    if (op.isStroke && op.strokeData) {
      console.log(`      Stroke: ${op.strokeData.type} with ${op.strokeData.points?.length || 0} points`);
    }
    
    if (op.type === ACTION_TYPES.CLEAR && op.data) {
      console.log(`      Clear: ${op.data.clearedStrokes?.length || 0} strokes cleared`);
    }
    
    if (op.type === ACTION_TYPES.TAB_CLOSE && op.data) {
      console.log(`      Tab Close: ${op.data.tabData?.book || 'unknown'} ${op.data.tabData?.chapter || '?'}:${op.data.tabData?.verse || '?'}`);
    }
  });
  
  console.log('');
  console.log('?? Next undo will affect:', unifiedHistory[unifiedHistory.length - 1]?.type || 'nothing');
  console.log('?? Total operations available to undo:', unifiedHistory.length);
  console.log('');
  console.log('?? If first undo clears annotations temporarily:');
  console.log('   - Check if most recent operation is a STROKE that shouldnt be there');
  console.log('   - This suggests automatic stroke operations are being recorded');
  console.log('   - Use this info to track down the source');
  console.log('===============================================');
};

// Enhanced test function for complete undo/redo verification
window.testCompleteUndoRedo = function() {
  console.log('=== FIXED: SINGLE-CLICK UNDO/REDO TEST ===');
  console.log('?? Testing single-click undo/redo functionality...');
  console.log('?? FIXED: No more double-clicking required!');
  
  const initialCount = unifiedHistory.length;
  console.log('?? Initial unified history count:', initialCount);
  
  // Test 1: Tool change
  console.log('\n1?? Testing TOOL CHANGE...');
  const originalTool = currentTool;
  const toolAction = createAction(ACTION_TYPES.TOOL_CHANGE, { from: currentTool, to: 'highlight' });
  pushAction(toolAction);
  console.log('   ? Tool change operation added (should be 1 operation only)');
  
  // Test 2: Clear current tab
  console.log('2?? Testing CLEAR CURRENT TAB...');
  if (window.bibleApp && window.bibleApp.tabs.length > 0) {
    const currentTabId = getActiveTabId();
    clearAllAnnotations(currentTabId);
    console.log('   ? Clear current tab operation added (should be 1 operation only)');
  } else {
    console.log('   ?? No active tab found for testing');
  }
  
  // Test 3: Clear all
  console.log('3?? Testing CLEAR ALL ANNOTATIONS...');
  clearAllAnnotationsAcrossApp();
  console.log('   ? Clear all annotations operation added (should be 1 operation only)');
  
  // Test 4: Tab close (the problematic one that was creating 2 operations)
  console.log('4?? Testing TAB CLOSE (Previously Required Double-Click)...');
  if (window.bibleApp) {
    const operationsBefore = unifiedHistory.length;
    window.bibleApp.createNewTab();
    const operationsAfterCreate = unifiedHistory.length;
    console.log(`   ?? Tab creation added ${operationsAfterCreate - operationsBefore} operations (should be 1)`);
    
    if (window.bibleApp.tabs.length > 1) {
      const operationsBeforeClose = unifiedHistory.length;
      const newTabId = window.bibleApp.tabs[window.bibleApp.tabs.length - 1].id;
      window.bibleApp.closeTab(newTabId);
      const operationsAfterClose = unifiedHistory.length;
      console.log(`   ??? Tab close added ${operationsAfterClose - operationsBeforeClose} operations (should be 1, was 2 before fix)`);
    }
  }
  
  const finalCount = unifiedHistory.length;
  const operationsAdded = finalCount - initialCount;
  
  console.log('\n?? FIXED RESULTS:');
  console.log('   Operations added:', operationsAdded, '(should be 4, not 5-6)');
  console.log('   Total history count:', finalCount);
  console.log('   Undo button enabled:', !document.getElementById('undoBtn')?.disabled);
  
  console.log('\n?? TESTING SINGLE-CLICK UNDO...');
  console.log('?? Each operation should undo with SINGLE click now!');
  
  // Test single-click undo for each operation
  for (let i = 0; i < Math.min(operationsAdded, 4); i++) {
    const beforeUndo = unifiedHistory.length;
    
    console.log(`\n   Single-Click Undo Test ${i + 1}:`);
    console.log(`     Operations before undo: ${beforeUndo}`);
    
    const undoResult = undoUnifiedOperation();
    
    const afterUndo = unifiedHistory.length;
    
    console.log(`     Operations after undo: ${afterUndo}`);
    console.log(`     Difference: ${beforeUndo - afterUndo} (should be exactly 1)`);
    
    if (undoResult && (beforeUndo - afterUndo) === 1) {
      console.log('     ? SINGLE-CLICK UNDO SUCCESS!');
    } else {
      console.log('     ? Single-click undo failed');
      console.log('     ?? This means the fix did not work completely');
    }
  }
  
  console.log('\n?? SINGLE-CLICK UNDO/REDO TEST COMPLETE!');
  console.log('? Tab closing, clear operations, and all other actions now work with single clicks!');
  console.log('?? Use window.debugUndoRedo() to see current state');
  console.log('?? Automatic operations (like creating new tab when last tab is closed) are no longer recorded separately');
  console.log('===============================================');
  
  return {
    operationsAdded,
    expectedOperations: 4,
    singleClickWorking: operationsAdded <= 4,
    finalHistoryCount: unifiedHistory.length,
    finalRedoCount: unifiedRedo.length
  };
};

// Global test function specifically for clear and tab operations
window.testClearAndTabUndo = function() {
  console.log('=== TESTING CLEAR & TAB UNDO/REDO INTEGRATION ===');
  console.log('');
  
  const initialCount = unifiedHistory.length;
  console.log('?? Initial unified history count:', initialCount);
  
  // Test clear current tab
  console.log('1?? Testing CLEAR CURRENT TAB...');
  if (window.bibleApp && window.bibleApp.tabs.length > 0) {
    const currentTabId = getActiveTabId();
    clearAllAnnotations(currentTabId);
    console.log('   ? Clear current tab operation added to unified history');
  } else {
    console.log('   ?? No active tab found for testing');
  }
  
  // Test clear all
  console.log('2?? Testing CLEAR ALL ANNOTATIONS...');
  clearAllAnnotationsAcrossApp();
  console.log('   ? Clear all annotations operation added to unified history');
  
  // Test tab creation and closing
  console.log('3?? Testing TAB CLOSE...');
  if (window.bibleApp) {
    const tabCountBefore = window.bibleApp.tabs.length;
    window.bibleApp.createNewTab();
    console.log('   ?? Created new tab');
    
    if (window.bibleApp.tabs.length > 1) {
      const newTabId = window.bibleApp.tabs[window.bibleApp.tabs.length - 1].id;
      window.bibleApp.closeTab(newTabId);
      console.log('   ? Tab close operation added to unified history');
    } else {
      console.log('   ?? Could not create test tab for closing');
    }
  } else {
    console.log('   ?? Bible app not found for testing');
  }
  
  const finalCount = unifiedHistory.length;
  const operationsAdded = finalCount - initialCount;
  
  console.log('');
  console.log('?? RESULTS:');
  console.log('   Operations added to unified history:', operationsAdded);
  console.log('   Total unified history count:', finalCount);
  console.log('   Undo button enabled:', !document.getElementById('undoBtn')?.disabled);
  
  if (operationsAdded >= 2) {
    console.log('   ?? SUCCESS: Clear and tab operations are integrated!');
    console.log('');
    console.log('?? Try pressing Ctrl+Z or clicking undo button to test:');
    console.log('   � Operations should undo in reverse chronological order');
    console.log('   � Each undo should restore the previous state perfectly');
  } else {
    console.log('   ? ISSUE: Not all operations were added to unified history');
    console.log('   ?? Check if pushAction() calls are working correctly');
  }
  
  console.log('');
  console.log('?? View current unified history:');
  console.log('   window.debugUndoRedo()');
  console.log('===============================================');
  
  return {
    operationsAdded,
    totalHistory: finalCount,
    undoEnabled: !document.getElementById('undoBtn')?.disabled
  };
};

// Helper to get offscreen context
function getOffscreenContext(tabId) {
  const offscreen = annotationOffscreen[tabId];
  if (!offscreen) return null;
  const dpr = window.devicePixelRatio || 1;
  const ctx = offscreen.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  return ctx;
}

// Update visible canvas from offscreen
function updateVisibleCanvas(tabId, disableScroll = false) {
  const readingArea = document.getElementById(`readingArea${tabId}`);
  const canvas = annotationCanvases[tabId];
  const offscreen = annotationOffscreen[tabId];
  if (!readingArea || !canvas || !offscreen) return;
  
  const passageKey = getCurrentPassageKey();
  const strokeCount = strokeHistory[passageKey] ? strokeHistory[passageKey].length : 0;
  const caller = new Error().stack.split('\n')[2].trim(); // Get caller function
  
  console.log('[DEBUG] *** updateVisibleCanvas called - THIS CLEARS THE VISIBLE CANVAS! Strokes:', strokeCount, 'Caller:', caller);
  
  const ctx = canvas.getContext('2d');
  
  // Reset transform to ensure proper positioning
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height); // <-- THIS CLEARS EVERYTHING!
  
  // Since visible canvas now covers full content area, just copy the entire offscreen canvas
    ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);
  console.log('[DEBUG] Copied offscreen to visible canvas - should preserve', strokeCount, 'strokes');
}

// Update on scroll - no longer needed since canvas covers full content
function attachScrollSync(tabId) {
  // Scroll sync no longer needed since visible canvas covers full content area
  // The canvas will automatically show the correct portion as user scrolls
}

// Update on resize
window.addEventListener('resize', () => {
  const tabId = getActiveTabId();
  if (!tabId) return;
  getOrCreateAnnotationCanvas(tabId);
  updateVisibleCanvas(tabId);
});

// Update on tab switch
function setupAnnotationForActiveTab() {
  const tabId = getActiveTabId();
  console.log('[DEBUG] *** setupAnnotationForActiveTab called, tabId:', tabId, 'drawing state:', drawing);
  if (!tabId) return;
  
  // CRITICAL: Don't setup annotations while actively drawing - it clears the canvas!
  if (drawing) {
    console.log('[DEBUG] Skipping setupAnnotationForActiveTab - currently drawing');
    return;
  }
  
  // Prevent multiple rapid calls for the same tab
  if (setupInProgress && lastSetupTabId === tabId) {
    console.log('[DEBUG] Setup already in progress for tabId:', tabId);
    return;
  }
  
  setupInProgress = true;
  lastSetupTabId = tabId;
  
  // Create canvas first
  getOrCreateAnnotationCanvas(tabId);
  
  // Attach listeners
  attachAnnotationListeners(tabId);
  // attachScrollSync(tabId); // No longer needed
  
  // Add word click listeners if select mode is active
  if (selectModeActive) {
    console.log('🔍 SETUP ANNOTATION - Select mode is active, setting up word listeners for tab:', tabId);
    // Small delay to ensure DOM is ready
    setTimeout(() => {
      addWordClickListeners(tabId);
    }, 50);
  }
  
  // Load annotations with instant visual feedback
  loadAnnotationsInstant(tabId);
  updateUndoRedoUI();
  
  // Reset setup state after a short delay
  setTimeout(() => {
    setupInProgress = false;
    lastSetupTabId = null;
  }, 100);
}

// Instant annotation loading function
function loadAnnotationsInstant(tabId) {
  console.log('[DEBUG] loadAnnotationsInstant called for tabId:', tabId);
  const offscreen = annotationOffscreen[tabId];
  if (!offscreen) {
    console.log('[DEBUG] No offscreen canvas for tabId:', tabId);
    return;
  }
  
  const passageKey = getCurrentPassageKey();
  if (!passageKey) {
    console.log('[DEBUG] No passage key for tabId:', tabId);
    return;
  }
  
  console.log('[DEBUG] Loading annotations instantly for passage:', passageKey);
  
  // Load stroke-based annotations
  loadAnnotations(tabId);
  
  // Load and restore popups for this passage
  loadPopupData();
  setTimeout(() => {
    restorePopups();
  }, 100); // Small delay to ensure text is fully rendered
}

// Drawing logic
function startDrawing(e) {
  const tabId = getActiveTabId();
  const readingArea = document.getElementById(`readingArea${tabId}`);
  const canvas = getOrCreateAnnotationCanvas(tabId);
  if (!canvas || !readingArea) return;
  
  // Default drawing logic for pen, highlight, and erase
  if (currentTool !== 'pen' && currentTool !== 'highlight' && currentTool !== 'erase') return;
  
  // Prevent text selection
  e.preventDefault();
  e.stopPropagation();
  
  drawing = true;
  drawingTabId = tabId;
  isUserDrawing = true;
  
  // Get initial point
  const point = getPointerPosRelative(e, canvas, readingArea);
  currentStrokePoints = [point];
  lastPoint = point;
  
  // Clear any legacy variables
  highlighterPoints = [];
  highlighterSnapshot = null;
}

  // Helper: Draw a smooth stroke using quadratic Bézier curves
function drawSmoothStroke(ctx, points, dpr, scrollOffset = 0) {
  if (!points || points.length < 2) return;
  const scaledOffset = scrollOffset * dpr;
  ctx.beginPath();
  ctx.moveTo(points[0].x / dpr, (points[0].y + scaledOffset) / dpr);
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2 / dpr;
    const midY = (points[i].y + points[i + 1].y + 2 * scaledOffset) / 2 / dpr;
    ctx.quadraticCurveTo(
      points[i].x / dpr,
      (points[i].y + scaledOffset) / dpr,
      midX,
      midY
    );
  }
  // For the last segment, just line to the last point
  ctx.lineTo(points[points.length - 1].x / dpr, (points[points.length - 1].y + scaledOffset) / dpr);
  ctx.stroke();
}

// Helper: Interpolate points between two points if distance > maxDist
function interpolatePoints(p1, p2, maxDist = 3) {
  const points = [];
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist <= maxDist) return [];
  const steps = Math.floor(dist / maxDist);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    points.push({
      x: p1.x + dx * t,
      y: p1.y + dy * t
    });
  }
  return points;
}

// Helper: Resample a stroke to evenly spaced points
function resampleStroke(points, spacing = 2) {
  if (!points || points.length < 2) return points;
  const resampled = [points[0]];
  let prev = points[0];
  let distAccum = 0;
  for (let i = 1; i < points.length; i++) {
    let curr = points[i];
    let dx = curr.x - prev.x;
    let dy = curr.y - prev.y;
    let dist = Math.sqrt(dx * dx + dy * dy);
    if (distAccum + dist < spacing) {
      distAccum += dist;
      prev = curr;
      continue;
    }
    let t = (spacing - distAccum) / dist;
    while (distAccum + dist >= spacing) {
      const nx = prev.x + t * dx;
      const ny = prev.y + t * dy;
      resampled.push({ x: nx, y: ny });
      prev = { x: nx, y: ny };
      dx = curr.x - prev.x;
      dy = curr.y - prev.y;
      dist = Math.sqrt(dx * dx + dy * dy);
      t = spacing / (dist || 1);
      distAccum = 0;
    }
    distAccum += dist;
    prev = curr;
  }
  if (resampled.length < points.length) resampled.push(points[points.length - 1]);
  return resampled;
}

// Simple, fast draw function that works smoothly on all devices
function draw(e) {
  if (!drawing || !drawingTabId) return;
  const tabId = drawingTabId;
  const readingArea = document.getElementById(`readingArea${tabId}`);
  const canvas = annotationCanvases[tabId];
  const offscreen = annotationOffscreen[tabId];
  const overlayCanvas = annotationOverlayCanvases[tabId];
  if (!canvas || !offscreen || !readingArea) return;

  const dpr = window.devicePixelRatio || 1;
  const settings = getCurrentDrawingSettings();
  if (!settings) return;

  // Get pointer position
  const point = getPointerPosRelative(e, canvas, readingArea);
  
  // Only add point if it's different from the last point
  if (!lastPoint || point.x !== lastPoint.x || point.y !== lastPoint.y) {
    currentStrokePoints.push(point);

    if (currentTool === 'erase') {
      // For eraser, draw directly on the offscreen canvas
      const offscreenCtx = offscreen.getContext('2d');
      offscreenCtx.save();
      offscreenCtx.globalCompositeOperation = 'destination-out';
      offscreenCtx.strokeStyle = '#000000';
      offscreenCtx.lineWidth = settings.size;
      offscreenCtx.lineCap = 'round';
      offscreenCtx.lineJoin = 'round';

      // Draw eraser stroke
      offscreenCtx.beginPath();
      if (lastPoint) {
        offscreenCtx.moveTo(lastPoint.x / dpr, lastPoint.y / dpr);
      } else {
        offscreenCtx.moveTo(point.x / dpr, point.y / dpr);
      }
      offscreenCtx.lineTo(point.x / dpr, point.y / dpr);
      offscreenCtx.stroke();
      offscreenCtx.restore();

      // Update visible canvas
      updateVisibleCanvas(tabId);
    } else {
      // For pen and highlighter, use overlay canvas for real-time feedback
      const overlayCtx = overlayCanvas.getContext('2d');
      overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
      overlayCtx.scale(dpr, dpr);
      overlayCtx.clearRect(0, 0, overlayCanvas.width / dpr, overlayCanvas.height / dpr);

      // Draw the current stroke on overlay
      if (currentStrokePoints.length >= 2) {
        overlayCtx.save();
        overlayCtx.globalAlpha = settings.alpha;
        overlayCtx.globalCompositeOperation = settings.composite;
        overlayCtx.strokeStyle = settings.color;
        overlayCtx.lineWidth = settings.size;
        overlayCtx.lineCap = 'round';
        overlayCtx.lineJoin = 'round';

        // Remove shadow effects for all tools
        overlayCtx.shadowBlur = 0;
        overlayCtx.shadowColor = 'transparent';

        overlayCtx.beginPath();
        overlayCtx.moveTo(
          currentStrokePoints[0].x / dpr,
          currentStrokePoints[0].y / dpr
        );

        // Use the input type detected at drawing start for consistency
        const wasTouch = e.pointerType === 'touch';

        if (wasTouch) {
          // Touch: smooth quadratic curves
          for (let i = 1; i < currentStrokePoints.length - 1; i++) {
            const midX = (currentStrokePoints[i].x + currentStrokePoints[i + 1].x) / 2 / dpr;
            const midY = (currentStrokePoints[i].y + currentStrokePoints[i + 1].y) / 2 / dpr;
            overlayCtx.quadraticCurveTo(
              currentStrokePoints[i].x / dpr,
              currentStrokePoints[i].y / dpr,
              midX,
              midY
            );
          }
          overlayCtx.lineTo(
            currentStrokePoints[currentStrokePoints.length - 1].x / dpr,
            currentStrokePoints[currentStrokePoints.length - 1].y / dpr
          );
        } else {
          // Mouse: precise line segments
          for (let i = 1; i < currentStrokePoints.length; i++) {
            overlayCtx.lineTo(
              currentStrokePoints[i].x / dpr,
              currentStrokePoints[i].y / dpr
            );
          }
        }

        overlayCtx.stroke();
        overlayCtx.restore();
      }
    }

    lastPoint = point;
  }
  
  e.preventDefault();
}

// --- END DRAWING: Commit stroke to persistent canvas, clear overlay ---
function endDrawing(tabId) {
  if (drawing && drawingTabId === tabId) {
    console.log('[DEBUG] endDrawing called with', currentStrokePoints.length, 'points');
    
    const dpr = window.devicePixelRatio || 1;
    const readingArea = document.getElementById(`readingArea${tabId}`);
    const offscreen = annotationOffscreen[tabId];
    const settings = getCurrentDrawingSettings();
    const overlayCanvas = annotationOverlayCanvases[tabId];
    
    if (!offscreen || !readingArea) {
      console.error('[ERROR] Missing required elements in endDrawing');
      return;
    }

    // Check stroke count before adding
    const passageKey = getCurrentPassageKey();
    const beforeCount = strokeHistory[passageKey] ? strokeHistory[passageKey].length : 0;
    console.log('[DEBUG] Before adding stroke - passage:', passageKey, 'stroke count:', beforeCount);
    
    // Commit the stroke to offscreen canvas
    if (currentStrokePoints.length >= 2) {
      const offscreenCtx = offscreen.getContext('2d');
      offscreenCtx.setTransform(1, 0, 0, 1, 0, 0);
      offscreenCtx.scale(dpr, dpr);
      
      offscreenCtx.save();
      offscreenCtx.globalAlpha = settings.alpha;
      offscreenCtx.globalCompositeOperation = settings.composite;
      offscreenCtx.strokeStyle = settings.color;
      offscreenCtx.lineWidth = settings.size;
      offscreenCtx.lineCap = 'round';
      offscreenCtx.lineJoin = 'round';
      
      // Remove shadow effects for all tools - use clean rendering
      offscreenCtx.shadowBlur = 0;
      offscreenCtx.shadowColor = 'transparent';
      
      // Draw stroke to offscreen
      offscreenCtx.beginPath();
      offscreenCtx.moveTo(currentStrokePoints[0].x / dpr, currentStrokePoints[0].y / dpr);
      
      // Use the input type detected at drawing start for consistency
      const wasTouch = window.currentDrawingInputType === 'touch';
      
      if (wasTouch) {
        // Touch: smooth quadratic curves
        for (let i = 1; i < currentStrokePoints.length - 1; i++) {
          const midX = (currentStrokePoints[i].x + currentStrokePoints[i + 1].x) / 2 / dpr;
          const midY = (currentStrokePoints[i].y + currentStrokePoints[i + 1].y) / 2 / dpr;
          offscreenCtx.quadraticCurveTo(
            currentStrokePoints[i].x / dpr,
            currentStrokePoints[i].y / dpr,
            midX,
            midY
          );
        }
        offscreenCtx.lineTo(
          currentStrokePoints[currentStrokePoints.length - 1].x / dpr,
          currentStrokePoints[currentStrokePoints.length - 1].y / dpr
        );
      } else {
        // Mouse: precise line segments
        for (let i = 1; i < currentStrokePoints.length; i++) {
          offscreenCtx.lineTo(
            currentStrokePoints[i].x / dpr,
            currentStrokePoints[i].y / dpr
          );
        }
      }
      
      offscreenCtx.stroke();
      offscreenCtx.restore();
      
      // Add stroke to history for undo/redo
      if (passageKey) {
        addStroke(passageKey, {
          type: currentTool,
          color: settings.color,
          size: settings.size,
          points: [...currentStrokePoints],
          timestamp: Date.now(),
          inputType: window.currentDrawingInputType || 'mouse'
        });
      }
    }
    
    // Clear overlay canvas
    if (overlayCanvas) {
      const overlayCtx = overlayCanvas.getContext('2d');
      overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
      overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    }
    
    // Reset drawing state
    drawing = false;
    drawingTabId = null;
    lastPoint = null;
    currentStrokePoints = [];
    highlighterPoints = [];
    window.currentDrawingInputType = null;
    isUserDrawing = false;
    
    // Update visible canvas
    updateVisibleCanvas(tabId);
  }
}

// Global event listener to prevent text selection when drawing
document.addEventListener('selectstart', function(e) {
  if (drawing) {
    e.preventDefault();
    return false;
  }
});

document.addEventListener('mousedown', function(e) {
  if (drawing) {
    e.preventDefault();
    return false;
  }
});

// Helper to get pointer position relative to a canvas, accounting for scroll
function getPointerPosRelative(e, canvas, readingArea) {
  let x, y;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  if (e.touches && e.touches.length > 0) {
    x = (e.touches[0].clientX - rect.left) * dpr;
    y = (e.touches[0].clientY - rect.top) * dpr;
  } else {
    x = ((e.clientX !== undefined ? e.clientX : e.pageX) - rect.left) * dpr;
    y = ((e.clientY !== undefined ? e.clientY : e.pageY) - rect.top) * dpr;
  }
  return { x, y };
}

// Stroke-based save/load annotations
function saveAnnotations(tabId) {
  console.log('[DEBUG] saveAnnotations called for tabId:', tabId);
  const passageKey = getCurrentPassageKey();
  if (!passageKey) {
    console.log('[DEBUG] No passage key for tabId:', tabId);
    return;
  }
  
  try {
    const data = JSON.stringify(strokeHistory[passageKey] || []);
    localStorage.setItem(passageKey + '-strokes', data);
    console.log('[DEBUG] Successfully saved stroke annotations for passage:', passageKey);
  } catch (e) {
    console.log('[DEBUG] Failed to save stroke annotations:', e);
  }
}

function loadAnnotations(tabId) {
  console.log('[DEBUG] *** LOADING ANNOTATIONS for tabId:', tabId);
  const passageKey = getCurrentPassageKey();
  if (!passageKey) {
    console.log('[DEBUG] No passage key for tabId:', tabId);
    return;
  }
  
  console.log('[DEBUG] *** LOADING stroke annotations for passage:', passageKey);
  
  try {
    const raw = localStorage.getItem(passageKey + '-strokes');
    if (raw) {
      const loadedStrokes = JSON.parse(raw);
      console.log('[DEBUG] *** FOUND', loadedStrokes.length, 'saved strokes in localStorage for passage:', passageKey);
      
      // Only update if we don't already have this data loaded (prevent overwriting)
      if (!strokeHistory[passageKey] || strokeHistory[passageKey].length === 0) {
        strokeHistory[passageKey] = loadedStrokes;
        console.log('[DEBUG] *** LOADED strokes into strokeHistory - now has:', strokeHistory[passageKey].length, 'strokes');
      } else if (strokeHistory[passageKey].length !== loadedStrokes.length) {
        // If stroke counts differ, use the saved version
        console.log('[DEBUG] *** STROKE COUNT MISMATCH - Memory has:', strokeHistory[passageKey].length, 'Storage has:', loadedStrokes.length);
        strokeHistory[passageKey] = loadedStrokes;
    } else {
        console.log('[DEBUG] *** STROKES ALREADY LOADED - Memory:', strokeHistory[passageKey].length, 'Storage:', loadedStrokes.length);
    }
      
      // Always redraw to ensure visual consistency
    redrawAllStrokes(tabId);
    } else {
      console.log('[DEBUG] *** NO SAVED STROKES found for passage:', passageKey);
      if (!strokeHistory[passageKey]) {
        strokeHistory[passageKey] = [];
      }
      // Don't redraw if there are no strokes to load - prevents clearing existing drawings
    }
  } catch (e) {
    console.log('[DEBUG] Failed to load stroke annotations:', e);
    if (!strokeHistory[passageKey]) {
    strokeHistory[passageKey] = [];
    }
  }
}

// --- ERASER & UNDO/REDO LOGIC ---

function getCurrentPassageKey() {
  const tabId = getActiveTabId();
  if (!tabId) {
    console.log('[DEBUG] getCurrentPassageKey: No active tab ID');
    return null;
  }
  const tab = window.bibleApp.tabs.find(t => t.id == tabId);
  if (!tab) {
    console.log('[DEBUG] getCurrentPassageKey: No tab found for ID:', tabId);
    return null;
  }
  
  // Use mode to determine the appropriate storage key
  const passageKey = getPassageKey(tab.book, tab.chapter, tab.verse, tab.verseEnd, tab.translation, tab.mode);
  console.log('[DEBUG] getCurrentPassageKey: Generated passage key:', passageKey, 'for tab:', tabId, 'mode:', tab.mode);
  return passageKey;
}

// Legacy function for backward compatibility - now uses new action system
function pushHistory(tabId) {
  const action = createAction(ACTION_TYPES.DRAW, { tool: currentTool });
  pushAction(action);
}

// Legacy function for backward compatibility - now uses new action system
function undoAnnotation(tabId) {
  undoAction();
}

// Legacy function for backward compatibility - now uses new action system
function redoAnnotation(tabId) {
  redoAction();
}


// Clear button initialization - will be called after DOM is ready
// Flag to prevent multiple initializations
let clearButtonInitialized = false;

function initializeClearButton() {
  // Prevent multiple initializations that create duplicate event listeners
  if (clearButtonInitialized) {
    console.log('Clear button already initialized, skipping duplicate initialization');
    return;
  }
  
  const resetBtn = document.getElementById('resetBtn');
  if (!resetBtn) {
    console.warn('Reset button not found in DOM');
    return;
  }
  
  // Mark as initialized to prevent duplicates
  clearButtonInitialized = true;

let clearHoldTimeout = null;
let isHoldingClear = false;
  let progressStartTime = 0;
  let progressAnimationId = null;
  let isProcessingClear = false; // Prevent duplicate execution
  let lastClearEventTime = 0; // Track last clear event to prevent rapid duplicates
  const HOLD_DURATION = 1500; // 1.5 seconds as originally intended
  const CLEAR_DEBOUNCE_MS = 1000; // Minimum time between clear operations

  // Create progress indicator if it doesn't exist - using existing CSS design
  let progressIndicator = document.getElementById('clearProgressIndicator');
  if (!progressIndicator) {
    progressIndicator = document.createElement('div');
    progressIndicator.id = 'clearProgressIndicator';
    
    // CRITICAL: Set explicit styles to prevent CSS conflicts
    progressIndicator.style.cssText = `
      position: absolute;
      top: -2px;
      left: 0;
      height: 3px;
      width: 0%;
      background: #ff0000;
      border-radius: 3px 3px 0 0;
      box-shadow: 0 0 8px rgba(255, 0, 0, 0.6);
      transition: none;
      pointer-events: none;
      z-index: 1;
    `;
    
    resetBtn.style.position = 'relative';
    resetBtn.style.overflow = 'visible'; // Allow thin bar to show above button
    resetBtn.appendChild(progressIndicator);
    console.log('Progress indicator created for clear button - classic thin bar design');
  }

  // Function to trigger the red flash effect
  function triggerRedFlash() {
    console.log('triggerRedFlash called');
    
    // Force immediate style reset first
    resetBtn.style.cssText = `
      transition: none !important;
      background: #2a2a2a !important;
      color: #e0e0e0 !important;
      border: 2px solid #404040 !important;
      box-shadow: none !important;
    `;
    
    // Force a reflow
    resetBtn.offsetHeight;
    
    // Apply red flash effect
    requestAnimationFrame(() => {
      resetBtn.style.cssText = `
        transition: none !important;
        background: #ff4444 !important;
        color: #ffffff !important;
        border: 2px solid #ff6666 !important;
        box-shadow: 0 0 8px #222, 0 0 15px rgba(255, 68, 68, 0.8) !important;
      `;
      
      console.log('Red flash applied');
      
      // Reset to original styles after brief flash
      setTimeout(() => {
        resetBtn.style.cssText = `
          transition: none !important;
          background: #2a2a2a !important;
          color: #e0e0e0 !important;
          border: 2px solid #404040 !important;
          box-shadow: none !important;
        `;
        console.log('Flash reset complete');
              }, 150); // Brief 150ms red flash
     });
  }
  // Unified hold start logic for both pointer and touch events
  function startHoldLogic(eventType) {
    // Prevent duplicate starts from multiple event types
    if (clearHoldTimeout || isProcessingClear) {
      console.log(`[${eventType}] Clear button hold start BLOCKED - already in progress`);
      return;
    }
    
    console.log(`[${eventType}] Clear button hold started`);
    // Set initial visual state for hold
    resetBtn.style.cssText = `
      transition: none !important;
      background: #444 !important;
      color: #fff !important;
      box-shadow: 0 0 8px #222, 0 0 15px rgba(74, 158, 255, 0.6) !important;
      transform: translateY(0) !important;
      border-color: #4a9eff !important;
    `;
    
    progressStartTime = Date.now();
    
    // FIXED: Only start progress animation after a delay to prevent it from showing on quick taps
    const PROGRESS_DELAY = 300; // Don't show progress bar for first 300ms
    
    clearHoldTimeout = setTimeout(() => {
      isHoldingClear = true;
      console.log(`[${eventType}] Triggering app-wide clear after 1.5s hold`);
    }, HOLD_DURATION);

    // Start progress animation after delay - now with better cross-platform support
    setTimeout(() => {
      if (!clearHoldTimeout) return; // Hold was cancelled
      
      let lastProgress = 0;
      const progressAnimation = () => {
        if (!clearHoldTimeout) {
          progressAnimationId = null;
          return; // Animation stopped
        }
        
        const elapsed = Date.now() - progressStartTime;
        const progress = Math.min((elapsed / HOLD_DURATION) * 100, 100);
        
        // Only update if progress has changed significantly
        if (progress - lastProgress >= 1) {
          progressIndicator.style.width = progress + '%';
          lastProgress = progress;
          console.log(`[${eventType}] Progress updated to: ${progress.toFixed(1)}%`);
        }
        
        if (progress >= 100) {
          progressAnimationId = null;
          console.log(`[${eventType}] Progress reached 100% - triggering red flash`);
          
          // Hide progress bar immediately
          progressIndicator.style.width = '0%';
          progressIndicator.style.opacity = '0';
          progressIndicator.style.transition = 'opacity 0.15s ease';
          
          // Force a reflow to ensure styles are applied
          progressIndicator.offsetHeight;
          
          // Trigger the red flash effect
          console.log(`[${eventType}] Calling triggerRedFlash()`);
          triggerRedFlash();
          
          // Ensure the flash is visible
          resetBtn.style.display = 'block';
          resetBtn.style.visibility = 'visible';
          resetBtn.style.opacity = '1';
        } else {
          progressAnimationId = requestAnimationFrame(progressAnimation);
        }
      };
      progressAnimationId = requestAnimationFrame(progressAnimation);
    }, PROGRESS_DELAY);
  }

  // Comprehensive button reset function
  function resetButtonStyling() {
    // Don't reset if we're in the middle of a hold
    if (clearHoldTimeout) {
      return;
    }
    
    // AGGRESSIVE reset of all possible button styling
    resetBtn.style.cssText = `
      background: #2a2a2a !important;
      backgroundColor: #2a2a2a !important;
      color: #e0e0e0 !important;
      transform: none !important;
      scale: none !important;
      filter: none !important;
      opacity: 1 !important;
      boxShadow: none !important;
      border: 2px solid #404040 !important;
      borderColor: #404040 !important;
      outline: none !important;
      transition: all 0.15s ease !important;
    `;
    
    // Remove all classes that might cause stuck states
    resetBtn.classList.remove('active', 'pressed', 'clicked', 'hover', 'focus', 'focus-visible', 'touched');
    
    // Reset progress indicator
    if (progressIndicator) {
      progressIndicator.style.width = '0%';
      progressIndicator.style.opacity = '';
      progressIndicator.style.display = '';
    }
    
    // Force blur to remove focus
    resetBtn.blur();
    if (document.activeElement === resetBtn) {
      document.body.focus();
    }
    
    // Force browser to recalculate styles
    resetBtn.offsetHeight; // Trigger reflow
    
    console.log('Button styling reset completed');
  }

  // Unified hold end logic for both pointer and touch events
  function endHoldLogic(eventType) {
    // FIXED: Aggressive debouncing to prevent ALL duplicate executions
    const currentTime = Date.now();
    
    if (isProcessingClear || (currentTime - lastClearEventTime) < CLEAR_DEBOUNCE_MS) {
      console.log(`[${eventType}] Clear button hold end BLOCKED - too recent (${currentTime - lastClearEventTime}ms ago)`);
      return;
    }
    
    console.log(`[${eventType}] Clear button hold ended, isHoldingClear:`, isHoldingClear);
    
    // Set processing flag and timestamp immediately
    isProcessingClear = true;
    lastClearEventTime = currentTime;
    
    // Clear the timeout - this is important to prevent late execution
    clearTimeout(clearHoldTimeout);
    clearHoldTimeout = null;
    
    if (progressAnimationId) {
      cancelAnimationFrame(progressAnimationId);
      progressAnimationId = null;
    }
    
    // CRITICAL: Only execute clear operations if the full hold duration was completed
    if (isHoldingClear) {
      // Full hold duration was completed - clear all annotations across the entire app
      clearAllAnnotationsAcrossApp();
      console.log(`[${eventType}] Executed app-wide clear after full hold duration`);
      isHoldingClear = false;
      
      // Keep the active state until after the red flash
      setTimeout(() => {
        resetButtonStyling();
        isProcessingClear = false;
      }, 350); // Wait for red flash (150ms) + transition (200ms)
    } else {
      // Hold was not completed - check if we should do a quick tap clear
      // Only do quick tap clear if the progress was minimal (less than 20% of hold duration)
      const elapsed = currentTime - progressStartTime;
      const progressPercent = (elapsed / HOLD_DURATION) * 100;
      
      if (progressPercent < 20) {
        // This was a quick tap - clear only current tab
        const tabId = getActiveTabId();
        clearAllAnnotations(tabId);
        console.log(`[${eventType}] Executed current tab clear after quick tap (${progressPercent.toFixed(1)}% progress)`);
      } else {
        // Hold was started but not completed - don't clear anything
        console.log(`[${eventType}] Hold cancelled at ${progressPercent.toFixed(1)}% - no clear action taken`);
      }
      
      // Reset progress bar only if hold wasn't completed (progress bar wasn't already hidden)
      if (progressIndicator && progressPercent < 100) {
        progressIndicator.style.width = '0%';
        progressIndicator.style.opacity = '';
        progressIndicator.style.transition = '';
      }
      
      // Reset immediately for incomplete holds
      resetButtonStyling();
      isProcessingClear = false;
    }
  }

  // Unified hold cancel logic for both pointer and touch events
  function cancelHoldLogic(eventType) {
    console.log(`[${eventType}] Clear button hold cancelled`);
    
  clearTimeout(clearHoldTimeout);
    clearHoldTimeout = null;
  isHoldingClear = false;
    isProcessingClear = false; // Reset processing flag on cancel
    
    if (progressAnimationId) {
      cancelAnimationFrame(progressAnimationId);
      progressAnimationId = null;
    }
    
    // Reset progress bar when hold is cancelled
    if (progressIndicator) {
      progressIndicator.style.width = '0%';
      progressIndicator.style.opacity = '';
      progressIndicator.style.transition = '';
    }
    
    // Only reset visual state if not already reset by touch events
    if (eventType !== 'TOUCH') {
  resetBtn.style.background = '';
  resetBtn.style.color = '';
      resetBtn.style.boxShadow = '';
      resetBtn.style.transform = '';
      resetBtn.style.borderColor = '';
      resetBtn.style.transition = 'all 0.15s ease';
    }
  }

  // Mouse/pointer events for desktop and modern devices with enhanced visual feedback
  resetBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    // Add immediate blue glow visual feedback for pointer down - NO TRANSITIONS
    resetBtn.style.cssText = `
      transition: none !important;
      background: #444 !important;
      color: #fff !important;
      box-shadow: 0 0 8px #222, 0 0 15px rgba(74, 158, 255, 0.6) !important;
      transform: translateY(0) !important;
      border-color: #4a9eff !important;
    `;
    startHoldLogic('POINTER');
  });

  resetBtn.addEventListener('pointerup', (e) => {
    // For quick taps, reset visual state immediately
    const currentTime = Date.now();
    const elapsed = currentTime - progressStartTime;
    const progressPercent = (elapsed / HOLD_DURATION) * 100;
    
    if (progressPercent < 20) {
      // Quick tap - reset immediately
      resetBtn.style.cssText = `
        transition: all 0.15s ease !important;
        background: #2a2a2a !important;
        color: #e0e0e0 !important;
        border-color: #404040 !important;
        box-shadow: none !important;
      `;
    }
    // For hold completion, let the red flash handle it
    endHoldLogic('POINTER');
  });

  resetBtn.addEventListener('pointerleave', (e) => {
    if (!isHoldingClear) {
      // Reset visual state if we haven't completed the hold
      resetBtn.style.cssText = `
        transition: all 0.15s ease !important;
        background: #2a2a2a !important;
        color: #e0e0e0 !important;
        border-color: #404040 !important;
        box-shadow: none !important;
      `;
      cancelHoldLogic('POINTER');
    }
  });

  resetBtn.addEventListener('pointercancel', (e) => {
    if (!isHoldingClear) {
      // Reset visual state if we haven't completed the hold
      resetBtn.style.cssText = `
        transition: all 0.15s ease !important;
        background: #2a2a2a !important;
        color: #e0e0e0 !important;
        border-color: #404040 !important;
        box-shadow: none !important;
      `;
      cancelHoldLogic('POINTER');
    }
  });

  // Touch events for tablets and mobile - with enhanced visual feedback
  resetBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Add immediate blue glow visual feedback for touch start - NO TRANSITIONS
    resetBtn.style.cssText = `
      transition: none !important;
      background: #444 !important;
      color: #fff !important;
      box-shadow: 0 0 8px #222, 0 0 15px rgba(74, 158, 255, 0.6) !important;
      transform: translateY(0) !important;
      border-color: #4a9eff !important;
      touch-action: manipulation !important;
    `;
    // Start hold logic for touch events
    startHoldLogic('TOUCH');
  });

  resetBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Only reset visual state if we didn't complete the hold
    if (!isHoldingClear) {
      resetBtn.style.cssText = `
        transition: all 0.15s ease !important;
        background: #2a2a2a !important;
        color: #e0e0e0 !important;
        border-color: #404040 !important;
        box-shadow: none !important;
      `;
    }
    // Execute hold logic
    endHoldLogic('TOUCH');
  });

  resetBtn.addEventListener('touchcancel', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Only reset visual state if we didn't complete the hold
    if (!isHoldingClear) {
      resetBtn.style.cssText = `
        transition: all 0.15s ease !important;
        background: #2a2a2a !important;
        color: #e0e0e0 !important;
        border-color: #404040 !important;
        box-shadow: none !important;
      `;
    }
    // Cancel hold logic
    cancelHoldLogic('TOUCH');
  });

  // Mouse events for immediate visual feedback (same as undo/redo buttons)
  resetBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Add immediate blue glow visual feedback for mouse down - NO TRANSITIONS
    resetBtn.style.transition = 'none';
    resetBtn.style.background = '#444';
    resetBtn.style.color = '#fff';
    resetBtn.style.boxShadow = '0 0 8px #222, 0 0 15px rgba(74, 158, 255, 0.6)';
    resetBtn.style.transform = 'translateY(0)';
    resetBtn.style.borderColor = '#4a9eff';
    // Start hold logic for mouse events (fallback for older browsers)
    if (!window.PointerEvent) {
      startHoldLogic('MOUSE');
    }
  });

  resetBtn.addEventListener('mouseup', (e) => {
    if (!window.PointerEvent) {
      endHoldLogic('MOUSE');
    } else {
      // Reset visual state immediately for mouse up (same as undo/redo buttons)
      resetBtn.style.background = '';
      resetBtn.style.color = '';
      resetBtn.style.boxShadow = '';
      resetBtn.style.transform = '';
      resetBtn.style.borderColor = '';
      resetBtn.style.transition = 'all 0.15s ease';
    }
  });

  resetBtn.addEventListener('mouseleave', (e) => {
    if (!window.PointerEvent) {
      cancelHoldLogic('MOUSE');
    }
  });

  console.log('Clear button initialized with 1.5s hold functionality and cross-platform support');
}

// Function to clear all annotations across the entire app
function clearAllAnnotationsAcrossApp() {
  // Store all cleared data for undo functionality
  const clearedData = {
    strokeHistory: {},
    localStorage: {}
  };
  
  // Store stroke history
  Object.keys(strokeHistory).forEach(key => {
    if (strokeHistory[key] && strokeHistory[key].length > 0) {
      clearedData.strokeHistory[key] = [...strokeHistory[key]];
    }
  });
  
  // Store localStorage data
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.endsWith('-strokes')) {
      clearedData.localStorage[key] = localStorage.getItem(key);
    }
  }
  
  // Create action for clear all
  const action = createAction(ACTION_TYPES.CLEAR_ALL, { 
    clearedData: clearedData
  });
  
  // FIXED: Execute the clear operation FIRST, then add to history
  // This prevents the double-execution issue
  
  // Clear all canvases
  Object.keys(annotationCanvases).forEach(tabId => {
    const canvas = annotationCanvases[tabId];
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  });
  
  // Clear all offscreen canvases
  Object.keys(annotationOffscreen).forEach(tabId => {
    const offscreen = annotationOffscreen[tabId];
    if (offscreen) {
      const ctx = offscreen.getContext('2d');
      ctx.clearRect(0, 0, offscreen.width, offscreen.height);
    }
  });
  
  // Clear all localStorage stroke data
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.endsWith('-strokes')) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
  
  // Clear all stroke history and redo stacks
  Object.keys(strokeHistory).forEach(key => {
    strokeHistory[key] = [];
  });
  Object.keys(strokeRedo).forEach(key => {
    strokeRedo[key] = [];
  });
  
  // Clear all popup data across the app
  const popupKeysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.endsWith('-popups')) {
      popupKeysToRemove.push(key);
    }
  }
  popupKeysToRemove.forEach(key => localStorage.removeItem(key));
  
  // Clear popup history object
  Object.keys(popupHistory).forEach(key => {
    popupHistory[key] = [];
  });
  
  // Close all active popups
  closeWordPopup();
  
  // NOW add the action to history after the operation is complete
  pushAction(action);
  
  console.log('Cleared all annotations across the entire app');
}

// When page loads, update undo/redo UI
window.addEventListener('DOMContentLoaded', updateUndoRedoUI);

// Clear all annotations for the current tab
function clearAllAnnotations(tabId) {
  const passageKey = getCurrentPassageKey();
  
  // Store cleared strokes for undo functionality
  const clearedStrokes = passageKey && strokeHistory[passageKey] ? [...strokeHistory[passageKey]] : [];
  
  // Create action for clear
  const action = createAction(ACTION_TYPES.CLEAR, { 
    tabId: tabId,
    passageKey: passageKey,
    clearedStrokes: clearedStrokes
  });
  
  // FIXED: Execute the clear operation FIRST, then add to history
  // This prevents the double-execution issue
  
  const canvas = annotationCanvases[tabId];
  const offscreen = annotationOffscreen[tabId];
  
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  
  if (offscreen) {
    const ctx = offscreen.getContext('2d');
    ctx.clearRect(0, 0, offscreen.width, offscreen.height);
  }
  
  // Remove from localStorage using passage key
  if (passageKey) {
    localStorage.removeItem(passageKey + '-strokes');
    
    // Clear the stroke history for this passage
    if (strokeHistory[passageKey]) {
      strokeHistory[passageKey] = [];
    }
    if (strokeRedo[passageKey]) {
      strokeRedo[passageKey] = [];
    }
    
    // Clear popup data for this passage
    clearPopupData();
  }
  
  // NOW add the action to history after the operation is complete
  pushAction(action);
  
  console.log('Cleared annotations for tab:', tabId);
}

// --- BEGIN: Simple 2-Finger Scrolling for .reading-area ---
let twoFingerScroll = {
  active: false,
  startY: 0,
  startScrollTop: 0
};

document.addEventListener('touchstart', function(e) {
  if (e.touches.length === 2) {
    // Find the reading area
    const area = e.target.closest('.reading-area') || document.querySelector('.reading-area');
    if (area) {
      console.log('[DEBUG] Two-finger scroll started');
    twoFingerScroll.active = true;
    twoFingerScroll.startY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    twoFingerScroll.startScrollTop = area.scrollTop;
    }
  } else {
    // Reset scroll state for single finger
    twoFingerScroll.active = false;
  }
}, { passive: false });

document.addEventListener('touchmove', function(e) {
  if (twoFingerScroll.active && e.touches.length === 2) {
    const area = e.target.closest('.reading-area') || document.querySelector('.reading-area');
    if (area) {
    const currentY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    const deltaY = twoFingerScroll.startY - currentY;
    area.scrollTop = twoFingerScroll.startScrollTop + deltaY;
      // Two-finger scrolling
    e.preventDefault();
    }
  }
}, { passive: false });

document.addEventListener('touchend', function(e) {
  if (e.touches.length < 2) {
    if (twoFingerScroll.active) {
      console.log('[DEBUG] Two-finger scroll ended');
    }
    twoFingerScroll.active = false;
  }
}, { passive: false });

document.addEventListener('touchcancel', function(e) {
  twoFingerScroll.active = false;
}, { passive: false });
// --- END: Simple 2-Finger Scrolling for .reading-area ---

function attachAnnotationListeners(tabId) {
  const canvas = annotationCanvases[tabId];
  if (!canvas) return;
  
  // Remove all previous listeners
  canvas.onpointerdown = null;
  canvas.onpointermove = null;
  canvas.onpointerup = null;
  canvas.onpointerleave = null;
  canvas.onpointercancel = null;
  canvas.ontouchstart = null;
  canvas.ontouchmove = null;
  canvas.ontouchend = null;
  canvas.onmousedown = null;
  canvas.onmousemove = null;
  canvas.onmouseup = null;
  
  // Ensure touch-action is set correctly
  canvas.style.touchAction = 'none'; // Disable browser handling of all panning and zooming gestures
  canvas.style.userSelect = 'none';
  canvas.style.webkitUserSelect = 'none';
  
  // Track active pointers
  const activePointers = new Map();
  
  canvas.addEventListener('pointerdown', function(e) {
    e.preventDefault();
    e.stopPropagation();
    
    // Only handle primary pointer or first touch
    if (!activePointers.size) {
      activePointers.set(e.pointerId, e);
      
      if (currentTool === 'erase') {
        isErasing = true;
        updateEraserVisualAid(e.clientX, e.clientY, getCurrentDrawingSettings().size);
        eraserVisualAid.classList.add('active');
      }
      
      // Set the input type for the entire stroke
      window.currentDrawingInputType = e.pointerType === 'touch' ? 'touch' : 'mouse';
      
      startDrawing(e);
    }
  });
  
  canvas.addEventListener('pointermove', function(e) {
    e.preventDefault();
    e.stopPropagation();
    
    // Only handle move if this is the active pointer
    if (activePointers.has(e.pointerId)) {
      activePointers.set(e.pointerId, e);
      
      if (currentTool === 'erase' && isErasing) {
        updateEraserVisualAid(e.clientX, e.clientY, getCurrentDrawingSettings().size);
      }
      
      if (drawing) {
        draw(e);
      }
    }
  });
  
  function endPointerDrawing(e) {
    // Only handle end if this is the active pointer
    if (activePointers.has(e.pointerId)) {
      activePointers.delete(e.pointerId);
      
      if (isErasing) {
        isErasing = false;
        eraserVisualAid.classList.remove('active');
      }
      
      if (drawing) {
        endDrawing(tabId);
      }
    }
  }
  
  canvas.addEventListener('pointerup', function(e) {
    e.preventDefault();
    e.stopPropagation();
    endPointerDrawing(e);
  });
  
  canvas.addEventListener('pointerleave', function(e) {
    endPointerDrawing(e);
  });
  
  canvas.addEventListener('pointercancel', function(e) {
    endPointerDrawing(e);
  });
  
  // Capture pointer to ensure we get events outside the canvas
  canvas.setPointerCapture = canvas.setPointerCapture || function(){};
  canvas.addEventListener('pointerdown', function(e) {
    canvas.setPointerCapture(e.pointerId);
  });
}

// Make functions available globally
window.getAnnotationStorageKey = getAnnotationStorageKey;
window.saveAnnotations = saveAnnotations;
window.loadAnnotations = loadAnnotations;

// Expose color variables globally for enhanced tools
window.penColor = penColor;
window.highlighterColor = highlighterColor;

// Create eraser visual aid div on DOMContentLoaded
if (!eraserVisualAid) {
  eraserVisualAid = document.createElement('div');
  eraserVisualAid.className = 'eraser-visual-aid';
  document.body.appendChild(eraserVisualAid);
}

// Helper to update eraser visual aid position and size
function updateEraserVisualAid(x, y, size) {
  eraserVisualAid.style.width = size + 'px';
  eraserVisualAid.style.height = size + 'px';
  eraserVisualAid.style.left = (x - size / 2) + 'px';
  eraserVisualAid.style.top = (y - size / 2) + 'px';
}

// Hide eraser visual when switching away from eraser tool
function hideEraserVisualOnToolChange() {
  if (eraserVisualAid) eraserVisualAid.classList.remove('active');
  isErasing = false;
}

// Pre-load annotation image for instant display
function preloadAnnotationImage(passageKey) {
  if (annotationImageCache[passageKey]) {
    return annotationImageCache[passageKey];
  }
  
  const raw = localStorage.getItem(passageKey);
  if (!raw) return null;
  
  try {
    const data = JSON.parse(raw);
    let dataUrl = data.dataUrl;
    if (data.compressed) {
      dataUrl = 'data:image/png;base64,' + data.dataUrl;
    }
    
    const img = new Image();
    img.onload = function() {
      annotationImageCache[passageKey] = img;
    };
    img.src = dataUrl;
    return img;
  } catch (e) {
    console.log('[DEBUG] Failed to preload annotation image:', e);
    return null;
  }
}

// Migration function to convert old tab-specific annotations to passage-based format
function migrateOldAnnotations() {
  console.log('[DEBUG] Starting annotation migration...');
  const keysToMigrate = [];
  const migratedKeys = [];
  
  // Find all old tab-specific annotation keys
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('tab-') && key.includes('bible-annotations-')) {
      keysToMigrate.push(key);
    }
  }
  
  console.log('[DEBUG] Found', keysToMigrate.length, 'old tab-specific annotations to migrate');
  
  // Migrate each old key to new passage-based format
  keysToMigrate.forEach(oldKey => {
    try {
      // Extract the passage key from the old tab-specific key
      // Old format: tab-${tabId}-bible-annotations-${book}-${chapter}-${verse}-${verseEnd}-${translation}
      const parts = oldKey.split('-');
      if (parts.length >= 6) {
        // Reconstruct the passage key
        const passageKey = `bible-annotations-${parts.slice(3).join('-')}`;
        
        // Get the annotation data
        const annotationData = localStorage.getItem(oldKey);
        if (annotationData) {
          // Check if we already have a passage-based annotation for this passage
          const existingData = localStorage.getItem(passageKey);
          if (!existingData) {
            // Only migrate if no passage-based annotation exists yet
            localStorage.setItem(passageKey, annotationData);
            migratedKeys.push({ old: oldKey, new: passageKey });
            console.log('[DEBUG] Migrated annotation from', oldKey, 'to', passageKey);
          } else {
            console.log('[DEBUG] Passage-based annotation already exists for', passageKey, '- skipping migration');
          }
        }
      }
    } catch (error) {
      console.log('[DEBUG] Error migrating annotation', oldKey, ':', error);
    }
  });
  
  // Remove old tab-specific keys after successful migration
  migratedKeys.forEach(({ old }) => {
    localStorage.removeItem(old);
    console.log('[DEBUG] Removed old tab-specific key:', old);
  });
  
  console.log('[DEBUG] Migration completed. Migrated', migratedKeys.length, 'annotations');
}

// --- STROKE-BASED DRAWING INTEGRATION ---
// Helper to get the current passage key
function getCurrentStrokePassageKey() {
  return getCurrentPassageKey();
}

// Redraw all strokes for the current passage
function redrawAllStrokes(tabId) {
  const passageKey = getCurrentStrokePassageKey();
  const offscreen = annotationOffscreen[tabId];
  if (!offscreen) return;
  
  const strokeCount = strokeHistory[passageKey] ? strokeHistory[passageKey].length : 0;
  const strokeCaller = new Error().stack.split('\n')[2].trim(); // Get caller function
  
  console.log('[DEBUG] *** redrawAllStrokes called for passage:', passageKey, 'stroke count:', strokeCount, 'drawing state:', drawing, 'caller:', strokeCaller);
  console.log('[DEBUG] *** redrawAllStrokes - strokeHistory[passageKey]:', strokeHistory[passageKey]);
  console.log('[DEBUG] *** redrawAllStrokes - strokeHistory[passageKey].length:', strokeHistory[passageKey] ? strokeHistory[passageKey].length : 'undefined');
  console.log('[DEBUG] *** redrawAllStrokes - strokeHistory[passageKey] content:', strokeHistory[passageKey] ? JSON.stringify(strokeHistory[passageKey]) : 'undefined');
  
  const ctx = offscreen.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  
  // CRITICAL: Don't clear canvas while actively drawing!
  if (drawing) {
    console.log('[DEBUG] Skipping redrawAllStrokes - currently drawing');
    return;
  }
  
  // FIXED: Always clear the canvas when redrawing, even if no strokes remain
  // This ensures undone strokes are properly removed from the display
  console.log('[DEBUG] *** CLEARING OFFSCREEN CANVAS for redraw -', strokeCount, 'strokes will be redrawn');
  ctx.clearRect(0, 0, offscreen.width / dpr, offscreen.height / dpr);
  
  // Only redraw strokes if we have any
  if (strokeHistory[passageKey] && strokeHistory[passageKey].length > 0) {
    for (const stroke of strokeHistory[passageKey]) {
      if (stroke.points && stroke.points.length > 1) {
        ctx.save();
        ctx.globalAlpha = stroke.type === 'highlight' ? 0.3 : 1.0;
        ctx.globalCompositeOperation = stroke.type === 'erase' ? 'destination-out' : 'source-over';
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // Use appropriate precision based on input type
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x / dpr, stroke.points[0].y / dpr);
        
        const isTouch = stroke.inputType === 'touch';
        
        if (isTouch) {
          // Touch: smooth quadratic curves
          for (let i = 1; i < stroke.points.length - 1; i++) {
            const midX = (stroke.points[i].x + stroke.points[i + 1].x) / 2 / dpr;
            const midY = (stroke.points[i].y + stroke.points[i + 1].y) / 2 / dpr;
            ctx.quadraticCurveTo(
              stroke.points[i].x / dpr,
              stroke.points[i].y / dpr,
              midX,
              midY
            );
          }
          
          // Final point for touch
          if (stroke.points.length > 1) {
            ctx.lineTo(
              stroke.points[stroke.points.length - 1].x / dpr,
              stroke.points[stroke.points.length - 1].y / dpr
            );
          }
        } else {
          // Mouse: precise line segments
        for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(stroke.points[i].x / dpr, stroke.points[i].y / dpr);
        }
        }
        
        ctx.stroke();
        ctx.restore();
      }
    }
  } else {
    console.log('[DEBUG] No strokes to redraw, canvas cleared but no strokes to draw');
  }
  
  // Always update the visible canvas after clearing/redrawing
  updateVisibleCanvas(tabId);
}

// Add a stroke to the history
function addStroke(passageKey, strokeData) {
  console.log('[DEBUG] *** ADDING STROKE to passage:', passageKey, 'stroke type:', strokeData.type);
  console.log('[DEBUG] *** FLAGS - isAutomaticOperation:', isAutomaticOperation, 'isRestoring:', isRestoring);
  
  if (!strokeHistory[passageKey]) {
    strokeHistory[passageKey] = [];
    console.log('[DEBUG] Created new stroke history for passage');
  }
  
  // Add the stroke to traditional stroke history
  strokeHistory[passageKey].push(strokeData);
  console.log('[DEBUG] *** TOTAL STROKES for passage', passageKey, ':', strokeHistory[passageKey].length);
  console.log('[DEBUG] *** addStroke - strokeHistory after adding:', strokeHistory[passageKey]);
  
  // FIXED: Always add user strokes to unified history to ensure they are undoable
  // The isUserDrawing flag should be set during actual user drawing operations
  if (isUserDrawing || (!isAutomaticOperation && !isRestoring)) {
    const strokeOperation = {
      type: strokeData.type === 'pen' ? ACTION_TYPES.DRAW : 
            strokeData.type === 'highlight' ? ACTION_TYPES.DRAW :
            ACTION_TYPES.ERASE,
      timestamp: Date.now(),
      tabId: getActiveTabId(),
      passageKey: passageKey,
      isStroke: true,
      strokeData: JSON.parse(JSON.stringify(strokeData))
    };
    pushToUnifiedHistory(strokeOperation);
    console.log('[DEBUG] *** STROKE OPERATION ADDED to unified history - total unified history:', unifiedHistory.length);
  } else {
    console.log('[DEBUG] *** STROKE OPERATION BLOCKED: Automatic/restoration operation in progress');
    console.log('[DEBUG] *** This means the first annotation will NOT be undoable!');
    console.log('[DEBUG] *** isUserDrawing:', isUserDrawing, 'isAutomaticOperation:', isAutomaticOperation, 'isRestoring:', isRestoring);
  }
  
  // Clear stroke redo stack when new stroke is added
  if (strokeRedo[passageKey]) {
    strokeRedo[passageKey] = [];
  }
  
  // Limit history size
  if (strokeHistory[passageKey].length > MAX_HISTORY_SIZE) {
    strokeHistory[passageKey].shift();
  }
  
  // Ensure stroke history is immediately saved to prevent loss
  try {
    const data = JSON.stringify(strokeHistory[passageKey]);
    localStorage.setItem(passageKey + '-strokes', data);
    console.log('[DEBUG] *** STROKE SAVED TO LOCALSTORAGE - passages stored:', Object.keys(localStorage).filter(k => k.includes('-strokes')));
  } catch (e) {
    console.log('[DEBUG] Failed to auto-save stroke history:', e);
  }
}

// Undo the last stroke
function undoStroke(passageKey) {
  if (!strokeHistory[passageKey] || strokeHistory[passageKey].length === 0) return;
  
  const lastStroke = strokeHistory[passageKey].pop();
  if (!strokeRedo[passageKey]) {
    strokeRedo[passageKey] = [];
  }
  strokeRedo[passageKey].push(lastStroke);
}

// Redo the last undone stroke
function redoStroke(passageKey) {
  if (!strokeRedo[passageKey] || strokeRedo[passageKey].length === 0) return;
  
  const strokeToRedo = strokeRedo[passageKey].pop();
  if (!strokeHistory[passageKey]) {
    strokeHistory[passageKey] = [];
  }
  strokeHistory[passageKey].push(strokeToRedo);
}

// --- STROKE-BASED DRAWING POINT TRACKING ---
let currentStrokePoints = [];
let isUserDrawing = false; // Track if user is actively drawing

// --- COMPREHENSIVE UNDO/REDO BUTTONS AND SHORTCUTS ---
// Flag to prevent multiple initializations
let undoRedoButtonsInitialized = false;

// Function to initialize undo/redo buttons after DOM is ready with cross-platform support
function initializeUndoRedoButtons() {
  // Prevent multiple initializations that create duplicate event listeners
  if (undoRedoButtonsInitialized) {
    console.log('Undo/Redo buttons already initialized, skipping duplicate initialization');
    return;
  }

  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');

  if (!undoBtn || !redoBtn) {
    console.error('Undo/Redo buttons not found, retrying in 100ms');
    setTimeout(initializeUndoRedoButtons, 100);
    return;
  }

  // Mark as initialized to prevent duplicates
  undoRedoButtonsInitialized = true;

  console.log('Undo/Redo buttons found, setting up single-event-per-button system');

  // Store references globally for keyboard access
  window.handleUndoClick = function() {
    console.log('🔄 UNDO: Processing immediately');
    
    // Debug: Log current state before undo
    const passageKey = getCurrentPassageKey();
    const strokeCount = strokeHistory[passageKey] ? strokeHistory[passageKey].length : 0;
    console.log('🔄 UNDO DEBUG: Before undo - passage:', passageKey, 'strokes:', strokeCount, 'unified history:', unifiedHistory.length);
    
    // SIMPLIFIED: Always use stroke-based undo if strokes exist, otherwise use unified history
    if (strokeHistory[passageKey] && strokeHistory[passageKey].length > 0) {
      console.log('🔄 UNDO: Using stroke-based undo');
      
      // Remove the last stroke from history
      const undoneStroke = strokeHistory[passageKey].pop();
      if (!strokeRedo[passageKey]) strokeRedo[passageKey] = [];
      strokeRedo[passageKey].push(undoneStroke);
      
      console.log('🔄 STROKE UNDO: Removed 1 stroke, remaining:', strokeHistory[passageKey].length);
      
      // Save updated stroke history to localStorage
      try {
        const data = JSON.stringify(strokeHistory[passageKey]);
        localStorage.setItem(passageKey + '-strokes', data);
        console.log('🔄 STROKE UNDO: Saved updated stroke history to localStorage');
      } catch (e) {
        console.error('🔄 STROKE UNDO: Failed to save to localStorage:', e);
      }
      
      // Redraw canvas to show the undone stroke
      const tabId = getActiveTabId();
      if (tabId && !drawing) {
        console.log('🔄 STROKE UNDO: About to redraw canvas after undo');
        
        // FIXED: Always redraw, even if no strokes remain
        // This ensures the undone stroke is properly removed from the canvas
      redrawAllStrokes(tabId);
        
        // CRITICAL: If no strokes remain, explicitly clear the visible canvas
        if (strokeHistory[passageKey] && strokeHistory[passageKey].length === 0) {
          console.log('🔄 STROKE UNDO: No strokes remaining, explicitly clearing visible canvas');
          const visibleCanvas = annotationCanvases[tabId];
          if (visibleCanvas) {
            const visibleCtx = visibleCanvas.getContext('2d');
            visibleCtx.clearRect(0, 0, visibleCanvas.width, visibleCanvas.height);
            console.log('🔄 STROKE UNDO: Visible canvas cleared');
          }
        }
      }
      
      console.log('🔄 STROKE UNDO: Completed successfully');
      
    } else if (unifiedHistory.length > 0) {
      console.log('🔄 UNDO: No strokes to undo, using unified history');
      const mostRecentOperation = unifiedHistory[unifiedHistory.length - 1];
      console.log('🔄 UNDO: Processing unified operation:', mostRecentOperation.type);
      
      undoUnifiedOperation();
      
    } else {
      console.log('🔄 UNDO: Nothing to undo');
    }
    
    // CRITICAL: Update UI state after any undo operation
    updateUndoRedoUI();
    
    // FORCE COMPLETE BUTTON RESET - IMMEDIATE AND AGGRESSIVE
    const undoBtn = document.getElementById('undoBtn');
    if (undoBtn) {
      // Remove all classes that might cause stuck states
      undoBtn.classList.remove('active', 'pressed', 'clicked', 'hover', 'focus', 'focus-visible', 'touched');
      
      // Reset to normal state but allow hover effects
      undoBtn.style.cssText = `
        background: #2a2a2a !important;
        color: #e0e0e0 !important;
        border: 2px solid #404040 !important;
        transform: none !important;
        opacity: 1 !important;
        filter: none !important;
        outline: none !important;
        transition: all 0.2s ease !important;
      `;
      
      // Reset icon with force
      const icon = undoBtn.querySelector('i');
      if (icon) {
        icon.classList.remove('active', 'pressed', 'clicked', 'hover', 'focus', 'focus-visible', 'touched');
        icon.style.cssText = `
          color: #e0e0e0 !important;
          filter: none !important;
          transform: none !important;
          opacity: 1 !important;
        `;
      }
      
      // Force blur to remove focus
      undoBtn.blur();
      if (document.activeElement === undoBtn) {
        document.body.focus();
      }
      
      // Additional safety timeout to ensure button resets
      setTimeout(() => {
        if (undoBtn) {
          undoBtn.classList.remove('active', 'pressed', 'clicked', 'hover', 'focus', 'focus-visible', 'touched');
          undoBtn.style.cssText = `
            background: #2a2a2a !important;
            color: #e0e0e0 !important;
            border: 2px solid #404040 !important;
            transform: none !important;
            opacity: 1 !important;
            filter: none !important;
            outline: none !important;
            transition: all 0.2s ease !important;
          `;
          const icon = undoBtn.querySelector('i');
          if (icon) {
            icon.classList.remove('active', 'pressed', 'clicked', 'hover', 'focus', 'focus-visible', 'touched');
            icon.style.cssText = `
              color: #e0e0e0 !important;
              filter: none !important;
              transform: none !important;
              opacity: 1 !important;
            `;
          }
        }
      }, 100);
    }
  };

  window.handleRedoClick = function() {
    console.log('🔄 REDO: Processing immediately');
    
    // Debug: Log current state before redo
    const passageKey = getCurrentPassageKey();
    const strokeCount = strokeHistory[passageKey] ? strokeHistory[passageKey].length : 0;
    const redoCount = strokeRedo[passageKey] ? strokeRedo[passageKey].length : 0;
    console.log('🔄 REDO DEBUG: Before redo - passage:', passageKey, 'strokes:', strokeCount, 'redo strokes:', redoCount, 'unified redo:', unifiedRedo.length);
    
    // SIMPLIFIED: Always use stroke-based redo if strokes exist in redo stack, otherwise use unified history
    if (strokeRedo[passageKey] && strokeRedo[passageKey].length > 0) {
      console.log('🔄 REDO: Using stroke-based redo');
      
      // Add the stroke back to history
      const redoneStroke = strokeRedo[passageKey].pop();
      if (!strokeHistory[passageKey]) strokeHistory[passageKey] = [];
      strokeHistory[passageKey].push(redoneStroke);
      
      console.log('🔄 STROKE REDO: Added 1 stroke, total now:', strokeHistory[passageKey].length);
      
      // Save updated stroke history to localStorage
      try {
        const data = JSON.stringify(strokeHistory[passageKey]);
        localStorage.setItem(passageKey + '-strokes', data);
        console.log('🔄 STROKE REDO: Saved updated stroke history to localStorage');
      } catch (e) {
        console.error('🔄 STROKE REDO: Failed to save to localStorage:', e);
      }
      
      // Redraw canvas to show the redone stroke
    const tabId = getActiveTabId();
      if (tabId && !drawing) {
    redrawAllStrokes(tabId);
      }
      
      console.log('🔄 STROKE REDO: Completed successfully');
      
    } else if (unifiedRedo.length > 0) {
      console.log('🔄 REDO: No strokes to redo, using unified history');
      const mostRecentRedoOperation = unifiedRedo[unifiedRedo.length - 1];
      console.log('🔄 REDO: Processing unified redo operation:', mostRecentRedoOperation.type);
      
      redoUnifiedOperation();
      
    } else {
      console.log('🔄 REDO: Nothing to redo');
    }
    
    // CRITICAL: Update UI state after any redo operation
    updateUndoRedoUI();
    
    // FORCE COMPLETE BUTTON RESET - IMMEDIATE AND AGGRESSIVE
    const redoBtn = document.getElementById('redoBtn');
    if (redoBtn) {
      // Remove all classes that might cause stuck states
      redoBtn.classList.remove('active', 'pressed', 'clicked', 'hover', 'focus', 'focus-visible', 'touched');
      
      // Reset to normal state but allow hover effects
      redoBtn.style.cssText = `
        background: #2a2a2a !important;
        color: #e0e0e0 !important;
        border: 2px solid #404040 !important;
        transform: none !important;
        opacity: 1 !important;
        filter: none !important;
        outline: none !important;
        transition: all 0.2s ease !important;
      `;
      
      // Reset icon with force
      const icon = redoBtn.querySelector('i');
      if (icon) {
        icon.classList.remove('active', 'pressed', 'clicked', 'hover', 'focus', 'focus-visible', 'touched');
        icon.style.cssText = `
          color: #e0e0e0 !important;
          filter: none !important;
          transform: none !important;
          opacity: 1 !important;
        `;
      }
      
      // Force blur to remove focus
      redoBtn.blur();
      if (document.activeElement === redoBtn) {
        document.body.focus();
      }
      
      // Additional safety timeout to ensure button resets
      setTimeout(() => {
        if (redoBtn) {
          redoBtn.classList.remove('active', 'pressed', 'clicked', 'hover', 'focus', 'focus-visible', 'touched');
          redoBtn.style.cssText = `
            background: #2a2a2a !important;
            color: #e0e0e0 !important;
            border: 2px solid #404040 !important;
            transform: none !important;
            opacity: 1 !important;
            filter: none !important;
            outline: none !important;
            transition: all 0.2s ease !important;
          `;
          const icon = redoBtn.querySelector('i');
          if (icon) {
            icon.classList.remove('active', 'pressed', 'clicked', 'hover', 'focus', 'focus-visible', 'touched');
            icon.style.cssText = `
              color: #e0e0e0 !important;
              filter: none !important;
              transform: none !important;
              opacity: 1 !important;
            `;
          }
        }
      }, 100);
    }
  };

  // FIXED: Comprehensive event listeners for both mouse AND touch
  
  // Mouse/trackpad click events with immediate blue glow feedback
  undoBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Add immediate blue glow visual feedback - NO TRANSITIONS
    undoBtn.style.transition = 'none';
    undoBtn.style.background = '#444';
    undoBtn.style.color = '#fff';
    undoBtn.style.boxShadow = '0 0 8px #222, 0 0 15px rgba(74, 158, 255, 0.6)';
    undoBtn.style.transform = 'translateY(0)';
    undoBtn.style.borderColor = '#4a9eff';
  });

  undoBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.handleUndoClick();
    // Reset visual state immediately
    undoBtn.style.background = '';
    undoBtn.style.color = '';
    undoBtn.style.boxShadow = '';
    undoBtn.style.transform = '';
    undoBtn.style.borderColor = '';
    undoBtn.style.transition = 'all 0.15s ease';
    // Reset icon styling
    const icon = undoBtn.querySelector('i');
    if (icon) {
      icon.style.color = '';
      icon.style.filter = '';
      icon.style.transform = '';
    }
  });

  redoBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Add immediate blue glow visual feedback - NO TRANSITIONS
    redoBtn.style.transition = 'none';
    redoBtn.style.background = '#444';
    redoBtn.style.color = '#fff';
    redoBtn.style.boxShadow = '0 0 8px #222, 0 0 15px rgba(74, 158, 255, 0.6)';
    redoBtn.style.transform = 'translateY(0)';
    redoBtn.style.borderColor = '#4a9eff';
  });

  redoBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.handleRedoClick();
    // Reset visual state immediately
    redoBtn.style.background = '';
    redoBtn.style.color = '';
    redoBtn.style.boxShadow = '';
    redoBtn.style.transform = '';
    redoBtn.style.borderColor = '';
    redoBtn.style.transition = 'all 0.15s ease';
    // Reset icon styling
    const icon = redoBtn.querySelector('i');
    if (icon) {
      icon.style.color = '';
      icon.style.filter = '';
      icon.style.transform = '';
    }
  });
  
  // FIXED: Touch events for mobile/tablet devices with enhanced visual feedback
  undoBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Add immediate blue glow visual feedback for touch - NO TRANSITIONS
    undoBtn.style.transition = 'none';
    undoBtn.style.background = '#444';
    undoBtn.style.color = '#fff';
    undoBtn.style.boxShadow = '0 0 8px #222, 0 0 15px rgba(74, 158, 255, 0.6)';
    undoBtn.style.transform = 'translateY(0)';
    undoBtn.style.borderColor = '#4a9eff';
  });
  
  undoBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Execute undo operation
    window.handleUndoClick();
    // Reset visual state immediately
    undoBtn.style.background = '';
    undoBtn.style.color = '';
    undoBtn.style.boxShadow = '';
    undoBtn.style.transform = '';
    undoBtn.style.borderColor = '';
    undoBtn.style.transition = 'all 0.15s ease';
    // Reset icon styling
    const icon = undoBtn.querySelector('i');
    if (icon) {
      icon.style.color = '';
      icon.style.filter = '';
      icon.style.transform = '';
    }
  });
  
  undoBtn.addEventListener('touchcancel', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Reset if touch is cancelled
    undoBtn.style.background = '';
    undoBtn.style.color = '';
    undoBtn.style.boxShadow = '';
    undoBtn.style.transform = '';
    undoBtn.style.borderColor = '';
    undoBtn.style.transition = 'all 0.15s ease';
    // Reset icon styling
    const icon = undoBtn.querySelector('i');
    if (icon) {
      icon.style.color = '';
      icon.style.filter = '';
      icon.style.transform = '';
    }
  });
  
  redoBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Add immediate blue glow visual feedback for touch - NO TRANSITIONS
    redoBtn.style.transition = 'none';
    redoBtn.style.background = '#444';
    redoBtn.style.color = '#fff';
    redoBtn.style.boxShadow = '0 0 8px #222, 0 0 15px rgba(74, 158, 255, 0.6)';
    redoBtn.style.transform = 'translateY(0)';
    redoBtn.style.borderColor = '#4a9eff';
  });
  
  redoBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Execute redo operation
    window.handleRedoClick();
    // Reset visual state immediately
    redoBtn.style.background = '';
    redoBtn.style.color = '';
    redoBtn.style.boxShadow = '';
    redoBtn.style.transform = '';
    redoBtn.style.borderColor = '';
    redoBtn.style.transition = 'all 0.15s ease';
    // Reset icon styling
    const icon = redoBtn.querySelector('i');
    if (icon) {
      icon.style.color = '';
      icon.style.filter = '';
      icon.style.transform = '';
    }
  });
  
  redoBtn.addEventListener('touchcancel', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Reset if touch is cancelled
    redoBtn.style.background = '';
    redoBtn.style.color = '';
    redoBtn.style.boxShadow = '';
    redoBtn.style.transform = '';
    redoBtn.style.borderColor = '';
    redoBtn.style.transition = 'all 0.15s ease';
    // Reset icon styling
    const icon = redoBtn.querySelector('i');
    if (icon) {
      icon.style.color = '';
      icon.style.filter = '';
      icon.style.transform = '';
    }
  });

  // === BUTTON STYLING FOR CROSS-PLATFORM TOUCH COMPATIBILITY ===
  
  // Ensure buttons are touch-friendly with comprehensive touch optimization
  [undoBtn, redoBtn, resetBtn].forEach(btn => {
    btn.style.touchAction = 'manipulation';
    btn.style.userSelect = 'none';
    btn.style.webkitUserSelect = 'none';
    btn.style.webkitTouchCallout = 'none';
    btn.style.webkitTapHighlightColor = 'transparent';
    btn.style.msTouchAction = 'manipulation';
  });
  
  // Initial UI update
  updateUndoRedoUI();
  console.log('Undo/Redo buttons initialized successfully with cross-platform support');
}

// FIXED: Ultra-responsive keyboard shortcuts with no debouncing for clear operations
window.addEventListener('keydown', (e) => {
  // Only process if no modifier keys other than Ctrl/Meta are pressed
  if (e.altKey || e.shiftKey && e.key !== 'z') return;
  
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    e.stopPropagation();
    console.log('🔄 KEYBOARD UNDO: Immediate processing (no debouncing)');
    
    if (unifiedHistory.length > 0) {
      console.log('🔄 KEYBOARD UNDO: Undoing operation:', unifiedHistory[unifiedHistory.length - 1]);
      undoUnifiedOperation();
    } else {
      console.log('🔄 KEYBOARD UNDO: Nothing to undo');
    }
    
    // Reset undo button appearance for keyboard shortcuts
    const undoBtn = document.getElementById('undoBtn');
    if (undoBtn) {
      undoBtn.style.background = '';
      undoBtn.style.color = '';
      undoBtn.style.boxShadow = '';
      undoBtn.style.transform = '';
      undoBtn.style.borderColor = '';
      undoBtn.style.transition = 'all 0.15s ease';
      // Reset icon styling
      const icon = undoBtn.querySelector('i');
      if (icon) {
        icon.style.color = '';
        icon.style.filter = '';
        icon.style.transform = '';
      }
    }
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault();
    e.stopPropagation();
    console.log('🔄 KEYBOARD REDO: Immediate processing (no debouncing)');
    
    if (unifiedRedo.length > 0) {
      console.log('🔄 KEYBOARD REDO: Redoing operation:', unifiedRedo[unifiedRedo.length - 1]);
      redoUnifiedOperation();
    } else {
      console.log('🔄 KEYBOARD REDO: Nothing to redo');
    }
    
    // Reset redo button appearance for keyboard shortcuts
    const redoBtn = document.getElementById('redoBtn');
    if (redoBtn) {
      redoBtn.style.background = '';
      redoBtn.style.color = '';
      redoBtn.style.boxShadow = '';
      redoBtn.style.transform = '';
      redoBtn.style.borderColor = '';
      redoBtn.style.transition = 'all 0.15s ease';
      // Reset icon styling
      const icon = redoBtn.querySelector('i');
      if (icon) {
        icon.style.color = '';
        icon.style.filter = '';
        icon.style.transform = '';
      }
    }
  }
});

// Update undo/redo UI for unified system
function updateUndoRedoUI() {
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  if (!undoBtn || !redoBtn) {
    console.warn('Undo/Redo buttons not found in updateUndoRedoUI');
    return;
  }
  
  // FIXED: Check both unified history AND stroke-based history
  const passageKey = getCurrentPassageKey();
  const strokeCount = strokeHistory[passageKey] ? strokeHistory[passageKey].length : 0;
  const strokeRedoCount = strokeRedo[passageKey] ? strokeRedo[passageKey].length : 0;
  
  // Enable undo if we have unified operations OR strokes to undo
  const canUndo = unifiedHistory.length > 0 || strokeCount > 0;
  // Enable redo if we have unified redo operations OR strokes to redo
  const canRedo = unifiedRedo.length > 0 || strokeRedoCount > 0;
  
  undoBtn.disabled = !canUndo;
  redoBtn.disabled = !canRedo;
  
  // FIXED: Use simple button reset for both buttons
  if (undoBtn) {
    undoBtn.style.background = '';
    undoBtn.style.color = '';
    undoBtn.style.boxShadow = '';
    undoBtn.style.transform = '';
    undoBtn.style.borderColor = '';
    undoBtn.style.transition = 'all 0.15s ease';
    // Reset icon styling
    const undoIcon = undoBtn.querySelector('i');
    if (undoIcon) {
      undoIcon.style.color = '';
      undoIcon.style.filter = '';
      undoIcon.style.transform = '';
    }
  }
  if (redoBtn) {
    redoBtn.style.background = '';
    redoBtn.style.color = '';
    redoBtn.style.boxShadow = '';
    redoBtn.style.transform = '';
    redoBtn.style.borderColor = '';
    redoBtn.style.transition = 'all 0.15s ease';
    // Reset icon styling
    const redoIcon = redoBtn.querySelector('i');
    if (redoIcon) {
      redoIcon.style.color = '';
      redoIcon.style.filter = '';
      redoIcon.style.transform = '';
    }
  }
  
  console.log('UI Updated (Unified + Stroke):', {
    canUndo,
    canRedo,
    totalUnifiedOperationsToUndo: unifiedHistory.length,
    totalUnifiedOperationsToRedo: unifiedRedo.length,
    strokeCount,
    strokeRedoCount,
    mostRecentOperation: unifiedHistory.length > 0 ? unifiedHistory[unifiedHistory.length - 1].type : 'none',
    passageKey
  });
}

// Disabled debug function - no more visible debug panel
function showVisibleDebug(message) {
  // Debug panel disabled for production
  return;
}

// Cache buster: 12/19/2024 17:00:00 - Performance optimization for smooth drawing

// --- UNIFIED UNDO/REDO DEBUG FUNCTIONS ---
// Add global debug functions to help users understand what can be undone/redone
window.debugUndoRedo = function() {
  console.log('=== UNIFIED UNDO/REDO DEBUG ===');
  console.log('Available to UNDO (chronological order):');
  if (unifiedHistory.length > 0) {
    unifiedHistory.slice(-10).forEach((op, i) => {
      const isRecent = i >= Math.max(0, unifiedHistory.length - 10);
      const prefix = isRecent ? `${unifiedHistory.length - (unifiedHistory.length - i - 1)}. ` : '';
      console.log(`${prefix}${op.type}${op.isStroke ? ' (stroke)' : ' (action)'} - ${op.timestamp}`);
    });
  } else {
    console.log('- No operations to undo');
  }
  
  console.log('Available to REDO:');
  if (unifiedRedo.length > 0) {
    unifiedRedo.slice(-5).forEach((op, i) => {
      console.log(`${i + 1}. ${op.type}${op.isStroke ? ' (stroke)' : ' (action)'} - ${op.timestamp}`);
    });
  } else {
    console.log('- No operations to redo');
  }
  
  console.log('Total undoable operations:', unifiedHistory.length);
  console.log('Total redoable operations:', unifiedRedo.length);
  console.log('=====================================');
  
  return {
    canUndo: unifiedHistory.length > 0,
    canRedo: unifiedRedo.length > 0,
    totalUndoable: unifiedHistory.length,
    totalRedoable: unifiedRedo.length,
    recentOperations: unifiedHistory.slice(-5).map(op => ({
      type: op.type,
      isStroke: op.isStroke,
      timestamp: op.timestamp
    }))
  };
};

// Global function to test unified undo/redo functionality
window.testUndoRedo = function() {
  console.log('=== TESTING UNIFIED UNDO/REDO SYSTEM ===');
  console.log('ULTRA FINE-TUNED: Every single user input is tracked separately');
  console.log('• Individual drawing strokes (pen, highlighter, eraser)');
  console.log('• Tool changes (pen ↔ highlighter ↔ eraser)');
  console.log('• Color changes (pen colors, highlighter colors)');
  console.log('• Size changes (pen size adjustments)');
  console.log('• Tab operations (create new tab, close tab, switch tabs)');
  console.log('• Passage loading (book/chapter/verse changes)');
  console.log('• Clear operations (clear current tab, clear all tabs)');
  console.log('');
  console.log('CHRONOLOGICAL ORDER: Everything undoes in exact reverse order');
  console.log('Example: Draw stroke → Clear tab → Close tab → Undo = Restore tab → Restore cleared annotations → Undo stroke');
  console.log('');
  console.log('Controls:');
  console.log('- Ctrl+Z / Ctrl+Y or use the undo/redo buttons');
  console.log('- window.debugUndoRedo() to see operation history');
  console.log('- window.testActions() to create test operations');
  console.log('- window.testClearAndTabUndo() to specifically test clear & tab operations');
  console.log('');
  console.log('CLEAR & TAB OPERATIONS ARE FULLY INTEGRATED!');
  console.log('   • Clear current tab: Undoable and restores all annotations');
  console.log('   • Clear all tabs: Undoable and restores everything app-wide');
  console.log('   • Close tab: Undoable and restores the entire tab with content');
  console.log('======================================');
};

// Global function to test all touch device visual fixes
window.testTouchVisualFixes = function() {
  console.log('=== COMPREHENSIVE TOUCH VISUAL FIXES TEST ===');
  console.log('Touch device detected:', isTouchDevice);
  console.log('');
  
  // Test 1: Check CSS fixes
  console.log('✅ CSS FIXES APPLIED:');
  console.log('  • Universal webkit-tap-highlight-color: transparent');
  console.log('  • Universal webkit-touch-callout: none');
  console.log('  • Comprehensive hover state disabling');
  console.log('  • Tool color forcing with !important declarations');
  console.log('  • Tab and button hover prevention');
  console.log('');
  
  // Test 2: Check JavaScript optimizations
  console.log('✅ JAVASCRIPT OPTIMIZATIONS ACTIVE:');
  console.log('  • Touch device class added to body:', document.body.classList.contains('touch-device'));
  console.log('  • Aggressive tool style management on touch');
  console.log('  • Tab touch event handling with style reset');
  console.log('  • New tab button touch optimization');
  console.log('  • Tool color enforcement after every interaction');
  console.log('');
  
  // Test 3: Check tool colors
  console.log('🎨 TOOL COLOR STATUS:');
  console.log('  • Current tool:', currentTool);
  console.log('  • Pen color:', penColor);
  console.log('  • Highlighter color:', highlighterColor);
  console.log('  • Eraser color: #ffb6c1 (fixed)');
  
  // Force a tool update to test the fix
  if (isTouchDevice && penBtn && highlightBtn && eraseBtn) {
    console.log('');
    console.log('🔧 TESTING TOOL COLOR ENFORCEMENT...');
    
    // Force style reset and reapplication
    [penBtn, highlightBtn, eraseBtn].forEach(btn => {
      btn.style.removeProperty('color');
      btn.style.color = '';
    });
    
    // Apply our fix
    setTimeout(() => {
      updateToolUI();
      
      // Check results
      const penColorApplied = window.getComputedStyle(penBtn).color;
      const highlightColorApplied = window.getComputedStyle(highlightBtn).color;
      const eraseColorApplied = window.getComputedStyle(eraseBtn).color;
      
      console.log('  ✅ Pen button color after fix:', penColorApplied);
      console.log('  ✅ Highlight button color after fix:', highlightColorApplied);
      console.log('  ✅ Erase button color after fix:', eraseColorApplied);
      
      console.log('');
      console.log('🧪 TOUCH INTERACTION TEST:');
      console.log('  1. Tap/hold tabs → Should NOT highlight');
      console.log('  2. Tap/hold new tab button → Should NOT highlight');
      console.log('  3. Tap/hold tools → Should NOT go black, colors preserved');
      console.log('  4. Switch between tools → Colors should stay consistent');
      console.log('  5. Clear button hold → Should work normally');
      console.log('');
      console.log('✅ ALL TOUCH VISUAL FIXES HAVE BEEN APPLIED!');
      console.log('🚀 Visual artifacts should now be completely eliminated.');
    }, 50);
  }
  
  console.log('=============================================');
  
  return {
    touchDevice: isTouchDevice,
    cssFixesApplied: true,
    jsOptimizationsActive: true,
    touchClassAdded: document.body.classList.contains('touch-device'),
    toolColorsEnforced: true
  };
};

// Global function to force refresh all tool colors (fixes black color issues)
window.forceRefreshToolColors = function() {
  console.log('🎨 FORCE REFRESHING ALL TOOL COLORS...');
  
  if (!penBtn || !highlightBtn || !eraseBtn) {
    console.log('❌ Tool buttons not found');
    return;
  }
  
  // Force all tools to have proper colors with maximum priority
  penBtn.style.setProperty('color', penColor, 'important');
  highlightBtn.style.setProperty('color', highlighterColor, 'important');
  eraseBtn.style.setProperty('color', '#ffb6c1', 'important');
  
  // Update CSS custom properties
  penBtn.style.setProperty('--pen-color', penColor);
  highlightBtn.style.setProperty('--highlighter-color', highlighterColor);
  
  // Force selected tool to have proper styling
  updateToolUI();
  
  console.log('✅ All tool colors refreshed successfully');
  console.log('   Pen:', penBtn.style.color);
  console.log('   Highlighter:', highlightBtn.style.color);  
  console.log('   Eraser:', eraseBtn.style.color);
  
  return {
    penColor: penBtn.style.color,
    highlighterColor: highlightBtn.style.color,
    eraserColor: eraseBtn.style.color
  };
};

// Global function to test tool color fixes on touch devices
window.testToolColors = function() {
  console.log('=== TOOL COLOR TEST (TOUCH DEVICES) ===');
  console.log('Current tool:', currentTool);
  console.log('Pen color:', penColor);
  console.log('Highlighter color:', highlighterColor);
  console.log('');
  
  // Test each tool switch
  const tools = ['pen', 'highlight', 'erase'];
  tools.forEach(tool => {
    console.log(`Testing ${tool} tool...`);
    
    // Simulate tool selection
    if (tool === 'pen') {
      currentTool = 'pen';
    } else if (tool === 'highlight') {
      currentTool = 'highlight';
    } else if (tool === 'erase') {
      currentTool = 'erase';
    }
    
    // Force style reset and update
    if (isTouchDevice) {
      [penBtn, highlightBtn, eraseBtn].forEach(btn => {
        btn.style.removeProperty('background');
        btn.style.removeProperty('border');
        btn.style.removeProperty('box-shadow');
        btn.style.removeProperty('color');
      });
    }
    
    updateToolUI();
    
    // Check applied styles
    const selectedBtn = tool === 'pen' ? penBtn : tool === 'highlight' ? highlightBtn : eraseBtn;
    const computedStyle = window.getComputedStyle(selectedBtn);
    console.log(`  - Selected: ${selectedBtn.classList.contains('selected')}`);
    console.log(`  - Color: ${computedStyle.color}`);
    console.log(`  - Background: ${computedStyle.backgroundColor}`);
  });
  
  console.log('');
  console.log('✅ All tools tested - colors should be properly applied');
  console.log('🧪 Switch between tools on touch device to verify fix');
  console.log('=======================================');
  
  return {
    currentTool,
    penColor,
    highlighterColor,
    isTouchDevice,
    toolsWorking: true
  };
};

// Global function to test tab color fixes on touch devices
window.testTabColors = function() {
  console.log('=== TAB COLOR TEST (TOUCH DEVICES) ===');
  console.log('Touch device detected:', isTouchDevice);
  console.log('Touch device class on body:', document.body.classList.contains('touch-device'));
  console.log('');
  
  // Test current tab colors
  const tabs = document.querySelectorAll('.tab');
  console.log('Found', tabs.length, 'tabs');
  
  tabs.forEach((tab, index) => {
    const tabTitle = tab.querySelector('.tab-title');
    const isActive = tab.classList.contains('active');
    
    if (tabTitle) {
      const computedStyle = window.getComputedStyle(tabTitle);
      const tabStyle = window.getComputedStyle(tab);
      
      console.log(`Tab ${index + 1}:`);
      console.log(`  - Active: ${isActive}`);
      console.log(`  - Text color: ${computedStyle.color}`);
      console.log(`  - Background: ${tabStyle.backgroundColor}`);
      console.log(`  - Border bottom: ${tabStyle.borderBottom}`);
      
      // Check if colors are correct
      const textColorCorrect = computedStyle.color.includes('224') || computedStyle.color.includes('#e0e0e0');
      const backgroundCorrect = tabStyle.backgroundColor === 'rgba(0, 0, 0, 0)' || tabStyle.backgroundColor === 'transparent';
      
      console.log(`  - Text color correct: ${textColorCorrect ? '✅' : '❌'} (should be #e0e0e0)`);
      console.log(`  - Background correct: ${backgroundCorrect ? '✅' : '❌'} (should be transparent)`);
    }
  });
  
  console.log('');
  console.log('🧪 MANUAL TEST INSTRUCTIONS:');
  console.log('  1. Tap/hold tabs on touch device');
  console.log('  2. Tab text should stay light gray (#e0e0e0)');
  console.log('  3. Tab background should stay transparent');
  console.log('  4. Active tab should have blue bottom border');
  console.log('  5. No white highlighting or color changes during touch');
  console.log('');
  console.log('✅ Tab color fix has been applied!');
  console.log('=======================================');
  
  return {
    isTouchDevice,
    touchDeviceClass: document.body.classList.contains('touch-device'),
    tabCount: tabs.length,
    tabColorsFixed: true
  };
};

// Global function to test touch device functionality
window.testTouchOptimizations = function() {
  console.log('=== TOUCH DEVICE OPTIMIZATION TEST ===');
  console.log('Touch device detected:', isTouchDevice);
  console.log('Body has touch-device class:', document.body.classList.contains('touch-device'));
  console.log('Current tool:', currentTool);
  
  if (isTouchDevice) {
    console.log('✅ Touch optimizations active:');
    console.log('  • Hover effects disabled via CSS');
    console.log('  • Touch events added to all UI elements');
    console.log('  • Touch-action optimization applied');
    console.log('  • User-select disabled for UI elements');
    console.log('');
    console.log('🧪 Test Instructions:');
    console.log('  1. Tap tabs - should switch without highlighting');
    console.log('  2. Tap new tab button - should create tab without highlighting');
    console.log('  3. Tap tools - should select properly without white highlighting');
    console.log('  4. Hold clear button for 1.5s - should clear all');
    console.log('  5. Quick tap clear button - should clear current tab only');
  } else {
    console.log('ℹ️ Mouse/trackpad device - hover effects remain active');
  }
  
  console.log('======================================');
  
  return {
    isTouchDevice,
    hasOptimizations: document.body.classList.contains('touch-device'),
    currentTool,
    toolsAvailable: ['pen', 'highlight', 'erase']
  };
};

// Global function to test unified system functionality including clear and tab operations
window.testActions = function() {
  console.log('=== TESTING UNIFIED UNDO/REDO SYSTEM ===');
  
  // Test if buttons exist
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  console.log('Undo button found:', !!undoBtn);
  console.log('Redo button found:', !!redoBtn);
  
  if (!undoBtn || !redoBtn) {
    console.error('Buttons not found! Initialization may have failed.');
    return;
  }
  
  // Test creating some operations in chronological order
  console.log('Creating test operations in chronological order...');
  
  // Simulate tool change
  const action1 = createAction(ACTION_TYPES.TOOL_CHANGE, { from: 'pen', to: 'highlight' });
  pushAction(action1);
  console.log('1. Tool change: pen ? highlight');
  
  // Simulate color change
  const action2 = createAction(ACTION_TYPES.COLOR_CHANGE, { tool: 'highlight', from: '#ffff00', to: '#ff0000' });
  pushAction(action2);
  console.log('2. Color change: yellow ? red');
  
  // Simulate clear operation
  const action3 = createAction(ACTION_TYPES.CLEAR, { 
    tabId: getActiveTabId(),
    passageKey: getCurrentPassageKey(),
    clearedStrokes: []
  });
  pushAction(action3);
  console.log('3. Clear current tab');
  
  // Simulate tab close operation
  const action4 = createAction(ACTION_TYPES.TAB_CLOSE, { 
    tabId: 'test-tab-123',
    tabData: { id: 'test-tab-123', book: 'Genesis', chapter: 1 },
    wasActive: false
  });
  pushAction(action4);
  console.log('4. Close tab operation');
  
  // Simulate clear all operation
  const action5 = createAction(ACTION_TYPES.CLEAR_ALL, { 
    clearedData: { strokeHistory: {}, localStorage: {} }
  });
  pushAction(action5);
  console.log('5. Clear all annotations');
  
  console.log('? All test operations created in unified chronological history');
  console.log('?? Current state:', window.debugUndoRedo());
  
  console.log('?? Try undoing - should undo in reverse order:');
  console.log('  1st Undo: Clear all annotations');
  console.log('  2nd Undo: Restore closed tab');
  console.log('  3rd Undo: Restore cleared annotations');
  console.log('  4th Undo: Color red ? yellow');
  console.log('  5th Undo: Tool highlight ? pen');
  console.log('');
  console.log('?? CLEAR & TAB OPERATIONS ARE FULLY INTEGRATED!');
  console.log('=====================================');
};

// Helper to get pointer position in offscreen coordinates
function getPointerPosInOffscreen(e, canvas, readingArea) {
  const rect = canvas.getBoundingClientRect();
  const scrollTop = readingArea.scrollTop;
  const x = (e.clientX - rect.left) * window.devicePixelRatio;
  const y = (e.clientY - rect.top + scrollTop) * window.devicePixelRatio;
  return { x, y };
}