cmake_minimum_required(VERSION 3.14)
project(chain_basic)

include(FetchContent)
include(cmake/dependencies.cmake)

FetchContent_Declare(
  googletest
  GIT_REPOSITORY https://github.com/google/googletest.git
  GIT_TAG        v1.17.0
)

add_subdirectory(libs/networking)

FetchContent_MakeAvailable(googletest fmt spdlog)
