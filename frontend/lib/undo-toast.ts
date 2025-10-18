// Undo toast system for destructive actions
// Provides 5-8 second window to undo before action executes

import { capture } from './ph';

export interface UndoAction {
  id: string;
  message: string;
  onUndo: () => void | Promise<void>;
  onExecute: () => void | Promise<void>;
  duration?: number; // milliseconds, default 7000 (7 seconds)
}

type ToastCallback = (action: UndoAction | null) => void;

class UndoToastManager {
  private subscribers: Set<ToastCallback> = new Set();
  private currentAction: UndoAction | null = null;
  private timeoutId: NodeJS.Timeout | null = null;

  subscribe(callback: ToastCallback) {
    this.subscribers.add(callback);
    // Immediately notify of current state
    callback(this.currentAction);
    
    return () => {
      this.subscribers.delete(callback);
    };
  }

  private notify() {
    this.subscribers.forEach(callback => callback(this.currentAction));
  }

  async showUndo(action: UndoAction) {
    // Cancel any existing action
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    // If there's a pending action, execute it immediately (no undo)
    if (this.currentAction) {
      await this.executeCurrentAction(false);
    }

    // Set new action
    this.currentAction = action;
    this.notify();

    // Track the action
    try {
      capture('undo_toast_shown', {
        action_id: action.id,
        message: action.message,
      });
    } catch (e) {
      // Non-critical
    }

    // Schedule execution
    const duration = action.duration || 7000;
    this.timeoutId = setTimeout(async () => {
      await this.executeCurrentAction(true);
    }, duration);
  }

  async undo() {
    if (!this.currentAction) return;

    const action = this.currentAction;

    // Clear timeout
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    // Execute undo callback
    try {
      await action.onUndo();
      
      capture('undo_toast_undone', {
        action_id: action.id,
        message: action.message,
      });
    } catch (e) {
      console.error('Error executing undo:', e);
      
      capture('undo_toast_error', {
        action_id: action.id,
        error: String(e),
        type: 'undo',
      });
    }

    // Clear current action
    this.currentAction = null;
    this.notify();
  }

  private async executeCurrentAction(wasTimedOut: boolean) {
    if (!this.currentAction) return;

    const action = this.currentAction;

    // Execute the action
    try {
      await action.onExecute();
      
      capture('undo_toast_executed', {
        action_id: action.id,
        message: action.message,
        timed_out: wasTimedOut,
      });
    } catch (e) {
      console.error('Error executing action:', e);
      
      capture('undo_toast_error', {
        action_id: action.id,
        error: String(e),
        type: 'execute',
      });
    }

    // Clear
    this.currentAction = null;
    this.timeoutId = null;
    this.notify();
  }

  dismiss() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    // Execute immediately without tracking
    if (this.currentAction) {
      const action = this.currentAction;
      this.currentAction = null;
      this.notify();
      
      // Execute action and handle potential errors
      try {
        const result = action.onExecute();
        if (result && typeof result.catch === 'function') {
          result.catch((e) => {
            console.error('Error executing dismissed action:', e);
          });
        }
      } catch (e) {
        console.error('Error executing dismissed action:', e);
      }
    }
  }
}

// Singleton instance
export const undoToastManager = new UndoToastManager();

// React hook for using undo toast
export function useUndoToast() {
  if (typeof window === 'undefined') {
    return {
      showUndo: async () => {},
      undo: async () => {},
      dismiss: () => {},
      currentAction: null,
    };
  }

  const [currentAction, setCurrentAction] = useState<UndoAction | null>(null);

  useEffect(() => {
    return undoToastManager.subscribe(setCurrentAction);
  }, []);

  return {
    showUndo: undoToastManager.showUndo.bind(undoToastManager),
    undo: undoToastManager.undo.bind(undoToastManager),
    dismiss: undoToastManager.dismiss.bind(undoToastManager),
    currentAction,
  };
}

// Need to import useState and useEffect
import { useState, useEffect } from 'react';

