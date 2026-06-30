package main

import (
	"strings"
	"testing"
)

func TestValidateRegistryBoundariesRejectsProviderOnlyLab(t *testing.T) {
	err := validateRegistryBoundaries([]templateSource{
		{ID: "aws-bedrock:gpt-example", Lab: "aws-bedrock"},
	}, nil, nil)
	if err == nil || !strings.Contains(err.Error(), "provider or runtime boundary") {
		t.Fatalf("validateRegistryBoundaries() error = %v, want provider-only lab rejection", err)
	}
}

func TestValidateRegistryBoundariesRejectsProviderOnlyComboLab(t *testing.T) {
	err := validateRegistryBoundaries([]templateSource{
		{ID: "openai:gpt-example", Lab: "openai"},
	}, nil, []comboRuleSource{
		{ProviderKind: "aws_bedrock", Lab: "aws-bedrock"},
	})
	if err == nil || !strings.Contains(err.Error(), "provider or runtime boundary") {
		t.Fatalf("validateRegistryBoundaries() error = %v, want provider-only combo lab rejection", err)
	}
}

func TestValidateRegistryBoundariesRejectsUnknownComboLab(t *testing.T) {
	err := validateRegistryBoundaries([]templateSource{
		{ID: "openai:gpt-example", Lab: "openai"},
	}, nil, []comboRuleSource{
		{ProviderKind: "ghost_official", Lab: "ghost-lab"},
	})
	if err == nil || !strings.Contains(err.Error(), "unknown lab") {
		t.Fatalf("validateRegistryBoundaries() error = %v, want unknown combo lab rejection", err)
	}
}

func TestValidateRegistryBoundariesAllowsLocalAudioRuntimeProvider(t *testing.T) {
	err := validateRegistryBoundaries([]templateSource{
		{ID: "open-source-audio:musicgen", Lab: "open-source-audio"},
	}, []providerTemplateSource{
		{ProviderKind: "local_audio_runtime"},
		{ProviderKind: "relay_gateway"},
	}, []comboRuleSource{
		{ProviderKind: "local_audio_runtime", Lab: "open-source-audio"},
		{ProviderKind: "relay_gateway"},
	})
	if err != nil {
		t.Fatalf("validateRegistryBoundaries() error = %v, want local audio runtime boundary accepted", err)
	}
}

func TestValidateRuntimeCapabilityCoverageRejectsUnimplementedAdapterCapability(t *testing.T) {
	err := validateRuntimeCapabilityCoverage([]templateSource{
		{
			ID:           "minimax:mimo-v2-omni",
			Lab:          "minimax",
			Capabilities: []string{"audio_chat"},
			Source:       sourceEvidence{Status: "verified"},
		},
	}, []comboRuleSource{
		{Lab: "minimax", AdapterType: "minimax"},
	})
	if err == nil || !strings.Contains(err.Error(), "no route template adapter implements runtime capability") {
		t.Fatalf("validateRuntimeCapabilityCoverage() error = %v, want missing runtime capability rejection", err)
	}
}

func TestValidateRuntimeCapabilityCoverageAllowsTemplateOnlyDiscovery(t *testing.T) {
	err := validateRuntimeCapabilityCoverage([]templateSource{
		{
			ID:           "minimax:mimo-v2-omni",
			Lab:          "minimax",
			Capabilities: []string{"audio_chat"},
			Source:       sourceEvidence{Status: "template_only"},
		},
	}, nil)
	if err != nil {
		t.Fatalf("validateRuntimeCapabilityCoverage() error = %v, want template-only discovery allowed", err)
	}
}

func TestValidateRuntimeCapabilityCoverageUsesRouteTemplateAdapter(t *testing.T) {
	err := validateRuntimeCapabilityCoverage([]templateSource{
		{
			ID:           "xai:grok-imagine-video",
			Lab:          "xai",
			Capabilities: []string{"video"},
			Source:       sourceEvidence{Status: "verified"},
		},
	}, []comboRuleSource{
		{
			ModelTemplateKey: "xai:grok-imagine-video",
			AdapterType:      "official_video_generations",
		},
	})
	if err != nil {
		t.Fatalf("validateRuntimeCapabilityCoverage() error = %v, want route adapter to cover video capability", err)
	}
}

func TestValidateRuntimeCapabilityCoverageAllowsDoubao2APIMedia(t *testing.T) {
	err := validateRuntimeCapabilityCoverage([]templateSource{
		{
			ID:           "doubao2api:doubao-image",
			Lab:          "doubao2api",
			Capabilities: []string{"image"},
			Source:       sourceEvidence{Status: "unofficial"},
		},
		{
			ID:           "doubao2api:doubao-video",
			Lab:          "doubao2api",
			Capabilities: []string{"video"},
			Source:       sourceEvidence{Status: "unofficial"},
		},
	}, []comboRuleSource{
		{Lab: "doubao2api", AdapterType: "doubao2api"},
	})
	if err != nil {
		t.Fatalf("validateRuntimeCapabilityCoverage() error = %v, want doubao2api image/video accepted", err)
	}
}
