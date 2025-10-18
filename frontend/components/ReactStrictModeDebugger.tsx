"use client";
import React, { useState, useRef } from 'react';

// Module-level tracking
let moduleCallCount = 0;
let moduleSetMessagesCount = 0;
let isAddingTypingMessage = false;
let lastMessageCount = 0;

export default function ReactStrictModeDebugger() {
  const [messages, setMessages] = useState<any[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const isExecutingRef = useRef<boolean>(false);
  const componentCallCount = useRef<number>(0);
  
  // Track message changes to detect disappearances
  React.useEffect(() => {
    if (lastMessageCount > 0 && messages.length < lastMessageCount) {
      const disappeared = lastMessageCount - messages.length;
      addLog(`❌ MESSAGE DISAPPEARED! Was ${lastMessageCount}, now ${messages.length} (lost ${disappeared})`);
      addLog(`   Current messages: [${messages.map(m => `${m.id}: ${m.content}`).join(', ')}]`);
    } else if (messages.length !== lastMessageCount) {
      addLog(`📊 Message count changed: ${lastMessageCount} → ${messages.length}`);
    }
    lastMessageCount = messages.length;
  }, [messages]);
  
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    setLogs(prev => [...prev, logMessage]);
  };

  const clearLogs = () => {
    setLogs([]);
    moduleCallCount = 0;
    moduleSetMessagesCount = 0;
    componentCallCount.current = 0;
    isAddingTypingMessage = false;
  };

  const testSimpleSetMessages = () => {
    componentCallCount.current++;
    moduleCallCount++;
    
    addLog(`🚀 TEST 1: Simple setMessages call #${componentCallCount.current} (module: ${moduleCallCount})`);
    
    setMessages(prev => {
      moduleSetMessagesCount++;
      addLog(`📝 TEST 1: setMessages updater called - count ${moduleSetMessagesCount}`);
      addLog(`   Current messages: ${prev.length}`);
      
      return [...prev, { id: `simple-${Date.now()}-${moduleSetMessagesCount}`, content: 'Simple test' }];
    });
  };

  const testWithExecutionGuard = () => {
    componentCallCount.current++;
    moduleCallCount++;
    
    addLog(`🚀 TEST 2: With execution guard call #${componentCallCount.current} (module: ${moduleCallCount})`);
    
    if (isExecutingRef.current) {
      addLog(`⚠️ TEST 2: Execution guard blocked duplicate call`);
      return;
    }
    
    isExecutingRef.current = true;
    addLog(`✅ TEST 2: Set execution guard to true`);
    
    try {
      setMessages(prev => {
        moduleSetMessagesCount++;
        addLog(`📝 TEST 2: setMessages updater called - count ${moduleSetMessagesCount}`);
        addLog(`   Current messages: ${prev.length}`);
        
        return [...prev, { id: `guarded-${Date.now()}-${moduleSetMessagesCount}`, content: 'Guarded test' }];
      });
    } finally {
      setTimeout(() => {
        isExecutingRef.current = false;
        addLog(`🧹 TEST 2: Reset execution guard`);
      }, 100);
    }
  };

  const testWithDuplicateCheck = () => {
    componentCallCount.current++;
    moduleCallCount++;
    
    addLog(`🚀 TEST 3: With duplicate check call #${componentCallCount.current} (module: ${moduleCallCount})`);
    
    setMessages(prev => {
      moduleSetMessagesCount++;
      addLog(`📝 TEST 3: setMessages updater called - count ${moduleSetMessagesCount}`);
      addLog(`   Current messages: ${prev.length}`);
      addLog(`   Checking for 'Typing…' in: [${prev.map(m => m.content).join(', ')}]`);
      
      const hasTyping = prev.some(msg => msg.content === 'Typing…');
      addLog(`   Has typing: ${hasTyping}`);
      
      if (hasTyping) {
        addLog(`⚠️ TEST 3: Typing message already exists, preventing duplicate`);
        return prev;
      }
      
      addLog(`✅ TEST 3: Adding typing message`);
      return [...prev, { id: `typing-${Date.now()}-${moduleSetMessagesCount}`, content: 'Typing…' }];
    });
  };

  const testWithSynchronousTracking = () => {
    componentCallCount.current++;
    moduleCallCount++;
    
    addLog(`🚀 TEST 4: Synchronous tracking call #${componentCallCount.current} (module: ${moduleCallCount})`);
    addLog(`   isAddingTypingMessage before: ${isAddingTypingMessage}`);
    
    if (isAddingTypingMessage) {
      addLog(`⚠️ TEST 4: Already adding typing message, blocked!`);
      return;
    }
    
    isAddingTypingMessage = true;
    addLog(`✅ TEST 4: Set synchronous flag to true`);
    
    setMessages(prev => {
      moduleSetMessagesCount++;
      addLog(`📝 TEST 4: setMessages updater called - count ${moduleSetMessagesCount}`);
      addLog(`   Current messages: ${prev.length}`);
      
      // Double check in case first call didn't work
      const hasTyping = prev.some(msg => msg.content === 'Typing…');
      if (hasTyping) {
        addLog(`⚠️ TEST 4: Typing already exists in state, skipping`);
        return prev;
      }
      
      addLog(`✅ TEST 4: Adding typing message`);
      return [...prev, { id: `sync-typing-${Date.now()}-${moduleSetMessagesCount}`, content: 'Typing…' }];
    });
    
    // Reset flag after a short delay
    setTimeout(() => {
      isAddingTypingMessage = false;
      addLog(`🧹 TEST 4: Reset synchronous flag`);
    }, 100);
  };

  const testLikeMainChat = () => {
    // First clear messages like starting a new chat
    setMessages([]);
    isAddingTypingMessage = false;
    
    // Add a user message first (like main chat does)
    setMessages([{ id: 'user-msg', content: 'User message', role: 'user' }]);
    
    componentCallCount.current++;
    moduleCallCount++;
    
    addLog(`🚀 TEST 5: Like main chat call #${componentCallCount.current} (module: ${moduleCallCount})`);
    addLog(`   isAddingTypingMessage before: ${isAddingTypingMessage}`);
    
    if (isAddingTypingMessage) {
      addLog(`⚠️ TEST 5: Already adding typing message, blocked!`);
      return;
    }
    
    isAddingTypingMessage = true;
    addLog(`✅ TEST 5: Set synchronous flag to true`);
    
    setMessages(prev => {
      moduleSetMessagesCount++;
      addLog(`📝 TEST 5: setMessages updater called - count ${moduleSetMessagesCount}`);
      addLog(`   Current messages: ${prev.length}`);
      
      const hasTyping = prev.some(msg => msg.role === 'assistant' && msg.content === 'Typing…');
      if (hasTyping) {
        addLog(`⚠️ TEST 5: Typing already exists in state, skipping`);
        return prev;
      }
      
      addLog(`✅ TEST 5: Adding typing message`);
      return [...prev, { id: `main-chat-typing-${Date.now()}-${moduleSetMessagesCount}`, content: 'Typing…', role: 'assistant' }];
    });
    
    setTimeout(() => {
      isAddingTypingMessage = false;
      addLog(`🧹 TEST 5: Reset synchronous flag`);
    }, 100);
  };

  const testStreamingCompletion = () => {
    // Start fresh like a real chat
    setMessages([{ id: 'user-msg', content: 'User message', role: 'user' }]);
    
    componentCallCount.current++;
    moduleCallCount++;
    
    addLog(`🚀 TEST 6: Streaming completion simulation`);
    
    // Add typing message
    const streamingId = `stream-${Date.now()}`;
    setMessages(prev => [...prev, { id: streamingId, content: 'Typing…', role: 'assistant' }]);
    
    // Simulate streaming tokens
    setTimeout(() => {
      addLog('🌊 Streaming tokens...');
      setMessages(prev => prev.map(msg => 
        msg.id === streamingId ? { ...msg, content: 'Hello there!' } : msg
      ));
      
      // Simulate completion after streaming
      setTimeout(() => {
        addLog('✅ Stream completed - checking if message persists...');
        // Don't do anything - just see if message disappears on its own
      }, 1000);
    }, 500);
  };

  const clearMessages = () => {
    setMessages([]);
    isAddingTypingMessage = false;
    lastMessageCount = 0;
    addLog(`🧹 Cleared all messages and reset flags`);
  };

  return (
    <div className="bg-red-900/20 border border-red-600/30 rounded-lg p-4 mb-6">
      <h2 className="text-lg font-bold text-red-400 mb-4">🐛 React Strict Mode Debugger (TEMPORARY)</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Controls */}
        <div className="space-y-3">
          <div className="text-sm font-semibold">Test Functions:</div>
          <div className="space-y-2">
            <button
              onClick={testSimpleSetMessages}
              className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm"
            >
              Test 1: Simple setMessages
            </button>
            <button
              onClick={testWithExecutionGuard}
              className="w-full px-3 py-2 bg-green-600 hover:bg-green-700 rounded text-sm"
            >
              Test 2: With Execution Guard
            </button>
            <button
              onClick={testWithDuplicateCheck}
              className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm"
            >
              Test 3: With Duplicate Check
            </button>
            <button
              onClick={testWithSynchronousTracking}
              className="w-full px-3 py-2 bg-yellow-600 hover:bg-yellow-700 rounded text-sm"
            >
              Test 4: Synchronous Tracking
            </button>
            <button
              onClick={testLikeMainChat}
              className="w-full px-3 py-2 bg-orange-600 hover:bg-orange-700 rounded text-sm"
            >
              Test 5: Like Main Chat
            </button>
            <button
              onClick={testStreamingCompletion}
              className="w-full px-3 py-2 bg-pink-600 hover:bg-pink-700 rounded text-sm"
            >
              Test 6: Streaming Completion
            </button>
          </div>
          
          <div className="border-t border-neutral-600 pt-3 space-y-2">
            <button
              onClick={clearMessages}
              className="w-full px-3 py-2 bg-red-600 hover:bg-red-700 rounded text-sm"
            >
              Clear Messages
            </button>
            <button
              onClick={clearLogs}
              className="w-full px-3 py-2 bg-neutral-600 hover:bg-neutral-700 rounded text-sm"
            >
              Clear Logs
            </button>
          </div>
          
          {/* Stats */}
          <div className="text-xs space-y-1 p-2 bg-neutral-800 rounded">
            <div>Component Calls: {componentCallCount.current}</div>
            <div>Module Calls: {moduleCallCount}</div>
            <div>setMessages Calls: {moduleSetMessagesCount}</div>
            <div>Messages Count: {messages.length}</div>
            <div>Execution Guard: {isExecutingRef.current ? '🔒 Active' : '🔓 Inactive'}</div>
          </div>
        </div>

        {/* Messages & Logs */}
        <div className="space-y-3">
          <div>
            <div className="text-sm font-semibold mb-2">Messages ({messages.length}):</div>
            <div className="bg-black p-2 rounded max-h-32 overflow-y-auto text-xs">
              {messages.length === 0 ? (
                <div className="text-neutral-500">No messages</div>
              ) : (
                messages.map((msg, i) => (
                  <div key={i} className="mb-1">
                    <span className="text-blue-400">{msg.id}</span>: {msg.content}
                  </div>
                ))
              )}
            </div>
          </div>
          
          <div>
            <div className="text-sm font-semibold mb-2">Logs:</div>
            <div className="bg-black p-2 rounded max-h-48 overflow-y-auto text-xs font-mono">
              {logs.length === 0 ? (
                <div className="text-neutral-500">No logs yet...</div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="mb-1 text-white">
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
      
      <div className="text-xs text-neutral-400 mt-3">
        This debugger tests different React Strict Mode scenarios. Each test shows different approaches to handling duplicate setMessages calls.
      </div>
    </div>
  );
}