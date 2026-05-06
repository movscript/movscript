package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/domain/model"
	"github.com/movscript/movscript/internal/infra/crypto"
	"gorm.io/gorm"
)

// Registry builds Provider instances from AICredential + resolved ModelDef.
type Registry struct {
	db            *gorm.DB
	encryptionKey []byte
}

func NewRegistry(db *gorm.DB, encryptionKey []byte) *Registry {
	return &Registry{db: db, encryptionKey: encryptionKey}
}

// BuildForConfig constructs a Provider for the given AIModelConfig.
// It loads the AICredential and resolves the model from admin config plus
// adapter defaults. Presets are never consulted here.
func (r *Registry) BuildForConfig(cfg model.AIModelConfig) (Provider, *ModelDef, error) {
	var cred model.AICredential
	if err := r.db.Where("id = ? AND is_enabled = true", cfg.CredentialID).First(&cred).Error; err != nil {
		return nil, nil, fmt.Errorf("credential id=%d not found or disabled", cfg.CredentialID)
	}

	def := resolveDefFromConfig(cfg, cred.AdapterType)

	provider, err := r.buildProvider(cred, def)
	if err != nil {
		return nil, nil, err
	}
	return provider, def, nil
}

// BuildForCredential constructs a Provider for testing connectivity (no model needed).
func (r *Registry) BuildForCredential(cred model.AICredential) (Provider, error) {
	// Use a fake minimal ModelDef that captures the adapter type.
	fakeDef := &ModelDef{AdapterType: cred.AdapterType}
	return r.buildProvider(cred, fakeDef)
}

func (r *Registry) buildProvider(cred model.AICredential, def *ModelDef) (Provider, error) {
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

	adapterType := def.AdapterType
	if adapterType == "" {
		adapterType = cred.AdapterType
	}

	switch adapterType {
	case AdapterAnthropic:
		return NewAnthropicAdapter(apiKey, baseURL), nil
	case AdapterKling:
		parts := splitKlingKey(apiKey)
		return NewKlingAdapter(parts[0], parts[1]), nil
	case AdapterVolcen:
		return NewVolcenAdapter(baseURL, apiKey), nil
	case AdapterGemini:
		return NewGeminiAdapter(apiKey, baseURL), nil
	default: // openai_compat — handles text, image (text-to-image), image_edit, and openai-compat video
		return NewOpenAIAdapter(baseURL, apiKey), nil
	}
}

// GetFileUploader returns a FileUploader configured for the credential associated with a model config.
// Returns nil if FilesAPIEnabled is not set on the credential.
// Uses the independent Files API key/URL when configured, falling back to the main credential.
func (r *Registry) GetFileUploader(cfg model.AIModelConfig) FileUploader {
	var cred model.AICredential
	if err := r.db.Where("id = ? AND is_enabled = true", cfg.CredentialID).First(&cred).Error; err != nil {
		return nil
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

// GetAny returns the first text-capable (credential, modelConfig, modelDef) triple.
// Used for internal calls (agent, script analyze) that don't care which model they get.
// When multiple configs share the highest priority, one is chosen in round-robin order.
func (r *Registry) GetAny() (Provider, string, error) {
	type row struct {
		model.AIModelConfig
		AdapterType string
	}
	var rows []row
	r.db.Model(&model.AIModelConfig{}).
		Select("ai_model_configs.*, ai_credentials.adapter_type AS adapter_type").
		Joins("JOIN ai_credentials ON ai_credentials.id = ai_model_configs.credential_id").
		Where("ai_model_configs.is_enabled = true AND ai_credentials.is_enabled = true").
		Order("ai_model_configs.priority DESC, ai_model_configs.id ASC").
		Scan(&rows)

	type candidate struct {
		cfg      model.AIModelConfig
		def      *ModelDef
		priority int
	}
	var candidates []candidate
	for _, r := range rows {
		def := resolveDefFromConfig(r.AIModelConfig, r.AdapterType)
		for _, cap := range def.Capabilities {
			if cap == CapabilityText {
				candidates = append(candidates, candidate{cfg: r.AIModelConfig, def: def, priority: r.Priority})
				break
			}
		}
	}
	if len(candidates) == 0 {
		return nil, "", fmt.Errorf("no text-capable model configured and enabled")
	}

	chosen := pickByPriority("registry.get_any_text", candidates, func(c candidate) int { return c.priority })
	provider, _, err := r.BuildForConfig(chosen.cfg)
	if err != nil {
		return nil, "", err
	}
	modelID := chosen.cfg.ModelIDOverride
	if modelID == "" {
		modelID = chosen.def.ModelID
	}
	return provider, modelID, nil
}

// EncryptCredentials encrypts the credential fields map and returns EncryptedKey and MaskedKey.
func (r *Registry) EncryptCredentials(adapterType string, creds map[string]string) (encKey, masked string, err error) {
	var raw string
	if adapterType == AdapterKling {
		raw = creds["access_key"] + ":" + creds["secret_key"]
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

// DebugCall makes the actual API call for a model config and returns raw HTTP details.
// For text models it sends a minimal generation request; for image it sends a real generation
// (may incur cost); for video it only validates auth via a list request (no billable task created).
func (r *Registry) DebugCall(ctx context.Context, cfg model.AIModelConfig) DebugCallResult {
	var cred model.AICredential
	if err := r.db.First(&cred, cfg.CredentialID).Error; err != nil {
		return DebugCallResult{Error: "credential not found"}
	}

	def := resolveDefFromConfig(cfg, cred.AdapterType)

	apiKey := ""
	if cred.EncryptedKey != "" {
		var err error
		apiKey, err = crypto.Decrypt(cred.EncryptedKey, r.encryptionKey)
		if err != nil {
			return DebugCallResult{Error: "failed to decrypt credentials: " + err.Error()}
		}
	}

	baseURL := cred.BaseURL
	if baseURL == "" {
		if def := GetAdapterDef(cred.AdapterType); def != nil {
			baseURL = def.DefaultBaseURL
		}
	}

	modelID := cfg.ModelIDOverride
	if modelID == "" {
		modelID = def.ModelID
	}

	hasText, hasImage := false, false
	for _, cap := range def.Capabilities {
		if cap == CapabilityText {
			hasText = true
		}
		if cap == CapabilityImage {
			hasImage = true
		}
	}

	switch def.AdapterType {
	case AdapterAnthropic:
		anthropicBase := baseURL
		if anthropicBase == "" {
			anthropicBase = "https://api.anthropic.com"
		}
		endpoint := strings.TrimRight(anthropicBase, "/") + "/v1/messages"
		body := map[string]any{
			"model":      modelID,
			"messages":   []map[string]string{{"role": "user", "content": "Hi"}},
			"max_tokens": 1,
		}
		return debugHTTPPost(ctx, endpoint, body, map[string]string{
			"x-api-key":         apiKey,
			"anthropic-version": "2023-06-01",
		}, modelID)

	case AdapterKling:
		// Use a list request so no billable task is created.
		parts := splitKlingKey(apiKey)
		ka := NewKlingAdapter(parts[0], parts[1])
		token := ka.BuildJWT()
		endpoint := "https://api.klingai.com/v1/videos/text2video?pageNum=1&pageSize=1"
		return debugHTTPGet(ctx, endpoint, map[string]string{
			"Authorization": "Bearer " + token,
		}, modelID)

	case AdapterVolcen:
		// For video, validate auth by listing tasks (no billing).
		endpoint := baseURL + "/contents/generations/tasks?page_size=1"
		return debugHTTPGet(ctx, endpoint, map[string]string{
			"Authorization": "Bearer " + apiKey,
		}, modelID)

	case AdapterGemini:
		// List models as a lightweight connectivity check.
		geminiBase := baseURL
		if geminiBase == "" {
			geminiBase = "https://generativelanguage.googleapis.com"
		}
		endpoint := geminiBase + "/v1beta/models?key=" + apiKey + "&pageSize=1"
		return debugHTTPGet(ctx, endpoint, nil, modelID)

	default: // openai_compat
		if hasImage {
			endpoint := baseURL + "/images/generations"
			body := map[string]any{
				"model":  modelID,
				"prompt": "a simple red circle on white background",
				"size":   "1280x720",
				"n":      1,
			}
			return debugHTTPPost(ctx, endpoint, body, map[string]string{
				"Authorization": "Bearer " + apiKey,
			}, modelID)
		}
		if hasText {
			endpoint := baseURL + "/chat/completions"
			body := map[string]any{
				"model":      modelID,
				"messages":   []map[string]string{{"role": "user", "content": "Hi"}},
				"max_tokens": 1,
			}
			return debugHTTPPost(ctx, endpoint, body, map[string]string{
				"Authorization": "Bearer " + apiKey,
			}, modelID)
		}
		// Fallback for video on openai_compat — list models endpoint as connectivity check.
		endpoint := baseURL + "/models"
		return debugHTTPGet(ctx, endpoint, map[string]string{
			"Authorization": "Bearer " + apiKey,
		}, modelID)
	}
}

func debugHTTPPost(ctx context.Context, endpoint string, body map[string]any, extraHeaders map[string]string, modelID string) DebugCallResult {
	bodyBytes, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(bodyBytes))
	if err != nil {
		return DebugCallResult{ModelID: modelID, Endpoint: endpoint, Method: "POST",
			RequestBody: string(bodyBytes), Error: err.Error()}
	}
	req.Header.Set("Content-Type", "application/json")
	for k, v := range extraHeaders {
		req.Header.Set(k, v)
	}
	// Capture request headers (mask Authorization value).
	reqHeaders := make(map[string]string)
	for k := range req.Header {
		v := req.Header.Get(k)
		if k == "Authorization" {
			v = maskAuthHeader(v)
		}
		reqHeaders[k] = v
	}
	start := time.Now()
	resp, err := http.DefaultClient.Do(req)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		return DebugCallResult{ModelID: modelID, Endpoint: endpoint, Method: "POST",
			RequestHeaders: reqHeaders, RequestBody: string(bodyBytes), LatencyMs: latency, Error: err.Error()}
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	success := resp.StatusCode < 400
	errMsg := ""
	if !success {
		errMsg = fmt.Sprintf("HTTP %d", resp.StatusCode)
	}
	return DebugCallResult{
		Success: success, ModelID: modelID, Endpoint: endpoint, Method: "POST",
		RequestHeaders: reqHeaders, RequestBody: string(bodyBytes),
		ResponseStatus: resp.StatusCode, ResponseBody: string(respBody),
		LatencyMs: latency, Error: errMsg,
	}
}

func debugHTTPGet(ctx context.Context, endpoint string, extraHeaders map[string]string, modelID string) DebugCallResult {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return DebugCallResult{ModelID: modelID, Endpoint: endpoint, Method: "GET", Error: err.Error()}
	}
	for k, v := range extraHeaders {
		req.Header.Set(k, v)
	}
	reqHeaders := make(map[string]string)
	for k := range req.Header {
		v := req.Header.Get(k)
		if k == "Authorization" {
			v = maskAuthHeader(v)
		}
		reqHeaders[k] = v
	}
	start := time.Now()
	resp, err := http.DefaultClient.Do(req)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		return DebugCallResult{ModelID: modelID, Endpoint: endpoint, Method: "GET",
			RequestHeaders: reqHeaders, LatencyMs: latency, Error: err.Error()}
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	success := resp.StatusCode < 400
	errMsg := ""
	if !success {
		errMsg = fmt.Sprintf("HTTP %d", resp.StatusCode)
	}
	return DebugCallResult{
		Success: success, ModelID: modelID, Endpoint: endpoint, Method: "GET",
		RequestHeaders: reqHeaders, RequestBody: "(no body)",
		ResponseStatus: resp.StatusCode, ResponseBody: string(respBody),
		LatencyMs: latency, Error: errMsg,
	}
}

// maskAuthHeader masks the token in an Authorization header value.
func maskAuthHeader(v string) string {
	if len(v) > 12 {
		return v[:7] + "..." + v[len(v)-4:]
	}
	return "***"
}
