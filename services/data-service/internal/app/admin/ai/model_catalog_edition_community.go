//go:build !runtime_overlay

package ai

func normalizeDistributionProfileModelRouteBindingInput(input ModelRouteBindingInput) ModelRouteBindingInput {
	return input
}

func supportsLocalProviderRouteBindings() bool { return true }

func supportsRelayGatewayRouteBindings() bool { return false }
