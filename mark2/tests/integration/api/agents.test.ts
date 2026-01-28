import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigService } from '@/lib/services/config-service';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Mock Next.js modules
vi.mock('next/server', () => {
  return {
    NextResponse: {
      json: vi.fn(),
    },
  };
});

// Import the route handlers after mocking
import { GET, PUT } from '@/app/api/agents/route';

describe('Agents API', () => {
  let tempDir: string;
  let configService: ConfigService;

  beforeEach(() => {
    // Create temporary directory for test agents.yaml
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mark2-test-'));
    configService = new ConfigService(tempDir);
    
    // Reset mocks
    vi.clearAllMocks();
    // Mock setup is handled in the vi.mock call
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('GET /api/agents', () => {
    it('should return empty array when no agents.yaml exists', async () => {
      const response = await GET();

      expect(mockNextResponse.json).toHaveBeenCalledWith({ agents: [] });
    });

    it('should return agents from agents.yaml', async () => {
      // Create test agents.yaml
      const agentsData = {
        agents: [
          {
            name: 'test-agent',
            cli_tool: 'claude-code',
            model: 'claude-sonnet-4-20250514',
            role_prompt: 'You are a test agent',
            timeout_minutes: 60,
          },
          {
            name: 'another-agent',
            cli_tool: 'gemini-cli',
            model: 'gemini-1.5-pro',
            role_prompt: 'You are another test agent',
            timeout_minutes: 30,
          },
        ],
      };

      const agentsPath = path.join(tempDir, 'agents.yaml');
      fs.writeFileSync(agentsPath, JSON.stringify(agentsData), 'utf-8');

      const response = await GET();

      expect(mockNextResponse.json).toHaveBeenCalledWith({
        agents: agentsData.agents,
      });
    });

    it('should return error for invalid agents.yaml', async () => {
      // Create invalid agents.yaml
      const agentsPath = path.join(tempDir, 'agents.yaml');
      fs.writeFileSync(agentsPath, 'invalid: yaml: content:', 'utf-8');

      const response = await GET();

      expect(mockNextResponse.json).toHaveBeenCalledWith(
        { error: expect.stringContaining('Failed to read agents.yaml') },
        { status: 500 },
      );
    });
  });

  describe('PUT /api/agents', () => {
    const validAgent = {
      name: 'test-agent',
      cli_tool: 'claude-code',
      model: 'claude-sonnet-4-20250514',
      role_prompt: 'You are a test agent',
      timeout_minutes: 60,
    };

    it('should create agents.yaml and return created agents', async () => {
      const requestBody = { agents: [validAgent] };
      const mockRequest = {
        json: vi.fn().mockResolvedValue(requestBody),
      } as any;

      const response = await PUT(mockRequest);

      // Verify agents.yaml was created
      const agentsPath = path.join(tempDir, 'agents.yaml');
      expect(fs.existsSync(agentsPath)).toBe(true);

      // Verify response
      expect(mockNextResponse.json).toHaveBeenCalledWith({
        agents: [validAgent],
      });
    });

    it('should update existing agents.yaml', async () => {
      // Create initial agents.yaml
      const initialAgent = {
        name: 'initial-agent',
        cli_tool: 'codex-cli',
        model: 'gpt-4',
        role_prompt: 'Initial agent',
        timeout_minutes: 45,
      };
      
      configService.updateAgents([initialAgent]);

      // Update with new agents
      const newAgents = [validAgent];
      const requestBody = { agents: newAgents };
      const mockRequest = {
        json: vi.fn().mockResolvedValue(requestBody),
      } as any;

      const response = await PUT(mockRequest);

      // Verify response contains new agents only
      expect(mockNextResponse.json).toHaveBeenCalledWith({
        agents: newAgents,
      });

      // Verify file was updated
      const savedAgents = configService.getAgents();
      expect(savedAgents).toEqual(newAgents);
    });

    it('should return error when agents array is missing', async () => {
      const requestBody = {};
      const mockRequest = {
        json: vi.fn().mockResolvedValue(requestBody),
      } as any;

      const response = await PUT(mockRequest);

      expect(mockNextResponse.json).toHaveBeenCalledWith(
        { error: 'agents array is required' },
        { status: 400 },
      );
    });

    it('should return error when agents is not an array', async () => {
      const requestBody = { agents: 'not-an-array' };
      const mockRequest = {
        json: vi.fn().mockResolvedValue(requestBody),
      } as any;

      const response = await PUT(mockRequest);

      expect(mockNextResponse.json).toHaveBeenCalledWith(
        { error: 'agents array is required' },
        { status: 400 },
      );
    });

    it('should return validation error for invalid agent data', async () => {
      const invalidAgent = {
        name: 'invalid-name!', // Invalid characters
        cli_tool: 'invalid-tool', // Invalid enum value
        model: '', // Empty model
        role_prompt: '', // Empty role_prompt
        timeout_minutes: 0, // Invalid timeout
      };

      const requestBody = { agents: [invalidAgent] };
      const mockRequest = {
        json: vi.fn().mockResolvedValue(requestBody),
      } as any;

      const response = await PUT(mockRequest);

      expect(mockNextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation failed',
        }),
        { status: 400 },
      );
    });

    it('should handle multiple valid agents', async () => {
      const agents = [
        validAgent,
        {
          name: 'second-agent',
          cli_tool: 'gemini-cli',
          model: 'gemini-1.5-pro',
          role_prompt: 'You are the second agent',
          timeout_minutes: 120,
        },
      ];

      const requestBody = { agents };
      const mockRequest = {
        json: vi.fn().mockResolvedValue(requestBody),
      } as any;

      const response = await PUT(mockRequest);

      expect(mockNextResponse.json).toHaveBeenCalledWith({
        agents,
      });

      // Verify all agents were saved
      const savedAgents = configService.getAgents();
      expect(savedAgents).toEqual(agents);
    });

    it('should handle request JSON parsing errors', async () => {
      const mockRequest = {
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
      } as any;

      const response = await PUT(mockRequest);

      expect(mockNextResponse.json).toHaveBeenCalledWith(
        { error: 'Invalid JSON' },
        { status: 500 },
      );
    });
  });
});