//go:build !runtime_overlay

package config

import "testing"

func TestCommunityConfigEditionHooksAreNoop(t *testing.T) {
	cfg := &Config{AIGatewayProvider: "future"}
	editionApplyLoadedConfig(cfg)
	if cfg.AIGatewayProvider != "future" {
		t.Fatalf("editionApplyLoadedConfig mutated config: %+v", cfg)
	}
	if problems := editionValidateStartup(cfg); len(problems) != 0 {
		t.Fatalf("editionValidateStartup() = %#v, want nil", problems)
	}
	if summary := editionSafeSummary(cfg); len(summary) != 0 {
		t.Fatalf("editionSafeSummary() = %#v, want nil", summary)
	}
	if provider, ok := editionAIGatewayProvider(cfg); ok || provider != "" {
		t.Fatalf("editionAIGatewayProvider() = %q, %v; want empty false", provider, ok)
	}
	if configured, handled := editionConfiguredAIGateway(cfg, "future"); configured || handled {
		t.Fatalf("editionConfiguredAIGateway() = %v, %v; want false false", configured, handled)
	}
	if fields, handled := editionProviderConfigFields(cfg, "ai_gateway", "future"); len(fields) != 0 || handled {
		t.Fatalf("editionProviderConfigFields() = %#v, %v; want nil false", fields, handled)
	}
	if fields, handled := editionProviderSecretFields(cfg, "ai_gateway", "future"); len(fields) != 0 || handled {
		t.Fatalf("editionProviderSecretFields() = %#v, %v; want nil false", fields, handled)
	}
	if mode, ok := editionDefaultDeploymentMode("cloud"); ok || mode != "" {
		t.Fatalf("editionDefaultDeploymentMode() = %q, %v; want empty false", mode, ok)
	}
	if providers, ok := editionDefaultDependencyProviders("external"); ok || providers.Profile != "" {
		t.Fatalf("editionDefaultDependencyProviders() = %+v, %v; want zero false", providers, ok)
	}
	origins := []string{"http://localhost:3001"}
	if got := editionDefaultCORSAllowedOrigins(origins); len(got) != 1 || got[0] != origins[0] {
		t.Fatalf("editionDefaultCORSAllowedOrigins() = %#v, want %#v", got, origins)
	}
}
