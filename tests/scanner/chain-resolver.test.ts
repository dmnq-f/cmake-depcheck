import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { resolveChain } from '../../src/scanner/chain-resolver.js';

const FIXTURES = path.join(__dirname, '..', 'fixtures');

function resolveFixture(fixtureName: string, entryFile = 'CMakeLists.txt') {
  return resolveChain(path.join(FIXTURES, fixtureName, entryFile));
}

function relativePaths(fixtureName: string, files: string[]): string[] {
  return files.map((f) => path.relative(path.join(FIXTURES, fixtureName), f));
}

describe('chain-resolver', () => {
  it('follows include() and add_subdirectory() in chain-basic', () => {
    const result = resolveFixture('chain-basic');
    const rel = relativePaths('chain-basic', result.files);

    expect(rel).toHaveLength(3);
    expect(rel).toContain('CMakeLists.txt');
    expect(rel).toContain(path.join('cmake', 'dependencies.cmake'));
    expect(rel).toContain(path.join('libs', 'networking', 'CMakeLists.txt'));
    expect(result.warnings).toHaveLength(0);
  });

  it('resolves nested include() relative to containing file in chain-nested', () => {
    const result = resolveFixture('chain-nested');
    const rel = relativePaths('chain-nested', result.files);

    expect(rel).toHaveLength(3);
    expect(rel).toContain('CMakeLists.txt');
    expect(rel).toContain(path.join('libs', 'engine', 'CMakeLists.txt'));
    expect(rel).toContain(path.join('libs', 'engine', 'cmake', 'deps.cmake'));
    expect(result.warnings).toHaveLength(0);
  });

  it('warns on unresolvable paths in chain-unresolvable', () => {
    const result = resolveFixture('chain-unresolvable');
    const rel = relativePaths('chain-unresolvable', result.files);

    expect(rel).toHaveLength(2);
    expect(rel).toContain('CMakeLists.txt');
    expect(rel).toContain(path.join('libs', 'real', 'CMakeLists.txt'));

    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toMatch(/\$\{MY_LIB_DIR\}/);
    expect(result.warnings[1]).toMatch(/\$\{PROJECT_SOURCE_DIR\}/);
  });

  it('warns on missing files in chain-missing-file', () => {
    const result = resolveFixture('chain-missing-file');
    const rel = relativePaths('chain-missing-file', result.files);

    expect(rel).toHaveLength(1);
    expect(rel).toContain('CMakeLists.txt');

    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toMatch(/generated-deps\.cmake/);
    expect(result.warnings[1]).toMatch(/phantom/);
  });

  it('appends .cmake extension when missing in chain-include-no-extension', () => {
    const result = resolveFixture('chain-include-no-extension');
    const rel = relativePaths('chain-include-no-extension', result.files);

    expect(rel).toHaveLength(2);
    expect(rel).toContain('CMakeLists.txt');
    expect(rel).toContain(path.join('cmake', 'foo.cmake'));
    expect(result.warnings).toHaveLength(0);
  });

  it('handles circular references without infinite loop', () => {
    const result = resolveFixture('chain-circular');
    const rel = relativePaths('chain-circular', result.files);

    expect(rel).toHaveLength(3);
    expect(rel).toContain('CMakeLists.txt');
    expect(rel).toContain(path.join('cmake', 'a.cmake'));
    expect(rel).toContain(path.join('cmake', 'b.cmake'));
    expect(result.warnings).toHaveLength(0);
  });
});
