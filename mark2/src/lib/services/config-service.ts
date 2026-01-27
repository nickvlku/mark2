import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { YamlReader } from '../yaml/reader';
import { YamlWriter } from '../yaml/writer';
import { ConfigSchema, AgentsFileSchema } from '../yaml/schemas';
import type { Config, AgentsFile, AgentDefinition } from '../yaml/schemas';

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
        return result.data.agents;
      }
      throw new Error(`Invalid agents.yaml: ${result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    } catch (e: any) {
      if (e.message.startsWith('Invalid agents.yaml')) throw e;
      throw new Error(`Failed to read agents.yaml: ${e.message}`);
    }
  }

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
