import type { UpdateCheckResult } from '../checker/types.js';
import type { VariableInfo } from '../scanner/chain-resolver.js';

export interface FileEdit {
  /** Absolute path to the file to edit */
  file: string;
  /** Original text to find (scoped to the relevant line) */
  oldText: string;
  /** Replacement text */
  newText: string;
}

/**
 * Align the `v` prefix of `newVersion` to match the convention of `currentVersion`.
 * - current "v1.2.3" + new "1.3.0" → "v1.3.0"
 * - current "1.2.3" + new "v1.3.0" → "1.3.0"
 */
function alignPrefix(currentVersion: string, newVersion: string): string {
  const currentHasV = currentVersion.startsWith('v');
  const newHasV = newVersion.startsWith('v');

  if (currentHasV && !newHasV) return `v${newVersion}`;
  if (!currentHasV && newHasV) return newVersion.slice(1);
  return newVersion;
}

/** Extract a CMake variable name from an expression like "${FOO}" or "${FOO}_suffix". */
function extractVarName(raw: string): string | null {
  const match = raw.match(/\$\{(\w+)\}/);
  return match ? match[1] : null;
}

/**
 * Compute the file edit needed to update a dependency to its latest version.
 * Returns null if the edit can't be computed.
 */
export function computeEdit(
  result: UpdateCheckResult,
  vars?: Map<string, VariableInfo>,
): FileEdit | null {
  if (result.status !== 'update-available') return null;

  const dep = result.dep;

  // Case 1: Git dep with variable-resolved GIT_TAG
  if (dep.sourceType === 'git' && dep.gitTagRaw?.includes('${')) {
    const varName = extractVarName(dep.gitTagRaw);
    if (!varName || !vars) return null;

    const info = vars.get(varName);
    if (!info) return null;

    const newVersion = alignPrefix(info.value, result.latestVersion!);
    if (newVersion === info.value) return null;

    return {
      file: info.file,
      oldText: info.value,
      newText: newVersion,
    };
  }

  // Case 2: Git dep with literal GIT_TAG
  if (dep.sourceType === 'git' && dep.gitTag && result.latestVersion) {
    const newVersion = alignPrefix(dep.gitTag, result.latestVersion);
    if (newVersion === dep.gitTag) return null;

    return {
      file: dep.location.file,
      oldText: dep.gitTag,
      newText: newVersion,
    };
  }

  // Case 3: URL dep with updatedUrl
  if (dep.sourceType === 'url' && result.updatedUrl) {
    // URL dep with variable-resolved URL
    if (dep.urlRaw?.includes('${')) {
      const varName = extractVarName(dep.urlRaw);
      if (!varName || !vars) return null;

      const info = vars.get(varName);
      if (!info) return null;

      const newVersion = alignPrefix(info.value, result.latestVersion!);
      if (newVersion === info.value) return null;

      return {
        file: info.file,
        oldText: info.value,
        newText: newVersion,
      };
    }

    // URL dep with literal URL
    if (dep.url) {
      return {
        file: dep.location.file,
        oldText: dep.url,
        newText: result.updatedUrl,
      };
    }
  }

  return null;
}
