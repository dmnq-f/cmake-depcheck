cmake_minimum_required(VERSION 3.14)
project(projsrcdir)

include(FetchContent)
include(${PROJECT_SOURCE_DIR}/cmake/deps.cmake)

FetchContent_MakeAvailable(fmt)
