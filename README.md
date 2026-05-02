# Persuaider

An AI-powered negotiation training platform. Create custom scenarios, practice against AI personas, and get LLM-evaluated feedback on your performance.

## Quick Setup

**New to this project? Just run:**

```bash
make dev
```

This command automatically:
- Installs all dependencies
- Creates `.env.local` with sensible defaults (SQLite for local dev)
- Sets up and seeds the database with demo scenarios
- Starts the development server

Then add your API keys to `.env.local`:
```bash
# Recommended: Claude (primary provider)
ANTHROPIC_API_KEY=<your key from console.anthropic.com>

# Optional fallbacks for reliability
GEMINI_API_KEY=<your key>       # Gemini 2.0 Flash (backup)
OPENAI_API_KEY=<your key>       # GPT-5.2 Instant (final fallback)
```

Visit **http://localhost:3000**

### Prerequisites

- **Node.js** v18 or later - [Download here](https://nodejs.org/)
- **Make** (pre-installed on macOS/Linux)
- **LLM API Key**: At least one of [Anthropic](https://console.anthropic.com/) (recommended), [Google AI](https://ai.google.dev/), or [OpenAI](https://platform.openai.com/)

### Alternative: Full Control Setup

```bash
make setup    # Install deps, setup database, seed data
make dev      # Start development server
```

## Login

**Admin**: Login with credentials from `.env.local` (`ADMIN_USERNAME` / `ADMIN_PASSWORD`)
**Users**: Created by admin with auto-generated credentials

### Admin Workflow
1. Login to admin dashboard
2. Create scenarios with custom personas, evaluation frameworks, and scoring criteria
3. Go to "Accounts" to create user accounts and assign them to scenarios
4. Share generated credentials with team members

### User Workflow
1. Login with provided credentials
2. Select a scenario and persona to practice with
3. Negotiate using the techniques from the scenario's evaluation frameworks
4. End the session to receive an LLM-evaluated performance summary

## How It Works

1. **Admins create scenarios** -- define the negotiation context, AI personas, and evaluation frameworks (any frameworks, not just the built-in ones)
2. **Users select a persona** and begin a conversation
3. **Chat with the AI persona**, which stays in character and responds according to the scenario context
4. **End the session** to trigger LLM-powered evaluation -- the LLM analyzes the full conversation and produces:
   - Overall score (0-100)
   - Per-framework scores based on the scenario's evaluation criteria
   - Winning arguments -- your 3-5 most effective points
   - Detailed feedback: what went well, what to improve, and specific suggestions
5. **Download reports** -- export results across all team members

## Demo Scenarios (Seed Data)

The database ships with two example scenarios to get started:

**Salary Negotiation** -- 3 personas with different management styles:
- **Alex Chen** -- Data-driven, fair-minded hiring manager
- **Jordan Wallace** -- Direct, skeptical, results-oriented
- **Pat Morales** -- Empathetic, collaborative, people-pleaser

**Convince Your Team to Adopt AI** -- 6 personas using CLEAR/AIDA frameworks:
- **Sarah the Security Hawk** -- Demands compliance and data protection proof
- **Bob the Dinosaur** -- Veteran who dismisses AI as a fad
- **Karen the Quality Controller** -- Worries about hallucinations and accuracy
- **Frank the Finance Guy** -- Wants hard ROI numbers before anything else
- **Martha the Craftsperson** -- Values human touch and authenticity
- **Tech-Timid Tim** -- Willing but overwhelmed by technology

These are examples. The platform supports any negotiation scenario -- sales objections, contract discussions, stakeholder alignment, conflict resolution, or anything an instructor designs.

## LLM Configuration

Multi-provider setup with automatic fallback:

**Provider Chain:**
1. **Claude Sonnet 4.5** (Primary) -- Best persona consistency
2. **Gemini 2.0 Flash** (Backup) -- Fast and reliable
3. **GPT-5.2 Instant** (Fallback) -- Final safety net

Configure in `.env.local` by setting the relevant API key environment variables. Provider priority is hardcoded as Claude, then Gemini, then OpenAI. The system uses whichever providers have keys configured and automatically falls back to the next available provider if quota is exceeded or API errors occur.

## Evaluation Frameworks

Scenarios can use any evaluation frameworks. The built-in demo uses CLEAR and AIDA:

### CLEAR Framework (Objection Handling)
- **C**apture: Repeat their concern
- **L**abel: Categorize using MAPPR (Money, Authority, Priority, Performance, Risk)
- **E**mpathize: Validate their feeling
- **A**nswer: Truth + Meaning + Proof
- **R**equest: Specific next step

### AIDA Framework (Persuasion)
- **A**ttention: Surprising facts/statistics
- **I**nterest: Show relevance to them
- **D**esire: Highlight benefits
- **A**ction: Specific steps to take

### Example: CLEAR + AIDA Combined
```
You mentioned cost concerns. I understand that's a valid worry about ROI.
Did you know 40-60% of work is automatable? This means AI handles repetitive
tasks, saving teams 20-40% of time - several hours per week.
Why don't you try one task with AI this week?
```

**This hits:**
- CLEAR: Capture, Label (Money), Empathize, Answer (data + benefits), Request
- AIDA: Attention (stat), Interest (tasks), Desire (time save), Action (try)

## Common Commands

All commands handle dependencies and setup automatically:

```bash
make help          # Show all available commands
make dev           # Start dev server (auto-setup everything)
make setup         # Complete project setup from scratch
make db-studio     # Open database GUI
make db-reset      # Reset database with fresh data
make build         # Build for production
make test          # Run all tests (unit + E2E)
```

Run `make help` for the full list.

## Testing

```bash
make test              # Run ALL tests (unit + Selenium E2E)
make test-unit         # Unit tests only (fast, no server needed)
make test-e2e          # Selenium E2E tests (headless, auto-starts server)
make test-e2e-visible  # Selenium E2E with visible browser (debugging)
make test-e2e-pw       # Playwright E2E tests (headless, auto-starts server)
make test-coverage     # Unit tests with coverage report
```

Both **Selenium** and **Playwright** E2E test suites are available. Selenium tests cover the full user flow; Playwright tests provide additional functional coverage with built-in auto-waiting and `data-testid` selectors.

## Development Workflow

### Making Database Schema Changes

```bash
# 1. Edit prisma/schema.prisma
# 2. Push changes to database
make db-push

# Or create a migration (recommended for production)
make db-migrate
```

### Resetting Everything

```bash
make clean          # Remove all build artifacts and dependencies
make clean-db       # Remove database only
make setup          # Full setup from scratch
```

### Before Committing Code

```bash
make pre-commit     # Runs formatting, linting, and tests
```

## Deploy

```bash
vercel --prod
```

Set environment variables in Vercel, connect PostgreSQL (Neon/Supabase), run `npx prisma migrate deploy && npx prisma db seed`.

## Tech Stack

- Next.js 16 + TypeScript + Tailwind CSS
- Prisma ORM (SQLite dev, PostgreSQL prod)
- NextAuth.js
- Multi-provider LLM (Claude Sonnet 4.5, Gemini 2.0 Flash, GPT-5.2 Instant)
- Selenium + Playwright E2E testing
- Vercel (free tier supports 50+ users)

## Cost

- **Hosting**: Free (Vercel)
- **Database**: Free (Neon 512MB)
- **LLM**: ~$0.07 per session (Claude Sonnet 4.5)

## Structure

```
src/
├── app/              # Next.js app (routes, pages, API)
├── components/       # React UI components
├── lib/              # Core logic (auth, db, llm, evaluation, frameworks)
└── types/            # TypeScript definitions

e2e/
├── selenium/         # Selenium WebDriver tests
└── playwright/       # Playwright functional tests

prisma/
├── schema.prisma     # Database schema
└── seed.ts           # Seed data (demo scenarios)
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No AI responses | Add at least one LLM API key to `.env.local` and restart |
| Login fails | Run `make db-reset` to reset database |
| Database errors | Run `make db-reset` or `make clean-db && make dev` |
| Module errors | Run `make clean && make dev` |
| Environment issues | Delete `.env.local` and run `make setup` |
| Port 3000 in use | Stop other servers or change port in `package.json` |

## Tips

- All `make` commands automatically install dependencies and setup environment
- Use `make help` to see all available commands with descriptions
- SQLite is used for local development (no external database needed)
- PostgreSQL is recommended for production deployments
