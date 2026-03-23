// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require('../package.json') as { version: string };
export const VERSION = pkg.version;

export { scan } from './scan.js';
export type { ScanOptions, ScanResult } from './scan.js';
