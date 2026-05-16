# Data And Privacy

Local desktop mode uses a local SQLite database and filesystem storage by default. Formal project data, resource indexes, and model configuration are stored under the local backend data directory.

Provider credentials are stored and encrypted by the backend. The Agent does not directly own provider secrets; model calls go through the Movscript backend.

The local Agent stores threads, runs, drafts, memory, and traces. Debug data may include prompts, context summaries, and tool results; redact logs before sharing them.
