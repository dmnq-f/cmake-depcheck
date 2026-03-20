include(cmake/deps.cmake)

add_library(engine src/engine.cpp)
target_link_libraries(engine PRIVATE fmt::fmt spdlog::spdlog)
