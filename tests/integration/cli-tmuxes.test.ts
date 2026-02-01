import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Mock child_process and @inquirer/prompts for integration tests
vi.mock('child_process');
vi.mock('@inquirer/prompts');

describe('tmuxes CLI Integration Tests', () => {
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  let consoleOutput: string[] = [];
  let consoleErrors: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    consoleOutput = [];
    consoleErrors = [];

    // Mock console methods to capture output
    console.log = vi.fn((...args) => {
      consoleOutput.push(args.join(' '));
    });
    console.error = vi.fn((...args) => {
      consoleErrors.push(args.join(' '));
    });
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    vi.restoreAllMocks();
  });

  describe('CLI Command Availability', () => {
    it('should be available in package.json scripts', () => {
      const packageJsonPath = path.resolve(process.cwd(), 'package.json');
      expect(fs.existsSync(packageJsonPath)).toBe(true);

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      expect(packageJson.scripts).toHaveProperty('mark2');
      expect(packageJson.scripts.mark2).toBe('tsx cli/cli.ts');
    });

    it('should have tmuxes command in CLI', () => {
      const cliPath = path.resolve(process.cwd(), 'cli/cli.ts');
      expect(fs.existsSync(cliPath)).toBe(true);

      const cliContent = fs.readFileSync(cliPath, 'utf-8');
      expect(cliContent).toContain("case 'tmuxes':");
      expect(cliContent).toContain("tmuxesCommand");
    });

    it('should have tmuxes.ts command file', () => {
      const tmuxesPath = path.resolve(process.cwd(), 'cli/commands/tmuxes.ts');
      expect(fs.existsSync(tmuxesPath)).toBe(true);

      const tmuxesContent = fs.readFileSync(tmuxesPath, 'utf-8');
      expect(tmuxesContent).toContain('export async function tmuxesCommand()');
      expect(tmuxesContent).toContain('import { select }');
      expect(tmuxesContent).toContain('tmux list-sessions');
    });
  });

  describe('Command Execution Flow', () => {
    it('should handle the case when tmux is not installed', async () => {
      const { execFileSync: mockExecFileSync } = await import('child_process');
      vi.mocked(mockExecFileSync).mockImplementation((command, args) => {
        if (command === 'tmux' && args?.[0] === '-V') {
          throw new Error('command not found');
        }
        return '';
      });

      // Import and execute the command
      const { tmuxesCommand } = await import('../../cli/commands/tmuxes');
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(tmuxesCommand()).rejects.toThrow('process.exit called');
      expect(consoleErrors).toContain('Error: tmux is not installed or not available in PATH.');
      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockRestore();
    });

    it('should handle the case when no sessions exist', async () => {
      const { execFileSync: mockExecFileSync } = await import('child_process');
      vi.mocked(mockExecFileSync).mockImplementation((command, args) => {
        if (command === 'tmux' && args?.[0] === '-V') {
          return 'tmux 3.3a';
        }
        if (command === 'tmux' && args?.[0] === 'list-sessions') {
          throw new Error('no server running');
        }
        return '';
      });

      const { tmuxesCommand } = await import('../../cli/commands/tmuxes');

      await tmuxesCommand();
      expect(consoleOutput).toContain('No tmux sessions found.');
    });

    it('should handle successful session listing and selection', async () => {
      const { execFileSync: mockExecFileSync } = await import('child_process');
      const { select } = await import('@inquirer/prompts');

      vi.mocked(mockExecFileSync).mockImplementation((command, args) => {
        if (command === 'tmux' && args?.[0] === '-V') {
          return 'tmux 3.3a';
        }
        if (command === 'tmux' && args?.[0] === 'list-sessions') {
          return 'session1|3|1643723400|attached|80x24\nsession2|1|1643720000|detached|120x30';
        }
        return '';
      });

      vi.mocked(select).mockResolvedValue('session1');

      // Mock spawn for session attachment
      const { spawn } = await import('child_process');
      const mockChild = {
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 0); // Simulate successful attachment
          }
        }),
      };
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      const { tmuxesCommand } = await import('../../cli/commands/tmuxes');

      await tmuxesCommand();

      expect(select).toHaveBeenCalledWith({
        message: 'Select a tmux session:',
        choices: expect.arrayContaining([
          expect.objectContaining({
            value: 'session1',
            name: expect.stringContaining('session1')
          }),
          expect.objectContaining({
            value: 'session2',
            name: expect.stringContaining('session2')
          })
        ])
      });

      expect(consoleOutput.some(output => output.includes('Attaching to tmux session: session1'))).toBe(true);
    });

    it('should handle user cancellation', async () => {
      const { execFileSync: mockExecFileSync } = await import('child_process');
      const { select } = await import('@inquirer/prompts');

      vi.mocked(mockExecFileSync).mockImplementation((command, args) => {
        if (command === 'tmux' && args?.[0] === '-V') {
          return 'tmux 3.3a';
        }
        if (command === 'tmux' && args?.[0] === 'list-sessions') {
          return 'session1|3|1643723400|attached|80x24';
        }
        return '';
      });

      vi.mocked(select).mockRejectedValue(new Error('User cancelled'));

      const { tmuxesCommand } = await import('../../cli/commands/tmuxes');

      await tmuxesCommand();
      expect(consoleOutput.some(output => output.includes('Operation cancelled.'))).toBe(true);
    });

    it('should handle session attachment failure', async () => {
      const { execFileSync: mockExecFileSync } = await import('child_process');
      const { select } = await import('@inquirer/prompts');

      vi.mocked(mockExecFileSync).mockImplementation((command, args) => {
        if (command === 'tmux' && args?.[0] === '-V') {
          return 'tmux 3.3a';
        }
        if (command === 'tmux' && args?.[0] === 'list-sessions') {
          return 'session1|3|1643723400|attached|80x24';
        }
        return '';
      });

      vi.mocked(select).mockResolvedValue('session1');

      // Mock spawn for failed session attachment
      const { spawn } = await import('child_process');
      const mockChild = {
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(1), 0); // Simulate failed attachment
          }
        }),
      };
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      const { tmuxesCommand } = await import('../../cli/commands/tmuxes');
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(tmuxesCommand()).rejects.toThrow('process.exit called');
      expect(consoleErrors.some(error => error.includes('Error:'))).toBe(true);
      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockRestore();
    });
  });

  describe('Session Data Parsing', () => {
    it('should correctly parse various session configurations', async () => {
      const { execFileSync: mockExecFileSync } = await import('child_process');
      const { select } = await import('@inquirer/prompts');

      const complexSessionData = `development|1|1643720000|detached|80x24
production-server|10|1643723400|attached|120x40
background-jobs|2|1643725000|detached|100x30
mark2-task-123|5|1643726000|attached|90x25`;

      vi.mocked(mockExecFileSync).mockImplementation((command, args) => {
        if (command === 'tmux' && args?.[0] === '-V') {
          return 'tmux 3.3a';
        }
        if (command === 'tmux' && args?.[0] === 'list-sessions') {
          return complexSessionData;
        }
        return '';
      });

      vi.mocked(select).mockResolvedValue('development');

      // Mock spawn
      const { spawn } = await import('child_process');
      const mockChild = {
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
        }),
      };
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      const { tmuxesCommand } = await import('../../cli/commands/tmuxes');

      await tmuxesCommand();

      expect(select).toHaveBeenCalledWith({
        message: 'Select a tmux session:',
        choices: expect.arrayContaining([
          expect.objectContaining({
            value: 'development',
            name: expect.stringContaining('[1 window]')
          }),
          expect.objectContaining({
            value: 'production-server',
            name: expect.stringContaining('[10 windows]')
          }),
          expect.objectContaining({
            value: 'background-jobs',
            name: expect.stringContaining('[2 windows]')
          }),
          expect.objectContaining({
            value: 'mark2-task-123',
            name: expect.stringContaining('[5 windows]')
          })
        ])
      });

      // Verify attached indicators
      const selectCall = vi.mocked(select).mock.calls[0][0];
      const choices = selectCall.choices;

      const productionChoice = choices.find((c: any) => c.value === 'production-server') as { name: string; value: string } | undefined;
      const developmentChoice = choices.find((c: any) => c.value === 'development') as { name: string; value: string } | undefined;

      expect(productionChoice?.name).toContain('(attached)');
      expect(developmentChoice?.name).not.toContain('(attached)');
    });
  });
});
