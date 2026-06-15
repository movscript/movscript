/**
 * Legacy internal business index.
 *
 * Public consumers should import from @movscript/ui/business/<domain>. This
 * file intentionally exposes domain namespaces only, so page and component
 * internals do not become a flattened stable API surface.
 */
export * as agent from "./agent";
export * as app from "./app";
export * as canvas from "./canvas";
export * as generation from "./generation";
export * as jobs from "./jobs";
export * as resource from "./resource";
export * as review from "./review";
export * as scripts from "./scripts";
export * as workbench from "./workbench";
