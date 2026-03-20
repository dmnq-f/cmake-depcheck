import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { scanDirectory } from '../../src/scanner/file-scanner.js';

const FIXTURES = path.join(__dirname, '..', 'fixtures');

describe('file-scanner', () => {
  it('finds CMakeLists.txt files recursively in nested-subdirs', () => {
    const files = scanDirectory(path.join(FIXTURES, 'nested-subdirs'));
    const relative = files.map((f) => path.relative(path.join(FIXTURES, 'nested-subdirs'), f));

    expect(relative).toHaveLength(3);
    expect(relative).toContain('CMakeLists.txt');
    expect(relative).toContain(path.join('libs', 'graphics', 'CMakeLists.txt'));
    expect(relative).toContain(path.join('libs', 'networking', 'CMakeLists.txt'));
  });

  it('excludes build directories and _deps by default', () => {
    const files = scanDirectory(path.join(FIXTURES, 'with-excluded-dirs'));
    const relative = files.map((f) => path.relative(path.join(FIXTURES, 'with-excluded-dirs'), f));

    expect(relative).toHaveLength(1);
    expect(relative).toContain('CMakeLists.txt');
  });

  it('returns a single file when scanning a directory with one CMakeLists.txt', () => {
    const files = scanDirectory(path.join(FIXTURES, 'basic-git'));
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/CMakeLists\.txt$/);
  });

  it('returns empty array for a directory with no CMake files', () => {
    const files = scanDirectory(path.join(FIXTURES, 'with-excluded-dirs', 'cmake-build-debug'));
    expect(files).toHaveLength(0);
  });

  it('respects custom exclusion patterns', () => {
    const files = scanDirectory(path.join(FIXTURES, 'nested-subdirs'), [/^libs$/]);
    const relative = files.map((f) => path.relative(path.join(FIXTURES, 'nested-subdirs'), f));

    expect(relative).toHaveLength(1);
    expect(relative).toContain('CMakeLists.txt');
  });

  it('throws for nonexistent path', () => {
    expect(() => scanDirectory(path.join(FIXTURES, 'does-not-exist'))).toThrow();
  });
});
