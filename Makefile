.PHONY: frontend-local frontend-local-fast dev-frontend-local dev-frontend-local-fast generate-model-registry test-newapi-smoke test-newapi-real-smoke test-newapi-real-smoke-secure test-agent-run-debugging-e2e verify-agent-run-debugging-summary verify-agent-run-debugging-summary-contract

AGENT_RUN_DEBUGGING_SUMMARY ?= apps/desktop/test-results/agent-run-debugging-acceptance-summary.json

frontend-local: dev-frontend-local

frontend-local-fast: dev-frontend-local-fast

generate-model-registry:
	cd services/data-service && go run ./internal/infra/ai/cmd/model-registry-generate

test-newapi-smoke:
	$(MAKE) -C services/data-service test-newapi-smoke

test-newapi-real-smoke:
	$(MAKE) -C services/data-service test-newapi-real-smoke

test-newapi-real-smoke-secure:
	bash scripts/run-newapi-real-smoke.sh

dev-frontend-local: generate-model-registry
	pnpm --filter @movscript/admin-surface build
	pnpm --filter @movscript/desktop dev:local

dev-frontend-local-fast: generate-model-registry
	pnpm --filter @movscript/admin-surface build
	pnpm --filter @movscript/desktop dev:local:fast

test-agent-run-debugging-e2e:
	node tests/agent-run-debugging/run-e2e.mjs

verify-agent-run-debugging-summary:
	node tests/agent-run-debugging/verify-acceptance-summary.mjs $(AGENT_RUN_DEBUGGING_SUMMARY)

verify-agent-run-debugging-summary-contract:
	node tests/agent-run-debugging/verify-acceptance-summary.mjs $(AGENT_RUN_DEBUGGING_SUMMARY) --allow-failed
