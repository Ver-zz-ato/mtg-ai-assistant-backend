'use client';

import { useState } from 'react';

export default function PriceCacheTest() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const testPriceCache = async () => {
    if (loading) return;
    
    setLoading(true);
    setResult(null);
    
    const testCards = ["Lightning Bolt", "Counterspell", "Sol Ring", "Path to Exile", "Birds of Paradise"];
    const start = Date.now();
    
    try {
      const response = await fetch('/api/price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: testCards, currency: 'USD' })
      });
      
      const data = await response.json();
      const duration = Date.now() - start;
      
      const testResult = {
        success: data.ok,
        duration,
        cacheStats: data.cache_stats || { hits: 0, misses: 0, total: 0 },
        prices: data.prices || {},
        missing: data.missing || [],
        error: data.error || null
      };
      
      setResult(testResult);
      console.log('Price cache test completed:', testResult);
    } catch (error: any) {
      const testResult = {
        success: false,
        duration: Date.now() - start,
        error: error.message || 'Network error',
        cacheStats: { hits: 0, misses: 0, total: 0 },
        prices: {},
        missing: []
      };
      
      setResult(testResult);
      console.error('Price cache test failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <button
        onClick={testPriceCache}
        disabled={loading}
        className="px-3 py-1 text-xs bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
      >
        {loading ? 'Testing...' : 'Test Price Cache'}
      </button>

      {result && (
        <div className="p-3 bg-neutral-900 rounded text-xs space-y-2">
          <div className="flex items-center gap-2">
            <span className={result.success ? 'text-green-500' : 'text-red-500'}>
              {result.success ? '✅' : '❌'} 
            </span>
            <span>
              Price cache test completed in {result.duration}ms
            </span>
          </div>
          
          {result.error && (
            <div className="text-red-400">
              <strong>Error:</strong> {result.error}
            </div>
          )}
          
          <div className="grid grid-cols-3 gap-4">
            <div>
              <strong>Cache Stats:</strong>
              <ul className="ml-2">
                <li>Hits: {result.cacheStats.hits}</li>
                <li>Misses: {result.cacheStats.misses}</li>
                <li>Total: {result.cacheStats.total}</li>
              </ul>
            </div>
            
            <div>
              <strong>Performance:</strong>
              <ul className="ml-2">
                <li>Duration: {result.duration}ms</li>
                <li>Hit Rate: {result.cacheStats.total > 0 ? Math.round(result.cacheStats.hits / result.cacheStats.total * 100) : 0}%</li>
              </ul>
            </div>
            
            <div>
              <strong>Results:</strong>
              <ul className="ml-2">
                <li>Prices: {Object.keys(result.prices).length}</li>
                <li>Missing: {result.missing.length}</li>
              </ul>
            </div>
          </div>
          
          {Object.keys(result.prices).length > 0 && (
            <details>
              <summary className="cursor-pointer hover:text-blue-400">Sample Prices</summary>
              <div className="mt-2 space-y-1">
                {Object.entries(result.prices).slice(0, 3).map(([name, price]: any) => (
                  <div key={name} className="font-mono">
                    {name}: ${price}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}