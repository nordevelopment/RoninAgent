import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { AgentService } from '../src/backend/ai/AgentService.js';

describe('AgentService Tests', () => {
  let agentService: AgentService;
  const testAgentId = 'test_unit_agent_123';
  const testAgentPath = path.join(__dirname, '../agents', testAgentId);

  beforeEach(() => {
    agentService = new AgentService();
    if (fs.existsSync(testAgentPath)) {
      fs.rmSync(testAgentPath, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testAgentPath)) {
      fs.rmSync(testAgentPath, { recursive: true, force: true });
    }
  });

  it('lists available agents excluding templates', async () => {
    const agents = await agentService.getAvailableAgents();
    expect(Array.isArray(agents)).toBe(true);
    expect(agents).not.toContain('base-template');
    expect(agents).not.toContain('base_template');
  });

  it('creates a new agent with empty skills folder and standard markdown files', async () => {
    await agentService.createAgent(testAgentId);

    expect(fs.existsSync(testAgentPath)).toBe(true);
    expect(fs.existsSync(path.join(testAgentPath, 'Agent.md'))).toBe(true);
    expect(fs.existsSync(path.join(testAgentPath, 'Identity.md'))).toBe(true);
    expect(fs.existsSync(path.join(testAgentPath, 'Memory.md'))).toBe(true);
    expect(fs.existsSync(path.join(testAgentPath, 'User.md'))).toBe(true);

    const skillsDir = path.join(testAgentPath, 'skills');
    expect(fs.existsSync(skillsDir)).toBe(true);
    // Should be empty (no copied shared skills)
    const skillsFiles = fs.readdirSync(skillsDir);
    expect(skillsFiles.length).toBe(0);

    const exists = await agentService.agentExists(testAgentId);
    expect(exists).toBe(true);

    // Delete agent
    await agentService.deleteAgent(testAgentId);
    expect(fs.existsSync(testAgentPath)).toBe(false);
  });
});
