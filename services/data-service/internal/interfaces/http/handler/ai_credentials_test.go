package handler

import (
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/infra/ai"
	"github.com/movscript/movscript/internal/infra/config"
	"github.com/movscript/movscript/internal/infra/crypto"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

const testHandlerEncryptionKeyHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

func TestCredentialAdminWritesAuditAndDeleteNotFound(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db := newTestAICredentialRouter(t)

	createReq := httptest.NewRequest(http.MethodPost, "/admin/credentials", strings.NewReader(`{
		"adapter_type":"openai_compat",
		"display_name":"OpenAI",
		"credentials":{"api_key":"sk-test","base_url":"https://api.example.com/v1?token=base-query-secret"},
		"files_api_enabled":true,
		"files_api_key":"files-secret"
	}`))
	createReq.Header.Set("Content-Type", "application/json")
	createRes := httptest.NewRecorder()

	router.ServeHTTP(createRes, createReq)

	if createRes.Code != http.StatusCreated {
		t.Fatalf("expected credential to be created, got %d: %s", createRes.Code, createRes.Body.String())
	}
	if countAuditAction(t, db, "ai_credential.admin_created") != 1 {
		t.Fatalf("expected create audit log")
	}
	assertAuditMetadataDoesNotContain(t, db, "ai_credential.admin_created", "sk-test")
	assertAuditMetadataDoesNotContain(t, db, "ai_credential.admin_created", "files-secret")
	assertAuditMetadataDoesNotContain(t, db, "ai_credential.admin_created", "base-query-secret")

	updateReq := httptest.NewRequest(http.MethodPut, "/admin/credentials/1", strings.NewReader(`{
		"display_name":"OpenAI Updated",
		"is_enabled":false,
		"base_url":"https://api.updated.example.com/v1?token=updated-query-secret",
		"api_key":"sk-updated-secret",
		"files_api_enabled":true,
		"files_api_key":"files-updated-secret"
	}`))
	updateReq.Header.Set("Content-Type", "application/json")
	updateRes := httptest.NewRecorder()

	router.ServeHTTP(updateRes, updateReq)

	if updateRes.Code != http.StatusOK {
		t.Fatalf("expected credential to be updated, got %d: %s", updateRes.Code, updateRes.Body.String())
	}
	if countAuditAction(t, db, "ai_credential.admin_updated") != 1 {
		t.Fatalf("expected update audit log")
	}
	assertAuditMetadataDoesNotContain(t, db, "ai_credential.admin_updated", "sk-updated-secret")
	assertAuditMetadataDoesNotContain(t, db, "ai_credential.admin_updated", "files-updated-secret")
	assertAuditMetadataDoesNotContain(t, db, "ai_credential.admin_updated", "updated-query-secret")

	deleteReq := httptest.NewRequest(http.MethodDelete, "/admin/credentials/1", nil)
	deleteRes := httptest.NewRecorder()

	router.ServeHTTP(deleteRes, deleteReq)

	if deleteRes.Code != http.StatusNoContent {
		t.Fatalf("expected credential to be deleted, got %d: %s", deleteRes.Code, deleteRes.Body.String())
	}
	if countAuditAction(t, db, "ai_credential.admin_deleted") != 1 {
		t.Fatalf("expected delete audit log")
	}

	missingReq := httptest.NewRequest(http.MethodDelete, "/admin/credentials/1", nil)
	missingRes := httptest.NewRecorder()

	router.ServeHTTP(missingRes, missingReq)

	if missingRes.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for missing credential delete, got %d: %s", missingRes.Code, missingRes.Body.String())
	}
}

func TestCredentialExternalAdminActionsWriteAuditWithoutSecrets(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db := newTestAICredentialRouter(t)

	createReq := httptest.NewRequest(http.MethodPost, "/admin/credentials", strings.NewReader(`{
		"adapter_type":"anthropic",
		"display_name":"Anthropic",
		"credentials":{"api_key":"sk-remote-secret"}
	}`))
	createReq.Header.Set("Content-Type", "application/json")
	createRes := httptest.NewRecorder()

	router.ServeHTTP(createRes, createReq)

	if createRes.Code != http.StatusCreated {
		t.Fatalf("expected credential to be created, got %d: %s", createRes.Code, createRes.Body.String())
	}

	remoteReq := httptest.NewRequest(http.MethodGet, "/admin/credentials/1/remote-models", nil)
	remoteRes := httptest.NewRecorder()

	router.ServeHTTP(remoteRes, remoteReq)

	if remoteRes.Code != http.StatusBadRequest {
		t.Fatalf("expected unsupported remote models response, got %d: %s", remoteRes.Code, remoteRes.Body.String())
	}
	if countAuditAction(t, db, "ai_credential.remote_models.admin_listed") != 1 {
		t.Fatalf("expected remote models audit log")
	}
	assertAuditMetadataDoesNotContain(t, db, "ai_credential.remote_models.admin_listed", "sk-remote-secret")

	broken := persistencemodel.AICredential{
		AdapterType:  "openai_compat",
		DisplayName:  "Broken",
		BaseURL:      "https://api.example.com/v1",
		EncryptedKey: "not-cipher",
		MaskedKey:    "***",
		IsEnabled:    true,
	}
	if err := db.Create(&broken).Error; err != nil {
		t.Fatalf("create broken credential: %v", err)
	}

	testReq := httptest.NewRequest(http.MethodPost, "/admin/credentials/2/test", nil)
	testRes := httptest.NewRecorder()

	router.ServeHTTP(testRes, testReq)

	if testRes.Code != http.StatusOK {
		t.Fatalf("expected credential test response, got %d: %s", testRes.Code, testRes.Body.String())
	}
	if countAuditAction(t, db, "ai_credential.admin_tested") != 1 {
		t.Fatalf("expected credential test audit log")
	}
	assertAuditMetadataDoesNotContain(t, db, "ai_credential.admin_tested", "not-cipher")
}

func TestCreateCredentialRequiresProviderKeyOutsideRelayGatewayMode(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, _ := newTestAICredentialRouter(t)

	createReq := httptest.NewRequest(http.MethodPost, "/admin/credentials", strings.NewReader(`{
		"adapter_type":"openai_compat",
		"display_name":"OpenAI",
		"credentials":{}
	}`))
	createReq.Header.Set("Content-Type", "application/json")
	createRes := httptest.NewRecorder()

	router.ServeHTTP(createRes, createReq)

	if createRes.Code != http.StatusBadRequest || !strings.Contains(createRes.Body.String(), "missing required credential: api_key") {
		t.Fatalf("expected missing api_key validation, got %d: %s", createRes.Code, createRes.Body.String())
	}
}

func TestCreateProviderWritesAuditAndDoesNotLeakSecrets(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db := newTestAICredentialRouter(t)

	createReq := httptest.NewRequest(http.MethodPost, "/admin/providers", strings.NewReader(`{
		"provider_kind":"openai_compat_gateway",
		"display_name":"Gateway Provider",
		"base_url_prefix":"https://gateway.example.com/v1?token=base-query-secret",
		"credentials":{"api_key":"sk-provider-secret"},
		"files_api_enabled":true,
		"files_api_key":"files-secret"
	}`))
	createReq.Header.Set("Content-Type", "application/json")
	createRes := httptest.NewRecorder()

	router.ServeHTTP(createRes, createReq)

	if createRes.Code != http.StatusCreated {
		t.Fatalf("expected provider to be created, got %d: %s", createRes.Code, createRes.Body.String())
	}
	body := createRes.Body.String()
	if !strings.Contains(body, `"provider_kind":"openai_compat_gateway"`) {
		t.Fatalf("unexpected provider response: %s", body)
	}
	if strings.Contains(body, "sk-provider-secret") || strings.Contains(body, "files-secret") {
		t.Fatalf("provider response leaked secret values: %s", body)
	}
	if countAuditAction(t, db, "ai_provider.admin_created") != 1 {
		t.Fatalf("expected provider create audit log")
	}
	assertAuditMetadataDoesNotContain(t, db, "ai_provider.admin_created", "sk-provider-secret")
	assertAuditMetadataDoesNotContain(t, db, "ai_provider.admin_created", "files-secret")
	assertAuditMetadataDoesNotContain(t, db, "ai_provider.admin_created", "base-query-secret")
}

func TestCreateProviderRejectsMissingRequiredProviderCredential(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, _ := newTestAICredentialRouter(t)

	createReq := httptest.NewRequest(http.MethodPost, "/admin/providers", strings.NewReader(`{
		"provider_kind":"volcengine_ark_official",
		"display_name":"Ark",
		"credentials":{}
	}`))
	createReq.Header.Set("Content-Type", "application/json")
	createRes := httptest.NewRecorder()

	router.ServeHTTP(createRes, createReq)

	if createRes.Code != http.StatusBadRequest || !strings.Contains(createRes.Body.String(), "missing required credential") {
		t.Fatalf("expected missing credential validation, got %d: %s", createRes.Code, createRes.Body.String())
	}
}

func TestProviderCredentialRotationEndpoints(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, _ := newTestAICredentialRouter(t)

	createProviderReq := httptest.NewRequest(http.MethodPost, "/admin/providers", strings.NewReader(`{
		"provider_kind":"openai_compat_gateway",
		"display_name":"Gateway Provider",
		"credentials":{"api_key":"sk-primary"}
	}`))
	createProviderReq.Header.Set("Content-Type", "application/json")
	createProviderRes := httptest.NewRecorder()
	router.ServeHTTP(createProviderRes, createProviderReq)
	if createProviderRes.Code != http.StatusCreated {
		t.Fatalf("create provider status = %d: %s", createProviderRes.Code, createProviderRes.Body.String())
	}
	var provider persistencemodel.AIProvider
	if err := json.Unmarshal(createProviderRes.Body.Bytes(), &provider); err != nil {
		t.Fatalf("decode provider: %v", err)
	}

	addKeyReq := httptest.NewRequest(http.MethodPost, "/admin/providers/"+provider.ProviderID+"/credentials", strings.NewReader(`{
		"credential_key":"backup",
		"credentials":{"api_key":"sk-backup-secret"}
	}`))
	addKeyReq.Header.Set("Content-Type", "application/json")
	addKeyRes := httptest.NewRecorder()
	router.ServeHTTP(addKeyRes, addKeyReq)
	if addKeyRes.Code != http.StatusCreated || strings.Contains(addKeyRes.Body.String(), "sk-backup-secret") {
		t.Fatalf("add key status/body = %d %s, want created without secret leak", addKeyRes.Code, addKeyRes.Body.String())
	}

	setPrimaryReq := httptest.NewRequest(http.MethodPost, "/admin/providers/"+provider.ProviderID+"/credentials/backup/primary", nil)
	setPrimaryRes := httptest.NewRecorder()
	router.ServeHTTP(setPrimaryRes, setPrimaryReq)
	if setPrimaryRes.Code != http.StatusOK || !strings.Contains(setPrimaryRes.Body.String(), `"credential_key":"backup"`) || !strings.Contains(setPrimaryRes.Body.String(), `"is_primary":true`) {
		t.Fatalf("set primary status/body = %d %s", setPrimaryRes.Code, setPrimaryRes.Body.String())
	}

	disableReq := httptest.NewRequest(http.MethodPatch, "/admin/providers/"+provider.ProviderID+"/credentials/backup", strings.NewReader(`{"status":"disabled"}`))
	disableReq.Header.Set("Content-Type", "application/json")
	disableRes := httptest.NewRecorder()
	router.ServeHTTP(disableRes, disableReq)
	if disableRes.Code != http.StatusOK || !strings.Contains(disableRes.Body.String(), `"status":"disabled"`) {
		t.Fatalf("disable key status/body = %d %s", disableRes.Code, disableRes.Body.String())
	}
}

func TestProviderInstancesExposeAIGatewayCredentialsWithoutSecrets(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db := newTestAICredentialRouter(t)
	cred := persistencemodel.AICredential{
		AdapterType:          "openai_compat",
		DisplayName:          "OpenAI",
		BaseURL:              "https://api.example.com/v1",
		EncryptedKey:         "encrypted-main-key",
		FilesAPIEnabled:      true,
		FilesAPIEncryptedKey: "encrypted-files-key",
		IsEnabled:            true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}

	listReq := httptest.NewRequest(http.MethodGet, "/admin/provider-instances", nil)
	listRes := httptest.NewRecorder()
	router.ServeHTTP(listRes, listReq)

	if listRes.Code != http.StatusOK {
		t.Fatalf("expected provider instances response, got %d: %s", listRes.Code, listRes.Body.String())
	}
	if body := listRes.Body.String(); strings.Contains(body, "encrypted-main-key") || strings.Contains(body, "encrypted-files-key") {
		t.Fatalf("provider instances leaked secret values: %s", body)
	}
	var body struct {
		Items []struct {
			ID      string `json:"id"`
			Type    string `json:"type"`
			Adapter string `json:"adapter"`
			Ref     struct {
				Kind string `json:"kind"`
				ID   uint   `json:"id"`
			} `json:"ref"`
			SecretFields []struct {
				Key        string `json:"key"`
				Configured bool   `json:"configured"`
			} `json:"secret_fields"`
			Capabilities []string `json:"capabilities"`
		} `json:"items"`
	}
	if err := json.Unmarshal(listRes.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode provider instances: %v", err)
	}
	if len(body.Items) != 1 {
		t.Fatalf("provider instance count = %d, want 1: %+v", len(body.Items), body.Items)
	}
	item := body.Items[0]
	if item.ID != "ai_gateway:credential:1" || item.Type != "ai_gateway" || item.Adapter != "openai_compat" || item.Ref.Kind != "ai_credential" || item.Ref.ID != 1 {
		t.Fatalf("provider instance = %+v, want ai gateway credential mapping", item)
	}
	seenAPIKey := false
	seenFilesKey := false
	for _, field := range item.SecretFields {
		if field.Key == "api_key" && field.Configured {
			seenAPIKey = true
		}
		if field.Key == "files_api_key" && field.Configured {
			seenFilesKey = true
		}
	}
	if !seenAPIKey || !seenFilesKey {
		t.Fatalf("provider instance secret status = %+v, want api_key and files_api_key configured", item.SecretFields)
	}
	for _, capability := range []string{"image.generation", "video.task", "video.poll", "video.cancel", "audio.generation"} {
		if !hasCapability(item.Capabilities, capability) {
			t.Fatalf("provider instance capabilities = %#v, want %s", item.Capabilities, capability)
		}
	}
}

func TestProviderInstancesIncludeStartupAndAIGatewayInstances(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cfg := &config.Config{
		DependencyProfile:       "local",
		DBDriver:                "sqlite",
		DBPath:                  t.TempDir() + "/movscript.db",
		StorageBackend:          "filesystem",
		FilesystemStorageRoot:   t.TempDir(),
		WorkspaceStorageBackend: "http",
		GitHTTPRoot:             t.TempDir(),
		GitBinary:               "git",
		AIGatewayProvider:       "local",
		CacheBackend:            "memory",
		MediaProcessingProvider: "desktop-managed",
		AgentRuntimeProvider:    "desktop-managed",
	}
	router, db := newTestAICredentialRouterWithConfig(t, cfg)
	cred := persistencemodel.AICredential{
		AdapterType:  "local",
		DisplayName:  "Local AI",
		EncryptedKey: "encrypted-local-key",
		IsEnabled:    true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/admin/provider-instances", nil)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected provider instances response, got %d: %s", res.Code, res.Body.String())
	}
	var body struct {
		Items []struct {
			ID   string `json:"id"`
			Type string `json:"type"`
		} `json:"items"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode provider instances: %v", err)
	}
	seen := map[string]bool{}
	for _, item := range body.Items {
		seen[item.ID] = true
	}
	for _, id := range []string{"database:sqlite", "blob_storage:filesystem", "workspace_repository:http", "cache:memory", "media_processing:desktop-managed", "agent_runtime:desktop-managed", "ai_gateway:credential:1"} {
		if !seen[id] {
			t.Fatalf("provider instances missing %q in %+v", id, body.Items)
		}
	}
}

func hasCapability(capabilities []string, capability string) bool {
	for _, item := range capabilities {
		if item == capability {
			return true
		}
	}
	return false
}

func TestProviderInstanceTestReusesCredentialPing(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db := newTestAICredentialRouter(t)

	createReq := httptest.NewRequest(http.MethodPost, "/admin/credentials", strings.NewReader(`{
		"adapter_type":"local",
		"display_name":"Local",
		"credentials":{}
	}`))
	createReq.Header.Set("Content-Type", "application/json")
	createRes := httptest.NewRecorder()
	router.ServeHTTP(createRes, createReq)
	if createRes.Code != http.StatusCreated {
		t.Fatalf("expected local credential to be created, got %d: %s", createRes.Code, createRes.Body.String())
	}

	testReq := httptest.NewRequest(http.MethodPost, "/admin/provider-instances/ai_gateway:credential:1/test", nil)
	testRes := httptest.NewRecorder()
	router.ServeHTTP(testRes, testReq)

	if testRes.Code != http.StatusOK {
		t.Fatalf("expected provider instance test response, got %d: %s", testRes.Code, testRes.Body.String())
	}
	if countAuditAction(t, db, "provider_instance.admin_tested") != 1 {
		t.Fatalf("expected provider instance test audit log")
	}
}

func TestProviderInstancesExposeExternalResourceSourcesAndProbeHealth(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db := newTestAICredentialRouter(t)
	key, err := hex.DecodeString(testHandlerEncryptionKeyHex)
	if err != nil {
		t.Fatalf("decode test encryption key: %v", err)
	}
	configJSON, err := crypto.Encrypt(`{"api_key":"pexels-secret"}`, key)
	if err != nil {
		t.Fatalf("encrypt external resource config: %v", err)
	}
	source := persistencemodel.ExternalResourceSource{
		OwnerID:     1,
		Name:        "Editorial Pexels",
		ProviderKey: "pexels",
		ConfigJSON:  configJSON,
		IsEnabled:   true,
	}
	if err := db.Create(&source).Error; err != nil {
		t.Fatalf("create external resource source: %v", err)
	}

	listReq := httptest.NewRequest(http.MethodGet, "/admin/provider-instances", nil)
	listRes := httptest.NewRecorder()
	router.ServeHTTP(listRes, listReq)
	if listRes.Code != http.StatusOK {
		t.Fatalf("expected provider instances response, got %d: %s", listRes.Code, listRes.Body.String())
	}
	if strings.Contains(listRes.Body.String(), "pexels-secret") {
		t.Fatalf("provider instances response leaked external resource secret: %s", listRes.Body.String())
	}
	var listBody struct {
		Items []struct {
			ID          string `json:"id"`
			Type        string `json:"type"`
			Adapter     string `json:"adapter"`
			DisplayName string `json:"display_name"`
			Configured  bool   `json:"configured"`
			Enabled     bool   `json:"enabled"`
			Ref         struct {
				Kind string `json:"kind"`
				ID   uint   `json:"id"`
			} `json:"ref"`
			SecretFields []struct {
				Key        string `json:"key"`
				Configured bool   `json:"configured"`
			} `json:"secret_fields"`
			Capabilities []string `json:"capabilities"`
		} `json:"items"`
	}
	if err := json.Unmarshal(listRes.Body.Bytes(), &listBody); err != nil {
		t.Fatalf("decode provider instances: %v", err)
	}
	instanceID := "external_resource:source:" + strconv.FormatUint(uint64(source.ID), 10)
	var externalInstance *struct {
		ID          string `json:"id"`
		Type        string `json:"type"`
		Adapter     string `json:"adapter"`
		DisplayName string `json:"display_name"`
		Configured  bool   `json:"configured"`
		Enabled     bool   `json:"enabled"`
		Ref         struct {
			Kind string `json:"kind"`
			ID   uint   `json:"id"`
		} `json:"ref"`
		SecretFields []struct {
			Key        string `json:"key"`
			Configured bool   `json:"configured"`
		} `json:"secret_fields"`
		Capabilities []string `json:"capabilities"`
	}
	for i := range listBody.Items {
		if listBody.Items[i].ID == instanceID {
			externalInstance = &listBody.Items[i]
			break
		}
	}
	if externalInstance == nil {
		t.Fatalf("provider instances missing external resource source %q in %+v", instanceID, listBody.Items)
	}
	if externalInstance.Type != "external_resource" || externalInstance.Adapter != "pexels" || externalInstance.DisplayName != "Editorial Pexels" || !externalInstance.Configured || !externalInstance.Enabled {
		t.Fatalf("external resource provider instance = %+v", externalInstance)
	}
	if externalInstance.Ref.Kind != "external_resource_source" || externalInstance.Ref.ID != source.ID {
		t.Fatalf("external resource provider ref = %+v, want source %d", externalInstance.Ref, source.ID)
	}
	if len(externalInstance.SecretFields) != 1 || externalInstance.SecretFields[0].Key != "api_key" || !externalInstance.SecretFields[0].Configured {
		t.Fatalf("external resource secret fields = %+v, want configured api_key", externalInstance.SecretFields)
	}

	var sawPexelsProbe bool
	originalTransport := http.DefaultTransport
	http.DefaultTransport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host != "api.pexels.com" || r.URL.Path != "/v1/search" {
			t.Fatalf("unexpected external resource probe URL %s", r.URL.String())
		}
		sawPexelsProbe = true
		if r.Header.Get("Authorization") != "pexels-secret" {
			t.Fatalf("pexels authorization = %q, want configured API key", r.Header.Get("Authorization"))
		}
		if r.URL.Query().Get("query") != "movscript" || r.URL.Query().Get("per_page") != "1" {
			t.Fatalf("unexpected pexels health query %s", r.URL.RawQuery)
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(`{"page":1,"per_page":1,"total_results":0,"photos":[]}`)),
		}, nil
	})
	t.Cleanup(func() {
		http.DefaultTransport = originalTransport
	})

	testReq := httptest.NewRequest(http.MethodPost, "/admin/provider-instances/"+instanceID+"/test", nil)
	testRes := httptest.NewRecorder()
	router.ServeHTTP(testRes, testReq)
	if testRes.Code != http.StatusOK {
		t.Fatalf("expected external resource provider test response, got %d: %s", testRes.Code, testRes.Body.String())
	}
	if !sawPexelsProbe {
		t.Fatal("expected Pexels health probe")
	}
	if strings.Contains(testRes.Body.String(), "pexels-secret") {
		t.Fatalf("provider test response leaked external resource secret: %s", testRes.Body.String())
	}
	var testBody struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(testRes.Body.Bytes(), &testBody); err != nil {
		t.Fatalf("decode provider test response: %v", err)
	}
	if !testBody.Success || !strings.Contains(testBody.Message, "succeeded") {
		t.Fatalf("external resource test result = %+v, want success", testBody)
	}
	if countAuditAction(t, db, "provider_instance.admin_tested") != 1 {
		t.Fatalf("expected provider instance test audit log")
	}
	assertAuditMetadataDoesNotContain(t, db, "provider_instance.admin_tested", "pexels-secret")
}

func TestProviderInstanceConfigDraftStoresSecretsWithoutLeaking(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cfg := &config.Config{
		DependencyProfile:       "external",
		DBDriver:                "postgres",
		DBHost:                  "db",
		DBPort:                  "5432",
		DBUser:                  "movscript",
		DBName:                  "movscript",
		StorageBackend:          "minio",
		MinIOEndpoint:           "minio:9000",
		MinIOBucket:             "movscript",
		WorkspaceStorageBackend: "gitea",
		GiteaBaseURL:            "https://git.example.com",
		GiteaToken:              "configured-at-startup",
		AIGatewayProvider:       "local",
		CacheBackend:            "redis",
		RedisAddr:               "redis:6379",
	}
	router, db := newTestAICredentialRouterWithConfig(t, cfg)

	updateReq := httptest.NewRequest(http.MethodPut, "/admin/provider-instances/blob_storage:minio/config", strings.NewReader(`{
		"config":{"minio_endpoint":"https://minio.example.com","minio_bucket":"media"},
		"secrets":{"minio_access_key":"access-secret","minio_secret_key":"secret-secret"}
	}`))
	updateReq.Header.Set("Content-Type", "application/json")
	updateRes := httptest.NewRecorder()
	router.ServeHTTP(updateRes, updateReq)

	if updateRes.Code != http.StatusOK {
		t.Fatalf("expected provider config draft update, got %d: %s", updateRes.Code, updateRes.Body.String())
	}
	if body := updateRes.Body.String(); strings.Contains(body, "access-secret") || strings.Contains(body, "secret-secret") {
		t.Fatalf("provider config draft response leaked secrets: %s", body)
	}
	if countAuditAction(t, db, "provider_instance.config_draft.admin_updated") != 1 {
		t.Fatalf("expected provider config draft audit log")
	}
	assertAuditMetadataDoesNotContain(t, db, "provider_instance.config_draft.admin_updated", "access-secret")
	assertAuditMetadataDoesNotContain(t, db, "provider_instance.config_draft.admin_updated", "secret-secret")

	getReq := httptest.NewRequest(http.MethodGet, "/admin/provider-instances/blob_storage:minio/config", nil)
	getRes := httptest.NewRecorder()
	router.ServeHTTP(getRes, getReq)

	if getRes.Code != http.StatusOK {
		t.Fatalf("expected provider config draft get, got %d: %s", getRes.Code, getRes.Body.String())
	}
	var draft struct {
		ProviderInstanceID string            `json:"provider_instance_id"`
		Config             map[string]string `json:"config"`
		SecretFields       []struct {
			Key        string `json:"key"`
			Configured bool   `json:"configured"`
		} `json:"secret_fields"`
		RequiresRestart bool `json:"requires_restart"`
	}
	if err := json.Unmarshal(getRes.Body.Bytes(), &draft); err != nil {
		t.Fatalf("decode provider config draft: %v", err)
	}
	if draft.ProviderInstanceID != "blob_storage:minio" || !draft.RequiresRestart {
		t.Fatalf("unexpected provider config draft identity/status: %+v", draft)
	}
	if draft.Config["minio_endpoint"] != "https://minio.example.com" || draft.Config["minio_bucket"] != "media" {
		t.Fatalf("unexpected provider config draft config: %+v", draft.Config)
	}
	secretConfigured := map[string]bool{}
	for _, field := range draft.SecretFields {
		secretConfigured[field.Key] = field.Configured
	}
	if !secretConfigured["minio_access_key"] || !secretConfigured["minio_secret_key"] {
		t.Fatalf("provider config draft secret status = %+v, want minio secrets configured", draft.SecretFields)
	}
	if body := getRes.Body.String(); strings.Contains(body, "access-secret") || strings.Contains(body, "secret-secret") {
		t.Fatalf("provider config draft get leaked secrets: %s", body)
	}
}

func TestProviderInstanceConfigDraftRejectsUnsupportedFields(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cfg := &config.Config{
		DependencyProfile: "external",
		DBDriver:          "postgres",
		DBHost:            "db",
		DBPort:            "5432",
		DBUser:            "movscript",
		DBName:            "movscript",
		StorageBackend:    "minio",
		MinIOEndpoint:     "minio:9000",
		MinIOBucket:       "movscript",
	}
	router, _ := newTestAICredentialRouterWithConfig(t, cfg)

	req := httptest.NewRequest(http.MethodPut, "/admin/provider-instances/blob_storage:minio/config", strings.NewReader(`{
		"config":{"unexpected":"value"}
	}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("expected unsupported config field to be rejected, got %d: %s", res.Code, res.Body.String())
	}
}

func TestProviderInstanceConfigDraftApplyWritesEnvOverlayWithoutLeaking(t *testing.T) {
	gin.SetMode(gin.TestMode)
	envPath := filepath.Join(t.TempDir(), "provider-startup.env")
	cfg := &config.Config{
		DependencyProfile:       "external",
		StorageBackend:          "minio",
		MinIOEndpoint:           "minio:9000",
		MinIOBucket:             "movscript",
		WorkspaceStorageBackend: "gitea",
		ProviderEnvPath:         envPath,
	}
	router, db := newTestAICredentialRouterWithConfig(t, cfg)

	updateReq := httptest.NewRequest(http.MethodPut, "/admin/provider-instances/blob_storage:minio/config", strings.NewReader(`{
		"config":{"minio_endpoint":"https://minio.example.com","minio_bucket":"media","minio_use_ssl":"true"},
		"secrets":{"minio_access_key":"access-secret","minio_secret_key":"secret-secret"}
	}`))
	updateReq.Header.Set("Content-Type", "application/json")
	updateRes := httptest.NewRecorder()
	router.ServeHTTP(updateRes, updateReq)
	if updateRes.Code != http.StatusOK {
		t.Fatalf("expected provider config draft update, got %d: %s", updateRes.Code, updateRes.Body.String())
	}

	applyReq := httptest.NewRequest(http.MethodPost, "/admin/provider-instances/blob_storage:minio/config/apply", nil)
	applyRes := httptest.NewRecorder()
	router.ServeHTTP(applyRes, applyReq)
	if applyRes.Code != http.StatusOK {
		t.Fatalf("expected provider config draft apply, got %d: %s", applyRes.Code, applyRes.Body.String())
	}
	if body := applyRes.Body.String(); strings.Contains(body, "access-secret") || strings.Contains(body, "secret-secret") {
		t.Fatalf("provider config apply response leaked secrets: %s", body)
	}
	var applyBody struct {
		ActivationMode string `json:"activation_mode"`
		ActivationPlan struct {
			Mode            string   `json:"mode"`
			Action          string   `json:"action"`
			Host            string   `json:"host"`
			EnvPath         string   `json:"env_path"`
			RequiresRestart bool     `json:"requires_restart"`
			CanAutoApply    bool     `json:"can_auto_apply"`
			EnvKeys         []string `json:"env_keys"`
			SecretKeys      []string `json:"secret_keys"`
		} `json:"activation_plan"`
	}
	if err := json.Unmarshal(applyRes.Body.Bytes(), &applyBody); err != nil {
		t.Fatalf("decode apply response: %v", err)
	}
	if applyBody.ActivationMode != "deployment_rollout" {
		t.Fatalf("activation_mode = %q, want deployment_rollout", applyBody.ActivationMode)
	}
	if applyBody.ActivationPlan.Mode != "deployment_rollout" ||
		applyBody.ActivationPlan.Action != "rollout_backend_deployment" ||
		applyBody.ActivationPlan.Host != "deployment_platform" ||
		applyBody.ActivationPlan.EnvPath != envPath ||
		!applyBody.ActivationPlan.RequiresRestart ||
		applyBody.ActivationPlan.CanAutoApply {
		t.Fatalf("activation_plan = %+v, want deployment rollout plan", applyBody.ActivationPlan)
	}
	if len(applyBody.ActivationPlan.SecretKeys) != 2 {
		t.Fatalf("activation_plan secret keys = %+v, want secret key names only", applyBody.ActivationPlan.SecretKeys)
	}
	envBytes, err := os.ReadFile(envPath)
	if err != nil {
		t.Fatalf("read provider env overlay: %v", err)
	}
	envBody := string(envBytes)
	for _, want := range []string{
		`STORAGE_BACKEND="minio"`,
		`MINIO_ENDPOINT="https://minio.example.com"`,
		`MINIO_BUCKET="media"`,
		`MINIO_USE_SSL="true"`,
		`MINIO_ACCESS_KEY="access-secret"`,
		`MINIO_SECRET_KEY="secret-secret"`,
	} {
		if !strings.Contains(envBody, want) {
			t.Fatalf("provider env overlay missing %q in:\n%s", want, envBody)
		}
	}
	if countAuditAction(t, db, "provider_instance.config_draft.admin_applied") != 1 {
		t.Fatalf("expected provider config apply audit log")
	}
	assertAuditMetadataDoesNotContain(t, db, "provider_instance.config_draft.admin_applied", "access-secret")
	assertAuditMetadataDoesNotContain(t, db, "provider_instance.config_draft.admin_applied", "secret-secret")
}

func TestProviderInstanceConfigDraftApplyWritesGitHubEnterpriseEnvOverlay(t *testing.T) {
	gin.SetMode(gin.TestMode)
	envPath := filepath.Join(t.TempDir(), "provider-startup.env")
	cfg := &config.Config{
		DependencyProfile:          "external",
		WorkspaceStorageBackend:    "github-enterprise",
		GitHubEnterpriseBaseURL:    "https://old-github.example.com",
		GitHubEnterpriseToken:      "old-token",
		GitHubEnterpriseRepoPrefix: "old-project-",
		GitHubEnterpriseOrgPrefix:  "old-org-",
		GitHubEnterpriseBranch:     "main",
		ProviderEnvPath:            envPath,
	}
	router, _ := newTestAICredentialRouterWithConfig(t, cfg)

	updateReq := httptest.NewRequest(http.MethodPut, "/admin/provider-instances/workspace_repository:github-enterprise/config", strings.NewReader(`{
		"config":{"github_enterprise_base_url":"https://github.example.com","github_enterprise_repo_prefix":"movscript-project-","github_enterprise_org_prefix":"movscript-org-","github_enterprise_branch":"main","workspace_clone_url_strategy":"direct"},
		"secrets":{"github_enterprise_token":"github-secret"}
	}`))
	updateReq.Header.Set("Content-Type", "application/json")
	updateRes := httptest.NewRecorder()
	router.ServeHTTP(updateRes, updateReq)
	if updateRes.Code != http.StatusOK {
		t.Fatalf("expected GitHub Enterprise provider config draft update, got %d: %s", updateRes.Code, updateRes.Body.String())
	}

	applyReq := httptest.NewRequest(http.MethodPost, "/admin/provider-instances/workspace_repository:github-enterprise/config/apply", nil)
	applyRes := httptest.NewRecorder()
	router.ServeHTTP(applyRes, applyReq)
	if applyRes.Code != http.StatusOK {
		t.Fatalf("expected GitHub Enterprise provider config draft apply, got %d: %s", applyRes.Code, applyRes.Body.String())
	}
	if body := applyRes.Body.String(); strings.Contains(body, "github-secret") {
		t.Fatalf("provider config apply response leaked secret: %s", body)
	}

	envBytes, err := os.ReadFile(envPath)
	if err != nil {
		t.Fatalf("read provider env overlay: %v", err)
	}
	envBody := string(envBytes)
	for _, want := range []string{
		`MOVSCRIPT_WORKSPACE_STORAGE_BACKEND="github-enterprise"`,
		`MOVSCRIPT_WORKSPACE_BACKEND="github-enterprise"`,
		`MOVSCRIPT_GITHUB_ENTERPRISE_BASE_URL="https://github.example.com"`,
		`MOVSCRIPT_GITHUB_ENTERPRISE_REPO_PREFIX="movscript-project-"`,
		`MOVSCRIPT_GITHUB_ENTERPRISE_ORG_PREFIX="movscript-org-"`,
		`MOVSCRIPT_GITHUB_ENTERPRISE_BRANCH="main"`,
		`MOVSCRIPT_WORKSPACE_CLONE_URL_STRATEGY="direct"`,
		`MOVSCRIPT_GITHUB_ENTERPRISE_TOKEN="github-secret"`,
	} {
		if !strings.Contains(envBody, want) {
			t.Fatalf("provider env overlay missing %q in:\n%s", want, envBody)
		}
	}
}

func TestProviderInstanceConfigDraftApplyWritesGitLabEnvOverlay(t *testing.T) {
	gin.SetMode(gin.TestMode)
	envPath := filepath.Join(t.TempDir(), "provider-startup.env")
	cfg := &config.Config{
		DependencyProfile:       "external",
		WorkspaceStorageBackend: "gitlab",
		GitLabBaseURL:           "https://old-gitlab.example.com",
		GitLabToken:             "old-token",
		GitLabRepoPrefix:        "old-project-",
		GitLabOrgPrefix:         "old-org-",
		GitLabBranch:            "main",
		ProviderEnvPath:         envPath,
	}
	router, _ := newTestAICredentialRouterWithConfig(t, cfg)

	updateReq := httptest.NewRequest(http.MethodPut, "/admin/provider-instances/workspace_repository:gitlab/config", strings.NewReader(`{
		"config":{"gitlab_base_url":"https://gitlab.example.com","gitlab_repo_prefix":"movscript-project-","gitlab_org_prefix":"movscript-org-","gitlab_branch":"main","workspace_clone_url_strategy":"direct"},
		"secrets":{"gitlab_token":"gitlab-secret"}
	}`))
	updateReq.Header.Set("Content-Type", "application/json")
	updateRes := httptest.NewRecorder()
	router.ServeHTTP(updateRes, updateReq)
	if updateRes.Code != http.StatusOK {
		t.Fatalf("expected GitLab provider config draft update, got %d: %s", updateRes.Code, updateRes.Body.String())
	}

	applyReq := httptest.NewRequest(http.MethodPost, "/admin/provider-instances/workspace_repository:gitlab/config/apply", nil)
	applyRes := httptest.NewRecorder()
	router.ServeHTTP(applyRes, applyReq)
	if applyRes.Code != http.StatusOK {
		t.Fatalf("expected GitLab provider config draft apply, got %d: %s", applyRes.Code, applyRes.Body.String())
	}
	if body := applyRes.Body.String(); strings.Contains(body, "gitlab-secret") {
		t.Fatalf("provider config apply response leaked secret: %s", body)
	}

	envBytes, err := os.ReadFile(envPath)
	if err != nil {
		t.Fatalf("read provider env overlay: %v", err)
	}
	envBody := string(envBytes)
	for _, want := range []string{
		`MOVSCRIPT_WORKSPACE_STORAGE_BACKEND="gitlab"`,
		`MOVSCRIPT_WORKSPACE_BACKEND="gitlab"`,
		`MOVSCRIPT_GITLAB_BASE_URL="https://gitlab.example.com"`,
		`MOVSCRIPT_GITLAB_REPO_PREFIX="movscript-project-"`,
		`MOVSCRIPT_GITLAB_ORG_PREFIX="movscript-org-"`,
		`MOVSCRIPT_GITLAB_BRANCH="main"`,
		`MOVSCRIPT_WORKSPACE_CLONE_URL_STRATEGY="direct"`,
		`MOVSCRIPT_GITLAB_TOKEN="gitlab-secret"`,
	} {
		if !strings.Contains(envBody, want) {
			t.Fatalf("provider env overlay missing %q in:\n%s", want, envBody)
		}
	}
}

func TestProviderInstanceConfigDraftApplyWritesQdrantEnvOverlay(t *testing.T) {
	gin.SetMode(gin.TestMode)
	envPath := filepath.Join(t.TempDir(), "provider-startup.env")
	cfg := &config.Config{
		DependencyProfile:   "custom",
		VectorIndexProvider: "qdrant",
		QdrantBaseURL:       "http://old-qdrant.local",
		QdrantCollection:    "old_vectors",
		ProviderEnvPath:     envPath,
	}
	router, _ := newTestAICredentialRouterWithConfig(t, cfg)

	updateReq := httptest.NewRequest(http.MethodPut, "/admin/provider-instances/vector_index:qdrant/config", strings.NewReader(`{
		"config":{"qdrant_base_url":"http://qdrant.local","qdrant_collection":"shot_vectors"},
		"secrets":{"qdrant_token":"qdrant-secret"}
	}`))
	updateReq.Header.Set("Content-Type", "application/json")
	updateRes := httptest.NewRecorder()
	router.ServeHTTP(updateRes, updateReq)
	if updateRes.Code != http.StatusOK {
		t.Fatalf("expected Qdrant provider config draft update, got %d: %s", updateRes.Code, updateRes.Body.String())
	}

	applyReq := httptest.NewRequest(http.MethodPost, "/admin/provider-instances/vector_index:qdrant/config/apply", nil)
	applyRes := httptest.NewRecorder()
	router.ServeHTTP(applyRes, applyReq)
	if applyRes.Code != http.StatusOK {
		t.Fatalf("expected Qdrant provider config draft apply, got %d: %s", applyRes.Code, applyRes.Body.String())
	}
	if body := applyRes.Body.String(); strings.Contains(body, "qdrant-secret") {
		t.Fatalf("provider config apply response leaked secret: %s", body)
	}

	envBytes, err := os.ReadFile(envPath)
	if err != nil {
		t.Fatalf("read provider env overlay: %v", err)
	}
	envBody := string(envBytes)
	for _, want := range []string{
		`MOVSCRIPT_VECTOR_INDEX_PROVIDER="qdrant"`,
		`MOVSCRIPT_QDRANT_BASE_URL="http://qdrant.local"`,
		`MOVSCRIPT_QDRANT_COLLECTION="shot_vectors"`,
		`MOVSCRIPT_QDRANT_TOKEN="qdrant-secret"`,
	} {
		if !strings.Contains(envBody, want) {
			t.Fatalf("provider env overlay missing %q in:\n%s", want, envBody)
		}
	}
}

func TestProviderInstanceConfigActivateTriggersDeploymentRolloutWebhook(t *testing.T) {
	gin.SetMode(gin.TestMode)
	envPath := filepath.Join(t.TempDir(), "provider-startup.env")
	var webhookPayload map[string]any
	var authHeader string
	previousHTTPClient := providerActivationHTTPClient
	providerActivationHTTPClient = &http.Client{Transport: activationRoundTripFunc(func(r *http.Request) (*http.Response, error) {
		authHeader = r.Header.Get("Authorization")
		if r.Method != http.MethodPost {
			t.Fatalf("webhook method = %s, want POST", r.Method)
		}
		if r.URL.String() != "https://deploy.example.test/rollout" {
			t.Fatalf("webhook URL = %s", r.URL.String())
		}
		if err := json.NewDecoder(r.Body).Decode(&webhookPayload); err != nil {
			t.Fatalf("decode webhook payload: %v", err)
		}
		return &http.Response{
			StatusCode: http.StatusAccepted,
			Status:     "202 Accepted",
			Body:       io.NopCloser(strings.NewReader(`{"status":"queued"}`)),
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Request:    r,
		}, nil
	})}
	t.Cleanup(func() {
		providerActivationHTTPClient = previousHTTPClient
	})

	cfg := &config.Config{
		DependencyProfile:                     "external",
		StorageBackend:                        "minio",
		MinIOEndpoint:                         "minio:9000",
		MinIOBucket:                           "movscript",
		WorkspaceStorageBackend:               "gitea",
		ProviderEnvPath:                       envPath,
		ProviderActivationRolloutWebhookURL:   "https://deploy.example.test/rollout",
		ProviderActivationRolloutWebhookToken: "rollout-token",
	}
	router, db := newTestAICredentialRouterWithConfig(t, cfg)

	updateReq := httptest.NewRequest(http.MethodPut, "/admin/provider-instances/blob_storage:minio/config", strings.NewReader(`{
		"config":{"minio_endpoint":"https://minio.example.com","minio_bucket":"media"},
		"secrets":{"minio_access_key":"access-secret"}
	}`))
	updateReq.Header.Set("Content-Type", "application/json")
	updateRes := httptest.NewRecorder()
	router.ServeHTTP(updateRes, updateReq)
	if updateRes.Code != http.StatusOK {
		t.Fatalf("expected provider config draft update, got %d: %s", updateRes.Code, updateRes.Body.String())
	}

	applyReq := httptest.NewRequest(http.MethodPost, "/admin/provider-instances/blob_storage:minio/config/apply", nil)
	applyRes := httptest.NewRecorder()
	router.ServeHTTP(applyRes, applyReq)
	if applyRes.Code != http.StatusOK {
		t.Fatalf("expected provider config draft apply, got %d: %s", applyRes.Code, applyRes.Body.String())
	}
	var applyBody struct {
		ActivationPlan struct {
			CanAutoApply      bool   `json:"can_auto_apply"`
			AutoApplyChannel  string `json:"auto_apply_channel"`
			AutoApplyEndpoint string `json:"auto_apply_endpoint"`
		} `json:"activation_plan"`
	}
	if err := json.Unmarshal(applyRes.Body.Bytes(), &applyBody); err != nil {
		t.Fatalf("decode apply response: %v", err)
	}
	if !applyBody.ActivationPlan.CanAutoApply ||
		applyBody.ActivationPlan.AutoApplyChannel != "backend.deployment.rollout_webhook" ||
		applyBody.ActivationPlan.AutoApplyEndpoint != "/admin/provider-instances/blob_storage:minio/config/activate" {
		t.Fatalf("activation plan = %+v, want webhook auto apply", applyBody.ActivationPlan)
	}

	activateReq := httptest.NewRequest(http.MethodPost, "/admin/provider-instances/blob_storage:minio/config/activate", nil)
	activateRes := httptest.NewRecorder()
	router.ServeHTTP(activateRes, activateReq)
	if activateRes.Code != http.StatusOK {
		t.Fatalf("expected provider config activation, got %d: %s", activateRes.Code, activateRes.Body.String())
	}
	if authHeader != "Bearer rollout-token" {
		t.Fatalf("webhook auth header = %q, want bearer token", authHeader)
	}
	if webhookPayload["provider_instance_id"] != "blob_storage:minio" ||
		webhookPayload["activation_mode"] != "deployment_rollout" ||
		webhookPayload["activation_action"] != "rollout_backend_deployment" ||
		webhookPayload["env_path"] != envPath {
		t.Fatalf("webhook payload = %+v", webhookPayload)
	}
	if body := activateRes.Body.String(); strings.Contains(body, "access-secret") || strings.Contains(body, "rollout-token") {
		t.Fatalf("activation response leaked secret: %s", body)
	}
	if countAuditAction(t, db, "provider_instance.config_activation.admin_triggered") != 1 {
		t.Fatalf("expected provider config activation audit log")
	}
	assertAuditMetadataDoesNotContain(t, db, "provider_instance.config_activation.admin_triggered", "rollout-token")
	assertAuditMetadataDoesNotContain(t, db, "provider_instance.config_activation.admin_triggered", "access-secret")
}

type activationRoundTripFunc func(*http.Request) (*http.Response, error)

func (fn activationRoundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}

func TestCreateCredentialWithRequiredTestDoesNotPersistOnFailure(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db := newTestAICredentialRouter(t)

	createReq := httptest.NewRequest(http.MethodPost, "/admin/credentials", strings.NewReader(`{
		"adapter_type":"openai_compat",
		"display_name":"Broken OpenAI",
		"credentials":{"api_key":"sk-bad","base_url":"http://[::1"},
		"require_test_success":true
	}`))
	createReq.Header.Set("Content-Type", "application/json")
	createRes := httptest.NewRecorder()

	router.ServeHTTP(createRes, createReq)

	if createRes.Code != http.StatusBadGateway {
		t.Fatalf("expected failed credential test, got %d: %s", createRes.Code, createRes.Body.String())
	}
	var credentialCount int64
	if err := db.Model(&persistencemodel.AICredential{}).Count(&credentialCount).Error; err != nil {
		t.Fatalf("count credentials: %v", err)
	}
	if credentialCount != 0 {
		t.Fatalf("credential count = %d, want 0", credentialCount)
	}
	if countAuditAction(t, db, "ai_credential.admin_created") != 0 {
		t.Fatalf("failed credential test should not write create audit log")
	}
}

func newTestAICredentialRouter(t *testing.T) (*gin.Engine, *gorm.DB) {
	t.Helper()
	return newTestAICredentialRouterWithConfig(t, nil)
}

func newTestAICredentialRouterWithConfig(t *testing.T, cfg *config.Config) (*gin.Engine, *gorm.DB) {
	t.Helper()
	db := testutil.OpenSQLite(t, "handler-ai-credentials.db", &persistencemodel.AICredential{}, &persistencemodel.AIProvider{}, &persistencemodel.AIProviderCredential{}, &persistencemodel.AuditLog{}, &persistencemodel.AdminSetting{}, &persistencemodel.ExternalResourceSource{})
	db = db.Session(&gorm.Session{SkipHooks: true})
	providerMode := ""
	if cfg != nil {
		providerMode = cfg.AIGatewayProvider
	}
	registry := ai.NewRegistryWithProviderMode(db, nil, providerMode)
	h := NewAIHandlerWithConfig(db, cfg, testHandlerEncryptionKeyHex, registry)

	router := gin.New()
	router.POST("/admin/credentials", h.CreateCredential)
	router.PUT("/admin/credentials/:id", h.UpdateCredential)
	router.DELETE("/admin/credentials/:id", h.DeleteCredential)
	router.GET("/admin/credentials/:id/remote-models", h.ListRemoteModels)
	router.POST("/admin/credentials/:id/test", h.TestCredential)
	router.GET("/admin/providers", h.ListProviders)
	router.POST("/admin/providers", h.CreateProvider)
	router.POST("/admin/providers/:providerID/credentials", h.CreateProviderCredential)
	router.PATCH("/admin/providers/:providerID/credentials/:credentialKey", h.UpdateProviderCredential)
	router.POST("/admin/providers/:providerID/credentials/:credentialKey/primary", h.SetProviderCredentialPrimary)
	router.GET("/admin/provider-instances", h.ListProviderInstances)
	router.GET("/admin/provider-instances/:id/config", h.GetProviderInstanceConfig)
	router.PUT("/admin/provider-instances/:id/config", h.UpdateProviderInstanceConfig)
	router.POST("/admin/provider-instances/:id/config/apply", h.ApplyProviderInstanceConfig)
	router.POST("/admin/provider-instances/:id/config/activate", h.ActivateProviderInstanceConfig)
	router.POST("/admin/provider-instances/:id/test", h.TestProviderInstance)
	return router, db
}

func countAuditAction(t *testing.T, db *gorm.DB, action string) int64 {
	t.Helper()
	var count int64
	if err := db.Model(&persistencemodel.AuditLog{}).Where("action = ?", action).Count(&count).Error; err != nil {
		t.Fatalf("count audit logs for %s: %v", action, err)
	}
	return count
}
