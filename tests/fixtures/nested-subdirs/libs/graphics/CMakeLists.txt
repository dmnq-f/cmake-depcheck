include(FetchContent)

FetchContent_Declare(
  fmt
  GIT_REPOSITORY https://github.com/fmtlib/fmt.git
  GIT_TAG        12.1.0
)

FetchContent_MakeAvailable(fmt)
add_library(graphics src/renderer.cpp)
target_link_libraries(graphics PRIVATE fmt::fmt)
