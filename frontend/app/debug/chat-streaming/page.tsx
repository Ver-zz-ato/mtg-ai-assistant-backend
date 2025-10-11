"use client";

import { useState, useRef } from "react";
import { postMessageStream } from "@/lib/threads";
import { capture } from "@/lib/ph";

export default function ChatStreamingDebugPage() {
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamAbort, setStreamAbort] = useState<AbortController | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [fallbackResponse, setFallbackResponse] = useState<string>("");
  const [inputText, setInputText] = useState("Tell me about Magic: The Gathering");
  const streamStartTimeRef = useRef<number>(0);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const clearLogs = () => {
    setLogs([]);
    setStreamingContent("");
    setFallbackResponse("");
  };

  const testStreaming = async () => {
    if (isStreaming) return;
    
    clearLogs();
    setStreamingContent("");
    setFallbackResponse("");
    setIsStreaming(true);
    
    const abortController = new AbortController();
    setStreamAbort(abortController);
    
    const streamStartTime = Date.now();
    streamStartTimeRef.current = streamStartTime;
    
    addLog("🚀 Starting streaming test");
    addLog(`📝 Input: "${inputText}"`);
    
    capture('chat_stream_start', {
      model: 'gpt-4o-mini',
      thread_id: 'debug',
      deck_id: null,
      started_at: streamStartTime
    });

    try {
      let streamFailed = false;
      
      await postMessageStream(
        { 
          text: inputText, 
          threadId: null, 
          context: { debug: true }, 
          prefs: { format: 'commander', budget: 'optimized' } 
        },
        (token: string) => {
          // Update streaming content
          setStreamingContent(prev => {
            const newContent = prev + token;
            addLog(`📥 Token received: "${token}" (total: ${newContent.length} chars)`);
            return newContent;
          });
        },
        () => {
          // Stream completed
          addLog("✅ Stream completed successfully");
          setIsStreaming(false);
          setStreamAbort(null);
          capture('chat_stream_stop', {
            stopped_by: 'complete',
            duration_ms: Date.now() - streamStartTime,
            tokens_if_known: Math.ceil(streamingContent.length / 4)
          });
        },
        (error: Error) => {
          addLog(`❌ Stream error: ${error.message}`);
          setIsStreaming(false);
          setStreamAbort(null);
          
          if (error.message === "fallback") {
            streamFailed = true;
            addLog("🔄 Falling back to regular chat API");
            capture('chat_stream_fallback', { reason: 'fallback_response' });
          } else {
            capture('chat_stream_error', {
              reason: error.message || 'unknown',
              duration_ms: Date.now() - streamStartTime,
              had_partial: streamingContent.length > 0
            });
          }
        },
        abortController.signal
      );
      
      // If streaming failed, test fallback
      if (streamFailed) {
        addLog("🔄 Testing fallback to regular chat API");
        try {
          const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: inputText,
              context: { debug: true },
              prefs: { format: 'commander', budget: 'optimized' }
            })
          });
          
          const result = await response.json();
          if (result.ok) {
            setFallbackResponse(result.text || "Fallback succeeded but no text returned");
            addLog("✅ Fallback API succeeded");
          } else {
            setFallbackResponse(`Fallback failed: ${result.error?.message || 'Unknown error'}`);
            addLog(`❌ Fallback API failed: ${result.error?.message}`);
          }
        } catch (fallbackError: any) {
          setFallbackResponse(`Fallback exception: ${fallbackError.message}`);
          addLog(`❌ Fallback exception: ${fallbackError.message}`);
        }
      }
      
    } catch (error: any) {
      addLog(`💥 Outer exception: ${error.message}`);
      setIsStreaming(false);
      setStreamAbort(null);
      capture('chat_stream_error', {
        reason: String(error).substring(0, 100),
        duration_ms: Date.now() - streamStartTime,
        had_partial: streamingContent.length > 0
      });
    }
  };

  const stopStreaming = () => {
    if (streamAbort) {
      addLog("⏹️ Stopping stream manually");
      streamAbort.abort();
      setStreamAbort(null);
      setIsStreaming(false);
      capture('chat_stream_stop', {
        stopped_by: 'user',
        duration_ms: Date.now() - streamStartTimeRef.current,
        tokens_if_known: Math.ceil(streamingContent.length / 4)
      });
    }
  };

  const testRegularChat = async () => {
    addLog("🔄 Testing regular chat API directly");
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: inputText,
          context: { debug: true },
          prefs: { format: 'commander', budget: 'optimized' }
        })
      });
      
      const result = await response.json();
      if (result.ok) {
        setFallbackResponse(result.text || "Regular chat succeeded but no text returned");
        addLog("✅ Regular chat API succeeded");
      } else {
        setFallbackResponse(`Regular chat failed: ${result.error?.message || 'Unknown error'}`);
        addLog(`❌ Regular chat API failed: ${result.error?.message}`);
      }
    } catch (error: any) {
      setFallbackResponse(`Regular chat exception: ${error.message}`);
      addLog(`❌ Regular chat exception: ${error.message}`);
    }
  };

  const testAuth = async () => {
    addLog("🔐 Testing authentication status");
    try {
      // Test GET endpoint first
      const healthResponse = await fetch('/api/chat/stream', {
        method: 'GET'
      });
      const healthData = await healthResponse.json();
      addLog(`✅ Health check: ${JSON.stringify(healthData)}`);
      
      // Test auth with regular chat endpoint
      const authResponse = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: "test auth",
        })
      });
      addLog(`🔐 Auth test status: ${authResponse.status}`);
      if (!authResponse.ok) {
        const authError = await authResponse.text();
        addLog(`❌ Auth failed: ${authError}`);
      } else {
        addLog(`✅ Authentication working`);
      }
    } catch (error: any) {
      addLog(`❌ Auth test exception: ${error.message}`);
    }
  };

  const testStreamingEndpoint = async () => {
    addLog("🔄 Testing streaming endpoint directly");
    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: inputText,
          context: { debug: true },
          prefs: { format: 'commander', budget: 'optimized' }
        })
      });
      
      addLog(`📡 Stream endpoint response status: ${response.status}`);
      addLog(`📡 Stream endpoint response headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()))}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        addLog(`❌ Stream endpoint error (${response.status}): ${errorText}`);
        
        // Try to parse as JSON to get more details
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.fallback) {
            addLog(`🔄 Fallback response detected: ${errorJson.reason || 'unknown reason'}`);
            if (errorJson.message) {
              addLog(`💡 Message: ${errorJson.message}`);
            }
          }
        } catch {
          addLog(`📄 Raw error text: ${errorText}`);
        }
        return;
      }
      
      if (response.headers.get('content-type')?.includes('application/json')) {
        const json = await response.json();
        addLog(`📄 Stream endpoint returned JSON: ${JSON.stringify(json)}`);
        if (json.fallback) {
          addLog("🔄 Stream endpoint indicates fallback needed");
        }
        return;
      }
      
      if (!response.body) {
        addLog("❌ No response body from stream endpoint");
        return;
      }
      
      addLog("📥 Reading stream directly...");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let totalContent = "";
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          addLog("✅ Stream reading completed");
          break;
        }
        
        const chunk = decoder.decode(value, { stream: true });
        totalContent += chunk;
        addLog(`📥 Raw chunk: "${chunk}" (${chunk.length} bytes)`);
        
        if (chunk.includes("[DONE]")) {
          addLog("🏁 Found [DONE] marker");
          break;
        }
      }
      
      setStreamingContent(totalContent);
      addLog(`📊 Total streamed content: ${totalContent.length} characters`);
      
    } catch (error: any) {
      addLog(`❌ Stream endpoint exception: ${error.message}`);
    }
  };

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Chat Streaming Debug</h1>
        <div className="flex gap-2">
          <button 
            onClick={clearLogs}
            className="px-3 py-1 rounded bg-gray-600 text-white hover:bg-gray-700"
          >
            Clear Logs
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Controls */}
        <section className="rounded-xl border border-neutral-800 p-4 space-y-4">
          <h2 className="text-lg font-semibold">Test Controls</h2>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Test Input:</label>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                rows={3}
                className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-white"
                placeholder="Enter test message..."
              />
            </div>
            
            <div className="flex flex-wrap gap-2">
              {isStreaming ? (
                <button 
                  onClick={stopStreaming}
                  className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
                >
                  ⏹️ Stop Stream
                </button>
              ) : (
                <>
                  <button 
                    onClick={testStreaming}
                    className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
                  >
                    🚀 Test Full Streaming Flow
                  </button>
                  <button 
                    onClick={testAuth}
                    className="px-4 py-2 rounded bg-orange-600 text-white hover:bg-orange-700"
                  >
                    🔐 Test Auth
                  </button>
                  <button 
                    onClick={testStreamingEndpoint}
                    className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700"
                  >
                    📡 Test Stream Endpoint
                  </button>
                  <button 
                    onClick={testRegularChat}
                    className="px-4 py-2 rounded bg-purple-600 text-white hover:bg-purple-700"
                  >
                    💬 Test Regular Chat
                  </button>
                </>
              )}
            </div>
            
            <div className="text-sm text-neutral-400">
              Status: {isStreaming ? "🔄 Streaming..." : "⏸️ Idle"}
            </div>
          </div>
        </section>
        
        {/* Streaming Output */}
        <section className="rounded-xl border border-neutral-800 p-4">
          <h2 className="text-lg font-semibold mb-3">Streaming Output</h2>
          <div className="bg-neutral-900 rounded p-3 min-h-[200px] max-h-[400px] overflow-y-auto">
            {streamingContent ? (
              <div className="whitespace-pre-wrap text-sm">
                {streamingContent}
                {isStreaming && <span className="animate-pulse">▊</span>}
              </div>
            ) : (
              <div className="text-neutral-500 text-sm">No streaming content yet...</div>
            )}
          </div>
          
          {fallbackResponse && (
            <>
              <h3 className="text-md font-medium mt-4 mb-2">Fallback Response:</h3>
              <div className="bg-yellow-900/20 border border-yellow-700/50 rounded p-3">
                <div className="whitespace-pre-wrap text-sm">{fallbackResponse}</div>
              </div>
            </>
          )}
        </section>
      </div>
      
      {/* Debug Logs */}
      <section className="rounded-xl border border-neutral-800 p-4">
        <h2 className="text-lg font-semibold mb-3">Debug Logs</h2>
        <div className="bg-black rounded p-3 max-h-[400px] overflow-y-auto font-mono text-xs">
          {logs.length > 0 ? (
            logs.map((log, index) => (
              <div key={index} className="text-green-400 mb-1">
                {log}
              </div>
            ))
          ) : (
            <div className="text-gray-500">No logs yet. Click a test button to start.</div>
          )}
        </div>
      </section>
    </main>
  );
}