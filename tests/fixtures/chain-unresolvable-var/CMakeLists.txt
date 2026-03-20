cmake_minimum_required(VERSION 3.14)
project(unresolvable)

include(FetchContent)

# This variable is never set — can't resolve
include(${UNKNOWN_DIR}/deps.cmake)

# Cache variable — we don't track these
set(CACHED_PATH "/some/path" CACHE STRING "help")
include(${CACHED_PATH}/more.cmake)

FetchContent_Declare(
  googletest
  GIT_REPOSITORY https://github.com/google/googletest.git
  GIT_TAG        v1.17.0
)

FetchContent_MakeAvailable(googletest)
