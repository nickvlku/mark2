import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import YAML from 'yaml';
import { YamlReader } from '../yaml/reader';
import { YamlWriter } from '../yaml/writer';
import { ConfigSchema, AgentsFileSchema, RolesFileSchema } from '../yaml/schemas';
import type { Config, AgentsFile, AgentDefinition, Role, RolesFile } from '../yaml/schemas';

export class ConfigService {
  private reader: YamlReader;
  private writer: YamlWriter;
  private mark2Dir: string;

  constructor(mark2Dir?: string) {
    this.mark2Dir = mark2Dir ?? path.join(process.cwd(), '.mark2');
    this.reader = new YamlReader(this.mark2Dir);
    this.writer = new YamlWriter(this.mark2Dir);
  }

  get(): Config {
    const { data, error } = this.reader.readConfig();
    if (!data) {
      throw new Error(`Failed to read config: ${error?.error ?? 'unknown error'}`);
    }
    return data;
  }

  update(updates: Partial<Config>): Config {
    const current = this.get();
    const merged = { ...current, ...updates };
    const config = ConfigSchema.parse(merged);
    this.writer.writeConfig(config);
    return config;
  }

  // ── Roles (new decoupled model) ───────────────────────────────────────

  getRoles(): Role[] {
    const { data, error } = this.reader.readRoles();
    if (!data) {
      // Return empty array if roles.yaml doesn't exist yet
      if (error?.error === 'File not found') {
        return [];
      }
      throw new Error(`Failed to read roles: ${error?.error ?? 'unknown error'}`);
    }

    // Auto-generate UUIDs for roles that don't have them
    let needsUpdate = false;
    const roles = data.roles.map(role => {
      if (!role.uuid) {
        needsUpdate = true;
        return { ...role, uuid: crypto.randomUUID() };
      }
      return role;
    });

    // Persist the generated UUIDs
    if (needsUpdate) {
      this.updateRoles(roles);
    }

    return roles;
  }

  updateRoles(roles: Role[]): Role[] {
    const rolesFile = RolesFileSchema.parse({ roles });
    this.writer.writeRoles(rolesFile);
    return rolesFile.roles;
  }

  getRoleByName(name: string): Role | undefined {
    const roles = this.getRoles();
    return roles.find(r => r.name === name);
  }

  // ── Agents (deprecated, kept for backwards compatibility) ─────────────

  /**
   * @deprecated Use getRoles() instead. Agents are being replaced by the new
   * decoupled role/cli/model system.
   */
  getAgents(): AgentDefinition[] {
    const filePath = path.join(this.mark2Dir, 'agents.yaml');
    if (!fs.existsSync(filePath)) {
      return [];
    }
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = YAML.parse(content);
      const result = AgentsFileSchema.safeParse(parsed);
      if (result.success) {
        // Auto-generate UUIDs for agents that don't have them
        let needsUpdate = false;
        const agents = result.data.agents.map(agent => {
          if (!agent.uuid) {
            needsUpdate = true;
            return { ...agent, uuid: crypto.randomUUID() };
          }
          return agent;
        });

        // Persist the generated UUIDs
        if (needsUpdate) {
          this.updateAgents(agents);
        }

        return agents;
      }
      throw new Error(`Invalid agents.yaml: ${result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    } catch (e: any) {
      if (e.message.startsWith('Invalid agents.yaml')) throw e;
      throw new Error(`Failed to read agents.yaml: ${e.message}`);
    }
  }

  /**
   * @deprecated Use updateRoles() instead. Agents are being replaced by the new
   * decoupled role/cli/model system.
   */
  updateAgents(agents: AgentDefinition[]): AgentDefinition[] {
    const agentsFile = AgentsFileSchema.parse({ agents });
    const filePath = path.join(this.mark2Dir, 'agents.yaml');
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const content = YAML.stringify(agentsFile, { lineWidth: 0 });
    fs.writeFileSync(filePath, content, 'utf-8');
    return agentsFile.agents;
  }
}
