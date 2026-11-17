// Device profiles from the code repository (hosts/standalone/profiles/*.json).
import fs from 'node:fs';
import path from 'node:path';
import { PROFILES_DIR } from './config.mjs';

export function loadProfiles(dir = PROFILES_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
    .filter((p) => p.format === 'oscairn.profile');
}
