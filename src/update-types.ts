import { VALID_UPDATE_TYPES } from './constants.js';

/**
 * Parse and validate a comma-separated (or multi-line) update types string.
 * Returns a Set of valid type strings.
 * Throws on invalid values or empty input.
 */
export function parseUpdateTypes(input: string): Set<string> {
  const types = input
    .split(/[,\n]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  for (const t of types) {
    if (!VALID_UPDATE_TYPES.has(t)) {
      throw new Error(`Invalid update type "${t}". Valid values: major, minor, patch, unknown`);
    }
  }

  if (types.length === 0) {
    throw new Error('No valid update types provided');
  }

  return new Set(types);
}

/**
 * Check whether an updateType value (which may be undefined) is included in the allowed set.
 * Maps undefined to 'unknown'.
 */
export function isAllowedUpdateType(
  updateType: 'major' | 'minor' | 'patch' | undefined,
  allowed: Set<string>,
): boolean {
  return allowed.has(updateType ?? 'unknown');
}
