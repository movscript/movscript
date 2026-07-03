//go:build !runtime_overlay

package config

func distributionProfileApplyLoadedConfig(_ *Config) {}

func distributionProfileValidateStartup(_ *Config) []string {
	return nil
}

func distributionProfileSafeSummary(_ *Config) map[string]any {
	return nil
}

func distributionProfileAIGatewayProvider(_ *Config) (string, bool) {
	return "", false
}

func distributionProfileConfiguredAIGateway(_ *Config, _ string) (bool, bool) {
	return false, false
}

func distributionProfileProviderConfigFields(_ *Config, _ string, _ string) ([]ProviderConfigField, bool) {
	return nil, false
}

func distributionProfileProviderSecretFields(_ *Config, _ string, _ string) ([]ProviderSecretField, bool) {
	return nil, false
}

func distributionProfileDefaultDeploymentMode(_ string) (string, bool) {
	return "", false
}

func distributionProfileDefaultDependencyProviders(_ string) (DependencyProviders, bool) {
	return DependencyProviders{}, false
}

func distributionProfileDefaultCORSAllowedOrigins(origins []string) []string {
	return origins
}
