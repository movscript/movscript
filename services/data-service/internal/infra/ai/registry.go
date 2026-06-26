package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/movscript/movscript/internal/infra/crypto"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

// Registry builds Provider instances from AICredential + resolved ModelDef.
type Registry struct {
	db              *gorm.DB
	encryptionKey   []byte
	providerMode    string
	providerFactory func(persistencemodel.AICredential, *ModelDef) (Provider, error)
}

func NewRegistry(db *gorm.DB, encryptionKey []byte) *Registry {
	return &Registry{db: db, encryptionKey: encryptionKey}
}

func NewRegistryWithProviderMode(db *gorm.DB, encryptionKey []byte, providerMode string) *Registry {
	providerMode = strings.TrimSpace(providerMode)
	if normalized, ok := editionRegistryProviderMode(providerMode); ok {
		providerMode = normalized
	} else if providerMode != "" {
		providerMode = AdapterLocal
	}
	return &Registry{db: db, encryptionKey: encryptionKey, providerMode: providerMode}
}

// BuildForCredential constructs a Provider for testing connectivity (no model needed).
func (r *Registry) BuildForCredential(cred persistencemodel.AICredential) (Provider, error) {
	// Use a fake minimal ModelDef that captures the adapter type.
	fakeDef := &ModelDef{AdapterType: cred.AdapterType}
	return r.buildProvider(cred, fakeDef)
}

// BuildForModelCredential constructs a Provider from an already resolved credential and model definition.
func (r *Registry) BuildForModelCredential(cred persistencemodel.AICredential, def *ModelDef) (Provider, error) {
	return r.buildProvider(cred, def)
}

// BuildForGatewayProvider constructs the configured gateway-level Provider
// without going through an admin credential row.
func (r *Registry) BuildForGatewayProvider() (Provider, error) {
	if r.providerMode == AdapterLocal || r.providerMode == "local" || r.providerMode == "" {
		return NewLocalAdapter(), nil
	}
	if provider, handled, err := r.editionBuildGatewayProvider(); handled || err != nil {
		return provider, err
	}
	return nil, fmt.Errorf("ai gateway provider %q is not supported", r.providerMode)
}

func (r *Registry) buildProvider(cred persistencemodel.AICredential, def *ModelDef) (Provider, error) {
	if r.providerFactory != nil {
		return r.providerFactory(cred, def)
	}
	if cred.AdapterType == AdapterLocal {
		return NewLocalAdapter(), nil
	}
	if provider, handled, err := r.editionBuildProvider(cred, def); handled || err != nil {
		return provider, err
	}
	apiKey := ""
	if cred.EncryptedKey != "" && len(r.encryptionKey) > 0 {
		var err error
		apiKey, err = crypto.Decrypt(cred.EncryptedKey, r.encryptionKey)
		if err != nil {
			return nil, fmt.Errorf("failed to decrypt credential %d: %w", cred.ID, err)
		}
	}

	baseURL := cred.BaseURL
	if baseURL == "" {
		if def := GetAdapterDef(cred.AdapterType); def != nil {
			baseURL = def.DefaultBaseURL
		}
	}

	adapterType := cred.AdapterType
	if adapterType == "" && def != nil {
		adapterType = def.AdapterType
	}

	switch adapterType {
	case AdapterAnthropic:
		return NewAnthropicAdapter(apiKey, baseURL), nil
	case AdapterKling:
		parts := splitKlingKey(apiKey)
		return NewKlingAdapter(parts[0], parts[1]), nil
	case AdapterVolcen:
		volcenKey, speech := splitVolcenCredential(apiKey)
		return NewVolcenAdapterWithSpeech(baseURL, volcenKey, speech), nil
	case AdapterGemini:
		return NewGeminiAdapter(apiKey, baseURL), nil
	case AdapterDashScope:
		return NewDashScopeAdapter(apiKey, baseURL), nil
	case AdapterVidu:
		return NewViduAdapter(apiKey, baseURL), nil
	case AdapterElevenLabs:
		return NewElevenLabsAdapter(apiKey, baseURL), nil
	case AdapterMiniMax:
		return NewMiniMaxAdapter(apiKey, baseURL), nil
	case AdapterXiaomiMimo:
		return NewXiaomiMimoAdapter(apiKey, baseURL), nil
	case AdapterMureka:
		return NewMurekaAdapter(apiKey, baseURL), nil
	case AdapterStability:
		return NewStabilityAdapter(apiKey, baseURL), nil
	default: // openai_compat — handles text, image (text-to-image), image_edit, and openai-compat video
		return NewOpenAIAdapter(baseURL, apiKey), nil
	}
}

// GetFileUploaderForCredential returns a FileUploader configured for a provider credential.
// Returns nil if FilesAPIEnabled is not set on the credential. Enterprise gateway
// mode may provide a per-user relay uploader without using the local credential.
func (r *Registry) GetFileUploaderForCredential(ctx context.Context, userID uint, cred persistencemodel.AICredential) FileUploader {
	if uploader, handled := r.editionFileUploader(ctx, userID); handled {
		return uploader
	}
	if !cred.FilesAPIEnabled {
		return nil
	}

	// Resolve API key: prefer independent Files API key, fallback to main key.
	apiKey := ""
	if cred.FilesAPIEncryptedKey != "" && len(r.encryptionKey) > 0 {
		plain, err := crypto.Decrypt(cred.FilesAPIEncryptedKey, r.encryptionKey)
		if err != nil {
			return nil
		}
		apiKey = plain
	} else if cred.EncryptedKey != "" && len(r.encryptionKey) > 0 {
		plain, err := crypto.Decrypt(cred.EncryptedKey, r.encryptionKey)
		if err != nil {
			return nil
		}
		apiKey = plain
	}

	// Resolve base URL: prefer independent Files API URL, fallback to main URL, then adapter default.
	baseURL := cred.FilesAPIBaseURL
	if baseURL == "" {
		baseURL = cred.BaseURL
	}
	if baseURL == "" {
		if def := GetAdapterDef(cred.AdapterType); def != nil {
			baseURL = def.DefaultBaseURL
		}
	}
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}
	if cred.AdapterType == AdapterVolcen {
		return NewVolcenFileUploader(baseURL, apiKey)
	}
	return NewFileUploader(baseURL, apiKey)
}

// EncryptCredentials encrypts the credential fields map and returns EncryptedKey and MaskedKey.
func (r *Registry) EncryptCredentials(adapterType string, creds map[string]string) (encKey, masked string, err error) {
	var raw string
	if adapterType == AdapterKling {
		raw = creds["access_key"] + ":" + creds["secret_key"]
	} else if adapterType == AdapterVolcen {
		raw = buildVolcenCredentialRaw(creds)
	} else {
		parts := []string{}
		if v := creds["api_key"]; v != "" {
			parts = append(parts, v)
		}
		if len(parts) == 0 {
			return "", "", nil // no key to encrypt
		}
		raw = parts[0]
	}
	if raw == "" || len(r.encryptionKey) == 0 {
		return "", "", nil
	}
	encKey, err = crypto.Encrypt(raw, r.encryptionKey)
	if err != nil {
		return "", "", err
	}
	masked = crypto.MaskKey(raw)
	return encKey, masked, nil
}

// EncryptRawKey encrypts a raw key string and returns (encryptedKey, maskedKey, error).
func (r *Registry) EncryptRawKey(raw string) (encKey, masked string, err error) {
	if raw == "" || len(r.encryptionKey) == 0 {
		return "", "", nil
	}
	encKey, err = crypto.Encrypt(raw, r.encryptionKey)
	if err != nil {
		return "", "", err
	}
	masked = crypto.MaskKey(raw)
	return encKey, masked, nil
}

func splitKlingKey(key string) [2]string {
	for i, c := range key {
		if c == ':' {
			return [2]string{key[:i], key[i+1:]}
		}
	}
	return [2]string{key, ""}
}

func buildVolcenCredentialRaw(creds map[string]string) string {
	apiKey := strings.TrimSpace(creds["api_key"])
	speech := volcenSpeechCredentials{
		AppID:   strings.TrimSpace(creds["speech_app_id"]),
		Token:   strings.TrimSpace(creds["speech_token"]),
		Cluster: strings.TrimSpace(creds["speech_cluster"]),
		BaseURL: strings.TrimSpace(creds["speech_base_url"]),
	}
	if speech.Token == "" && speech.AppID == "" && speech.Cluster == "" && speech.BaseURL == "" {
		return apiKey
	}
	raw := struct {
		APIKey string `json:"api_key,omitempty"`
		volcenSpeechCredentials
	}{
		APIKey:                  apiKey,
		volcenSpeechCredentials: speech,
	}
	data, err := json.Marshal(raw)
	if err != nil {
		return apiKey
	}
	return string(data)
}

func splitVolcenCredential(raw string) (string, volcenSpeechCredentials) {
	raw = strings.TrimSpace(raw)
	if !strings.HasPrefix(raw, "{") {
		return raw, volcenSpeechCredentials{}
	}
	var parsed struct {
		APIKey string `json:"api_key"`
		volcenSpeechCredentials
	}
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return raw, volcenSpeechCredentials{}
	}
	return parsed.APIKey, parsed.volcenSpeechCredentials
}

// maskAuthHeader masks the token in an Authorization header value.
func maskAuthHeader(v string) string {
	if len(v) > 12 {
		return v[:7] + "..." + v[len(v)-4:]
	}
	return "***"
}
