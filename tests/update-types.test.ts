import { describe, it, expect } from 'vitest';
import { parseUpdateTypes, isAllowedUpdateType } from '../src/update-types.js';

describe('parseUpdateTypes', () => {
  it('accepts comma-separated values', () => {
    const result = parseUpdateTypes('major,minor,patch');
    expect(result).toEqual(new Set(['major', 'minor', 'patch']));
  });

  it('accepts newline-separated values', () => {
    const result = parseUpdateTypes('major\nminor\npatch');
    expect(result).toEqual(new Set(['major', 'minor', 'patch']));
  });

  it('accepts mixed comma and newline separators', () => {
    const result = parseUpdateTypes('major,minor\npatch');
    expect(result).toEqual(new Set(['major', 'minor', 'patch']));
  });

  it('is case-insensitive', () => {
    const result = parseUpdateTypes('MAJOR,Minor,Patch');
    expect(result).toEqual(new Set(['major', 'minor', 'patch']));
  });

  it('trims whitespace', () => {
    const result = parseUpdateTypes('  major , minor , patch  ');
    expect(result).toEqual(new Set(['major', 'minor', 'patch']));
  });

  it('accepts unknown as a valid type', () => {
    const result = parseUpdateTypes('unknown');
    expect(result).toEqual(new Set(['unknown']));
  });

  it('deduplicates values', () => {
    const result = parseUpdateTypes('major,major,minor');
    expect(result).toEqual(new Set(['major', 'minor']));
  });

  it('throws on invalid values', () => {
    expect(() => parseUpdateTypes('major,bogus')).toThrow(
      'Invalid update type "bogus". Valid values: major, minor, patch, unknown',
    );
  });

  it('throws on empty input', () => {
    expect(() => parseUpdateTypes('')).toThrow('No valid update types provided');
  });

  it('throws on whitespace-only input', () => {
    expect(() => parseUpdateTypes('  ,  ')).toThrow('No valid update types provided');
  });
});

describe('isAllowedUpdateType', () => {
  it('returns true for matching type', () => {
    expect(isAllowedUpdateType('major', new Set(['major', 'minor']))).toBe(true);
  });

  it('returns false for non-matching type', () => {
    expect(isAllowedUpdateType('major', new Set(['minor', 'patch']))).toBe(false);
  });

  it('maps undefined to unknown', () => {
    expect(isAllowedUpdateType(undefined, new Set(['unknown']))).toBe(true);
  });

  it('rejects undefined when unknown is not in allowed set', () => {
    expect(isAllowedUpdateType(undefined, new Set(['major', 'minor']))).toBe(false);
  });

  it('returns correct boolean for each type', () => {
    const allowed = new Set(['minor', 'patch']);
    expect(isAllowedUpdateType('major', allowed)).toBe(false);
    expect(isAllowedUpdateType('minor', allowed)).toBe(true);
    expect(isAllowedUpdateType('patch', allowed)).toBe(true);
    expect(isAllowedUpdateType(undefined, allowed)).toBe(false);
  });
});
