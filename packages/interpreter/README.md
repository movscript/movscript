# @movscript/interpreter

Interpreter package for translating source changes into MovScript diagnostics, impact plans, and deterministic read-model artifacts.

The review/interpret path is intentionally layered:

```text
file changes
  -> git coverage
  -> JSON value changes
  -> JSON file field changes
  -> source entity changes
  -> semantic business changes
  -> production impacts
  -> review/interpret read models
```

See the layered pipeline notes for current module boundaries and test ownership:

- [Interpreter layered pipeline](../../docs/interpreter-layered-pipeline.md)

This is an internal MovScript workspace package.
