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

    // MY_LIB_DIR and PROJECT_SOURCE_DIR now resolve; warnings are "file not found"
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toMatch(/libs\/real\/other/);
    expect(result.warnings[1]).toMatch(/cmake\/magic\.cmake/);
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

  it('resolves set() variables in include paths in chain-variables', () => {
    const result = resolveFixture('chain-variables');
    const rel = relativePaths('chain-variables', result.files);

    expect(rel).toHaveLength(2);
    expect(rel).toContain('CMakeLists.txt');
    expect(rel).toContain(path.join('cmake', 'modules', 'deps.cmake'));
    expect(result.warnings).toHaveLength(0);

    // VariableInfo shape: set() variables carry file/line metadata
    const moduleDir = result.vars.get('MODULE_DIR');
    expect(moduleDir).toBeDefined();
    expect(moduleDir).toHaveProperty('value');
    expect(moduleDir).toHaveProperty('file');
    expect(moduleDir).toHaveProperty('line');
    expect(moduleDir!.file).toContain('CMakeLists.txt');
    expect(moduleDir!.line).toBe(5);
  });

  it('resolves CMAKE_CURRENT_SOURCE_DIR in add_subdirectory scope', () => {
    const result = resolveFixture('chain-builtin-vars');
    const rel = relativePaths('chain-builtin-vars', result.files);

    expect(rel).toHaveLength(3);
    expect(rel).toContain('CMakeLists.txt');
    expect(rel).toContain(path.join('libs', 'engine', 'CMakeLists.txt'));
    expect(rel).toContain(path.join('libs', 'engine', 'cmake', 'engine-deps.cmake'));
    expect(result.warnings).toHaveLength(0);
  });

  it('distinguishes CMAKE_CURRENT_LIST_DIR from CMAKE_CURRENT_SOURCE_DIR in included files', () => {
    const result = resolveFixture('chain-list-dir-vs-source-dir');
    const rel = relativePaths('chain-list-dir-vs-source-dir', result.files);

    expect(rel).toHaveLength(3);
    expect(rel).toContain('CMakeLists.txt');
    expect(rel).toContain(path.join('cmake', 'setup.cmake'));
    expect(rel).toContain(path.join('cmake', 'deps', 'fetch.cmake'));
    expect(result.warnings).toHaveLength(0);
  });

  it('warns on truly unresolvable variables in chain-unresolvable-var', () => {
    const result = resolveFixture('chain-unresolvable-var');
    const rel = relativePaths('chain-unresolvable-var', result.files);

    expect(rel).toHaveLength(1);
    expect(rel).toContain('CMakeLists.txt');

    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toMatch(/UNKNOWN_DIR/);
    expect(result.warnings[1]).toMatch(/CACHED_PATH/);
  });

  it('resolves PROJECT_SOURCE_DIR in chain-project-source-dir', () => {
    const result = resolveFixture('chain-project-source-dir');
    const rel = relativePaths('chain-project-source-dir', result.files);

    expect(rel).toHaveLength(2);
    expect(rel).toContain('CMakeLists.txt');
    expect(rel).toContain(path.join('cmake', 'deps.cmake'));
    expect(result.warnings).toHaveLength(0);
  });

  it('restores built-ins after recursive visit in chain-sequential-includes', () => {
    const result = resolveFixture('chain-sequential-includes');
    const rel = relativePaths('chain-sequential-includes', result.files);

    expect(rel).toHaveLength(3);
    expect(rel).toContain('CMakeLists.txt');
    expect(rel).toContain(path.join('cmake', 'first.cmake'));
    expect(rel).toContain(path.join('cmake', 'second.cmake'));
    expect(result.warnings).toHaveLength(0);
  });
});
