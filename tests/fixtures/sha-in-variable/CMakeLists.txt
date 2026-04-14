cmake_minimum_required(VERSION 3.14)
project(shaInVariable)

include(FetchContent)
include(${CMAKE_CURRENT_LIST_DIR}/Versions.cmake)

FetchContent_Declare(
  freetype
  GIT_REPOSITORY https://gitlab.freedesktop.org/freetype/freetype.git
  GIT_TAG ${FREETYPE_GIT_COMMIT}
)
