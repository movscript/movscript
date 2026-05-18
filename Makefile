.PHONY: dev-frontend-local test-agent-run-debugging-e2e verify-agent-run-debugging-summary verify-agent-run-debugging-summary-contract

AGENT_RUN_DEBUGGING_SUMMARY ?= apps/frontend/test-results/agent-run-debugging-acceptance-summary.json

dev-frontend-local:
	pnpm --filter movscript-admin build
	pnpm --filter movscript-backend build
	node apps/backend/scripts/build.mjs copy-admin-assets
	pnpm --filter movscript-frontend dev:local

test-agent-run-debugging-e2e:
	node tests/agent-run-debugging/run-e2e.mjs

verify-agent-run-debugging-summary:
	node tests/agent-run-debugging/verify-acceptance-summary.mjs $(AGENT_RUN_DEBUGGING_SUMMARY)

verify-agent-run-debugging-summary-contract:
	node tests/agent-run-debugging/verify-acceptance-summary.mjs $(AGENT_RUN_DEBUGGING_SUMMARY) --allow-failed
