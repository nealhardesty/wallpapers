# wallpapers: every task the project needs is a target here. Run `make` to list them.

.DEFAULT_GOAL := help
PORT ?= 8000

.PHONY: help hooks serve lint audit audit-staged audit-history test ci clean

help: ## List every target
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_-]+:.*## / {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

hooks: ## Install git hooks: audit on commit, commit message and push
	git config core.hooksPath .githooks
	@echo "hooks installed from .githooks/"

serve: ## Serve web/ at http://localhost:8000 (override with PORT=)
	@test -d web || { echo "web/ does not exist yet (roadmap phase 2)"; exit 1; }
	python3 -m http.server $(PORT) --directory web

lint: ## Syntax-check every script and JSON file
	@node tools/lint.mjs

audit: ## Scan the working tree for anything private
	@node tools/audit.mjs --tree

audit-staged: ## Scan only what is staged for commit
	@node tools/audit.mjs --staged

audit-history: ## Scan every blob ever committed
	@node tools/audit.mjs --history

test: ## Run the tests
	@node --test 'tools/*.test.mjs'

ci: lint audit audit-history test ## Everything CI runs

clean: ## Remove build output
	rm -rf dist
