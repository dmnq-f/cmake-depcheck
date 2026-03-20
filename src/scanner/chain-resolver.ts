import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ChainResult {
  files: string[];
  warnings: string[];
}

const DIRECTIVE_PATTERN = /\b(include|add_subdirectory)\s*\(\s*([^)]+)\s*\)/gi;

function isUnresolvable(arg: string): boolean {
  return arg.includes('${') || arg.includes('$<');
}

function isModuleName(arg: string): boolean {
  // A bare name with no path separators — relies on CMAKE_MODULE_PATH
  return !arg.includes('/') && !arg.includes('\\') && !arg.endsWith('.cmake');
}

function stripQuotes(arg: string): string {
  if (arg.startsWith('"') && arg.endsWith('"')) {
    return arg.slice(1, -1);
  }
  return arg;
}

function stripComments(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('#');
      return idx === -1 ? line : line.substring(0, idx);
    })
    .join('\n');
}

/**
 * Extract the first argument from a CMake function call body.
 * The body may contain multiple whitespace-separated args; we only want the first.
 */
function firstArg(body: string): string {
  return stripQuotes(body.trim().split(/\s+/)[0]);
}

function lineNumberAt(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

/**
 * Resolve the chain of include() and add_subdirectory() calls starting from an entry file.
 * Returns all discovered file paths and any warnings for unresolvable references.
 */
export function resolveChain(entryFile: string): ChainResult {
  const visited = new Set<string>();
  const files: string[] = [];
  const warnings: string[] = [];

  function visit(filePath: string): void {
    const resolved = path.resolve(filePath);
    if (visited.has(resolved)) return;
    visited.add(resolved);
    files.push(resolved);

    const content = fs.readFileSync(resolved, 'utf-8');
    const cleaned = stripComments(content);
    const dir = path.dirname(resolved);

    let match: RegExpExecArray | null;
    DIRECTIVE_PATTERN.lastIndex = 0;
    while ((match = DIRECTIVE_PATTERN.exec(cleaned)) !== null) {
      const kind = match[1].toLowerCase();
      const arg = firstArg(match[2]);
      const line = lineNumberAt(content, match.index);

      if (isUnresolvable(arg)) {
        warnings.push(`Warning: skipping unresolvable path '${arg}' in ${resolved}:${line}`);
        continue;
      }

      if (kind === 'include') {
        if (isModuleName(arg)) {
          const knownModules = ['fetchcontent', 'ctest', 'cpack', 'externalproject'];
          if (!knownModules.includes(arg.toLowerCase())) {
            warnings.push(`Warning: skipping unresolvable module '${arg}' in ${resolved}:${line}`);
          }
          continue;
        }

        let target = path.resolve(dir, arg);
        if (!target.endsWith('.cmake')) {
          target += '.cmake';
        }

        if (!fs.existsSync(target)) {
          warnings.push(`Warning: file not found '${target}' referenced in ${resolved}:${line}`);
          continue;
        }

        visit(target);
      } else {
        // add_subdirectory
        const target = path.resolve(dir, arg, 'CMakeLists.txt');

        if (!fs.existsSync(target)) {
          warnings.push(`Warning: file not found '${target}' referenced in ${resolved}:${line}`);
          continue;
        }

        visit(target);
      }
    }
  }

  visit(entryFile);
  return { files, warnings };
}
