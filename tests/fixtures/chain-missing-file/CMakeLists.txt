cmake_minimum_required(VERSION 3.14)
project(chain_missing)

include(FetchContent)

# This file doesn't exist
include(cmake/generated-deps.cmake)

# This subdirectory doesn't exist
add_subdirectory(libs/phantom)

FetchContent_Declare(
  googletest
  GIT_REPOSITORY https://github.com/google/googletest.git
  GIT_TAG        v1.17.0
)

FetchContent_MakeAvailable(googletest)
