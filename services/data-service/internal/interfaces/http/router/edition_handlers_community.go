//go:build !runtime_overlay

package router

type distributionProfileHandlers struct{}

func newDistributionProfileHandlers(_ Dependencies) distributionProfileHandlers {
	return distributionProfileHandlers{}
}
