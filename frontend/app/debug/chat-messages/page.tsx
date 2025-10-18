"use client";
import React from 'react';

export default function ChatMessagesDebug() {
  const [logs, setLogs] = React.useState<string[]>([]);
  const [testMessage, setTestMessage] = React.useState('build me a commander deck');
  const [isRunning, setIsRunning] = React.useState(false);
  
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const testChatFlow = async () => {
    setIsRunning(true);
    setLogs([]);
    
    try {
      addLog(`🟡 Simulating real chat flow with message: "${testMessage}"`);
      
      // Simulate the actual postMessageStream flow from Chat.tsx
      let streamFailed = false;
      let streamContent = '';
      
      addLog('🚀 Step 1: Attempting streaming (like real chat component)...');
      
      try {
        const streamRes = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            text: testMessage,
            prefs: { format: 'commander', budget: 'optimized', colors: [] }
          })
        });
        
        if (streamRes.headers.get('content-type')?.includes('application/json')) {
          const streamJson = await streamRes.json();
          addLog(`🔴 Streaming failed with JSON response: ${JSON.stringify(streamJson)}`);
          streamFailed = true;
        } else {
          addLog('📡 Streaming started successfully');
          
          const reader = streamRes.body?.getReader();
          const decoder = new TextDecoder();
          let chunkCount = 0;
          
          if (reader) {
            try {
              while (true) {
                const { value, done } = await reader.read();
                if (done) {
                  addLog('✅ Streaming completed successfully');
                  break;
                }
                
                const chunk = decoder.decode(value, { stream: true });
                streamContent += chunk;
                chunkCount++;
                
                if (chunkCount <= 3) {
                  addLog(`📦 Chunk ${chunkCount}: "${chunk.substring(0, 50)}${chunk.length > 50 ? '...' : ''}"`);
                }
                
                // Check for completion signal
                if (chunk.includes('[DONE]')) {
                  addLog('🏁 Found [DONE] signal, streaming complete');
                  break;
                }
              }
            } catch (error) {
              addLog(`❌ Streaming error: ${error}`);
              streamFailed = true;
            }
          } else {
            addLog('❌ No stream reader available');
            streamFailed = true;
          }
        }
      } catch (error) {
        addLog(`❌ Stream request failed: ${error}`);
        streamFailed = true;
      }
      
      addLog(`📊 Stream result: ${streamFailed ? 'FAILED' : 'SUCCESS'}, content: ${streamContent.length} chars`);
      
      // Step 2: If streaming failed, test fallback (like real chat component)
      if (streamFailed) {
        addLog('🔄 Step 2: Stream failed, attempting fallback...');
        
        const chatRes = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            text: testMessage,
            prefs: { format: 'commander', budget: 'optimized', colors: [] }
          })
        });
        
        const chatJson = await chatRes.json();
        addLog(`💬 Fallback response: ${JSON.stringify(chatJson, null, 2)}`);
        
        if (chatJson.threadId) {
          addLog('📡 Checking messages in thread after fallback...');
          const messagesRes = await fetch(`/api/chat/messages/list?threadId=${chatJson.threadId}`);
          const messagesJson = await messagesRes.json();
          
          if (messagesJson.messages) {
            addLog(`💾 Found ${messagesJson.messages.length} messages in thread:`);
            messagesJson.messages.forEach((msg: any, i: number) => {
              addLog(`  ${i + 1}. [${msg.role}] ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`);
            });
          }
        }
      } else {
        addLog('✨ Streaming succeeded - no fallback needed (this is the normal flow)');
        addLog('ℹ️  In real usage, the streamed message appears in UI and no duplicate is created');
      }
      
    } catch (error) {
      addLog(`❌ Error: ${error}`);
    } finally {
      setIsRunning(false);
    }
  };

  const clearLogs = () => setLogs([]);

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">🐛 Chat Messages Debug</h1>
        
        <div className="space-y-4">
          <div className="flex gap-4 items-center">
            <input
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              className="flex-1 bg-neutral-800 border border-neutral-700 rounded px-3 py-2"
              placeholder="Test message..."
            />
            <button
              onClick={testChatFlow}
              disabled={isRunning}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 rounded"
            >
              {isRunning ? 'Testing...' : 'Test Message Flow'}
            </button>
            <button
              onClick={clearLogs}
              className="px-4 py-2 bg-neutral-600 hover:bg-neutral-700 rounded"
            >
              Clear
            </button>
          </div>
          
          <div className="bg-neutral-900 border border-neutral-700 rounded p-4 h-96 overflow-y-auto">
            <div className="font-mono text-sm space-y-1">
              {logs.length === 0 ? (
                <div className="text-neutral-500">Click "Test Message Flow" to start debugging...</div>
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
          <h3 className="font-semibold mb-2">What this tests:</h3>
          <ul className="list-disc list-inside space-y-1">
            <li>Whether /api/chat/stream creates a message or just streams</li>
            <li>Whether /api/chat creates a message when prefs exist</li>
            <li>What gets saved to the database</li>
            <li>Whether both endpoints are being called simultaneously</li>
          </ul>
        </div>
      </div>
    </div>
  );
}