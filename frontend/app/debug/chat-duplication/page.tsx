"use client";
import React, { useState, useEffect, useRef } from 'react';

export default function ChatDuplicationDebug() {
  const [logs, setLogs] = useState<string[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-50), `[${timestamp}] ${message}`]); // Keep only last 50 logs
  };

  const startMonitoring = () => {
    if (isMonitoring) return;
    
    setIsMonitoring(true);
    setLogs([]);
    addLog('🟡 Starting chat message monitoring...');
    
    // Monkey patch console.log to capture React state changes
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    
    console.log = (...args) => {
      const message = args.join(' ');
      if (message.includes('setMessages') || 
          message.includes('streamingMsgId') || 
          message.includes('Streaming completed') ||
          message.includes('messages.length') ||
          message.includes('assistant') ||
          message.includes('duplicate')) {
        addLog(`📝 CONSOLE: ${message}`);
      }
      originalLog(...args);
    };
    
    console.warn = (...args) => {
      const message = args.join(' ');
      if (message.includes('message') || message.includes('duplicate') || message.includes('streaming')) {
        addLog(`⚠️ WARN: ${message}`);
      }
      originalWarn(...args);
    };
    
    console.error = (...args) => {
      const message = args.join(' ');
      if (message.includes('message') || message.includes('duplicate') || message.includes('streaming')) {
        addLog(`❌ ERROR: ${message}`);
      }
      originalError(...args);
    };
    
    // Monitor for React dev tools updates
    if (typeof window !== 'undefined' && (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__) {
      const hook = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
      const originalOnFiberCommit = hook.onCommitFiberRoot;
      
      hook.onCommitFiberRoot = (id: any, root: any, ...args: any[]) => {
        try {
          // This is a very rough way to detect Chat component updates
          const rootContainer = root?.containerInfo;
          if (rootContainer && rootContainer.querySelector) {
            const chatElements = rootContainer.querySelectorAll('[data-role="assistant"]');
            if (chatElements.length > 1) {
              const duplicates = Array.from(chatElements).filter((el, i, arr) => {
                const content = (el as HTMLElement).textContent || '';
                return arr.some((other, j) => i !== j && (other as HTMLElement).textContent === content && content.length > 10);
              });
              
              if (duplicates.length > 0) {
                addLog(`🚨 FOUND ${duplicates.length} DUPLICATE ASSISTANT MESSAGES in DOM!`);
                duplicates.forEach((el, i) => {
                  addLog(`  Duplicate ${i + 1}: "${((el as HTMLElement).textContent || '').substring(0, 50)}..."`);
                });
              }
            }
          }
        } catch (e) {
          // Ignore errors in monitoring
        }
        
        if (originalOnFiberCommit) {
          return originalOnFiberCommit(id, root, ...args);
        }
      };
    }
    
    addLog('✅ Monitoring started. Try sending a message in the main chat.');
  };

  const stopMonitoring = () => {
    setIsMonitoring(false);
    addLog('🛑 Monitoring stopped');
    
    // Restore original console methods
    // Note: This is a simplified restore - in a real app you'd want to store the originals
    setTimeout(() => {
      if (typeof window !== 'undefined') {
        window.location.reload(); // Simple way to restore console
      }
    }, 1000);
  };

  const clearLogs = () => setLogs([]);

  // Auto-scroll logs to bottom
  const logsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">🐛 Chat Duplication Monitor</h1>
        
        <div className="space-y-4">
          <div className="flex gap-4">
            <button
              onClick={startMonitoring}
              disabled={isMonitoring}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-800 rounded"
            >
              {isMonitoring ? 'Monitoring Active...' : 'Start Monitoring'}
            </button>
            <button
              onClick={stopMonitoring}
              disabled={!isMonitoring}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-800 rounded"
            >
              Stop Monitoring
            </button>
            <button
              onClick={clearLogs}
              className="px-4 py-2 bg-neutral-600 hover:bg-neutral-700 rounded"
            >
              Clear Logs
            </button>
          </div>
          
          <div className="bg-neutral-900 border border-neutral-700 rounded p-4 h-96 overflow-y-auto" ref={logsRef}>
            <div className="font-mono text-sm space-y-1">
              {logs.length === 0 ? (
                <div className="text-neutral-500">Click "Start Monitoring" then use the main chat to test for duplicates...</div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="whitespace-pre-wrap break-all">
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        
        <div className="mt-6 text-sm text-neutral-400">
          <h3 className="font-semibold mb-2">Instructions:</h3>
          <ol className="list-decimal list-inside space-y-1">
            <li>Click "Start Monitoring" above</li>
            <li>Go to the main chat page (open in another tab/window)</li>
            <li>Send a test message like "hello" or "build me a deck"</li>
            <li>Watch the logs here for duplicate detection</li>
            <li>The monitor will detect duplicate assistant messages in the DOM</li>
          </ol>
          
          <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-600/30 rounded">
            <h4 className="font-semibold text-yellow-400">What to look for:</h4>
            <ul className="list-disc list-inside text-xs mt-1 space-y-1">
              <li>🚨 "FOUND X DUPLICATE ASSISTANT MESSAGES" - indicates the bug</li>
              <li>📝 Console logs about setMessages calls</li>
              <li>React Fiber commit logs showing component updates</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}