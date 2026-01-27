import { capturePane } from '../utils/tmux';
import { getWSServer } from './server';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 500;

// ---------------------------------------------------------------------------
// TerminalStream
// ---------------------------------------------------------------------------

interface StreamEntry {
  sessionName: string;
  interval: ReturnType<typeof setInterval>;
  lastLength: number;
}

export class TerminalStream {
  private streams: Map<string, StreamEntry> = new Map();

  /**
   * Start streaming incremental TMUX pane output for a task.
   */
  start(taskId: string, sessionName: string): void {
    // Avoid duplicate streams for the same task
    if (this.streams.has(taskId)) {
      this.stop(taskId);
    }

    const entry: StreamEntry = {
      sessionName,
      interval: setInterval(() => {
        void this.poll(taskId);
      }, POLL_INTERVAL_MS),
      lastLength: 0,
    };

    this.streams.set(taskId, entry);
  }

  /**
   * Stop streaming for a specific task.
   */
  stop(taskId: string): void {
    const entry = this.streams.get(taskId);
    if (entry) {
      clearInterval(entry.interval);
      this.streams.delete(taskId);
    }
  }

  /**
   * Stop all active streams.
   */
  stopAll(): void {
    for (const [taskId] of this.streams) {
      this.stop(taskId);
    }
  }

  /**
   * Return the set of currently streamed task IDs.
   */
  get activeTaskIds(): string[] {
    return [...this.streams.keys()];
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private async poll(taskId: string): Promise<void> {
    const entry = this.streams.get(taskId);
    if (!entry) return;

    try {
      const output = await capturePane(entry.sessionName, 500);
      if (output.length > entry.lastLength) {
        const newContent = output.slice(entry.lastLength);
        entry.lastLength = output.length;

        const server = getWSServer();
        server.sendToTask(taskId, 'terminal:output', {
          task_id: taskId,
          session: entry.sessionName,
          data: newContent,
        });
      }
    } catch {
      // TMUX session may have died; silently ignore
    }
  }
}
