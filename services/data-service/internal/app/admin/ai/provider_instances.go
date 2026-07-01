package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	externalresourceapp "github.com/movscript/movscript/internal/app/externalresource"
	domainai "github.com/movscript/movscript/internal/domain/ai"
	infraai "github.com/movscript/movscript/internal/infra/ai"
	"github.com/movscript/movscript/internal/infra/crypto"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

type ProviderInstance struct {
	ID              string                  `json:"id"`
	Type            string                  `json:"type"`
	Adapter         string                  `json:"adapter"`
	Label           string                  `json:"label"`
	DisplayName     string                  `json:"display_name"`
	ManagedBy       string                  `json:"managed_by"`
	Configured      bool                    `json:"configured"`
	Enabled         bool                    `json:"enabled"`
	ConfigEditable  bool                    `json:"config_editable"`
	RequiresRestart bool                    `json:"requires_restart"`
	Ref             *ProviderInstanceRef    `json:"ref,omitempty"`
	ConfigFields    []ProviderInstanceField `json:"config_fields"`
	SecretFields    []ProviderInstanceField `json:"secret_fields"`
	Capabilities    []string                `json:"capabilities"`
}

type ProviderInstanceRef struct {
	Kind string `json:"kind"`
	ID   uint   `json:"id"`
}

type ProviderInstanceField struct {
	Key        string `json:"key"`
	Required   bool   `json:"required"`
	Configured bool   `json:"configured"`
}

func (s *Service) ListProviderInstances(ctx context.Context) ([]ProviderInstance, error) {
	creds, err := s.ListCredentials(ctx)
	if err != nil {
		return nil, err
	}
	instances := make([]ProviderInstance, 0, len(creds))
	externalResourceInstances, err := s.listExternalResourceProviderInstances(ctx)
	if err != nil {
		return nil, err
	}
	instances = append(instances, externalResourceInstances...)
	for _, cred := range creds {
		instances = append(instances, providerInstanceFromCredential(cred))
	}
	return instances, nil
}

func (s *Service) TestProviderInstance(ctx context.Context, id string) (TestResult, error) {
	credentialID, ok := parseProviderInstanceCredentialID(id)
	if ok {
		return s.TestCredential(ctx, fmt.Sprintf("%d", credentialID))
	}
	externalSourceID, ok := parseExternalResourceProviderInstanceID(id)
	if ok {
		return s.testExternalResourceProviderInstance(ctx, externalSourceID)
	}
	return TestResult{}, ErrNotFound
}

func providerInstanceFromCredential(cred domainai.Credential) ProviderInstance {
	def := infraai.GetAdapterDef(cred.AdapterType)
	label := cred.AdapterType
	if def != nil && strings.TrimSpace(def.DisplayName) != "" {
		label = def.DisplayName
	}
	configFields, secretFields := providerInstanceFieldsFromCredential(cred, def)
	ref := &ProviderInstanceRef{
		Kind: "ai_credential",
		ID:   cred.ID,
	}
	return ProviderInstance{
		ID:           providerInstanceCredentialID(cred.ID),
		Type:         providercontract.TypeAIGateway,
		Adapter:      cred.AdapterType,
		Label:        label,
		DisplayName:  cred.DisplayName,
		ManagedBy:    providercontract.ManagedByConfig,
		Configured:   providerInstanceConfigured(secretFields),
		Enabled:      cred.IsEnabled,
		Ref:          ref,
		ConfigFields: configFields,
		SecretFields: secretFields,
		Capabilities: providerInstanceAIGatewayCapabilities(def),
	}
}

func providerInstanceAIGatewayCapabilities(def *infraai.AdapterDef) []string {
	caps := []string{
		"model.list",
		"model.resolve",
		"chat.completions",
		"chat.stream",
		"responses",
		"image.generate",
		"video.generate",
		"file.upload",
		"usage.reserve",
		"usage.settle",
		"audit.record",
		"health.probe",
		"runtime_health.snapshot",
	}
	seen := map[string]bool{}
	out := make([]string, 0, len(caps)+4)
	add := func(capability string) {
		if capability == "" || seen[capability] {
			return
		}
		seen[capability] = true
		out = append(out, capability)
	}
	for _, capability := range caps {
		add(capability)
	}
	if def == nil {
		return out
	}
	if def.AdapterType == infraai.AdapterOpenAICompat {
		add("video.task")
		add("video.poll")
		add("video.cancel")
	}
	for _, set := range def.ParamSets {
		switch set.Capability {
		case infraai.CapabilityFamilyImageGeneration:
			add("image.generation")
		case infraai.CapabilityFamilyAudioGeneration:
			add("audio.generation")
		}
	}
	return out
}

func providerInstanceFieldsFromCredential(cred domainai.Credential, def *infraai.AdapterDef) ([]ProviderInstanceField, []ProviderInstanceField) {
	configFields := []ProviderInstanceField{
		{Key: "base_url", Required: false, Configured: strings.TrimSpace(cred.BaseURL) != ""},
		{Key: "files_api_base_url", Required: false, Configured: strings.TrimSpace(cred.FilesAPIBaseURL) != ""},
	}
	secretFields := []ProviderInstanceField{}
	if def != nil {
		for _, field := range def.CredFields {
			switch field.Key {
			case "base_url":
				continue
			default:
				secretFields = append(secretFields, ProviderInstanceField{
					Key:        field.Key,
					Required:   field.Required,
					Configured: strings.TrimSpace(cred.MaskedKey) != "" || strings.TrimSpace(cred.EncryptedKey) != "",
				})
			}
		}
	}
	if cred.FilesAPIEnabled {
		secretFields = append(secretFields, ProviderInstanceField{
			Key:        "files_api_key",
			Required:   false,
			Configured: strings.TrimSpace(cred.FilesAPIMaskedKey) != "" || strings.TrimSpace(cred.FilesAPIEncryptedKey) != "",
		})
	}
	return configFields, secretFields
}

func providerInstanceConfigured(fields []ProviderInstanceField) bool {
	for _, field := range fields {
		if field.Required && !field.Configured {
			return false
		}
	}
	return true
}

func providerInstanceCredentialID(id uint) string {
	return fmt.Sprintf("ai_gateway:credential:%d", id)
}

func parseProviderInstanceCredentialID(id string) (uint, bool) {
	value := strings.TrimSpace(id)
	const prefix = "ai_gateway:credential:"
	if !strings.HasPrefix(value, prefix) {
		return 0, false
	}
	parsed, err := parseUintID(strings.TrimPrefix(value, prefix))
	if err != nil {
		return 0, false
	}
	return parsed, true
}

func (s *Service) listExternalResourceProviderInstances(ctx context.Context) ([]ProviderInstance, error) {
	var rows []persistencemodel.ExternalResourceSource
	if err := s.db.WithContext(ctx).Order("provider_key asc, priority asc, id asc").Find(&rows).Error; err != nil {
		return nil, err
	}
	instances := make([]ProviderInstance, 0, len(rows))
	for _, row := range rows {
		instances = append(instances, s.externalResourceProviderInstanceFromSource(row))
	}
	return instances, nil
}

func (s *Service) externalResourceProviderInstanceFromSource(row persistencemodel.ExternalResourceSource) ProviderInstance {
	config := s.decryptExternalResourceConfig(row.ConfigJSON)
	apiKeyConfigured := strings.TrimSpace(config["api_key"]) != ""
	label := externalResourceProviderLabel(row.ProviderKey)
	displayName := strings.TrimSpace(row.Name)
	if displayName == "" {
		displayName = label
	}
	ref := &ProviderInstanceRef{
		Kind: "external_resource_source",
		ID:   row.ID,
	}
	return ProviderInstance{
		ID:              externalResourceProviderInstanceID(row.ID),
		Type:            providercontract.TypeExternalResource,
		Adapter:         strings.TrimSpace(row.ProviderKey),
		Label:           label,
		DisplayName:     displayName,
		ManagedBy:       providercontract.ManagedByConfig,
		Configured:      apiKeyConfigured,
		Enabled:         row.IsEnabled,
		ConfigEditable:  false,
		RequiresRestart: false,
		Ref:             ref,
		SecretFields: []ProviderInstanceField{
			{Key: "api_key", Required: true, Configured: apiKeyConfigured},
		},
		Capabilities: []string{
			"external_resource.search",
			"external_resource.attribution",
			"health.probe",
		},
	}
}

func (s *Service) testExternalResourceProviderInstance(ctx context.Context, sourceID uint) (TestResult, error) {
	var row persistencemodel.ExternalResourceSource
	if err := s.db.WithContext(ctx).First(&row, sourceID).Error; err != nil {
		return TestResult{}, ErrNotFound
	}
	start := time.Now()
	provider, ok := externalresourceapp.NewProviderAdapter(row.ProviderKey, s.decryptExternalResourceConfig(row.ConfigJSON), nil)
	if !ok {
		return TestResult{Success: false, Message: "external resource provider is not supported", LatencyMs: time.Since(start).Milliseconds()}, nil
	}
	healthChecker, ok := provider.(providercontract.HealthChecker)
	if !ok {
		return TestResult{Success: false, Message: "external resource provider does not support health check", LatencyMs: time.Since(start).Milliseconds()}, nil
	}
	health := healthChecker.Health(ctx)
	return TestResult{
		Success:   health.Status == providercontract.HealthStatusOK,
		Message:   health.Message,
		LatencyMs: time.Since(start).Milliseconds(),
	}, nil
}

func (s *Service) decryptExternalResourceConfig(configJSON string) map[string]string {
	raw := strings.TrimSpace(configJSON)
	if raw == "" {
		return map[string]string{}
	}
	if len(s.encryptionKey) > 0 {
		if plain, err := crypto.Decrypt(raw, s.encryptionKey); err == nil {
			raw = plain
		}
	}
	var config map[string]string
	if err := json.Unmarshal([]byte(raw), &config); err != nil {
		return map[string]string{}
	}
	return config
}

func externalResourceProviderInstanceID(id uint) string {
	return fmt.Sprintf("external_resource:source:%d", id)
}

func parseExternalResourceProviderInstanceID(id string) (uint, bool) {
	value := strings.TrimSpace(id)
	const prefix = "external_resource:source:"
	if !strings.HasPrefix(value, prefix) {
		return 0, false
	}
	parsed, err := parseUintID(strings.TrimPrefix(value, prefix))
	if err != nil {
		return 0, false
	}
	return parsed, true
}

func externalResourceProviderLabel(providerKey string) string {
	switch strings.TrimSpace(providerKey) {
	case externalresourceapp.ProviderPexels:
		return "Pexels"
	case externalresourceapp.ProviderPixabay:
		return "Pixabay"
	default:
		return strings.TrimSpace(providerKey)
	}
}
