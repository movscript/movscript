//go:build !runtime_overlay

package descriptor

func editionBuiltInProviders() []builtInProvider {
	return nil
}

func editionBuiltIn(_ string, _ string) (Descriptor, bool) {
	return Descriptor{}, false
}
