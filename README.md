# CMake Dependency Checker

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Scans CMake files for `FetchContent_Declare` calls and reports which dependencies are declared, where, and at what version. Think `npm outdated`, but for CMake's FetchContent dependencies.

## Quick Start

Point it at your top-level `CMakeLists.txt`:

```bash
npx cmake-depcheck scan --path ./CMakeLists.txt
```

```
Found 4 dependencies in 3 files:

  googletest  git  v1.17.0                                     CMakeLists.txt:7
  fmt         git  12.1.0                                      cmake/deps.cmake:2
  spdlog      git  v1.17.0                                     libs/logging/CMakeLists.txt:4
  json        url  https://github.com/.../json.tar.xz          CMakeLists.txt:19
```

This follows the chain of `include()` and `add_subdirectory()` calls from your entry file, giving you the exact set of FetchContent dependencies your build actually uses.

## Installation

Requires Node.js 24+.

```bash
npm install -g cmake-depcheck
```

Or run directly with `npx`:

```bash
npx cmake-depcheck scan --path ./CMakeLists.txt
```

## Usage

### Scan from a CMakeLists.txt (recommended)

When given a file, cmake-depcheck follows the chain of `include()` and `add_subdirectory()` calls to discover all related CMake files and their dependencies. This mirrors how CMake itself traverses your project and gives the most accurate results.

```bash
cmake-depcheck scan --path ./CMakeLists.txt
```

Chain resolution handles:
- `include(cmake/deps.cmake)` — resolved relative to the file containing the call
- `include(cmake/deps)` — `.cmake` extension appended automatically
- `add_subdirectory(libs/networking)` — looks for `CMakeLists.txt` in the subdirectory
- `${CMAKE_CURRENT_SOURCE_DIR}`, `${CMAKE_CURRENT_LIST_DIR}`, `${PROJECT_SOURCE_DIR}`, and other variables set via `set()` are resolved automatically
- Generator expressions (`$<...>`) and variables that can't be resolved produce a warning on stderr

### Scan a directory

Alternatively, scan an entire directory tree. This recursively finds all `CMakeLists.txt` and `.cmake` files and parses them for FetchContent declarations.

```bash
cmake-depcheck scan --path ./my-project
```

Build directories (`build*/`, `cmake-build-*/`, `_deps/`) and hidden directories are excluded by default. Add custom exclusions with `--exclude`:

```bash
cmake-depcheck scan --path . --exclude "^vendor$" --exclude "^third_party$"
```

Exclusion patterns are regular expressions matched against directory names.

Directory mode is useful for a quick overview or when your project structure doesn't follow standard `add_subdirectory()` patterns.

### Ignoring dependencies

Use `--ignore` to exclude specific dependencies from the output by name (repeatable, case-insensitive). Names are matched exactly by default; use regex syntax for patterns:

```bash
cmake-depcheck scan --path . --ignore ominous-dep --ignore "stb.*"
```

Ignored dependencies are still parsed but omitted from the results. The summary line indicates how many were filtered.

## Limitations

- **Limited variable expansion.** When scanning from a specific file (chain mode), cmake-depcheck tracks `set()` calls and resolves `${VAR}` references in both file paths and dependency declarations. This covers common patterns like `set(GTEST_VERSION "v1.14.0")` followed by `GIT_TAG ${GTEST_VERSION}`. However, `CACHE` variables, `PARENT_SCOPE`, environment variables, and values computed via `string()`, `list()`, or `math()` are not resolved. In directory scan mode, no variable resolution is performed.
- **No conditional evaluation.** Declarations inside `if()` blocks are always included regardless of the condition.
- **No cross-file include resolution in directory mode.** Directory scanning finds files by walking the filesystem, not by tracing `include()` calls. Use file mode for precise chain-following.
- **No version checking yet.** The tool currently reports what's declared but doesn't check upstream for newer versions. This is planned.

## Building from Source

```bash
git clone https://github.com/user/cmake-depcheck.git
cd cmake-depcheck
npm install
npm run build
npm test
```

Development without a build step:

```bash
npm run dev -- scan --path ./CMakeLists.txt
```
