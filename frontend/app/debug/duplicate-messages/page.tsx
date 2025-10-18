"use client";
import React, { useState, useRef } from 'react';
import { postMessageStream } from '@/lib/threads';

export default function DuplicateMessagesDebug() {
  const [messages, setMessages] = useState<any[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [testMessage, setTestMessage] = useState('test message');
  
  // Refs to track React Strict Mode behavior
  const isExecutingRef = useRef<boolean>(false);
  const streamingMessageIdRef = useRef<string | null>(null);
  const callCountRef = useRef<number>(0);
  
  const log = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] 🐛 ${message}`);
  };

  const clearMessages = () => {
    setMessages([]);
    isExecutingRef.current = false;
    streamingMessageIdRef.current = null;
    callCountRef.current = 0;
    log('Cleared all messages and reset state');
  };

  const sendMessage = async () => {
    callCountRef.current++;
    const callNumber = callCountRef.current;
    
    log(`🚀 Send message called - execution #${callNumber}`);
    
    // React Strict Mode guard
    if (isExecutingRef.current) {
      log(`⚠️ Execution already in progress, skipping duplicate call #${callNumber}`);
      return;
    }
    isExecutingRef.current = true;
    
    try {
      // Add user message
      const userMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: testMessage,
        timestamp: new Date().toISOString()
      };
      
      log(`💬 Adding user message: ${userMessage.id}`);
      setMessages(prev => [...prev, userMessage]);
      
      // Generate streaming message ID
      const streamingId = `assistant-streaming-${Date.now()}`;
      streamingMessageIdRef.current = streamingId;
      log(`🎯 Generated streaming ID: ${streamingId}`);
      
      // Add typing placeholder with duplicate prevention
      setMessages(prev => {
        const hasTyping = prev.some(msg => msg.role === 'assistant' && msg.content === 'Typing…');
        if (hasTyping) {
          log('⚠️ Typing placeholder already exists, preventing duplicate');
          return prev;
        }
        
        const typingMessage = {
          id: streamingId,
          role: 'assistant',
          content: 'Typing…',
          timestamp: new Date().toISOString()
        };
        
        log(`⏳ Adding typing placeholder: ${streamingId}`);
        return [...prev, typingMessage];
      });
      
      // Start streaming
      setIsStreaming(true);
      log('🌊 Starting token stream...');
      
      let fullContent = '';
      let tokenCount = 0;
      
      await postMessageStream(
        { text: testMessage, threadId: null },
        (token: string) => {
          tokenCount++;
          fullContent += token;
          log(`📝 Token #${tokenCount}: "${token}"`);
          
          setMessages(prev => prev.map(msg => 
            msg.id === streamingId 
              ? { ...msg, content: fullContent }
              : msg
          ));
        },
        () => {
          log('✅ Streaming completed');
        },
        (error: Error) => {
          log(`❌ Streaming error: ${error.message}`);
        },
        new AbortController().signal
      );
      
      log(`✅ Streaming completed with ${tokenCount} tokens`);
      
    } catch (error) {
      log(`❌ Error: ${error}`);
    } finally {
      setIsStreaming(false);
      streamingMessageIdRef.current = null;
      isExecutingRef.current = false;
      log('🧹 Cleaned up execution state');
    }
  };

  const assistantMessages = messages.filter(msg => msg.role === 'assistant');
  const hasDuplicates = assistantMessages.length > 1;

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">🐛 Duplicate Messages Debug Tool</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Controls */}
          <div className="space-y-4">
            <div className="bg-neutral-900 rounded-lg p-4">
              <h2 className="text-lg font-semibold mb-4">Test Controls</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm mb-1">Test Message:</label>
                  <input
                    type="text"
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={sendMessage}
                    disabled={isStreaming}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 rounded"
                  >
                    {isStreaming ? 'Streaming...' : 'Send Test Message'}
                  </button>
                  <button
                    onClick={clearMessages}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded"
                  >
                    Clear Messages
                  </button>
                </div>
              </div>
            </div>

            {/* Debug State */}
            <div className="bg-neutral-900 rounded-lg p-4">
              <h2 className="text-lg font-semibold mb-4">Debug State</h2>
              <div className="space-y-2 text-sm">
                <div>Function Calls: <span className="text-blue-400">{callCountRef.current}</span></div>
                <div>Is Executing: <span className={isExecutingRef.current ? 'text-red-400' : 'text-green-400'}>{String(isExecutingRef.current)}</span></div>
                <div>Is Streaming: <span className={isStreaming ? 'text-yellow-400' : 'text-gray-400'}>{String(isStreaming)}</span></div>
                <div>Streaming ID: <span className="text-purple-400">{streamingMessageIdRef.current || 'null'}</span></div>
                <div>Total Messages: <span className="text-blue-400">{messages.length}</span></div>
                <div>Assistant Messages: <span className={hasDuplicates ? 'text-red-400 font-bold' : 'text-green-400'}>{assistantMessages.length}</span></div>
                {hasDuplicates && (
                  <div className="text-red-400 font-bold">🚨 DUPLICATE DETECTED!</div>
                )}
              </div>
            </div>
          </div>

          {/* Messages Display */}
          <div className="bg-neutral-900 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4">Messages ({messages.length})</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {messages.length === 0 ? (
                <div className="text-neutral-500 text-sm">No messages</div>
              ) : (
                messages.map((msg, i) => (
                  <div 
                    key={msg.id} 
                    className={`p-3 rounded text-sm border-l-4 ${
                      msg.role === 'assistant' 
                        ? 'bg-blue-900/30 border-blue-500' 
                        : 'bg-green-900/30 border-green-500'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-mono text-xs text-neutral-400">{msg.id}</span>
                      <span className="text-xs text-neutral-400">{msg.role}</span>
                    </div>
                    <div className="break-words">{msg.content}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-6 text-sm text-neutral-400">
          <h3 className="font-semibold mb-2">Instructions:</h3>
          <ol className="list-decimal list-inside space-y-1">
            <li>Open your browser's developer console to see detailed logs</li>
            <li>Click "Send Test Message" to trigger the chat flow</li>
            <li>Watch for duplicate assistant messages in the display</li>
            <li>Check console logs for execution flow details</li>
          </ol>
          
          <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-600/30 rounded">
            <div className="font-semibold text-yellow-400">Expected in React Strict Mode:</div>
            <div className="text-xs mt-1">You should see "Execution already in progress" messages in console if the duplicate prevention is working correctly.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
