include(FetchContent)

FetchContent_Declare(
  spdlog
  GIT_REPOSITORY https://github.com/gabime/spdlog.git
  GIT_TAG        v1.17.0
)

FetchContent_MakeAvailable(spdlog)
add_library(networking src/http.cpp)
target_link_libraries(networking PRIVATE spdlog::spdlog)
