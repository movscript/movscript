//go:build !runtime_overlay

package gateway

func applyAPIKeyRuntimeFromModel(target *APIKey, source any) {}

func applyAPIKeyRuntimeToModel(source APIKey, target any) {}
