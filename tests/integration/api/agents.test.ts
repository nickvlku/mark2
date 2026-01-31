import { describe, it, expect, beforeEach, vi } from 'vitest';

// Use vi.hoisted to ensure mocks are available during vi.mock hoisting
const mockNextResponse = vi.hoisted(() => ({
  json: vi.fn().mockReturnThis(),
}));

const mockConfigServiceInstance = vi.hoisted(() => ({
  getAgents: vi.fn().mockReturnValue([]),
  updateAgents: vi.fn().mockImplementation((agents) => agents),
}));

// Mock Next.js modules
vi.mock('next/server', () => ({
  NextResponse: mockNextResponse,
}));

// Mock ConfigService as a class
vi.mock('@/lib/services/config-service', () => ({
  ConfigService: class {
    getAgents = mockConfigServiceInstance.getAgents;
    updateAgents = mockConfigServiceInstance.updateAgents;
  },
}));

// Import the route handlers after mocking
import { GET, PUT } from '@/app/api/agents/route';

describe('Agents API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock return values
    mockConfigServiceInstance.getAgents.mockReturnValue([]);
    mockConfigServiceInstance.updateAgents.mockImplementation((agents) => agents);
  });

  describe('GET /api/agents', () => {
    it('should return empty array when no agents exist', async () => {
      mockConfigServiceInstance.getAgents.mockReturnValue([]);

      await GET();

      expect(mockConfigServiceInstance.getAgents).toHaveBeenCalled();
      expect(mockNextResponse.json).toHaveBeenCalledWith({ agents: [] });
    });

    it('should return agents from ConfigService', async () => {
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
          name: 'another-agent',
          cli_tool: 'gemini-cli',
          model: 'gemini-1.5-pro',
          phase: 'design',
          role_prompt: 'You are another test agent',
          timeout_minutes: 30,
        },
      ];

      mockConfigServiceInstance.getAgents.mockReturnValue(testAgents);

      await GET();

      expect(mockConfigServiceInstance.getAgents).toHaveBeenCalled();
      expect(mockNextResponse.json).toHaveBeenCalledWith({ agents: testAgents });
    });

    it('should return error when ConfigService throws', async () => {
      mockConfigServiceInstance.getAgents.mockImplementation(() => {
        throw new Error('Failed to read agents.yaml');
      });

      await GET();

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
      model: 'claude-sonnet-4-5',
      phase: 'coding',
      role_prompt: 'You are a test agent',
      timeout_minutes: 60,
    };

    it('should create agents and return them', async () => {
      const requestBody = { agents: [validAgent] };
      const mockRequest = {
        json: vi.fn().mockResolvedValue(requestBody),
      } as any;

      mockConfigServiceInstance.updateAgents.mockReturnValue([validAgent]);

      await PUT(mockRequest);

      expect(mockConfigServiceInstance.updateAgents).toHaveBeenCalledWith([validAgent]);
      expect(mockNextResponse.json).toHaveBeenCalledWith({ agents: [validAgent] });
    });

    it('should update existing agents', async () => {
      const newAgents = [validAgent];
      const requestBody = { agents: newAgents };
      const mockRequest = {
        json: vi.fn().mockResolvedValue(requestBody),
      } as any;

      mockConfigServiceInstance.updateAgents.mockReturnValue(newAgents);

      await PUT(mockRequest);

      expect(mockConfigServiceInstance.updateAgents).toHaveBeenCalledWith(newAgents);
      expect(mockNextResponse.json).toHaveBeenCalledWith({ agents: newAgents });
    });

    it('should return error when agents array is missing', async () => {
      const requestBody = {};
      const mockRequest = {
        json: vi.fn().mockResolvedValue(requestBody),
      } as any;

      await PUT(mockRequest);

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

      await PUT(mockRequest);

      // API uses same error message for missing and non-array agents
      expect(mockNextResponse.json).toHaveBeenCalledWith(
        { error: 'agents array is required' },
        { status: 400 },
      );
    });

    it('should return error when agent validation fails (ZodError)', async () => {
      const invalidAgent = {
        name: 'INVALID_NAME', // Invalid: uppercase
        cli_tool: 'invalid-tool', // Invalid: not a valid cli_tool
        model: '',
        phase: 'invalid',
        role_prompt: '',
        timeout_minutes: 0,
      };
      const requestBody = { agents: [invalidAgent] };
      const mockRequest = {
        json: vi.fn().mockResolvedValue(requestBody),
      } as any;

      // Create a ZodError-like object
      const zodError = new Error('Validation failed');
      (zodError as any).name = 'ZodError';
      (zodError as any).issues = [{ message: 'Invalid name format' }];

      mockConfigServiceInstance.updateAgents.mockImplementation(() => {
        throw zodError;
      });

      await PUT(mockRequest);

      expect(mockNextResponse.json).toHaveBeenCalledWith(
        { error: 'Validation failed', details: [{ message: 'Invalid name format' }] },
        { status: 400 },
      );
    });

    it('should return error when ConfigService throws a regular error', async () => {
      const requestBody = { agents: [{ name: 'test' }] };
      const mockRequest = {
        json: vi.fn().mockResolvedValue(requestBody),
      } as any;

      mockConfigServiceInstance.updateAgents.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      await PUT(mockRequest);

      expect(mockNextResponse.json).toHaveBeenCalledWith(
        { error: 'Database connection failed' },
        { status: 500 },
      );
    });

    it('should handle empty agents array', async () => {
      const requestBody = { agents: [] };
      const mockRequest = {
        json: vi.fn().mockResolvedValue(requestBody),
      } as any;

      mockConfigServiceInstance.updateAgents.mockReturnValue([]);

      await PUT(mockRequest);

      expect(mockConfigServiceInstance.updateAgents).toHaveBeenCalledWith([]);
      expect(mockNextResponse.json).toHaveBeenCalledWith({ agents: [] });
    });

    it('should handle multiple agents', async () => {
      const agents = [
        {
          name: 'first-agent',
          cli_tool: 'claude-code',
          model: 'claude-sonnet-4-5',
          phase: 'design',
          role_prompt: 'You are a test agent',
          timeout_minutes: 60,
        },
        {
          name: 'second-agent',
          cli_tool: 'gemini-cli',
          model: 'gemini-1.5-pro',
          phase: 'coding',
          role_prompt: 'You are the second agent',
          timeout_minutes: 120,
        },
      ];
      const requestBody = { agents };
      const mockRequest = {
        json: vi.fn().mockResolvedValue(requestBody),
      } as any;

      mockConfigServiceInstance.updateAgents.mockReturnValue(agents);

      await PUT(mockRequest);

      expect(mockConfigServiceInstance.updateAgents).toHaveBeenCalledWith(agents);
      expect(mockNextResponse.json).toHaveBeenCalledWith({ agents });
    });
  });
});
