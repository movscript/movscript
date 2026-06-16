//go:build !runtime_overlay

package main

import "testing"

func TestCommunityEditionHandleCommandIsNoop(t *testing.T) {
	if editionHandleCommand([]string{"server", "migrate"}) {
		t.Fatal("editionHandleCommand() = true, want false")
	}
}
