import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';
import { ConfigService } from '@/lib/services/config-service';

let mark2Dir: string;
let stateDir: string;

beforeEach(() => {
  mark2Dir = mkdtempSync(path.join(os.tmpdir(), 'mark2-config-service-'));
  stateDir = path.join(mark2Dir, '.state');
  mkdirSync(stateDir, { recursive: true });
});

afterEach(() => {
  rmSync(mark2Dir, { recursive: true, force: true });
});

describe('ConfigService', () => {
  it('prefers roles from the state worktree when present', () => {
    writeFileSync(
      path.join(mark2Dir, 'roles.yaml'),
      YAML.stringify({
        roles: [
          {
            name: 'local-role',
            role_prompt: 'Local role',
            suggested_phases: [],
            timeout_minutes: 30,
          },
        ],
      }),
      'utf-8',
    );

    writeFileSync(
      path.join(stateDir, 'roles.yaml'),
      YAML.stringify({
        roles: [
          {
            name: 'state-role',
            role_prompt: 'State role',
            suggested_phases: ['coding'],
            timeout_minutes: 60,
          },
        ],
      }),
      'utf-8',
    );

    const service = new ConfigService(mark2Dir);
    const roles = service.getRoles();

    expect(roles).toHaveLength(1);
    expect(roles[0].name).toBe('state-role');
  });

  it('writes roles to the state worktree and mirrors them locally', () => {
    const service = new ConfigService(mark2Dir);
    const roles = service.updateRoles([
      {
        name: 'expert-fullstack-coder',
        role_prompt: 'Builds features safely',
        suggested_phases: ['coding'],
        timeout_minutes: 120,
      },
    ]);

    expect(roles[0].name).toBe('expert-fullstack-coder');

    const stateRoles = YAML.parse(readFileSync(path.join(stateDir, 'roles.yaml'), 'utf-8'));
    const localRoles = YAML.parse(readFileSync(path.join(mark2Dir, 'roles.yaml'), 'utf-8'));

    expect(stateRoles.roles[0].name).toBe('expert-fullstack-coder');
    expect(localRoles.roles[0].name).toBe('expert-fullstack-coder');
  });

  it('writes config to the state worktree and mirrors it locally', () => {
    writeFileSync(
      path.join(stateDir, 'config.yaml'),
      YAML.stringify({
        project_name: 'demo',
        base_port: 3000,
        ports_per_task: 10,
        auto_fix: { P0: true, P1: false, P2: false },
        phase_defaults: {},
        plan_phase_defaults: {},
        max_loop_count: 5,
        server_port: 3100,
        merge_strategy: 'squash',
        ide_commands: ['code'],
      }),
      'utf-8',
    );

    const service = new ConfigService(mark2Dir);
    const updated = service.update({
      phase_defaults: {
        coding: {
          role: 'expert-fullstack-coder',
          cli_tool: 'claude-code',
          model: 'claude-sonnet-4-5',
          auto_advance: true,
        },
      },
    });

    expect(updated.phase_defaults.coding).toMatchObject({
      role: 'expert-fullstack-coder',
      cli_tool: 'claude-code',
      model: 'claude-sonnet-4-5',
    });

    const stateConfig = YAML.parse(readFileSync(path.join(stateDir, 'config.yaml'), 'utf-8'));
    const localConfig = YAML.parse(readFileSync(path.join(mark2Dir, 'config.yaml'), 'utf-8'));

    expect(stateConfig.phase_defaults.coding.role).toBe('expert-fullstack-coder');
    expect(localConfig.phase_defaults.coding.role).toBe('expert-fullstack-coder');
  });
});
