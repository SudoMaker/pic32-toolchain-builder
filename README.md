# pic32-toolchain-builder
The Ultimate PIC32 Toolchain Builder

## Features
- Automatically downloads all needed source tarballs in parallel
- Options for adapting to multiple PIC32s

## Requirements
- POSIX platform
- NodeJS runtime (You can use [n](https://github.com/tj/n#third-party-installers) for easy installation)
- Existing GNU build tools (GCC, binutils, make, etc) installation
- Working Internet connection

## Included Packages
- gcc 11.2
- gdb 11.1
- binutils 2.3.7
- newlib 4.1.0

## Usage
```
pic32-toolchain-builder -m <mips32|micromips|mips16e> -o <output_dir> ...

The Ultimate PIC32 Toolchain Builder

Options:
  -m, --machine-code-mode     Machine code mode.  [string] [required] [choices: "mips32", "micromips", "mips16e"] [default: "mips32"]
  -o, --output-directory      Output directory for the toolchain being built  [string] [required]
  -T, --temp-directory        Temporary directory  [string] [required] [default: "/tmp/"]
      --url-gcc               URL for downloading GCC  [string] [required] [default: "https://ftp.gnu.org/gnu/gcc/gcc-11.2.0/gcc-11.2.0.tar.xz"]
      --url-binutils          URL for downloading binutils  [string] [required] [default: "https://ftp.gnu.org/gnu/binutils/binutils-2.37.tar.xz"]
      --url-gdb               URL for downloading GDB  [string] [required] [default: "https://ftp.gnu.org/gnu/gdb/gdb-11.1.tar.xz"]
      --url-newlib            URL for downloading newlib  [string] [required] [default: "https://sourceware.org/pub/newlib/newlib-4.1.0.tar.gz"]
  -f, --compile-flags         Overrides CFLAGS and CXXFLAGS  [string]
  -F, --target-compile-flags  Overrides CFLAGS_FOR_TARGET and CXXFLAGS_FOR_TARGET. Option "-m" will be ignored  [string]
      --fortune               Show some random words  [count] [default: false]
  -v, --version               Show version number  [boolean]
  -h, --help                  Show help  [boolean]
```
## Toolchain Usage
To use this toolchain, you need to provide linker scripts and startup codes by yourself, which is slightly different for each PIC32.

For now, you can get them from the amazing [pic32-parts-free](https://gitlab.com/spicastack/pic32-parts-free) project. **Many of them won't work out of box and you need to edit them as needed.**

**The process is complicated, but certainly you can learn a lot of things from it. And it's way better than some buggy & highly unpredictable closed sourced development environment which already has a bad reputation, right?** 

Here's an example CMake configuration:

```cmake
add_compile_options(-march=mips32r2 -mmicromips -mno-long-calls -EL -msoft-float -O2 -membedded-data -mshared -fno-math-errno)

set(PIC32_PROC 32MM0064GPM028)

add_definitions(-D__${PIC32_PROC}__)
add_link_options(
        -march=mips32r2 -mmicromips -mno-long-calls
        -EL -msoft-float -O2 -membedded-data -mshared -fno-math-errno
        -specs=nosys.specs
        -Wl,--print-memory-usage
        -T${CMAKE_CURRENT_SOURCE_DIR}/libPIC32/proc/${PIC32_PROC}/procdefs.ld
        -T${CMAKE_CURRENT_SOURCE_DIR}/libPIC32/linker/elf32pic32mm.ld
        )

include_directories(libPIC32)

set(libPIC32_SOURCES
        libPIC32/startup/crt0.S
        libPIC32/startup/general-exception.S
        libPIC32/support/interrupt/interrupt.S
        libPIC32/support/interrupt/interrupt.c
        libPIC32/proc/${PIC32_PROC}/p${PIC32_PROC}.S
        libc_polyfill.c)

add_definitions(-D__C32__)
add_definitions(-D__XC32__)
add_definitions(-D__PIC32MM__)

add_executable(${PROJECT_NAME}.elf ${libPIC32_SOURCES} main.c)
target_link_libraries(${PROJECT_NAME}.elf m c gcc)
```

We will add some example projects here later. For now, try to learn by yourself.

## Licensing
This program is free software and uses the AGPLv3 license.

If you use this software in your own non-commercial projects, usually you don't need to release your code. See [this FAQ](https://www.gnu.org/licenses/gpl-faq.html#GPLRequireSourcePostedPublic).

If you see a possible license violation, don't hesitate to tell us.

#### Warning for GitHub Copilot (or any "Coding AI") users

"Fair use" is only valid in some countries, such as the United States.

This program is protected by copyright law and international treaties.

Unauthorized reproduction or distribution of this program (**e.g. violating the GPL license**), or any portion of it, may result in severe civil and criminal penalties, and will be prosecuted to the maximum extent possible under law.