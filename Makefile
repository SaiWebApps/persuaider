.PHONY: help install setup dev build test test-unit test-e2e test-e2e-visible test-e2e-pw test-health lint format db-setup db-migrate db-seed db-reset db-studio clean deploy init-env set-keys ensure-server

# Default target - show help
help:
	@echo "╔═══════════════════════════════════════════════════════════════════════╗"
	@echo "║          Persuaider - Available Commands                              ║"
	@echo "╚═══════════════════════════════════════════════════════════════════════╝"
	@echo ""
	@echo "🚀 Quick Start (New Developers):"
	@echo "  make setup         - Complete project setup (recommended for first time)"
	@echo "  make dev           - Start development server (auto-setup if needed)"
	@echo ""
	@echo "📦 Setup & Installation:"
	@echo "  make init-env      - Create .env.local with sensible defaults"
	@echo "  make set-keys      - Interactively configure API keys"
	@echo "  make install       - Install all dependencies"
	@echo "  make quick-start   - Fast setup (env + install + db)"
	@echo "  make check-env     - Verify environment configuration"
	@echo ""
	@echo "🗄️  Database:"
	@echo "  make db-setup      - Initialize database and run migrations"
	@echo "  make db-seed       - Seed database with default data"
	@echo "  make db-migrate    - Run database migrations"
	@echo "  make db-push       - Push schema changes without migration"
	@echo "  make db-generate   - Generate Prisma Client"
	@echo "  make db-studio     - Open Prisma Studio (database GUI)"
	@echo "  make db-reset      - Reset database (drop, recreate, migrate, seed)"
	@echo ""
	@echo "💻 Development:"
	@echo "  make dev           - Start development server (with auto-setup)"
	@echo "  make lint          - Run ESLint"
	@echo "  make format        - Format code with Prettier"
	@echo "  make format-check  - Check code formatting"
	@echo ""
	@echo "🧪 Testing:"
	@echo "  make test          - Run ALL tests (unit + Selenium E2E + Playwright E2E)"
	@echo "  make test-unit     - Run unit tests only (fast, no server needed)"
	@echo "  make test-smoke    - Run production smoke test against live URL"
	@echo "  make test-e2e      - Run E2E Selenium tests only (headless, auto-starts server)"
	@echo "  make test-e2e-visible - Run E2E tests with visible browser (for debugging)"
	@echo "  make test-e2e-pw   - Run Playwright functional tests (headless, auto-starts server)"
	@echo "  make test-e2e-pw-visible - Run Playwright tests with visible browser"
	@echo "  make test-health   - Verify LLM API keys work (fast pre-flight check)"
	@echo "  make test-watch    - Run unit tests in watch mode"
	@echo "  make test-coverage - Run unit tests with coverage report"
	@echo ""
	@echo "🏗️  Build & Deployment:"
	@echo "  make build         - Build for production (auto-setup if needed)"
	@echo "  make start         - Start production server (after build)"
	@echo "  make deploy        - Deploy to Vercel production"
	@echo "  make deploy-preview - Deploy preview to Vercel"
	@echo ""
	@echo "🧹 Utilities:"
	@echo "  make clean         - Clean build artifacts and dependencies"
	@echo "  make clean-db      - Clean database only"
	@echo "  make pre-commit    - Run pre-commit checks (format, lint, test)"
	@echo "  make ci            - Run full CI workflow"
	@echo ""
	@echo "💡 Note: Most commands automatically install dependencies and setup"
	@echo "   the environment if needed. Just run 'make dev' to get started!"
	@echo ""

# Initialize environment file with sensible defaults
init-env:
	@if [ ! -f .env.local ]; then \
		echo "Creating .env.local with local development defaults..."; \
		echo "# Database (SQLite for local development)" > .env.local; \
		echo "DATABASE_URL=\"file:./dev.db\"" >> .env.local; \
		echo "" >> .env.local; \
		echo "# Authentication" >> .env.local; \
		echo "NEXTAUTH_URL=\"http://localhost:3000\"" >> .env.local; \
		echo "NEXTAUTH_SECRET=\"$$(openssl rand -base64 32 2>/dev/null || echo 'CHANGE_ME_IN_PRODUCTION')\"" >> .env.local; \
		echo "" >> .env.local; \
		echo "# Google OAuth (optional)" >> .env.local; \
		echo "GOOGLE_CLIENT_ID=\"\"" >> .env.local; \
		echo "GOOGLE_CLIENT_SECRET=\"\"" >> .env.local; \
		echo "" >> .env.local; \
		echo "# Microsoft OAuth (optional)" >> .env.local; \
		echo "MICROSOFT_CLIENT_ID=\"\"" >> .env.local; \
		echo "MICROSOFT_CLIENT_SECRET=\"\"" >> .env.local; \
		echo "" >> .env.local; \
		echo "# LLM Providers (at least one required)" >> .env.local; \
		echo "GEMINI_API_KEY=\"\"" >> .env.local; \
		echo "ANTHROPIC_API_KEY=\"\"" >> .env.local; \
		echo "OPENAI_API_KEY=\"\"" >> .env.local; \
		echo "" >> .env.local; \
		echo "# Email / SMTP (optional for local dev)" >> .env.local; \
		echo "SMTP_HOST=\"\"" >> .env.local; \
		echo "SMTP_PORT=\"587\"" >> .env.local; \
		echo "SMTP_USER=\"\"" >> .env.local; \
		echo "SMTP_PASS=\"\"" >> .env.local; \
		echo "EMAIL_FROM=\"noreply@localhost\"" >> .env.local; \
		echo "" >> .env.local; \
		echo "Created .env.local - run 'make set-keys' to configure API keys interactively"; \
	else \
		echo ".env.local already exists"; \
	fi

# Interactive API key configuration
set-keys:
	@echo "Configure API keys for Persuaider"
	@echo "Press Enter to skip any key you don't want to set."
	@echo ""
	@read -p "Gemini API Key (primary LLM): " GEMINI_KEY; \
	if [ -n "$$GEMINI_KEY" ]; then \
		if grep -q "^GEMINI_API_KEY=" .env.local 2>/dev/null; then \
			sed -i '' "s|^GEMINI_API_KEY=.*|GEMINI_API_KEY=\"$$GEMINI_KEY\"|" .env.local; \
		else \
			echo "GEMINI_API_KEY=\"$$GEMINI_KEY\"" >> .env.local; \
		fi; \
		echo "  Set GEMINI_API_KEY"; \
	fi; \
	read -p "Anthropic API Key (fallback LLM): " ANTHROPIC_KEY; \
	if [ -n "$$ANTHROPIC_KEY" ]; then \
		if grep -q "^ANTHROPIC_API_KEY=" .env.local 2>/dev/null; then \
			sed -i '' "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=\"$$ANTHROPIC_KEY\"|" .env.local; \
		else \
			echo "ANTHROPIC_API_KEY=\"$$ANTHROPIC_KEY\"" >> .env.local; \
		fi; \
		echo "  Set ANTHROPIC_API_KEY"; \
	fi; \
	read -p "OpenAI API Key (fallback LLM): " OPENAI_KEY; \
	if [ -n "$$OPENAI_KEY" ]; then \
		if grep -q "^OPENAI_API_KEY=" .env.local 2>/dev/null; then \
			sed -i '' "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=\"$$OPENAI_KEY\"|" .env.local; \
		else \
			echo "OPENAI_API_KEY=\"$$OPENAI_KEY\"" >> .env.local; \
		fi; \
		echo "  Set OPENAI_API_KEY"; \
	fi; \
	echo ""; \
	echo "Keys configured. Run 'make dev' to start."

# Install dependencies
install:
	@echo "📦 Installing dependencies..."
	npm install
	@echo "✅ Dependencies installed"

# Complete setup
setup: init-env install db-setup db-seed
	@echo "Setup complete! Run 'make set-keys' to configure API keys, then 'make dev' to start."

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

# Run migrations
db-migrate: ensure-deps init-env
	@echo "🔄 Running database migrations..."
	npx prisma migrate dev
	@echo "✅ Migrations complete"

# Push schema changes
db-push: ensure-deps init-env
	@echo "⬆️  Pushing schema changes..."
	npx prisma db push
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

# Start development server (auto-setup if needed)
dev: ensure-deps init-env ensure-db
	@echo "🚀 Starting development server..."
	@echo "💡 Tip: Access the app at http://localhost:3000"
	npm run dev

# Build for production (auto-setup if needed)
build: ensure-deps init-env
	@echo "🏗️  Building for production..."
	npx prisma generate
	npm run build
	@echo "✅ Build complete"

# Start production server
start:
	@echo "🚀 Starting production server..."
	npm start

# Run ALL tests (unit + Selenium E2E + Playwright E2E)
test: ensure-deps init-env db-setup db-seed
	@echo "🧪 Running ALL tests (unit + Selenium + Playwright)..."
	@echo ""
	@echo "📋 Step 1/3: Unit + integration tests (Jest)..."
	@npm test || exit 1
	@echo ""
	@echo "📋 Step 2/3: Selenium E2E tests..."
	@echo "🚀 Starting dev server in background..."
	@env $$(grep -E '^[A-Za-z_][A-Za-z_0-9]*=' .env.local | xargs) npm run dev > /dev/null 2>&1 & \
	SERVER_PID=$$!; \
	sleep 8; \
	echo "✅ Server started (PID: $$SERVER_PID)"; \
	echo "🧪 Running Selenium tests..."; \
	HEADLESS=true env $$(grep -E '^[A-Za-z_][A-Za-z_0-9]*=' .env.local | xargs) npm run test:e2e; \
	SELENIUM_EXIT=$$?; \
	echo ""; \
	echo "📋 Step 3/3: Playwright functional tests..."; \
	npx playwright test --config e2e/playwright.config.ts; \
	PW_EXIT=$$?; \
	echo "🛑 Stopping dev server..."; \
	kill $$SERVER_PID 2>/dev/null || true; \
	pkill -f "next dev" 2>/dev/null || true; \
	if [ $$SELENIUM_EXIT -ne 0 ]; then echo "❌ Selenium tests failed"; exit $$SELENIUM_EXIT; fi; \
	if [ $$PW_EXIT -ne 0 ]; then echo "❌ Playwright tests failed"; exit $$PW_EXIT; fi; \
	echo ""; \
	echo "✅ ALL tests passed (unit + Selenium + Playwright)"

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

# Run E2E Selenium tests only (headless mode, auto-starts server)
test-e2e: ensure-deps init-env ensure-db
	@echo "🧪 Running E2E tests (headless mode)..."
	@echo "🚀 Starting dev server in background..."
	@env $$(grep -E '^[A-Za-z_][A-Za-z_0-9]*=' .env.local | xargs) npm run dev > /dev/null 2>&1 & \
	SERVER_PID=$$!; \
	sleep 8; \
	echo "✅ Server started (PID: $$SERVER_PID)"; \
	echo "🧪 Running Selenium tests..."; \
	HEADLESS=true env $$(grep -E '^[A-Za-z_][A-Za-z_0-9]*=' .env.local | xargs) npm run test:e2e; \
	TEST_EXIT=$$?; \
	echo "🛑 Stopping dev server..."; \
	kill $$SERVER_PID 2>/dev/null || true; \
	pkill -f "next dev" 2>/dev/null || true; \
	exit $$TEST_EXIT
	@echo "✅ E2E tests complete"

# Run E2E tests with visible browser (for debugging)
test-e2e-visible: ensure-deps init-env ensure-db
	@echo "🧪 Running E2E tests (visible browser mode)..."
	@echo "🚀 Starting dev server in background..."
	@env $$(grep -E '^[A-Za-z_][A-Za-z_0-9]*=' .env.local | xargs) npm run dev > /dev/null 2>&1 & \
	SERVER_PID=$$!; \
	sleep 8; \
	echo "✅ Server started (PID: $$SERVER_PID)"; \
	echo "🧪 Running Selenium tests with visible browser..."; \
	env $$(grep -E '^[A-Za-z_][A-Za-z_0-9]*=' .env.local | xargs) npm run test:e2e; \
	TEST_EXIT=$$?; \
	echo "🛑 Stopping dev server..."; \
	kill $$SERVER_PID 2>/dev/null || true; \
	pkill -f "next dev" 2>/dev/null || true; \
	exit $$TEST_EXIT
	@echo "✅ E2E tests complete"

# Run Playwright functional tests (auto-starts dev server)
test-e2e-pw: ensure-deps init-env ensure-db
	@echo "🧪 Running Playwright functional tests..."
	npx playwright test --config e2e/playwright.config.ts
	@echo "✅ Playwright tests complete"

# Run Playwright tests with visible browser (for debugging)
test-e2e-pw-visible: ensure-deps init-env ensure-db
	@echo "🧪 Running Playwright tests (visible browser)..."
	npx playwright test --config e2e/playwright.config.ts --headed
	@echo "✅ Playwright tests complete"

# Run LLM health check (verify API keys work before running E2E tests)
test-health: ensure-deps
	@echo "🔑 Running LLM health check..."
	@npx tsx e2e/playwright/health-check.ts
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
deploy: build
	@echo "🚀 Deploying to Vercel production..."
	vercel --prod
	@echo "✅ Deployment complete"

# Deploy preview to Vercel
deploy-preview:
	@echo "🚀 Deploying preview to Vercel..."
	vercel
	@echo "✅ Preview deployment complete"

# Verify required environment variables are set
check-env: init-env
	@echo "Checking environment configuration..."
	@if ! grep -q "GEMINI_API_KEY=\"[^\"]\+\"" .env.local && ! grep -q "ANTHROPIC_API_KEY=\"[^\"]\+\"" .env.local && ! grep -q "OPENAI_API_KEY=\"[^\"]\+\"" .env.local; then \
		echo "WARNING: No LLM API key found in .env.local"; \
		echo "   Run 'make set-keys' to configure at least one LLM provider"; \
	else \
		echo "Environment configuration looks good"; \
	fi

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

# Quick development workflow (fastest way to get started)
quick-start: init-env install db-setup db-seed
	@echo "Quick start complete! Run 'make set-keys' to configure API keys, then 'make dev'"

# Full CI workflow
ci: init-env install lint test build
	@echo "✅ CI checks passed"

# Pre-commit checks (fast - unit tests only)
pre-commit: ensure-deps format lint test-unit
	@echo "✅ Pre-commit checks passed"

# Production deployment workflow
production: clean install build test deploy
	@echo "Production deployment complete"
