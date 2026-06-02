.PHONY: help setup dev build test test-unit test-e2e-pw test-e2e-pw-visible test-smoke test-health test-auth-health test-watch test-coverage lint format format-check typecheck deploy deploy-preview db-setup db-generate db-migrate db-push db-seed db-reset db-studio clean clean-db ci pre-commit install ensure-deps ensure-env ensure-auth ensure-vercel ensure-db ensure-playwright ensure-e2e-env init-env clerk-setup

# Default target
help:
	@echo ""
	@echo "  Persuaider"
	@echo "  ────────────────────────────────────────────"
	@echo ""
	@echo "  Getting started:"
	@echo "    make setup           One command. Zero to running."
	@echo "    make dev             Start dev server."
	@echo ""
	@echo "  Development:"
	@echo "    make lint            Lint code"
	@echo "    make format          Format code"
	@echo "    make typecheck       TypeScript type check"
	@echo ""
	@echo "  Testing:"
	@echo "    make test            Full suite (unit + E2E)"
	@echo "    make test-unit       Unit tests only (fast)"
	@echo "    make test-smoke      Production smoke test"
	@echo ""
	@echo "  Database:"
	@echo "    make db-studio       Open Prisma GUI"
	@echo "    make db-reset        Drop and recreate everything"
	@echo ""
	@echo "  Deploy:"
	@echo "    make build           Production build"
	@echo "    make deploy          Ship to production"
	@echo "    make deploy-preview  Preview deployment"
	@echo ""
	@echo "  Other:"
	@echo "    make clean           Wipe build artifacts + node_modules"
	@echo "    make ci              Full CI workflow"
	@echo ""
	@echo "  Everything auto-installs deps, configures auth, and sets up"
	@echo "  the database as needed. Just run 'make dev' to start."
	@echo ""

# Ensure .env.local exists with correct structure
ensure-env:
	@if [ ! -f .env.local ]; then \
		echo "📝 Creating .env.local..."; \
		echo "# Database (SQLite for local development)" > .env.local; \
		echo "DATABASE_URL=\"file:./dev.db\"" >> .env.local; \
		echo "" >> .env.local; \
		echo "# Authentication (Clerk)" >> .env.local; \
		echo "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=\"\"" >> .env.local; \
		echo "CLERK_SECRET_KEY=\"\"" >> .env.local; \
		echo "" >> .env.local; \
		echo "# LLM Providers (at least one required)" >> .env.local; \
		echo "GEMINI_API_KEY=\"\"" >> .env.local; \
		echo "ANTHROPIC_API_KEY=\"\"" >> .env.local; \
		echo "OPENAI_API_KEY=\"\"" >> .env.local; \
		echo "" >> .env.local; \
		echo "Created .env.local"; \
	fi

# Backwards compat alias
init-env: ensure-env
# Install dependencies
install:
	@echo "📦 Installing dependencies..."
	npm install
	@echo "📦 Installing Playwright browsers..."
	npx playwright install chromium
	@echo "✅ Dependencies installed"

# Ensure Clerk auth keys are configured (runs setup inline if missing)
ensure-auth: ensure-env
	@CLERK_KEY=$$(grep "^CLERK_SECRET_KEY=" .env.local 2>/dev/null | cut -d'"' -f2); \
	if [ -n "$$CLERK_KEY" ] && [ "$$CLERK_KEY" != "" ]; then \
		exit 0; \
	fi; \
	echo "🔐 Clerk keys missing. Setting up authentication..."; \
	echo ""; \
	if ! command -v vercel >/dev/null 2>&1; then \
		echo "📦 Installing Vercel CLI..."; \
		npm install -g vercel; \
	fi; \
	if ! vercel whoami >/dev/null 2>&1; then \
		echo "🔑 Logging in to Vercel..."; \
		vercel login; \
	else \
		echo "✓ Logged in as $$(vercel whoami)"; \
	fi; \
	if [ ! -f .vercel/project.json ]; then \
		echo "🔗 Linking project to Vercel..."; \
		vercel link; \
	else \
		echo "✓ Project already linked"; \
	fi; \
	echo ""; \
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; \
	echo "  ACTION REQUIRED: Add Clerk in Vercel Dashboard"; \
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; \
	echo ""; \
	echo "  1. Open: https://vercel.com/marketplace/clerk"; \
	echo "  2. Click 'Add Integration'"; \
	echo "  3. Select your Vercel team/account"; \
	echo "  4. Select this project and complete setup"; \
	echo ""; \
	read -p "  Press Enter once Clerk is added in the dashboard... " _; \
	echo "📥 Pulling environment variables from Vercel..."; \
	vercel env pull .env.vercel.tmp --yes || { rm -f .env.vercel.tmp; echo "❌ Failed to pull env vars"; exit 1; }; \
	while IFS= read -r line; do \
		case "$$line" in \
			\#*|"") continue ;; \
		esac; \
		key=$${line%%=*}; \
		if ! grep -q "^$$key=" .env.local 2>/dev/null; then \
			echo "$$line" >> .env.local; \
			echo "  + Added $$key"; \
		fi; \
	done < .env.vercel.tmp; \
	rm -f .env.vercel.tmp; \
	echo ""; \
	if grep -q "^CLERK_SECRET_KEY=\"[^\"]\+\"" .env.local && grep -q "^NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=\"[^\"]\+\"" .env.local; then \
		echo "✅ Clerk configured successfully!"; \
	else \
		echo "❌ Clerk keys not found after pull."; \
		echo "   Verify Clerk was added to this project in the Vercel dashboard."; \
		exit 1; \
	fi

# Explicit entry point (same as ensure-auth)
clerk-setup: ensure-auth

# Complete setup: zero to running in one command
setup: ensure-deps ensure-env ensure-auth ensure-db
	@# Prompt for LLM key if none configured
	@if grep -qE '^(GEMINI_API_KEY|ANTHROPIC_API_KEY|OPENAI_API_KEY)="[^"]+"' .env.local 2>/dev/null; then \
		echo "✓ LLM provider configured"; \
	else \
		echo ""; \
		echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; \
		echo "  Configure LLM Provider (at least one required)"; \
		echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; \
		echo ""; \
		read -p "  Gemini API Key (recommended): " GKEY; \
		if [ -n "$$GKEY" ]; then \
			sed -i '' "s|^GEMINI_API_KEY=.*|GEMINI_API_KEY=\"$$GKEY\"|" .env.local; \
			echo "  ✓ Set GEMINI_API_KEY"; \
		else \
			read -p "  Anthropic API Key: " AKEY; \
			if [ -n "$$AKEY" ]; then \
				sed -i '' "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=\"$$AKEY\"|" .env.local; \
				echo "  ✓ Set ANTHROPIC_API_KEY"; \
			else \
				read -p "  OpenAI API Key: " OKEY; \
				if [ -n "$$OKEY" ]; then \
					sed -i '' "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=\"$$OKEY\"|" .env.local; \
					echo "  ✓ Set OPENAI_API_KEY"; \
				else \
					echo "  ⚠️  No LLM key set. AI features won't work until you add one to .env.local"; \
				fi; \
			fi; \
		fi; \
	fi
	@echo ""
	@echo "✅ Setup complete! Run 'make dev' to start."

# Database setup
db-setup: ensure-deps init-env
	@echo "🗄️  Setting up database..."
	@env $$(grep -E '^[A-Za-z_][A-Za-z_0-9]*=' .env.local | xargs) npx prisma generate
	@env $$(grep -E '^[A-Za-z_][A-Za-z_0-9]*=' .env.local | xargs) npx prisma db push
	@echo "✅ Database setup complete"

# Generate Prisma Client
db-generate: ensure-deps init-env
	@echo "🔧 Generating Prisma Client..."
	npx prisma generate
	@echo "✅ Prisma Client generated"

# Run migrations (loads .env.local; pass NAME=<migration_name> for non-interactive runs)
db-migrate: ensure-deps init-env
	@echo "🔄 Running database migrations..."
	@env $$(grep -E '^[A-Za-z_][A-Za-z_0-9]*=' .env.local | xargs) npx prisma migrate dev $(if $(NAME),--name $(NAME),)
	@echo "✅ Migrations complete"

# Push schema changes
db-push: ensure-deps init-env
	@echo "⬆️  Pushing schema changes..."
	@env $$(grep -E '^[A-Za-z_][A-Za-z_0-9]*=' .env.local | xargs) npx prisma db push
	@echo "✅ Schema pushed"

# Seed database
db-seed: ensure-deps init-env
	@echo "🌱 Seeding database..."
	@env $$(grep -E '^[A-Za-z_][A-Za-z_0-9]*=' .env.local | xargs) npx tsx prisma/seed.ts
	@echo "Database seeded"

# Reset database
db-reset: ensure-deps init-env
	@echo "⚠️  Resetting database..."
	@read -p "Are you sure? This will delete all data. [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		rm -f prisma/dev.db prisma/dev.db-journal; \
		env $$(grep -E '^[A-Za-z_][A-Za-z_0-9]*=' .env.local | xargs) npx prisma db push --force-reset; \
		env $$(grep -E '^[A-Za-z_][A-Za-z_0-9]*=' .env.local | xargs) npx tsx prisma/seed.ts; \
		echo "✅ Database reset complete"; \
	else \
		echo "❌ Reset cancelled"; \
	fi

# Open Prisma Studio
db-studio: ensure-deps init-env
	@echo "🎨 Opening Prisma Studio..."
	npx prisma studio

# Ensure node_modules exists
ensure-deps:
	@if [ ! -d node_modules ]; then \
		echo "📦 Dependencies not found, installing..."; \
		npm install; \
	fi

# Ensure database exists and is ready
ensure-db: ensure-deps init-env
	@NEEDS_SEED=0; \
	if [ ! -d node_modules/@prisma/client ]; then \
		echo "🗄️  Prisma client not found, setting up database..."; \
		$(MAKE) db-setup 2>&1 | grep -v "make\["; \
		NEEDS_SEED=1; \
	fi; \
	DB_URL=$$(grep "^DATABASE_URL=" .env.local 2>/dev/null | cut -d'"' -f2); \
	if echo "$$DB_URL" | grep -q "file:"; then \
		DB_FILE=$$(echo "$$DB_URL" | sed 's/file://'); \
		if [ ! -f "prisma/$$DB_FILE" ] && [ ! -f "$$DB_FILE" ]; then \
			echo "🗄️  Database file not found, setting up..."; \
			$(MAKE) db-setup 2>&1 | grep -v "make\["; \
			NEEDS_SEED=1; \
		fi; \
	fi; \
	if [ "$$NEEDS_SEED" = "1" ]; then \
		$(MAKE) db-seed 2>&1 | grep -v "make\["; \
	fi

# Ensure Playwright browsers are installed (auto-installs if missing)
ensure-playwright: ensure-deps
	@node -e "try{require('playwright').chromium.executablePath();process.exit(0)}catch{process.exit(1)}" 2>/dev/null || \
		(echo "Installing Playwright chromium browser..." && npx playwright install chromium)

# Ensure Vercel CLI is installed, logged in, and project linked
ensure-vercel:
	@if ! command -v vercel >/dev/null 2>&1; then \
		echo "📦 Installing Vercel CLI..."; \
		npm install -g vercel; \
	fi
	@if ! vercel whoami >/dev/null 2>&1; then \
		echo "🔑 Logging in to Vercel..."; \
		vercel login; \
	fi
	@if [ ! -f .vercel/project.json ]; then \
		echo "🔗 Linking project to Vercel..."; \
		vercel link; \
	fi

# Run full E2E environment health check (Clerk, test users, LLM, browsers)
ensure-e2e-env: ensure-deps init-env ensure-playwright
	@echo "Checking E2E prerequisites..."
	@env $$(grep -E '^[A-Za-z_][A-Za-z_0-9]*=' .env.local 2>/dev/null | xargs) npx tsx e2e/playwright/health-check.ts

# Start development server (auto-setup if needed)
dev: ensure-deps ensure-env ensure-auth ensure-db
	@echo "🚀 Starting development server..."
	@echo "💡 Tip: Access the app at http://localhost:3000"
	npm run dev

# Build for production (auto-setup if needed)
build: ensure-deps ensure-env ensure-auth
	@echo "🏗️  Building for production..."
	npx prisma generate
	npm run build
	@echo "✅ Build complete"

# Start production server
start:
	@echo "🚀 Starting production server..."
	npm start

# Run ALL tests (unit + Playwright E2E)
test: ensure-deps ensure-env ensure-auth ensure-db ensure-e2e-env
	@echo "Running ALL tests (unit + Playwright E2E)..."
	@echo ""
	@echo "Step 1/2: Unit + integration tests (Jest)..."
	@npm test || exit 1
	@echo ""
	@echo "Step 2/2: Playwright E2E tests..."
	npx playwright test --config e2e/playwright.config.ts
	@echo ""
	@echo "ALL tests passed (unit + Playwright E2E)"


# Run unit tests only (fast, no server needed)
test-unit: ensure-deps
	@echo "🧪 Running unit tests..."
	npm test
	@echo "✅ Unit tests complete"

# Run production smoke test against live URL
test-smoke:
	@echo "🔥 Running production smoke test..."
	PRODUCTION_URL="https://persuaider.vercel.app" npx tsx e2e/smoke/production.ts
	@echo "✅ Smoke test complete"


# Run Playwright functional tests (auto-starts dev server)
test-e2e-pw: ensure-deps init-env ensure-db ensure-e2e-env
	@echo "🧪 Running Playwright functional tests..."
	npx playwright test --config e2e/playwright.config.ts
	@echo "✅ Playwright tests complete"

# Run Playwright tests with visible browser (for debugging)
test-e2e-pw-visible: ensure-deps init-env ensure-db ensure-e2e-env
	@echo "🧪 Running Playwright tests (visible browser)..."
	npx playwright test --config e2e/playwright.config.ts --headed
	@echo "✅ Playwright tests complete"

# Run LLM health check (verify API keys work before running E2E tests)
test-health: ensure-deps init-env
	@echo "Running E2E prerequisites health check..."
	@env $$(grep -E '^[A-Za-z_][A-Za-z_0-9]*=' .env.local 2>/dev/null | xargs) npx tsx e2e/playwright/health-check.ts

# Run Clerk auth health check (verify Clerk API key is valid)
test-auth-health: ensure-deps
	@echo "🔐 Running Clerk auth health check..."
	@npx tsx e2e/playwright/clerk-health.ts
	@echo ""

# Run tests in watch mode
test-watch: ensure-deps
	@echo "👀 Running tests in watch mode..."
	npm run test:watch

# Run tests with coverage
test-coverage: ensure-deps
	@echo "📊 Running tests with coverage..."
	npm run test:coverage
	@echo "✅ Coverage report generated in ./coverage"

# Type-check (no emit)
typecheck: ensure-deps
	@echo "🔍 Running TypeScript type check..."
	npx tsc --noEmit
	@echo "✅ Type check complete"

# Lint code
lint: ensure-deps
	@echo "🔍 Linting code..."
	npm run lint
	@echo "✅ Linting complete"

# Format code
format: ensure-deps
	@echo "💅 Formatting code..."
	npm run format
	@echo "✅ Code formatted"

# Check code formatting
format-check: ensure-deps
	@echo "🔍 Checking code formatting..."
	npm run format:check

# Deploy to Vercel production
deploy: build ensure-vercel
	@echo "🚀 Deploying to Vercel production..."
	@vercel --prod
	@echo "✅ Deployment complete"

# Deploy preview to Vercel
deploy-preview: build ensure-vercel
	@echo "🚀 Deploying preview to Vercel..."
	@vercel
	@echo "✅ Preview deployment complete"
	@echo "✅ Preview deployment complete"

# Clean build artifacts and dependencies
clean:
	@echo "🧹 Cleaning build artifacts..."
	rm -rf .next
	rm -rf node_modules
	rm -rf coverage
	rm -rf dist
	@echo "✅ Clean complete"

# Clean database only
clean-db:
	@echo "🧹 Cleaning database..."
	rm -rf prisma/dev.db
	rm -rf prisma/dev.db-journal
	@echo "✅ Database cleaned"

# Full CI workflow
ci: ensure-deps ensure-env lint test build
	@echo "✅ CI checks passed"

# Pre-commit checks (fast - unit tests only)
pre-commit: ensure-deps format lint test-unit
	@echo "✅ Pre-commit checks passed"
