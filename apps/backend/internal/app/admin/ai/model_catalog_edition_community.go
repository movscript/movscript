//go:build !runtime_overlay

package ai

func normalizeEditionModelRouteBindingInput(input ModelRouteBindingInput) ModelRouteBindingInput {
	return input
}

func supportsLocalProviderRouteBindings() bool { return true }

func supportsNewAPIRouteBindings() bool { return false }
