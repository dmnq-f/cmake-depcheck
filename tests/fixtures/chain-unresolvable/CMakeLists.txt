cmake_minimum_required(VERSION 3.14)
project(chain_unresolvable)

include(FetchContent)

set(MY_LIB_DIR "libs/real")

# This can be resolved — literal path
add_subdirectory(libs/real)

# These cannot be resolved
add_subdirectory(${MY_LIB_DIR}/other)
include(${PROJECT_SOURCE_DIR}/cmake/magic.cmake)
include(SomeModule)

FetchContent_Declare(
  googletest
  GIT_REPOSITORY https://github.com/google/googletest.git
  GIT_TAG        v1.17.0
)

FetchContent_MakeAvailable(googletest)
