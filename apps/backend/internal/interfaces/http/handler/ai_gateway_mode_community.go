//go:build !runtime_overlay

package handler

func (h *AIHandler) newAPIGatewayMode() bool {
	return false
}
