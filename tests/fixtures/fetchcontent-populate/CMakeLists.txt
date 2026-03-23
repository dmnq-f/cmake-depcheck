cmake_minimum_required(VERSION 3.14)
project(populate_test)

include(FetchContent)

# Direct population with git source — should be detected
FetchContent_Populate(
  spdlog
  GIT_REPOSITORY https://github.com/gabime/spdlog.git
  GIT_TAG        v1.17.0
  SOURCE_DIR     ${CMAKE_BINARY_DIR}/spdlog-src
  BINARY_DIR     ${CMAKE_BINARY_DIR}/spdlog-build
)

# Direct population with URL source — should be detected
FetchContent_Populate(
  json
  URL https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz
  URL_HASH SHA256=d6c65aca6b1ed68e7a182f4757257b107ae403032760ed6ef121c9d55e81757d
  SOURCE_DIR ${CMAKE_BINARY_DIR}/json-src
)

# Regular declare — should still work
FetchContent_Declare(
  fmt
  GIT_REPOSITORY https://github.com/fmtlib/fmt.git
  GIT_TAG        12.1.0
)

# Bare declare with no source keywords — should still be reported (possibly malformed)
FetchContent_Declare(orphan_dep)

# Simple populate trigger — NOT a declaration, should be ignored
FetchContent_Populate(fmt)

FetchContent_MakeAvailable(fmt)
