/**
 * Client-side streaming pacer that emits text at a steady rate
 * regardless of network chunk timing, mimicking ChatGPT's natural typing speed.
 */

export interface StreamingPacerOptions {
  tokensPerSecond?: number; // Default: 25 (ChatGPT-like speed)
  onUpdate?: (text: string, isComplete: boolean) => void;
  onError?: (error: Error) => void;
}

export class StreamingPacer {
  private queue: string[] = [];
  private currentOutput: string = '';
  private isRunning: boolean = false;
  private isComplete: boolean = false;
  private animationFrame: number | null = null;
  private lastFrameTime: number = 0;
  private tokensPerSecond: number;
  private msPerToken: number;
  private accumulatedTime: number = 0;
  
  private onUpdate: (incrementalText: string, isComplete: boolean) => void;
  private onError: (error: Error) => void;

  constructor(options: StreamingPacerOptions = {}) {
    this.tokensPerSecond = options.tokensPerSecond || 25;
    this.msPerToken = 1000 / this.tokensPerSecond;
    this.onUpdate = options.onUpdate || (() => {});
    this.onError = options.onError || (() => {});
  }

  /**
   * Add text chunk to the queue for paced output
   */
  addChunk(chunk: string): void {
    if (!chunk) return;
    
    // Split chunk into individual tokens (words/characters)
    const tokens = this.tokenize(chunk);
    this.queue.push(...tokens);
    
    // Start the pacer if not already running
    if (!this.isRunning) {
      this.start();
    }
  }

  /**
   * Signal that all chunks have been added
   */
  complete(): void {
    this.isComplete = true;
    
    // If no more tokens to process, finish immediately
    if (this.queue.length === 0 && this.isRunning) {
      this.finish();
    }
  }

  /**
   * Stop the pacer and clean up
   */
  stop(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.isRunning = false;
  }

  /**
   * Reset the pacer for a new stream
   */
  reset(): void {
    this.stop();
    this.queue = [];
    this.currentOutput = '';
    this.isComplete = false;
    this.lastFrameTime = 0;
    this.accumulatedTime = 0;
  }

  private tokenize(text: string): string[] {
    // Split by words and punctuation, keeping spaces
    // This mimics how a person might type - word by word with pauses
    const tokens = text.split(/(\s+|[.!?,:;])/);
    return tokens.filter(token => token.length > 0);
  }

  private start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.tick();
  }

  private tick = (): void => {
    if (!this.isRunning) return;

    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastFrameTime;
    this.lastFrameTime = currentTime;
    this.accumulatedTime += deltaTime;

    // Check if it's time to emit the next token
    if (this.accumulatedTime >= this.msPerToken && this.queue.length > 0) {
      const tokensToEmit = Math.floor(this.accumulatedTime / this.msPerToken);
      this.accumulatedTime = this.accumulatedTime % this.msPerToken;

      // Emit tokens incrementally
      let incrementalText = '';
      for (let i = 0; i < tokensToEmit && this.queue.length > 0; i++) {
        const token = this.queue.shift();
        if (token) {
          this.currentOutput += token;
          incrementalText += token;
        }
      }

      // Update the UI with only the new tokens
      if (incrementalText) {
        try {
          this.onUpdate(incrementalText, false);
        } catch (error) {
          this.onError(error instanceof Error ? error : new Error(String(error)));
          this.stop();
          return;
        }
      }
    }

    // Continue if we have more tokens or if we're not complete yet
    if (this.queue.length > 0 || !this.isComplete) {
      this.animationFrame = requestAnimationFrame(this.tick);
    } else if (this.isComplete) {
      this.finish();
    }
  };

  private finish(): void {
    this.stop();
    
    // Emit any remaining tokens immediately (incrementally)
    let finalIncrement = '';
    while (this.queue.length > 0) {
      const token = this.queue.shift();
      if (token) {
        this.currentOutput += token;
        finalIncrement += token;
      }
    }

    try {
      if (finalIncrement) {
        this.onUpdate(finalIncrement, false);
      }
      // Signal completion with empty string
      this.onUpdate('', true);
    } catch (error) {
      this.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

/**
 * Convenience function to create and use a pacer with a ReadableStream
 */
export async function streamWithPacer(
  stream: ReadableStream,
  options: StreamingPacerOptions = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const pacer = new StreamingPacer({
      ...options,
      onError: (error) => {
        options.onError?.(error);
        reject(error);
      }
    });

    let fullText = '';
    
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    const readChunk = async (): Promise<void> => {
      try {
        const { value, done } = await reader.read();
        
        if (done) {
          pacer.complete();
          resolve(fullText);
          return;
        }

        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        pacer.addChunk(chunk);
        
        readChunk(); // Continue reading
      } catch (error) {
        pacer.stop();
        reject(error);
      }
    };

    readChunk();
  });
}