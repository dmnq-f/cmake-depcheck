import { describe, it, expect } from 'vitest';
import { buildEditMarker, extractEditText } from '../../src/pr/edit-marker.js';

describe('buildEditMarker', () => {
  it('produces correct HTML comment for a version string', () => {
    expect(buildEditMarker('v12.1.0')).toBe('<!-- cmake-depcheck:edit:v12.1.0 -->');
  });

  it('produces correct HTML comment for a full URL', () => {
    const url = 'https://github.com/foo/bar/archive/refs/tags/v2.0.tar.gz';
    expect(buildEditMarker(url)).toBe(`<!-- cmake-depcheck:edit:${url} -->`);
  });
});

describe('extractEditText', () => {
  it('extracts text from a valid marker', () => {
    const body = 'Some PR body\n<!-- cmake-depcheck:edit:v12.1.0 -->';
    expect(extractEditText(body)).toBe('v12.1.0');
  });

  it('extracts a full URL from a marker', () => {
    const url = 'https://github.com/foo/bar/archive/refs/tags/v2.0.tar.gz';
    const body = `PR content\n<!-- cmake-depcheck:edit:${url} -->`;
    expect(extractEditText(body)).toBe(url);
  });

  it('returns null when marker is absent', () => {
    expect(extractEditText('Just a normal PR body')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractEditText('')).toBeNull();
  });

  it('returns null when prefix exists but suffix is missing', () => {
    expect(extractEditText('<!-- cmake-depcheck:edit:v1.0.0')).toBeNull();
  });

  it('handles URLs with query params and special characters', () => {
    const url = 'https://example.com/archive.tar.gz?token=abc&ref=v2.0';
    const body = `body\n<!-- cmake-depcheck:edit:${url} -->`;
    expect(extractEditText(body)).toBe(url);
  });

  it('round-trips through buildEditMarker and extractEditText', () => {
    const values = [
      'v12.1.0',
      '12.1.0',
      'https://github.com/foo/bar/archive/refs/tags/v2.0.tar.gz',
      'https://example.com/download?version=3.0&format=tar.gz',
      'VER-2-14-3',
    ];
    for (const value of values) {
      const body = `Some PR content\n${buildEditMarker(value)}`;
      expect(extractEditText(body)).toBe(value);
    }
  });

  it('extracts from marker embedded in a full PR body', () => {
    const body = [
      '## Dependency Update',
      '',
      '| | |',
      '|---|---|',
      '| **Package** | fmt |',
      '',
      '---',
      '*This PR was automatically created by cmake-depcheck.*',
      '<!-- cmake-depcheck:edit:v12.1.0 -->',
    ].join('\n');
    expect(extractEditText(body)).toBe('v12.1.0');
  });
});
