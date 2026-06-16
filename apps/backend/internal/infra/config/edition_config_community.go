//go:build !runtime_overlay

package config

func editionApplyLoadedConfig(_ *Config) {}

func editionValidateStartup(_ *Config) []string {
	return nil
}

func editionSafeSummary(_ *Config) map[string]any {
	return nil
}

func editionAIGatewayProvider(_ *Config) (string, bool) {
	return "", false
}

func editionConfiguredAIGateway(_ *Config, _ string) (bool, bool) {
	return false, false
}

func editionProviderConfigFields(_ *Config, _ string, _ string) ([]ProviderConfigField, bool) {
	return nil, false
}

func editionProviderSecretFields(_ *Config, _ string, _ string) ([]ProviderSecretField, bool) {
	return nil, false
}

func editionDefaultDeploymentMode(_ string) (string, bool) {
	return "", false
}

func editionDefaultDependencyProviders(_ string) (DependencyProviders, bool) {
	return DependencyProviders{}, false
}

func editionDefaultCORSAllowedOrigins(origins []string) []string {
	return origins
}
