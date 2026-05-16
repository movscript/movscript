# API Reference

Backend APIs are mounted under `/api/v1`.

Common local URLs:

- External backend development: `http://localhost:8765/api/v1`
- Frontend-managed local mode: `http://localhost:8766/api/v1`

Public surfaces include auth, projects, resources, generation jobs, model listing, and feature configuration. Admin APIs live under `/api/v1/admin/*` and require `super_admin`.

The OpenAI-compatible gateway is available at:

```text
/v1/models
/v1/chat/completions
```

Configure credentials and enable models in the admin console before generating content.
