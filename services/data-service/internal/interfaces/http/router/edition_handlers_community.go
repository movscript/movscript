//go:build !runtime_overlay

package router

type editionHandlers struct{}

func newEditionHandlers(_ Dependencies) editionHandlers {
	return editionHandlers{}
}
