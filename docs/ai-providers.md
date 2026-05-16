# AI Providers

AI providers are configured in the admin console:

```text
http://localhost:8766/admin/models
```

Basic flow:

1. Add provider credentials.
2. Test credential connectivity.
3. Enable one or more models.
4. Configure model capabilities, input limits, pricing, and parameters.
5. Configure feature routing with default models or allowed model pools.

If the Agent or generation tools report that no model config is available, a model is usually missing, disabled, or attached to a disabled credential.
