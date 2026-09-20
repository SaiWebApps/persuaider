.PHONY: help setup dev build test test-all test-unit test-e2e test-e2e-visible db-up db-down promote-admin test-health test-auth-health test-watch test-coverage lint format format-check typecheck deploy deploy-preview db-setup db-generate db-migrate db-push db-seed db-reset db-studio clean clean-db ci pre-commit install ensure-deps ensure-env ensure-auth ensure-vercel ensure-db ensure-playwright ensure-e2e-env init-env clerk-setup

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
	@echo "    make test            Unit tests (fast, offline)"
	@echo "    make test-e2e        Playwright against a live dev server"
	@echo "    make promote-admin EMAIL=…   Make a signed-up user an admin"
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
		echo "# Database (Postgres; 'make db-up' starts one in Docker)" > .env.local; \
		echo "DATABASE_URL=\"postgresql://persuaider:persuaider@localhost:5432/persuaider\"" >> .env.local; \
		echo "DATABASE_URL_UNPOOLED=\"postgresql://persuaider:persuaider@localhost:5432/persuaider\"" >> .env.local; \
		echo "" >> .env.local; \
		echo "# Authentication (Clerk). Empty = keyless mode; the app prints a claim link." >> .env.local; \
		echo "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=\"\"" >> .env.local; \
		echo "CLERK_SECRET_KEY=\"\"" >> .env.local; \
		echo "" >> .env.local; \
		echo "# LLM Providers (at least one required)" >> .env.local; \
		echo "GOOGLE_GEMINI_API_KEY=\"\"" >> .env.local; \
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

# Clerk keys are optional locally: with none set, @clerk/nextjs runs in keyless
# mode and prints a claim link. This target only reports; it never blocks.
ensure-auth: ensure-env
	@if grep -qE '^CLERK_SECRET_KEY=["'"'"']?sk_' .env.local 2>/dev/null; then \
		echo "✓ Clerk keys present"; \
	else \
		echo "ℹ️  No Clerk keys in .env.local — running in Clerk keyless mode."; \
		echo "   To use a real Clerk instance, paste NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY into .env.local."; \
	fi

# Pull Clerk keys from the linked Vercel project (optional, interactive)
clerk-setup: ensure-vercel
	@vercel env pull .env.vercel.tmp --yes && \
	grep -E '^(NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY|CLERK_SECRET_KEY|CLERK_WEBHOOK_SECRET)=' .env.vercel.tmp >> .env.local; \
	rm -f .env.vercel.tmp; echo "✓ Clerk keys appended to .env.local"

# Complete setup: zero to running in one command
setup: ensure-deps ensure-env ensure-auth db-up ensure-db
	@# Prompt for LLM key if none configured
	@if grep -qE '^(GOOGLE_GEMINI_API_KEY|ANTHROPIC_API_KEY|OPENAI_API_KEY)="[^"]+"' .env.local 2>/dev/null; then \
		echo "✓ LLM provider configured"; \
	else \
		echo ""; \
		echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; \
		echo "  Configure LLM Provider (at least one required)"; \
		echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; \
		echo ""; \
		read -p "  Gemini API Key (recommended): " GKEY; \
		if [ -n "$$GKEY" ]; then \
			sed -i '' "s|^GOOGLE_GEMINI_API_KEY=.*|GOOGLE_GEMINI_API_KEY=\"$$GKEY\"|" .env.local; \
			echo "  ✓ Set GOOGLE_GEMINI_API_KEY"; \
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
	if [ "$$NEEDS_SEED" = "1" ]; then \
		$(MAKE) db-seed 2>&1 | grep -v "make\["; \
	fi

# Start a local Postgres in Docker matching the default DATABASE_URL
db-up:
	@docker compose up -d db
	@echo "✓ Postgres on localhost:5432 (user/pass/db: persuaider)"

db-down:
	@docker compose down

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
build: ensure-deps ensure-env
	@echo "🏗️  Building for production..."
	npx prisma generate
	npm run build
	@echo "✅ Build complete"

# Start production server
start:
	@echo "🚀 Starting production server..."
	npm start

# Unit tests. No network, no database, no keys.
test: ensure-deps
	npm test

# Everything: unit, then Playwright against a live dev server (needs Clerk + DB + one LLM key)
test-all: test test-e2e


# Run unit tests only (fast, no server needed)
test-unit: ensure-deps
	@echo "🧪 Running unit tests..."
	npm test
	@echo "✅ Unit tests complete"

# Run Playwright functional tests (auto-starts dev server)
test-e2e: ensure-deps init-env ensure-db ensure-e2e-env
	@echo "🧪 Running Playwright functional tests..."
	npx playwright test --config e2e/playwright.config.ts
	@echo "✅ Playwright tests complete"

# Run Playwright tests with visible browser (for debugging)
test-e2e-visible: ensure-deps init-env ensure-db ensure-e2e-env
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
	npx prettier --write "src/**/*.{ts,tsx}" "e2e/**/*.ts" "scripts/**/*.ts"

# Check code formatting
format-check: ensure-deps
	npx prettier --check "src/**/*.{ts,tsx}" "e2e/**/*.ts" "scripts/**/*.ts"

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

# What GitHub Actions runs on every push. No secrets, no network.
ci: ensure-deps typecheck lint test build
	@echo "✅ CI checks passed"

# Promote a user to admin by email: make promote-admin EMAIL=you@example.com
promote-admin: ensure-deps init-env
	@env $$(grep -E '^[A-Za-z_][A-Za-z_0-9]*=' .env.local | xargs) npx tsx scripts/promote-admin.ts "$(EMAIL)" $(or $(ROLE),admin)

# Pre-commit checks (fast - unit tests only)
pre-commit: ensure-deps format lint test-unit
	@echo "✅ Pre-commit checks passed"
