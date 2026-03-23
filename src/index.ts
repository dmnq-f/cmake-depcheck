import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };
export const VERSION = pkg.version;

export { scan } from './scan.js';
export type { ScanOptions, ScanResult } from './scan.js';
