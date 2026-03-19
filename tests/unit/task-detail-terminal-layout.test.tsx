/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@/types';
import { TaskDetail } from '@/components/detail/TaskDetail';

vi.mock('@/components/shared/Badge', () => ({
  Badge: ({ value }: { value: string }) => <span>{value}</span>,
}));

vi.mock('@/components/shared/ActionBar', () => ({
  ActionBar: () => <div data-testid="action-bar">Action Bar</div>,
}));

vi.mock('@/components/shared/Dialog', () => ({
  Dialog: () => null,
}));

vi.mock('@/components/shared/EnhanceDialog', () => ({
  EnhanceDialog: () => null,
}));

vi.mock('@/components/detail/PhaseTimeline', () => ({
  PhaseTimeline: () => <div data-testid="phase-timeline">Timeline</div>,
}));

vi.mock('@/components/detail/DetailsTab', () => ({
  DetailsTab: () => <div>Details Tab</div>,
}));

vi.mock('@/components/detail/ArtifactsTab', () => ({
  ArtifactsTab: () => <div>Artifacts Tab</div>,
}));

vi.mock('@/components/detail/ActivityTab', () => ({
  ActivityTab: () => <div>Activity Tab</div>,
}));

vi.mock('@/components/detail/CodeTab', () => ({
  CodeTab: () => <div>Code Tab</div>,
}));

vi.mock('@/components/detail/PhaseOverridesTab', () => ({
  PhaseOverridesTab: () => <div>Overrides Tab</div>,
}));

vi.mock('@/components/detail/DependenciesTab', () => ({
  DependenciesTab: () => <div>Dependencies Tab</div>,
}));

vi.mock('@/components/detail/DevServerPanel', () => ({
  DevServerPanel: () => <div data-testid="dev-server-panel">Dev Server</div>,
}));

vi.mock('@/components/detail/TerminalTab', () => ({
  TerminalTab: ({
    isMaximized,
    maximizeSupported,
    onMaximizeToggle,
  }: {
    isMaximized: boolean;
    maximizeSupported: boolean;
    onMaximizeToggle: () => void;
  }) => (
    <div data-live-terminal>
      <input aria-label="terminal-input" />
      {maximizeSupported ? (
        <button onClick={onMaximizeToggle}>
          {isMaximized ? 'Restore' : 'Maximize'}
        </button>
      ) : null}
    </div>
  ),
}));

const baseTask: Task = {
  id: 'TASK-89',
  title: 'Interactive tmux panel',
  description: 'Make terminal interactive',
  phase: 'coding',
  phase_agents: {},
  phase_overrides: {},
  blockers: [],
  priority: 'P1',
  artifacts: [],
  ports: [],
  worktrees: {},
  created_by: 'nick',
  merge_strategy: 'squash',
  auto_advance: true,
  auto_approve: false,
  created_at: '2026-03-19T12:00:00.000Z',
  updated_at: '2026-03-19T12:00:00.000Z',
  phase_entered_at: '2026-03-19T12:00:00.000Z',
  loop_count: 0,
  archived: false,
};

describe('TaskDetail terminal layout', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ task: baseTask }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not close on Escape while focus is inside the live terminal', async () => {
    const onClose = vi.fn();

    render(
      <TaskDetail
        task={baseTask}
        onClose={onClose}
        onUpdate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Terminal' }));

    const input = await screen.findByLabelText('terminal-input');
    input.focus();
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('maximizes the terminal shell and hides non-terminal chrome', async () => {
    render(
      <TaskDetail
        task={baseTask}
        onClose={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );

    expect(screen.getByTestId('phase-timeline')).toBeTruthy();
    expect(screen.getByTestId('dev-server-panel')).toBeTruthy();
    expect(screen.getByTestId('action-bar')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Terminal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Maximize' }));

    await waitFor(() => {
      expect(screen.queryByTestId('phase-timeline')).toBeNull();
    });

    expect(screen.queryByTestId('dev-server-panel')).toBeNull();
    expect(screen.queryByTestId('action-bar')).toBeNull();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeTruthy();
  });
});
