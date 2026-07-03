//go:build !runtime_overlay

package config

import "testing"

func TestCommunityConfigDistributionProfileHooksAreNoop(t *testing.T) {
	cfg := &Config{AIGatewayProvider: "future"}
	distributionProfileApplyLoadedConfig(cfg)
	if cfg.AIGatewayProvider != "future" {
		t.Fatalf("distributionProfileApplyLoadedConfig mutated config: %+v", cfg)
	}
	if problems := distributionProfileValidateStartup(cfg); len(problems) != 0 {
		t.Fatalf("distributionProfileValidateStartup() = %#v, want nil", problems)
	}
	if summary := distributionProfileSafeSummary(cfg); len(summary) != 0 {
		t.Fatalf("distributionProfileSafeSummary() = %#v, want nil", summary)
	}
	if provider, ok := distributionProfileAIGatewayProvider(cfg); ok || provider != "" {
		t.Fatalf("distributionProfileAIGatewayProvider() = %q, %v; want empty false", provider, ok)
	}
	if configured, handled := distributionProfileConfiguredAIGateway(cfg, "future"); configured || handled {
		t.Fatalf("distributionProfileConfiguredAIGateway() = %v, %v; want false false", configured, handled)
	}
	if fields, handled := distributionProfileProviderConfigFields(cfg, "ai_gateway", "future"); len(fields) != 0 || handled {
		t.Fatalf("distributionProfileProviderConfigFields() = %#v, %v; want nil false", fields, handled)
	}
	if fields, handled := distributionProfileProviderSecretFields(cfg, "ai_gateway", "future"); len(fields) != 0 || handled {
		t.Fatalf("distributionProfileProviderSecretFields() = %#v, %v; want nil false", fields, handled)
	}
	if mode, ok := distributionProfileDefaultDeploymentMode("cloud"); ok || mode != "" {
		t.Fatalf("distributionProfileDefaultDeploymentMode() = %q, %v; want empty false", mode, ok)
	}
	if providers, ok := distributionProfileDefaultDependencyProviders("external"); ok || providers.Profile != "" {
		t.Fatalf("distributionProfileDefaultDependencyProviders() = %+v, %v; want zero false", providers, ok)
	}
	origins := []string{"http://localhost:3001"}
	if got := distributionProfileDefaultCORSAllowedOrigins(origins); len(got) != 1 || got[0] != origins[0] {
		t.Fatalf("distributionProfileDefaultCORSAllowedOrigins() = %#v, want %#v", got, origins)
	}
}
