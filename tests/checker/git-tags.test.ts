import { describe, it, expect } from 'vitest';
import { parseGitLsRemoteOutput } from '../../src/checker/git-tags.js';

describe('parseGitLsRemoteOutput', () => {
  it('extracts tag names from ls-remote output', () => {
    const raw = [
      'abc123def456abc123def456abc123def456abc12345\trefs/tags/v1.0.0',
      'def456abc123def456abc123def456abc123def45678\trefs/tags/v1.1.0',
      'ghi789abc123def456abc123def456abc123def45678\trefs/tags/v2.0.0',
    ].join('\n');

    expect(parseGitLsRemoteOutput(raw)).toEqual(['v1.0.0', 'v1.1.0', 'v2.0.0']);
  });

  it('filters out ^{} dereference entries', () => {
    const raw = [
      'abc123def456abc123def456abc123def456abc12345\trefs/tags/v1.0.0',
      'def456abc123def456abc123def456abc123def45678\trefs/tags/v1.0.0^{}',
      'ghi789abc123def456abc123def456abc123def45678\trefs/tags/v1.1.0',
      'jkl012abc123def456abc123def456abc123def45678\trefs/tags/v1.1.0^{}',
    ].join('\n');

    expect(parseGitLsRemoteOutput(raw)).toEqual(['v1.0.0', 'v1.1.0']);
  });

  it('returns empty array for empty output', () => {
    expect(parseGitLsRemoteOutput('')).toEqual([]);
  });

  it('returns empty array for whitespace-only output', () => {
    expect(parseGitLsRemoteOutput('  \n  \n  ')).toEqual([]);
  });

  it('handles tags without refs/tags/ prefix gracefully', () => {
    const raw = ['abc123\trefs/heads/main', 'def456\trefs/tags/v1.0.0'].join('\n');

    expect(parseGitLsRemoteOutput(raw)).toEqual(['v1.0.0']);
  });

  it('deduplicates tags', () => {
    const raw = ['abc123\trefs/tags/v1.0.0', 'def456\trefs/tags/v1.0.0'].join('\n');

    expect(parseGitLsRemoteOutput(raw)).toEqual(['v1.0.0']);
  });

  it('handles non-semver tag names', () => {
    const raw = [
      'abc123\trefs/tags/VER-2-14-0',
      'def456\trefs/tags/VER-2-14-2',
      'ghi789\trefs/tags/release-1.0',
    ].join('\n');

    expect(parseGitLsRemoteOutput(raw)).toEqual(['VER-2-14-0', 'VER-2-14-2', 'release-1.0']);
  });
});
