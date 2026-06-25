//go:build !runtime_overlay

package main

func editionHandleCommand(_ []string) bool {
	return false
}
