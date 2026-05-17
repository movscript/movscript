## Summary

- 

## Validation

- [ ] `make test`
- [ ] Manual verification notes added when UI behavior changes
- [ ] AgentRun debugging changes: `pnpm run test:agent-run-debugging` passed, and `pnpm run test:agent-run-debugging:e2e` or CI `agent-run-debugging-playwright-results` artifact reviewed with `agent-run-debugging-acceptance-summary.json` showing `passed: true`; `node scripts/verify-agent-run-debugging-acceptance-summary.mjs <summary-path>` passes for downloaded summaries

## Release impact

- [ ] No user-facing change
- [ ] Documentation updated
- [ ] Migration or configuration change documented
