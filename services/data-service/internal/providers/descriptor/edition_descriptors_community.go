//go:build !runtime_overlay

package descriptor

func distributionProfileBuiltInProviders() []builtInProvider {
	return nil
}

func distributionProfileBuiltIn(_ string, _ string) (Descriptor, bool) {
	return Descriptor{}, false
}
