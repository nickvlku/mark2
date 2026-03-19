import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { YamlReader } from '../yaml/reader';
import { YamlWriter } from '../yaml/writer';
import { ConfigSchema, RolesFileSchema } from '../yaml/schemas';
import type { Config, Role, RolesFile } from '../yaml/schemas';
import { getMark2Dir } from '../utils/mark2-dir';

export class ConfigService {
  private mark2Dir: string;
  private stateDir: string;

  constructor(mark2Dir?: string) {
    this.mark2Dir = mark2Dir ?? getMark2Dir();
    this.stateDir = path.join(this.mark2Dir, '.state');
  }

  private getStorageDir(): string {
    return fs.existsSync(this.stateDir) ? this.stateDir : this.mark2Dir;
  }

  private getReader(dir: string = this.getStorageDir()): YamlReader {
    return new YamlReader(dir);
  }

  private getWriter(dir: string = this.getStorageDir()): YamlWriter {
    return new YamlWriter(dir);
  }

  private mirrorFileToLocal(fileName: 'config.yaml' | 'roles.yaml'): void {
    const storageDir = this.getStorageDir();
    if (storageDir === this.mark2Dir) {
      return;
    }

    const sourcePath = path.join(storageDir, fileName);
    const targetPath = path.join(this.mark2Dir, fileName);
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }

  private readConfigWithFallback(): { data: Config | null; error?: { error: string } | null } {
    const storageDir = this.getStorageDir();
    const primary = this.getReader(storageDir).readConfig();
    if (primary.data || storageDir === this.mark2Dir) {
      return primary;
    }
    return this.getReader(this.mark2Dir).readConfig();
  }

  private readRolesWithFallback(): { data: RolesFile | null; error?: { error: string } | null } {
    const storageDir = this.getStorageDir();
    const primary = this.getReader(storageDir).readRoles();
    if (primary.data || storageDir === this.mark2Dir) {
      return primary;
    }
    return this.getReader(this.mark2Dir).readRoles();
  }

  get(): Config {
    const { data, error } = this.readConfigWithFallback();
    if (!data) {
      throw new Error(`Failed to read config: ${error?.error ?? 'unknown error'}`);
    }
    return data;
  }

  update(updates: Partial<Config>): Config {
    const current = this.get();
    const merged = { ...current, ...updates };
    const config = ConfigSchema.parse(merged);
    this.getWriter().writeConfig(config);
    this.mirrorFileToLocal('config.yaml');
    return config;
  }

  // ── Roles (new decoupled model) ───────────────────────────────────────

  getRoles(): Role[] {
    const { data, error } = this.readRolesWithFallback();
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
    this.getWriter().writeRoles(rolesFile);
    this.mirrorFileToLocal('roles.yaml');
    return rolesFile.roles;
  }

  getRoleByName(name: string): Role | undefined {
    const roles = this.getRoles();
    return roles.find(r => r.name === name);
  }

}
