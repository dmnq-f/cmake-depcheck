cmake_minimum_required(VERSION 3.14)
project(circular)

include(FetchContent)
include(cmake/a.cmake)

FetchContent_Declare(
  googletest
  GIT_REPOSITORY https://github.com/google/googletest.git
  GIT_TAG        v1.17.0
)
