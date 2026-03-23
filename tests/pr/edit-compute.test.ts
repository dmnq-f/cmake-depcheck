import { describe, it, expect } from 'vitest';
import { computeEdit } from '../../src/pr/edit-compute.js';
import type { UpdateCheckResult } from '../../src/checker/types.js';
import type { FetchContentDependency } from '../../src/parser/types.js';
import type { VariableInfo } from '../../src/scanner/chain-resolver.js';

function makeDep(overrides: Partial<FetchContentDependency> = {}): FetchContentDependency {
  return {
    name: 'fmt',
    sourceType: 'git',
    gitRepository: 'https://github.com/fmtlib/fmt.git',
    gitTag: 'v10.2.1',
    location: {
      file: '/project/CMakeLists.txt',
      startLine: 10,
      endLine: 14,
    },
    ...overrides,
  };
}

function makeResult(overrides: Partial<UpdateCheckResult> = {}): UpdateCheckResult {
  return {
    dep: makeDep(),
    status: 'update-available',
    latestVersion: '12.1.0',
    updateType: 'major',
    ...overrides,
  };
}

describe('computeEdit', () => {
  it('returns null for non-update-available status', () => {
    const result = makeResult({ status: 'up-to-date' });
    expect(computeEdit(result)).toBeNull();
  });

  describe('literal GIT_TAG replacement', () => {
    it('computes edit for a literal GIT_TAG', () => {
      const result = makeResult({
        dep: makeDep({ gitTag: '10.2.1' }),
        latestVersion: '12.1.0',
      });
      const edit = computeEdit(result);

      expect(edit).toEqual({
        file: '/project/CMakeLists.txt',
        line: 10,
        endLine: 14,
        oldText: '10.2.1',
        newText: '12.1.0',
      });
    });

    it('preserves v prefix when current has v and latest does not', () => {
      const result = makeResult({
        dep: makeDep({ gitTag: 'v10.2.1' }),
        latestVersion: '12.1.0',
      });
      const edit = computeEdit(result);

      expect(edit).toEqual({
        file: '/project/CMakeLists.txt',
        line: 10,
        endLine: 14,
        oldText: 'v10.2.1',
        newText: 'v12.1.0',
      });
    });

    it('strips v prefix when current lacks v and latest has v', () => {
      const result = makeResult({
        dep: makeDep({ gitTag: '10.2.1' }),
        latestVersion: 'v12.1.0',
      });
      const edit = computeEdit(result);

      expect(edit).toEqual({
        file: '/project/CMakeLists.txt',
        line: 10,
        endLine: 14,
        oldText: '10.2.1',
        newText: '12.1.0',
      });
    });

    it('returns null when current and latest are the same after alignment', () => {
      const result = makeResult({
        dep: makeDep({ gitTag: 'v12.1.0' }),
        latestVersion: '12.1.0',
      });
      const edit = computeEdit(result);
      expect(edit).toBeNull();
    });
  });

  describe('variable-resolved GIT_TAG → set() replacement', () => {
    it('targets the set() variable when gitTagRaw contains ${VAR}', () => {
      const dep = makeDep({
        gitTag: '10.2.1',
        gitTagRaw: '${FMT_VERSION}',
      });
      const vars = new Map<string, VariableInfo>([
        ['FMT_VERSION', { value: '10.2.1', file: '/project/cmake/versions.cmake', line: 5 }],
      ]);
      const result = makeResult({ dep, latestVersion: '12.1.0' });
      const edit = computeEdit(result, vars);

      expect(edit).toEqual({
        file: '/project/cmake/versions.cmake',
        line: 5,
        endLine: 5,
        oldText: '10.2.1',
        newText: '12.1.0',
      });
    });

    it('preserves v prefix in variable value', () => {
      const dep = makeDep({
        gitTag: 'v1.2.3',
        gitTagRaw: '${LIB_VERSION}',
      });
      const vars = new Map<string, VariableInfo>([
        ['LIB_VERSION', { value: 'v1.2.3', file: '/project/versions.cmake', line: 3 }],
      ]);
      const result = makeResult({ dep, latestVersion: '2.0.0' });
      const edit = computeEdit(result, vars);

      expect(edit).toEqual({
        file: '/project/versions.cmake',
        line: 3,
        endLine: 3,
        oldText: 'v1.2.3',
        newText: 'v2.0.0',
      });
    });

    it('returns null when vars map is not provided', () => {
      const dep = makeDep({
        gitTag: '10.2.1',
        gitTagRaw: '${FMT_VERSION}',
      });
      const result = makeResult({ dep });
      expect(computeEdit(result)).toBeNull();
    });

    it('returns null when variable not found in vars', () => {
      const dep = makeDep({
        gitTag: '10.2.1',
        gitTagRaw: '${UNKNOWN_VAR}',
      });
      const vars = new Map<string, VariableInfo>();
      const result = makeResult({ dep });
      expect(computeEdit(result, vars)).toBeNull();
    });
  });

  describe('URL dep with updatedUrl', () => {
    it('computes edit for a literal URL replacement', () => {
      const dep = makeDep({
        sourceType: 'url',
        gitTag: undefined,
        gitRepository: undefined,
        url: 'https://github.com/owner/repo/archive/refs/tags/v1.0.0.tar.gz',
      });
      const result = makeResult({
        dep,
        latestVersion: '2.0.0',
        updatedUrl: 'https://github.com/owner/repo/archive/refs/tags/v2.0.0.tar.gz',
      });
      const edit = computeEdit(result);

      expect(edit).toEqual({
        file: '/project/CMakeLists.txt',
        line: 10,
        endLine: 14,
        oldText: 'https://github.com/owner/repo/archive/refs/tags/v1.0.0.tar.gz',
        newText: 'https://github.com/owner/repo/archive/refs/tags/v2.0.0.tar.gz',
      });
    });

    it('targets set() variable when urlRaw contains ${VAR}', () => {
      const dep = makeDep({
        sourceType: 'url',
        gitTag: undefined,
        gitRepository: undefined,
        url: 'https://github.com/owner/repo/archive/refs/tags/v1.0.0.tar.gz',
        urlRaw: 'https://github.com/owner/repo/archive/refs/tags/${REPO_VERSION}.tar.gz',
      });
      const vars = new Map<string, VariableInfo>([
        ['REPO_VERSION', { value: 'v1.0.0', file: '/project/versions.cmake', line: 2 }],
      ]);
      const result = makeResult({
        dep,
        latestVersion: '2.0.0',
        updatedUrl: 'https://github.com/owner/repo/archive/refs/tags/v2.0.0.tar.gz',
      });
      const edit = computeEdit(result, vars);

      expect(edit).toEqual({
        file: '/project/versions.cmake',
        line: 2,
        endLine: 2,
        oldText: 'v1.0.0',
        newText: 'v2.0.0',
      });
    });
  });

  describe('non-editable cases', () => {
    it('returns null for pinned status', () => {
      expect(computeEdit(makeResult({ status: 'pinned' }))).toBeNull();
    });

    it('returns null for unsupported status', () => {
      expect(computeEdit(makeResult({ status: 'unsupported' }))).toBeNull();
    });

    it('returns null for URL dep without updatedUrl', () => {
      const dep = makeDep({
        sourceType: 'url',
        gitTag: undefined,
        gitRepository: undefined,
        url: 'https://example.com/lib.tar.gz',
      });
      const result = makeResult({ dep, updatedUrl: undefined });
      expect(computeEdit(result)).toBeNull();
    });
  });
});
