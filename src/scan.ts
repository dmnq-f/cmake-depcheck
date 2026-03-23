import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseCMakeContent } from './parser/index.js';
import { scanDirectory, resolveChain, resolveDependencyVariables } from './scanner/index.js';
import { FetchContentDependency } from './parser/types.js';
import { checkForUpdates } from './checker/index.js';
import { UpdateCheckResult } from './checker/types.js';

export interface ScanOptions {
  /** Path to CMakeLists.txt or project root directory */
  path: string;
  /** Additional directory exclusion patterns (directory mode only) */
  excludePatterns?: RegExp[];
  /** Dependency names to exclude from results (matched case-insensitively as exact names) */
  ignoreNames?: string[];
  /** If true, skip update checking */
  scanOnly?: boolean;
  /** Progress callback for update checking — caller decides if/how to show progress */
  onProgress?: (completed: number, total: number) => void;
}

export interface ScanResult {
  /** Discovered dependencies (post-ignore filtering) */
  deps: FetchContentDependency[];
  /** Absolute base path for relativizing locations */
  basePath: string;
  /** How files were discovered */
  scanMode: 'directory' | 'chain';
  /** All CMake files that were scanned (absolute paths) */
  filesScanned: string[];
  /** Warnings from chain resolution, unresolvable paths, etc. */
  warnings: string[];
  /** Number of dependencies excluded by ignore config */
  ignoredCount: number;
  /** Update check results, absent when scanOnly is true */
  updateResults?: UpdateCheckResult[];
}

export async function scan(options: ScanOptions): Promise<ScanResult> {
  const targetPath = path.resolve(options.path);
  const stat = fs.statSync(targetPath);

  let deps: FetchContentDependency[] = [];
  let basePath: string;
  let scanMode: 'directory' | 'chain';
  let filesScanned: string[];
  let warnings: string[] = [];

  if (stat.isDirectory()) {
    scanMode = 'directory';
    basePath = targetPath;
    filesScanned = scanDirectory(targetPath, options.excludePatterns ?? []);
    for (const file of filesScanned) {
      const content = fs.readFileSync(file, 'utf-8');
      deps = deps.concat(parseCMakeContent(content, file));
    }
  } else {
    scanMode = 'chain';
    basePath = path.dirname(targetPath);
    const chain = resolveChain(targetPath);
    filesScanned = chain.files;
    warnings = chain.warnings;
    for (const file of chain.files) {
      const content = fs.readFileSync(file, 'utf-8');
      deps = deps.concat(parseCMakeContent(content, file));
    }
    resolveDependencyVariables(deps, chain.vars);
  }

  let ignoredCount = 0;
  if (options.ignoreNames && options.ignoreNames.length > 0) {
    const patterns = options.ignoreNames.map((name) => new RegExp(`^${name}$`, 'i'));
    const before = deps.length;
    deps = deps.filter((d) => !patterns.some((p) => p.test(d.name)));
    ignoredCount = before - deps.length;
  }

  let updateResults: UpdateCheckResult[] | undefined;
  if (!options.scanOnly) {
    updateResults = await checkForUpdates(deps, options.onProgress);
  }

  return {
    deps,
    basePath,
    scanMode,
    filesScanned,
    warnings,
    ignoredCount,
    updateResults,
  };
}
