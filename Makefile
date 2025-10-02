DIST := dist
WEB := web

.PHONY: build serve clean

build:
	@rm -rf $(DIST)
	@mkdir -p $(DIST)
	@cp -r $(WEB)/* $(DIST)/

serve: build
	cd $(DIST) && python3 -m http.server 8080

clean:
	rm -rf $(DIST)
