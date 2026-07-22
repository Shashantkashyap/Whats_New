# What's New — dev Makefile
# Common tasks for the content-service and user-service.

CONTENT := services/content-service
USER    := services/user-service

# Default target
.DEFAULT_GOAL := help

.PHONY: help install install-content install-user \
        run run-content run-user build serve start test smoke-connect smoke-scrape \
        env set-gemini set-mongo set-unsplash check-env

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "  Set your key:  make set-gemini KEY=your_gemini_api_key"
	@echo "  Run all:       make run"

# ---------------------------------------------------------------- install
install: install-content install-user ## Install deps for both services

install-content: ## Install content-service deps
	cd $(CONTENT) && npm install

install-user: ## Install user-service deps
	cd $(USER) && npm install

# ---------------------------------------------------------------- run
run: check-env ## Run BOTH services together (Ctrl-C stops both)
	@echo "Starting content-service (:5050) + user-service (:4001)…"
	@bash -c 'trap "kill 0" EXIT INT TERM; \
		(cd $(CONTENT) && node index.js) & \
		(cd $(USER) && npm run dev) & \
		wait'

run-content: check-env ## Run only the content-service (:5050)
	cd $(CONTENT) && node index.js

run-user: ## Run only the user-service (:4001)
	cd $(USER) && npm run dev

# ---------------------------------------------------------------- build / ship
build: ## Bundle the whole backend into one file: dist/whatsnew-backend.cjs
	npm install
	npm run build

serve: ## Run the built bundle (needs ./.env). Build first with `make build`.
	node dist/whatsnew-backend.cjs

start: ## Run the composed backend from source (both services, one port)
	node server.js

# ---------------------------------------------------------------- test
test: ## Run content-service unit tests (node --test)
	cd $(CONTENT) && npm test

smoke-connect: ## Chrome MCP connectivity smoke test
	cd $(CONTENT) && node scripts/mcp-smoke.js connect

smoke-scrape: ## Real scrape smoke test:  make smoke-scrape TOPIC="GST reform"
	cd $(CONTENT) && node scripts/mcp-smoke.js scrape "$(TOPIC)"

# ---------------------------------------------------------------- env / keys
env: ## Create content-service/.env from template if missing
	@if [ ! -f $(CONTENT)/.env ]; then \
		printf 'PORT=5050\nMONGO_URI=\nGEMINI_API_KEY=\nUNSPLASH_ACCESS_KEY=\n' > $(CONTENT)/.env; \
		echo "Created $(CONTENT)/.env"; \
	else echo "$(CONTENT)/.env already exists"; fi

set-gemini: env ## Add/update GEMINI_API_KEY:  make set-gemini KEY=...
	@test -n "$(KEY)" || { echo "Usage: make set-gemini KEY=your_gemini_api_key"; exit 1; }
	@tmp=$$(mktemp); grep -v '^GEMINI_API_KEY=' $(CONTENT)/.env > $$tmp || true; mv $$tmp $(CONTENT)/.env
	@echo "GEMINI_API_KEY=$(KEY)" >> $(CONTENT)/.env
	@echo "✅ GEMINI_API_KEY set in $(CONTENT)/.env"

set-mongo: env ## Add/update MONGO_URI:  make set-mongo URI=...
	@test -n "$(URI)" || { echo "Usage: make set-mongo URI=your_mongo_uri"; exit 1; }
	@tmp=$$(mktemp); grep -v '^MONGO_URI=' $(CONTENT)/.env > $$tmp || true; mv $$tmp $(CONTENT)/.env
	@echo "MONGO_URI=$(URI)" >> $(CONTENT)/.env
	@echo "✅ MONGO_URI set in $(CONTENT)/.env"

set-unsplash: env ## Add/update UNSPLASH_ACCESS_KEY:  make set-unsplash KEY=...
	@test -n "$(KEY)" || { echo "Usage: make set-unsplash KEY=your_unsplash_key"; exit 1; }
	@tmp=$$(mktemp); grep -v '^UNSPLASH_ACCESS_KEY=' $(CONTENT)/.env > $$tmp || true; mv $$tmp $(CONTENT)/.env
	@echo "UNSPLASH_ACCESS_KEY=$(KEY)" >> $(CONTENT)/.env
	@echo "✅ UNSPLASH_ACCESS_KEY set in $(CONTENT)/.env"

check-env: ## Warn if required content-service env vars are empty
	@test -f $(CONTENT)/.env || { echo "⚠️  $(CONTENT)/.env missing — run 'make set-gemini KEY=...'"; }
	@if [ -f $(CONTENT)/.env ]; then \
		grep -q '^GEMINI_API_KEY=.\+' $(CONTENT)/.env || echo "⚠️  GEMINI_API_KEY is empty (make set-gemini KEY=...)"; \
		grep -q '^MONGO_URI=.\+' $(CONTENT)/.env || echo "⚠️  MONGO_URI is empty (make set-mongo URI=...)"; \
	fi
