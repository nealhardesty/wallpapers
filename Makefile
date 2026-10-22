# wallpapers: every task the project needs is a target here. Run `make` to list them.

.DEFAULT_GOAL := help
PORT ?= 8000

.PHONY: help hooks serve serve-https cert bing-json thumbnails docker-build docker-run lint audit audit-staged audit-history test smoke ci clean

help: ## List every target
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_-]+:.*## / {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

hooks: ## Install git hooks: audit on commit, commit message and push
	git config core.hooksPath .githooks
	@echo "hooks installed from .githooks/"

serve: ## Serve web/ at http://localhost:8000 (PORT=, HOST=0.0.0.0 for the LAN)
	@PORT=$(PORT) node tools/serve.mjs

serve-https: ## Serve web/ over https at https://localhost:8443, making a self-signed cert if needed
	@PORT=$(or $(HTTPS_PORT),8443) node tools/serve.mjs --https

cert: ## Make a fresh self-signed dev certificate in .cert/ (localhost + LAN addresses)
	@node tools/serve.mjs --cert-only

bing-json: ## Fetch Bing's last eight images of the day into web/bing.json (for served pages)
	@node tools/bing.mjs

thumbnails: ## Regenerate the panel's wallpaper thumbnails (committed; review the changes)
	@node tools/thumbnails.mjs

docker-build: ## Build the container image (wallpapers:latest)
	docker build -t wallpapers .

docker-run: ## Run the container at http://localhost:8000 (PORT= to change)
	docker run --rm -it --read-only -p $(PORT):8000 --name wallpapers wallpapers

lint: ## Syntax-check every script and JSON file
	@node tools/lint.mjs

audit: ## Scan the working tree for anything private
	@node tools/audit.mjs --tree

audit-staged: ## Scan only what is staged for commit
	@node tools/audit.mjs --staged

audit-history: ## Scan every blob ever committed
	@node tools/audit.mjs --history

test: ## Run the unit tests
	@node --test 'tools/*.test.mjs'

smoke: ## Boot every wallpaper in headless Chrome (needs Chrome; CHROME_PATH to override)
	@node tools/smoke.mjs

ci: lint audit audit-history test smoke ## Everything CI runs

clean: ## Remove build output
	rm -rf dist
