import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigService } from '@/lib/services/config-service';
import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';

describe('ConfigService - Agent Management', () => {
  let tempDir: string;
  let configService: ConfigService;

  beforeEach(() => {
    // Create temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mark2-test-'));
    configService = new ConfigService(tempDir);
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('getAgents()', () => {
    it('should return empty array when agents.yaml does not exist', () => {
      const agents = configService.getAgents();
      expect(agents).toEqual([]);
    });

    it('should return agents from valid agents.yaml', () => {
      const testAgents = [
        {
          name: 'test-agent',
          cli_tool: 'claude-code',
          model: 'claude-sonnet-4-5',
          phase: 'coding',
          role_prompt: 'You are a test agent',
          timeout_minutes: 60,
        },
        {
          name: 'gemini-agent',
          cli_tool: 'gemini-cli',
          model: 'gemini-1.5-pro',
          phase: 'design',
          role_prompt: 'You are a Gemini agent',
          timeout_minutes: 30,
        },
      ];

      const agentsFile = { agents: testAgents };
      const agentsPath = path.join(tempDir, 'agents.yaml');
      fs.writeFileSync(agentsPath, YAML.stringify(agentsFile), 'utf-8');

      const agents = configService.getAgents();
      expect(agents).toHaveLength(testAgents.length);
      agents.forEach((agent, i) => {
        expect(agent).toMatchObject(testAgents[i]);
        expect(agent.uuid).toBeDefined();
        expect(typeof agent.uuid).toBe('string');
      });
    });

    it('should throw error for invalid agents.yaml structure', () => {
      const agentsPath = path.join(tempDir, 'agents.yaml');
      fs.writeFileSync(agentsPath, YAML.stringify({ invalid: 'structure' }), 'utf-8');

      expect(() => configService.getAgents()).toThrow(/Invalid agents\.yaml/);
    });

    it('should throw error for malformed YAML', () => {
      const agentsPath = path.join(tempDir, 'agents.yaml');
      fs.writeFileSync(agentsPath, 'invalid: yaml: content:', 'utf-8');

      expect(() => configService.getAgents()).toThrow(/Failed to read agents\.yaml/);
    });

    it('should throw error for agents with invalid schema', () => {
      const invalidAgentsFile = {
        agents: [
          {
            name: 'invalid-name!', // Invalid name format
            cli_tool: 'invalid-tool', // Invalid enum value
            model: '', // Empty model
            role_prompt: '', // Empty role_prompt
            timeout_minutes: -1, // Invalid timeout
          },
        ],
      };

      const agentsPath = path.join(tempDir, 'agents.yaml');
      fs.writeFileSync(agentsPath, YAML.stringify(invalidAgentsFile), 'utf-8');

      expect(() => configService.getAgents()).toThrow(/Invalid agents\.yaml/);
    });

    it('should handle empty agents array', () => {
      const agentsFile = { agents: [] };
      const agentsPath = path.join(tempDir, 'agents.yaml');
      fs.writeFileSync(agentsPath, YAML.stringify(agentsFile), 'utf-8');

      const agents = configService.getAgents();
      expect(agents).toEqual([]);
    });
  });

  describe('updateAgents()', () => {
    it('should create agents.yaml when it does not exist', () => {
      const testAgents = [
        {
          name: 'new-agent',
          cli_tool: 'claude-code' as const,
          model: 'claude-sonnet-4-5',
          phase: 'coding' as const,
          role_prompt: 'You are a new agent',
          timeout_minutes: 60,
        },
      ];

      const result = configService.updateAgents(testAgents);

      expect(result).toEqual(testAgents);

      const agentsPath = path.join(tempDir, 'agents.yaml');
      expect(fs.existsSync(agentsPath)).toBe(true);

      // Verify file contents
      const fileContent = fs.readFileSync(agentsPath, 'utf-8');
      const parsed = YAML.parse(fileContent);
      expect(parsed.agents).toEqual(testAgents);
    });

    it('should create directory if it does not exist', () => {
      // Use a nested directory that doesn't exist
      const nestedTempDir = path.join(tempDir, 'nested', 'dir');
      const nestedConfigService = new ConfigService(nestedTempDir);

      const testAgents = [
        {
          name: 'nested-agent',
          cli_tool: 'opencode' as const,
          model: 'gpt-4',
          phase: 'testing' as const,
          role_prompt: 'You are a nested agent',
          timeout_minutes: 45,
        },
      ];

      const result = nestedConfigService.updateAgents(testAgents);

      expect(result).toEqual(testAgents);
      expect(fs.existsSync(path.join(nestedTempDir, 'agents.yaml'))).toBe(true);
    });

    it('should overwrite existing agents.yaml', () => {
      // Create initial agents.yaml
      const initialAgents = [
        {
          name: 'initial-agent',
          cli_tool: 'codex-cli' as const,
          model: 'gpt-4',
          phase: 'coding' as const,
          role_prompt: 'Initial agent',
          timeout_minutes: 30,
        },
      ];
      configService.updateAgents(initialAgents);

      // Update with new agents
      const newAgents = [
        {
          name: 'updated-agent',
          cli_tool: 'gemini-cli' as const,
          model: 'gemini-1.5-pro',
          phase: 'design' as const,
          role_prompt: 'Updated agent',
          timeout_minutes: 90,
        },
      ];

      const result = configService.updateAgents(newAgents);

      expect(result).toEqual(newAgents);

      // Verify file was updated (getAgents adds uuid when missing)
      const retrievedAgents = configService.getAgents();
      expect(retrievedAgents).toHaveLength(newAgents.length);
      retrievedAgents.forEach((agent, i) => {
        expect(agent).toMatchObject(newAgents[i]);
        expect(agent.uuid).toBeDefined();
        expect(typeof agent.uuid).toBe('string');
      });
    });

    it('should handle multiple agents', () => {
      const testAgents = [
        {
          name: 'agent-one',
          cli_tool: 'claude-code' as const,
          model: 'claude-sonnet-4-5',
          phase: 'design' as const,
          role_prompt: 'You are agent one',
          timeout_minutes: 60,
        },
        {
          name: 'agent-two',
          cli_tool: 'gemini-cli' as const,
          model: 'gemini-1.5-pro',
          phase: 'coding' as const,
          role_prompt: 'You are agent two',
          timeout_minutes: 30,
        },
        {
          name: 'agent-three',
          cli_tool: 'opencode' as const,
          model: 'gpt-4-turbo',
          phase: 'testing' as const,
          role_prompt: 'You are agent three',
          timeout_minutes: 120,
        },
      ];

      const result = configService.updateAgents(testAgents);

      expect(result).toEqual(testAgents);

      // Verify all agents were saved (getAgents adds uuid when missing)
      const retrievedAgents = configService.getAgents();
      expect(retrievedAgents).toHaveLength(testAgents.length);
      retrievedAgents.forEach((agent, i) => {
        expect(agent).toMatchObject(testAgents[i]);
        expect(agent.uuid).toBeDefined();
        expect(typeof agent.uuid).toBe('string');
      });
    });

    it('should handle empty agents array', () => {
      // First create some agents
      const initialAgents = [
        {
          name: 'temp-agent',
          cli_tool: 'claude-code' as const,
          model: 'claude-sonnet-4-5',
          phase: 'coding' as const,
          role_prompt: 'Temporary agent',
          timeout_minutes: 60,
        },
      ];
      configService.updateAgents(initialAgents);

      // Then clear all agents
      const result = configService.updateAgents([]);

      expect(result).toEqual([]);

      // Verify file was updated
      const retrievedAgents = configService.getAgents();
      expect(retrievedAgents).toEqual([]);
    });

    it('should validate agent schema and throw on invalid data', () => {
      const invalidAgents = [
        {
          name: 'INVALID-NAME', // Should be lowercase
          cli_tool: 'invalid-tool', // Invalid enum value
          model: '', // Empty model
          role_prompt: '', // Empty role_prompt
          timeout_minutes: 0, // Invalid timeout
        },
      ] as any;

      expect(() => configService.updateAgents(invalidAgents)).toThrow();
    });

    it('should apply default timeout when not specified', () => {
      const agentWithoutTimeout = {
        name: 'default-timeout-agent',
        cli_tool: 'claude-code',
        model: 'claude-sonnet-4-5',
        phase: 'coding',
        role_prompt: 'Agent with default timeout',
        // timeout_minutes not specified - should default to 60
      } as any;

      const result = configService.updateAgents([agentWithoutTimeout]);

      expect(result[0].timeout_minutes).toBe(60);
    });

    it('should preserve valid timeout when specified', () => {
      const agentWithCustomTimeout = {
        name: 'custom-timeout-agent',
        cli_tool: 'claude-code' as const,
        model: 'claude-sonnet-4-5',
        phase: 'coding' as const,
        role_prompt: 'Agent with custom timeout',
        timeout_minutes: 180,
      };

      const result = configService.updateAgents([agentWithCustomTimeout]);

      expect(result[0].timeout_minutes).toBe(180);
    });

    it('should validate agent name format', () => {
      const invalidNames = [
        'UPPERCASE',
        'with spaces',
        'with_underscores',
        'with.dots',
        'with@symbols',
        '',
        '123-starts-with-number',
      ];

      invalidNames.forEach((invalidName) => {
        const agent = {
          name: invalidName,
          cli_tool: 'claude-code' as const,
          model: 'claude-sonnet-4-5',
          phase: 'coding' as const,
          role_prompt: 'Test agent',
          timeout_minutes: 60,
        };

        expect(() => configService.updateAgents([agent])).toThrow();
      });
    });

    it('should accept valid agent name formats', () => {
      const validNames = [
        'valid-agent',
        'agent123',
        'a',
        'another-valid-name-123',
        'hyphen-separated-name',
      ];

      validNames.forEach((validName) => {
        const agent = {
          name: validName,
          cli_tool: 'claude-code' as const,
          model: 'claude-sonnet-4-5',
          phase: 'coding' as const,
          role_prompt: 'Test agent',
          timeout_minutes: 60,
        };

        expect(() => configService.updateAgents([agent])).not.toThrow();
      });
    });

    it('should validate cli_tool enum values', () => {
      const validCliTools = ['claude-code', 'codex-cli', 'gemini-cli', 'opencode'] as const;

      validCliTools.forEach((cliTool) => {
        const agent = {
          name: 'test-agent',
          cli_tool: cliTool,
          model: 'test-model',
          phase: 'coding' as const,
          role_prompt: 'Test agent',
          timeout_minutes: 60,
        };

        expect(() => configService.updateAgents([agent])).not.toThrow();
      });

      // Test invalid cli_tool
      const invalidAgent = {
        name: 'test-agent',
        cli_tool: 'invalid-tool' as any,
        model: 'test-model',
        phase: 'coding' as const,
        role_prompt: 'Test agent',
        timeout_minutes: 60,
      };

      expect(() => configService.updateAgents([invalidAgent])).toThrow();
    });
  });
});