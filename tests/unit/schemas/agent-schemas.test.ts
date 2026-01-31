import { describe, it, expect } from 'vitest';
import { AgentDefinitionSchema, AgentsFileSchema } from '@/lib/yaml/schemas';

describe('Agent Schemas', () => {
  describe('AgentDefinitionSchema', () => {
    const validAgent = {
      name: 'test-agent',
      cli_tool: 'claude-code',
      model: 'claude-sonnet-4-5',
      phase: 'coding',
      role_prompt: 'You are a helpful assistant',
      timeout_minutes: 60,
    };

    it('should validate a correct agent definition', () => {
      const result = AgentDefinitionSchema.safeParse(validAgent);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validAgent);
      }
    });

    it('should apply default timeout of 60 minutes', () => {
      const { timeout_minutes, ...agentWithoutTimeout } = validAgent;

      const result = AgentDefinitionSchema.safeParse(agentWithoutTimeout);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.timeout_minutes).toBe(60);
      }
    });

    describe('name validation', () => {
      it('should accept valid names', () => {
        const validNames = [
          'agent',
          'test-agent',
          'agent123',
          'my-cool-agent',
          'a',
          'agent-with-multiple-hyphens',
        ];

        validNames.forEach((name) => {
          const agent = { ...validAgent, name };
          const result = AgentDefinitionSchema.safeParse(agent);
          expect(result.success).toBe(true);
        });
      });

      it('should reject invalid names', () => {
        const invalidNames = [
          'Agent', // Uppercase
          'TEST-AGENT', // All uppercase
          'test_agent', // Underscore
          'test.agent', // Dot
          'test agent', // Space
          'test@agent', // Special character
          'test/agent', // Forward slash
          'test\\agent', // Backslash
          'test+agent', // Plus
          'test=agent', // Equals
          '', // Empty string
          'agent!', // Exclamation mark
          'agent?', // Question mark
          'agent#', // Hash
          'agent$', // Dollar sign
          'agent%', // Percent
          'agent^', // Caret
          'agent&', // Ampersand
          'agent*', // Asterisk
          'agent()', // Parentheses
          'agent{}', // Braces
          'agent[]', // Brackets
          'agent|', // Pipe
          'agent:', // Colon
          'agent;', // Semicolon
          'agent,', // Comma
          '123agent', // Starts with digit
        ];

        invalidNames.forEach((name) => {
          const agent = { ...validAgent, name };
          const result = AgentDefinitionSchema.safeParse(agent);
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.issues[0].message).toContain('Agent names must be lowercase alphanumeric with hyphens');
          }
        });
      });

      it('should require name field', () => {
        const { name, ...agentWithoutName } = validAgent;

        const result = AgentDefinitionSchema.safeParse(agentWithoutName);
        expect(result.success).toBe(false);
      });
    });

    describe('cli_tool validation', () => {
      it('should accept valid cli_tool values', () => {
        const validCliTools = ['claude-code', 'codex-cli', 'gemini-cli', 'opencode'];

        validCliTools.forEach((cli_tool) => {
          const agent = { ...validAgent, cli_tool };
          const result = AgentDefinitionSchema.safeParse(agent);
          expect(result.success).toBe(true);
        });
      });

      it('should reject invalid cli_tool values', () => {
        const invalidCliTools = [
          'invalid-tool',
          'claude',
          'gemini',
          'openai',
          'anthropic',
          '',
          'CLAUDE-CODE',
          'Claude-Code',
        ];

        invalidCliTools.forEach((cli_tool) => {
          const agent = { ...validAgent, cli_tool };
          const result = AgentDefinitionSchema.safeParse(agent);
          expect(result.success).toBe(false);
        });
      });

      it('should require cli_tool field', () => {
        const { cli_tool, ...agentWithoutCliTool } = validAgent;

        const result = AgentDefinitionSchema.safeParse(agentWithoutCliTool);
        expect(result.success).toBe(false);
      });
    });

    describe('model validation', () => {
      it('should accept any non-empty string for model', () => {
        const validModels = [
          'claude-sonnet-4-5',
          'gpt-4',
          'gpt-4-turbo',
          'gemini-1.5-pro',
          'custom-model-name',
          'model123',
          'very-long-model-name-with-lots-of-characters',
        ];

        validModels.forEach((model) => {
          const agent = { ...validAgent, model };
          const result = AgentDefinitionSchema.safeParse(agent);
          expect(result.success).toBe(true);
        });
      });

      it('should reject empty model string', () => {
        const agent = { ...validAgent, model: '' };
        const result = AgentDefinitionSchema.safeParse(agent);
        expect(result.success).toBe(false);
      });

      it('should require model field', () => {
        const { model, ...agentWithoutModel } = validAgent;

        const result = AgentDefinitionSchema.safeParse(agentWithoutModel);
        expect(result.success).toBe(false);
      });
    });

    describe('role_prompt validation', () => {
      it('should accept any non-empty string for role_prompt', () => {
        const validPrompts = [
          'You are a helpful assistant',
          'Short prompt',
          `You are a very detailed assistant with a long prompt that explains
           exactly what you should do in multiple lines and provides comprehensive
           instructions for the agent's behavior.`,
          'Simple.',
          'Prompt with numbers 123 and symbols!',
        ];

        validPrompts.forEach((role_prompt) => {
          const agent = { ...validAgent, role_prompt };
          const result = AgentDefinitionSchema.safeParse(agent);
          expect(result.success).toBe(true);
        });
      });

      it('should reject empty role_prompt string', () => {
        const agent = { ...validAgent, role_prompt: '' };
        const result = AgentDefinitionSchema.safeParse(agent);
        expect(result.success).toBe(false);
      });

      it('should require role_prompt field', () => {
        const { role_prompt, ...agentWithoutPrompt } = validAgent;

        const result = AgentDefinitionSchema.safeParse(agentWithoutPrompt);
        expect(result.success).toBe(false);
      });
    });

    describe('timeout_minutes validation', () => {
      it('should accept positive integers for timeout_minutes', () => {
        const validTimeouts = [1, 30, 60, 120, 240, 600, 1440];

        validTimeouts.forEach((timeout_minutes) => {
          const agent = { ...validAgent, timeout_minutes };
          const result = AgentDefinitionSchema.safeParse(agent);
          expect(result.success).toBe(true);
        });
      });

      it('should reject zero and negative timeout_minutes', () => {
        const invalidTimeouts = [0, -1, -60, -120];

        invalidTimeouts.forEach((timeout_minutes) => {
          const agent = { ...validAgent, timeout_minutes };
          const result = AgentDefinitionSchema.safeParse(agent);
          expect(result.success).toBe(false);
        });
      });

      it('should reject non-integer timeout_minutes', () => {
        const invalidTimeouts = [30.5, 60.1, 120.99];

        invalidTimeouts.forEach((timeout_minutes) => {
          const agent = { ...validAgent, timeout_minutes };
          const result = AgentDefinitionSchema.safeParse(agent);
          expect(result.success).toBe(false);
        });
      });

      it('should reject non-numeric timeout_minutes', () => {
        // undefined gets default value, so we exclude it
        const invalidTimeouts = ['60', '30', 'thirty', null, {}];

        invalidTimeouts.forEach((timeout_minutes) => {
          const agent = { ...validAgent, timeout_minutes };
          const result = AgentDefinitionSchema.safeParse(agent);
          expect(result.success).toBe(false);
        });
      });

      it('should apply default for undefined timeout_minutes', () => {
        const agent = { ...validAgent, timeout_minutes: undefined };
        const result = AgentDefinitionSchema.safeParse(agent);
        expect(result.success).toBe(true);
        expect(result.data?.timeout_minutes).toBe(60);
      });
    });

    it('should reject additional unknown properties', () => {
      const agentWithExtra = {
        ...validAgent,
        unknown_field: 'should not be allowed',
      };

      const result = AgentDefinitionSchema.safeParse(agentWithExtra);
      expect(result.success).toBe(false);
    });
  });

  describe('AgentsFileSchema', () => {
    const validAgentsFile = {
      agents: [
        {
          name: 'agent-one',
          cli_tool: 'claude-code',
          model: 'claude-sonnet-4-5',
          phase: 'design',
          role_prompt: 'You are agent one',
          timeout_minutes: 60,
        },
        {
          name: 'agent-two',
          cli_tool: 'gemini-cli',
          model: 'gemini-1.5-pro',
          phase: 'coding',
          role_prompt: 'You are agent two',
          timeout_minutes: 30,
        },
      ],
    };

    it('should validate a correct agents file structure', () => {
      const result = AgentsFileSchema.safeParse(validAgentsFile);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validAgentsFile);
      }
    });

    it('should apply default empty array for agents', () => {
      const emptyFile = {};
      const result = AgentsFileSchema.safeParse(emptyFile);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agents).toEqual([]);
      }
    });

    it('should accept empty agents array', () => {
      const fileWithEmptyAgents = { agents: [] };
      const result = AgentsFileSchema.safeParse(fileWithEmptyAgents);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agents).toEqual([]);
      }
    });

    it('should validate all agents in the array', () => {
      const fileWithInvalidAgent = {
        agents: [
          {
            name: 'valid-agent',
            cli_tool: 'claude-code',
            model: 'claude-sonnet-4-5',
            phase: 'coding',
            role_prompt: 'Valid agent',
            timeout_minutes: 60,
          },
          {
            name: 'INVALID-AGENT', // Invalid name
            cli_tool: 'invalid-tool', // Invalid cli_tool
            model: '',
            phase: 'invalid', // Invalid phase
            role_prompt: '',
            timeout_minutes: 0,
          },
        ],
      };

      const result = AgentsFileSchema.safeParse(fileWithInvalidAgent);
      expect(result.success).toBe(false);
    });

    it('should reject non-array agents field', () => {
      const invalidTypes = [
        'string',
        123,
        { not: 'array' },
        null,
      ];

      invalidTypes.forEach((agents) => {
        const file = { agents };
        const result = AgentsFileSchema.safeParse(file);
        expect(result.success).toBe(false);
      });
    });

    it('should accept single agent in array', () => {
      const fileWithSingleAgent = {
        agents: [
          {
            name: 'single-agent',
            cli_tool: 'opencode',
            model: 'gpt-4',
            phase: 'testing',
            role_prompt: 'You are a single agent',
            timeout_minutes: 45,
          },
        ],
      };

      const result = AgentsFileSchema.safeParse(fileWithSingleAgent);
      expect(result.success).toBe(true);
    });

    it('should reject additional unknown properties at the file level', () => {
      const fileWithExtra = {
        ...validAgentsFile,
        unknown_field: 'should not be allowed',
      };

      const result = AgentsFileSchema.safeParse(fileWithExtra);
      expect(result.success).toBe(false);
    });

    it('should handle large number of agents', () => {
      const phases = ['design', 'coding', 'testing', 'code_review', 'manual_testing'] as const;
      const manyAgents = Array.from({ length: 100 }, (_, i) => ({
        name: `agent-${i}`,
        cli_tool: 'claude-code' as const,
        model: 'claude-sonnet-4-5',
        phase: phases[i % phases.length],
        role_prompt: `You are agent number ${i}`,
        timeout_minutes: 60,
      }));

      const fileWithManyAgents = { agents: manyAgents };
      const result = AgentsFileSchema.safeParse(fileWithManyAgents);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agents).toHaveLength(100);
      }
    });
  });
});