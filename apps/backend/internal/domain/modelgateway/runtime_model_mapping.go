//go:build !runtime_overlay

package modelgateway

func applyAPIKeyRuntimeFromModel(target *APIKey, source any) {}

func applyAPIKeyRuntimeToModel(source APIKey, target any) {}
