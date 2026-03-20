cmake_minimum_required(VERSION 3.14)
project(vartest)

set(PROJECT_ROOT "${CMAKE_CURRENT_SOURCE_DIR}")
set(MODULE_DIR "${PROJECT_ROOT}/cmake/modules")

include(FetchContent)
include(${MODULE_DIR}/deps.cmake)

FetchContent_Declare(
  googletest
  GIT_REPOSITORY https://github.com/google/googletest.git
  GIT_TAG        v1.17.0
)

FetchContent_MakeAvailable(googletest fmt)
