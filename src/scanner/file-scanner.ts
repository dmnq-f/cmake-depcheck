import * as fs from 'node:fs';
import * as path from 'node:path';

const DEFAULT_EXCLUDE_PATTERNS = [/^build/, /^cmake-build-/, /^_deps$/, /^\./, /^node_modules$/];

function shouldExcludeDir(dirName: string, customExcludes: RegExp[]): boolean {
  const allPatterns = [...DEFAULT_EXCLUDE_PATTERNS, ...customExcludes];
  return allPatterns.some((pattern) => pattern.test(dirName));
}

function isCMakeFile(fileName: string): boolean {
  return fileName === 'CMakeLists.txt' || fileName.endsWith('.cmake');
}

/**
 * Recursively find all CMake files in a directory, respecting exclusion patterns.
 */
export function scanDirectory(dirPath: string, customExcludes: RegExp[] = []): string[] {
  const results: string[] = [];

  function walk(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!shouldExcludeDir(entry.name, customExcludes)) {
          walk(path.join(dir, entry.name));
        }
      } else if (entry.isFile() && isCMakeFile(entry.name)) {
        results.push(path.join(dir, entry.name));
      }
    }
  }

  walk(dirPath);
  return results.sort();
}
