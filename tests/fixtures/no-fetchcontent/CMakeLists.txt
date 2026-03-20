cmake_minimum_required(VERSION 3.14)
project(plain)

add_executable(main main.cpp)
target_link_libraries(main PRIVATE pthread)
