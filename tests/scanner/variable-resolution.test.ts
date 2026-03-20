import { describe, it, expect } from 'vitest';
import { resolveVariables } from '../../src/scanner/chain-resolver.js';

describe('resolveVariables', () => {
  it('returns plain strings unchanged', () => {
    const vars = new Map<string, string>();
    expect(resolveVariables('cmake/deps.cmake', vars)).toBe('cmake/deps.cmake');
  });

  it('resolves a simple variable', () => {
    const vars = new Map([['ROOT', '/project']]);
    expect(resolveVariables('${ROOT}/deps.cmake', vars)).toBe('/project/deps.cmake');
  });

  it('resolves multiple variables in one string', () => {
    const vars = new Map([
      ['A', 'first'],
      ['B', 'second'],
    ]);
    expect(resolveVariables('${A}/middle/${B}', vars)).toBe('first/middle/second');
  });

  it('resolves nested variable references', () => {
    const vars = new Map([
      ['B', '/root'],
      ['A', '${B}/sub'],
    ]);
    expect(resolveVariables('${A}/file.cmake', vars)).toBe('/root/sub/file.cmake');
  });

  it('returns null when a variable is unknown', () => {
    const vars = new Map([['KNOWN', 'value']]);
    expect(resolveVariables('${KNOWN}/${UNKNOWN}', vars)).toBeNull();
  });

  it('returns null when recursion exceeds depth limit', () => {
    const vars = new Map([
      ['A', '${B}'],
      ['B', '${A}'],
    ]);
    expect(resolveVariables('${A}', vars)).toBeNull();
  });
});
