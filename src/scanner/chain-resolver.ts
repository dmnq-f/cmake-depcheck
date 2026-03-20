import * as fs from 'node:fs';
import * as path from 'node:path';
import { findClosingParen, lineNumberAt, stripComments, tokenize } from '../cmake-utils.js';
import { FetchContentDependency } from '../parser/types.js';

export interface ChainResult {
  files: string[];
  warnings: string[];
  vars: Map<string, string>;
}

function isModuleName(arg: string): boolean {
  return !arg.includes('/') && !arg.includes('\\') && !arg.endsWith('.cmake');
}

/**
 * Resolve ${VAR} references in a string using the variable table.
 * Returns null if any variables remain unresolved.
 */
export function resolveVariables(
  input: string,
  vars: Map<string, string>,
  depth = 0,
): string | null {
  if (depth > 10) return null;
  if (!input.includes('${')) return input;

  const result = input.replace(/\$\{(\w+)\}/g, (_match, varName: string) => {
    const value = vars.get(varName);
    if (value === undefined) return _match;
    return value;
  });

  if (result.includes('${') && result !== input) {
    return resolveVariables(result, vars, depth + 1);
  }

  return result.includes('${') ? null : result;
}

/**
 * Extract set() calls from file content and populate the variable table.
 * Skips CACHE variables, PARENT_SCOPE, ENV{}, and multi-value set() calls.
 */
function extractSetCalls(content: string, vars: Map<string, string>): void {
  const cleaned = stripComments(content);
  const pattern = /\bset\s*\(/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(cleaned)) !== null) {
    const openIdx = cleaned.indexOf('(', match.index);
    if (openIdx === -1) continue;

    const closeIdx = findClosingParen(cleaned, openIdx);
    if (closeIdx === -1) continue;

    const body = cleaned.substring(openIdx + 1, closeIdx);
    const tokens = tokenize(body);

    if (tokens.length < 2) continue;

    // Skip CACHE, PARENT_SCOPE, ENV{}
    const upperTokens = tokens.map((t) => t.toUpperCase());
    if (upperTokens.includes('CACHE')) continue;
    if (upperTokens.includes('PARENT_SCOPE')) continue;
    if (tokens[0].startsWith('ENV{')) continue;

    const varName = tokens[0];
    // Skip multi-value set() — only track single-value assignments
    // The value is tokens[1]; anything beyond that is a second value (not a keyword)
    if (tokens.length > 2) continue;

    let value = tokens[1];

    // Resolve any variable references in the value
    const resolved = resolveVariables(value, vars);
    if (resolved !== null) {
      value = resolved;
    }

    vars.set(varName, value);
  }
}

/**
 * Detect project() calls and update PROJECT_SOURCE_DIR.
 */
function detectProjectCalls(
  content: string,
  currentSourceDir: string,
  vars: Map<string, string>,
): void {
  const cleaned = stripComments(content);
  if (/\bproject\s*\(/i.test(cleaned)) {
    vars.set('PROJECT_SOURCE_DIR', currentSourceDir);
  }
}

/**
 * Set built-in variables for the file being processed.
 *
 * For CMakeLists.txt entered via add_subdirectory():
 *   CMAKE_CURRENT_SOURCE_DIR = the file's directory
 *   CMAKE_CURRENT_LIST_DIR = the file's directory
 *
 * For .cmake files entered via include():
 *   CMAKE_CURRENT_SOURCE_DIR = unchanged (the including CMakeLists.txt's directory)
 *   CMAKE_CURRENT_LIST_DIR = the .cmake file's directory
 */
function setBuiltins(vars: Map<string, string>, filePath: string, currentSourceDir: string): void {
  vars.set('CMAKE_CURRENT_SOURCE_DIR', currentSourceDir);
  vars.set('CMAKE_CURRENT_LIST_DIR', path.dirname(filePath));
  vars.set('CMAKE_CURRENT_LIST_FILE', filePath);
}

/**
 * Resolve the chain of include() and add_subdirectory() calls starting from an entry file.
 * Returns all discovered file paths and any warnings for unresolvable references.
 */
export function resolveChain(entryFile: string): ChainResult {
  const visited = new Set<string>();
  const files: string[] = [];
  const warnings: string[] = [];
  const vars = new Map<string, string>();

  const entryDir = path.dirname(path.resolve(entryFile));
  vars.set('CMAKE_SOURCE_DIR', entryDir);
  vars.set('PROJECT_SOURCE_DIR', entryDir);

  function visit(filePath: string, currentSourceDir: string): void {
    const resolved = path.resolve(filePath);
    if (visited.has(resolved)) return;
    visited.add(resolved);
    files.push(resolved);

    const content = fs.readFileSync(resolved, 'utf-8');
    const cleaned = stripComments(content);
    const dir = path.dirname(resolved);

    // Set built-in variables for this file
    setBuiltins(vars, resolved, currentSourceDir);

    // Detect project() calls
    detectProjectCalls(content, currentSourceDir, vars);

    // Extract set() calls before processing directives
    extractSetCalls(content, vars);

    const directivePattern = /\b(include|add_subdirectory)\s*\(/gi;
    let match: RegExpExecArray | null;
    while ((match = directivePattern.exec(cleaned)) !== null) {
      const openIdx = cleaned.indexOf('(', match.index);
      if (openIdx === -1) continue;

      const closeIdx = findClosingParen(cleaned, openIdx);
      if (closeIdx === -1) continue;

      const body = cleaned.substring(openIdx + 1, closeIdx);
      const tokens = tokenize(body);
      if (tokens.length === 0) continue;

      const kind = match[1].toLowerCase();
      let arg = tokens[0];
      const line = lineNumberAt(content, match.index);

      // Try to resolve variables in the argument
      if (arg.includes('${') || arg.includes('$<')) {
        if (arg.includes('$<')) {
          warnings.push(`Warning: skipping unresolvable path '${arg}' in ${resolved}:${line}`);
          continue;
        }
        const resolvedArg = resolveVariables(arg, vars);
        if (resolvedArg === null) {
          warnings.push(`Warning: skipping unresolvable path '${arg}' in ${resolved}:${line}`);
          continue;
        }
        arg = resolvedArg;
      }

      if (kind === 'include') {
        if (isModuleName(arg)) {
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

        // For include(), CMAKE_CURRENT_SOURCE_DIR stays at the current value
        visit(target, currentSourceDir);
        setBuiltins(vars, resolved, currentSourceDir);
      } else {
        // add_subdirectory — CMAKE_CURRENT_SOURCE_DIR becomes the subdirectory
        const subdir = path.resolve(dir, arg);
        const target = path.join(subdir, 'CMakeLists.txt');

        if (!fs.existsSync(target)) {
          warnings.push(`Warning: file not found '${target}' referenced in ${resolved}:${line}`);
          continue;
        }

        visit(target, subdir);
        setBuiltins(vars, resolved, currentSourceDir);
      }
    }
  }

  visit(path.resolve(entryFile), entryDir);
  return { files, warnings, vars };
}

/**
 * Resolve ${VAR} references in dependency fields using a variable table.
 * Mutates deps in place. Fields that can't be resolved are left as-is.
 */
export function resolveDependencyVariables(
  deps: FetchContentDependency[],
  vars: Map<string, string>,
): void {
  for (const dep of deps) {
    if (dep.gitRepository?.includes('${')) {
      dep.gitRepository = resolveVariables(dep.gitRepository, vars) ?? dep.gitRepository;
    }
    if (dep.gitTag?.includes('${')) {
      dep.gitTag = resolveVariables(dep.gitTag, vars) ?? dep.gitTag;
    }
    if (dep.url?.includes('${')) {
      dep.url = resolveVariables(dep.url, vars) ?? dep.url;
    }
    if (dep.urlHash?.includes('${')) {
      dep.urlHash = resolveVariables(dep.urlHash, vars) ?? dep.urlHash;
    }
    if (dep.sourceSubdir?.includes('${')) {
      dep.sourceSubdir = resolveVariables(dep.sourceSubdir, vars) ?? dep.sourceSubdir;
    }
  }
}
