# The Supabase CLI ships PostHog telemetry, and its shutdown flush can time out
# and take the CLI's EXIT CODE with it — so a deploy whose functions shipped
# perfectly still fails with "Timeout while shutting down PostHog" followed by
# make Error 1. DO_NOT_TRACK is the cross-tool convention the CLI honors. Set
# here rather than per-machine so it travels with the repo.
export DO_NOT_TRACK := 1

.PHONY: help dev build preview start stop status reset types diff link push verify \
        test test-unit test-integration test-scenario preflight lint lint-fix typecheck \
        deploy deploy-app deploy-push smoke

help:
	@echo "Local development:"
	@echo "  make start       — boot the local Supabase stack (Docker)"
	@echo "  make dev         — Vite against that stack, on :5373"
	@echo "  make stop        — tear the stack down"
	@echo "  make status      — print the local URLs and keys"
	@echo "  make reset       — wipe the local database back to migrations + seeds"
	@echo "  make types       — regenerate src/types/database.ts from the local schema"
	@echo ""
	@echo "Testing:"
	@echo "  make test        — the gate: typecheck + lint + every suite"
	@echo "  make test-unit   — pure functions and components, no database"
	@echo "  make test-integration — constraints, triggers and RLS, against the live stack"
	@echo "  make test-scenario    — the multi-step journeys"
	@echo "  make smoke       — drive the running app in a real browser, and screenshot it"
	@echo "  make preflight   — run before pushing: everything, including what CI cannot"
	@echo ""
	@echo "Cloud:"
	@echo "  make link        — link this repo to the cloud Supabase project"
	@echo "  make push        — apply local migrations to the cloud project"
	@echo "  make verify      — check the local schema matches the cloud one"
	@echo "  make deploy      — build and deploy the SPA worker and the push worker"

# Guard for anything that reads or writes the LOCAL database.
#
# This repo, fundive and app-fundivers all run local Supabase stacks. They are
# on different ports, but a CLI command is perfectly happy to talk to whichever
# stack answers — and `supabase migration list --local` then reports another
# repo's migrations as drift, which reads exactly like a production problem.
# The container name is project-scoped, so its presence is the one unambiguous
# check.
LOCAL_DB_CONTAINER = supabase_db_app-fencing
REQUIRE_LOCAL = \
	if ! docker ps --format '{{.Names}}' | grep -qx "$(LOCAL_DB_CONTAINER)"; then \
	  echo "ERROR: this repo's local stack is not running ($(LOCAL_DB_CONTAINER))."; \
	  echo "       Start it with: make start"; \
	  exit 1; \
	fi

LOCAL_DB_URL = postgresql://postgres:postgres@127.0.0.1:64522/postgres

dev:     ; @npm run dev
build:   ; @npm run build
preview: ; @npm run preview

start:   ; @npm run db:start
stop:    ; @npm run db:stop
status:  ; @npm run db:status

reset:
	@$(REQUIRE_LOCAL)
	@npm run db:reset

diff:
	@$(REQUIRE_LOCAL)
	@npm run db:diff

# Generated from the LOCAL stack over a direct connection. `gen types --local`
# shells into a container that does not always come up; the db-url path needs
# nothing but a running Postgres.
types:
	@$(REQUIRE_LOCAL)
	@printf '%s\n\n' "// GENERATED FILE — DO NOT EDIT. Regenerate with \`make types\` after every" \
	  "// migration. The hand-written aliases and the compile-time guards that pin the" \
	  "// app's vocabularies to this schema live next door in src/types/db.ts." \
	  > src/types/database.ts
	@npx supabase gen types typescript --db-url "$(LOCAL_DB_URL)" 2>/dev/null \
	  | grep -v '^Connecting to' >> src/types/database.ts
	@echo "wrote src/types/database.ts"

link:    ; @npm run db:link
push:    ; @npm run db:push

# Schema drift between local and cloud, table by table. Cheap insurance before
# a deploy, and the only thing that catches a migration applied by hand.
verify:
	@npx supabase db diff --linked --schema public

typecheck: ; @npx tsc -b
lint:      ; @npm run lint
lint-fix:  ; @npm run lint:fix

test-unit:        ; @npx vitest run --project unit
test-integration:
	@$(REQUIRE_LOCAL)
	@npx vitest run --project integration
test-scenario:
	@$(REQUIRE_LOCAL)
	@npx vitest run --project scenario

test: typecheck lint
	@$(REQUIRE_LOCAL)
	@npx vitest run

# Everything the gate runs, plus the browser walk — which CI has no display for
# and which is the only thing that catches a page that type-checks and renders
# blank.
preflight: test smoke

smoke:
	@node scripts/smoke.mjs

deploy: deploy-app deploy-push

deploy-app:
	@npm run build
	@npx dotenv -e .env.production -- npx wrangler deploy

deploy-push:
	@cd workers/push && npx dotenv -e ../../.env.push -- npx wrangler deploy
