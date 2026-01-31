import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import YAML from 'yaml';
import { YamlReader } from '../yaml/reader';
import { YamlWriter } from '../yaml/writer';
import { ConfigSchema, RolesFileSchema } from '../yaml/schemas';
import type { Config, Role, RolesFile } from '../yaml/schemas';

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

}
