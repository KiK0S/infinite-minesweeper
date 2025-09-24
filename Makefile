SOURCES := $(wildcard src/*.cpp)
HEADERS := $(wildcard src/*.hpp)
DIST := dist
EMXX := em++

EMFLAGS := -std=c++20 -O3 --bind -s WASM=1 -s MODULARIZE=1 -s EXPORT_NAME=createMinesweeperModule -s ALLOW_MEMORY_GROWTH=1 -s ENVIRONMENT=web -s ASSERTIONS=1

.PHONY: all build clean serve

all: build

$(DIST)/game.js: $(SOURCES) $(HEADERS)
	@mkdir -p $(DIST)
	$(EMXX) $(SOURCES) -o $@ $(EMFLAGS)

build: $(DIST)/game.js
	cp -r web/* $(DIST)/

serve: build
	cd $(DIST) && python3 -m http.server 8080

clean:
	rm -rf $(DIST)
