package handler

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
	adminai "github.com/movscript/movscript/internal/app/admin/ai"
	adminsettings "github.com/movscript/movscript/internal/app/admin/settings"
	"github.com/movscript/movscript/internal/infra/config"
	"github.com/movscript/movscript/internal/infra/crypto"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
)

func TestProviderAssetClientPrefersProviderCredential(t *testing.T) {
	db := testutil.OpenSQLite(t, "handler-provider-asset-client-provider-credential.db",
		&persistencemodel.AdminSetting{},
		&persistencemodel.AIProvider{},
		&persistencemodel.AIProviderCredential{},
	)
	provider := persistencemodel.AIProvider{
		ProviderID:               "volc-ark-main",
		ProviderKind:             persistencemodel.AIProviderKindVolcengineArk,
		ProviderCategory:         persistencemodel.AIProviderCategoryOfficialPlatform,
		AdapterKey:               "volcen",
		DisplayName:              "Ark main",
		AssetLibraryStateJSON:    "{}",
		TrustedResourceStateJSON: "{}",
		HealthJSON:               "{}",
		IsEnabled:                true,
	}
	if err := db.Create(&provider).Error; err != nil {
		t.Fatalf("create provider: %v", err)
	}
	keyHex := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	key, err := hex.DecodeString(keyHex)
	if err != nil {
		t.Fatalf("decode key: %v", err)
	}
	if _, err := adminsettings.NewService(db, keyHex).UpdateProviderAssetSettings(context.Background(), adminsettings.ProviderAssetSettings{
		ArkOpenAPIBaseURL:  "https://global.example.com",
		ArkRegion:          "cn-beijing",
		ArkAccessKeyID:     "ak-global",
		ArkSecretAccessKey: "global-secret",
	}); err != nil {
		t.Fatalf("save global provider asset settings: %v", err)
	}
	if _, err := adminai.NewService(db, key, nil).UpdateProviderAssetLibrarySettings(context.Background(), provider.ProviderID, adminai.ProviderAssetLibrarySettingsInput{
		ArkOpenAPIBaseURL:  "https://provider.example.com",
		ArkRegion:          "cn-shanghai",
		ArkAccessKeyID:     "ak-provider",
		ArkSecretAccessKey: "provider-secret",
	}); err != nil {
		t.Fatalf("save provider asset library settings: %v", err)
	}

	handler := NewProviderAssetHandler(db, &config.Config{}, nil, nil, keyHex)
	client, err := handler.volcArkAssetClient(context.Background(), provider.ProviderID)
	if err != nil {
		t.Fatalf("volcArkAssetClient() error = %v", err)
	}
	if client.ConfigSource != "provider" || client.AccessKeyID != "ak-provider" || client.SecretAccessKey != "provider-secret" ||
		client.BaseURL != "https://provider.example.com" || client.Region != "cn-shanghai" {
		t.Fatalf("client = %+v, want provider credential", client)
	}
}

func TestProviderAssetCertifyUsesAdminSettingsSecret(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-provider-asset-certify-admin-settings.db",
		&persistencemodel.RawResource{},
		&persistencemodel.AdminSetting{},
		&persistencemodel.AIProvider{},
		&persistencemodel.ProviderAssetGroup{},
		&persistencemodel.ProviderAsset{},
		&persistencemodel.ProviderAssetModelCertification{},
	)
	user := newHandlerExternalUser("alice")
	resource := persistencemodel.RawResource{
		OwnerID:        user.ID,
		Type:           "image",
		Name:           "reference.png",
		FilePath:       "resources/reference.png",
		StorageKey:     "resources/reference.png",
		StorageBackend: "local",
		MimeType:       "image/png",
		Size:           128,
	}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	provider := persistencemodel.AIProvider{
		ProviderID:       "volc-ark-main",
		ProviderKind:     persistencemodel.AIProviderKindVolcengineArk,
		ProviderCategory: persistencemodel.AIProviderCategoryOfficialPlatform,
		AdapterKey:       "volcen",
		DisplayName:      "Ark main",
		IsEnabled:        true,
	}
	if err := db.Create(&provider).Error; err != nil {
		t.Fatalf("create provider: %v", err)
	}

	var upstreamAuth string
	var upstreamActions []string
	var createGroupPayload map[string]any
	var createAssetPayload map[string]any
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamAuth = r.Header.Get("Authorization")
		action := r.URL.Query().Get("Action")
		upstreamActions = append(upstreamActions, action)
		if r.URL.Path != "/" || r.URL.Query().Get("Version") != "2024-01-01" {
			t.Fatalf("unexpected upstream request: path=%s query=%s", r.URL.Path, r.URL.RawQuery)
		}
		switch action {
		case "CreateAssetGroup":
			if err := json.NewDecoder(r.Body).Decode(&createGroupPayload); err != nil {
				t.Fatalf("decode create group payload: %v", err)
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"Result":{"Id":"group-123","Status":"Active"}}`)
		case "CreateAsset":
			if err := json.NewDecoder(r.Body).Decode(&createAssetPayload); err != nil {
				t.Fatalf("decode create asset payload: %v", err)
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"Result":{"Id":"asset-123","Status":"Active"}}`)
		default:
			t.Fatalf("unexpected upstream action: %s", action)
		}
	}))
	t.Cleanup(upstream.Close)

	settingsService := adminsettings.NewService(db, "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	if _, err := settingsService.UpdateProviderAssetSettings(context.Background(), adminsettings.ProviderAssetSettings{
		ArkOpenAPIBaseURL:  upstream.URL,
		ArkRegion:          "cn-beijing",
		ArkAccessKeyID:     "ak-test",
		ArkSecretAccessKey: "admin-ark-secret",
	}); err != nil {
		t.Fatalf("save provider asset settings: %v", err)
	}

	handler := NewProviderAssetHandler(db, &config.Config{
		EncryptionKey: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
	}, nil, nil, "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	router := gin.New()
	router.Use(func(c *gin.Context) {
		setTestAuthContextUser(c, domainidentity.UserProfile{
			ID:         user.ID,
			Username:   user.Username,
			SystemRole: domainidentity.SystemRoleUser,
			Status:     domainidentity.UserStatusActive,
		})
	})
	router.POST("/provider-assets/providers/:provider_ref/certify", handler.CertifyProviderAsset)

	req := httptest.NewRequest(http.MethodPost, "/provider-assets/providers/volcengine_ark_official/certify", strings.NewReader(`{
		"resource_id": 1,
		"source_url": "https://cdn.example.com/reference.png",
		"name": "角色参考"
	}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected certify success, got %d: %s", res.Code, res.Body.String())
	}
	if !strings.Contains(upstreamAuth, "Credential=ak-test/") || !strings.Contains(upstreamAuth, "SignedHeaders=content-type;host;x-content-sha256;x-date") {
		t.Fatalf("upstream auth = %q", upstreamAuth)
	}
	if len(upstreamActions) != 2 || upstreamActions[0] != "CreateAssetGroup" || upstreamActions[1] != "CreateAsset" {
		t.Fatalf("upstream actions = %#v", upstreamActions)
	}
	if got := createGroupPayload["GroupType"]; got != "AIGC" {
		t.Fatalf("create group GroupType = %#v", got)
	}
	if got := createAssetPayload["URL"]; got != "https://cdn.example.com/reference.png" {
		t.Fatalf("upstream URL = %#v", got)
	}
	if got := createAssetPayload["GroupId"]; got != "group-123" {
		t.Fatalf("upstream GroupId = %#v", got)
	}
	if strings.Contains(res.Body.String(), "admin-ark-secret") {
		t.Fatalf("certify response leaked secret: %s", res.Body.String())
	}
	if !strings.Contains(res.Body.String(), `"hub_asset_id":"asset-123"`) ||
		!strings.Contains(res.Body.String(), `"asset_uri":"asset://asset-123"`) ||
		!strings.Contains(res.Body.String(), `"asset_group_id":"group-123"`) ||
		!strings.Contains(res.Body.String(), `"provider_id":"volc-ark-main"`) {
		t.Fatalf("unexpected certify response: %s", res.Body.String())
	}
	var stored persistencemodel.RawResource
	if err := db.First(&stored, resource.ID).Error; err != nil {
		t.Fatalf("load certified resource: %v", err)
	}
	if !strings.Contains(stored.ProviderAssetCertifications, `"volc-ark-main"`) ||
		strings.Contains(stored.ProviderAssetCertifications, `"seedance2"`) ||
		!strings.Contains(stored.ProviderAssetCertifications, `"asset://asset-123"`) {
		t.Fatalf("resource provider asset certifications = %s", stored.ProviderAssetCertifications)
	}
	var group persistencemodel.ProviderAssetGroup
	if err := db.Where("provider_id = ? AND remote_group_id = ?", "volc-ark-main", "group-123").First(&group).Error; err != nil {
		t.Fatalf("load provider asset group: %v", err)
	}
	var asset persistencemodel.ProviderAsset
	if err := db.Where("provider_id = ? AND remote_asset_id = ?", "volc-ark-main", "asset-123").First(&asset).Error; err != nil {
		t.Fatalf("load provider asset: %v", err)
	}
	if asset.GroupID != group.ID || asset.AssetURI != "asset://asset-123" || asset.SourceResourceID == nil || *asset.SourceResourceID != resource.ID {
		t.Fatalf("provider asset = %#v, group = %#v", asset, group)
	}
	var cert persistencemodel.ProviderAssetModelCertification
	if err := db.Where("provider_asset_id = ?", asset.ID).First(&cert).Error; err != nil {
		t.Fatalf("load provider asset model certification: %v", err)
	}
	if cert.ProviderID != "volc-ark-main" || cert.AssetURI != "asset://asset-123" || cert.Status != persistencemodel.ProviderAssetStatusActive {
		t.Fatalf("provider asset model certification = %#v", cert)
	}
}

func TestProviderAssetCertifyUsesYunwuGatewayProvider(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-provider-asset-certify-seedance-gateway.db",
		&persistencemodel.RawResource{},
		&persistencemodel.AdminSetting{},
		&persistencemodel.AICredential{},
		&persistencemodel.AIProvider{},
		&persistencemodel.AIProviderCredential{},
		&persistencemodel.ProviderAssetGroup{},
		&persistencemodel.ProviderAsset{},
		&persistencemodel.ProviderAssetModelCertification{},
	)
	user := newHandlerExternalUser("alice")
	resource := persistencemodel.RawResource{
		OwnerID:        user.ID,
		Type:           "image",
		Name:           "role.png",
		FilePath:       "resources/role.png",
		StorageKey:     "resources/role.png",
		StorageBackend: "local",
		MimeType:       "image/png",
		Size:           128,
	}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	provider := persistencemodel.AIProvider{
		ProviderID:       "yunwu-main",
		ProviderKind:     persistencemodel.AIProviderKindYunwuGateway,
		ProviderCategory: persistencemodel.AIProviderCategoryAggregatorGateway,
		AdapterKey:       "openai_compat",
		DisplayName:      "Yunwu Gateway",
		IsEnabled:        true,
	}
	if err := db.Create(&provider).Error; err != nil {
		t.Fatalf("create provider: %v", err)
	}

	var gatewayAuth string
	var createGroupPayload map[string]any
	var createAssetPayload map[string]any
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gatewayAuth = r.Header.Get("Authorization")
		if r.Method != http.MethodPost {
			t.Fatalf("unexpected gateway method: %s", r.Method)
		}
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v1/private-avatar/groups":
			if err := json.NewDecoder(r.Body).Decode(&createGroupPayload); err != nil {
				t.Fatalf("decode gateway group payload: %v", err)
			}
			_, _ = io.WriteString(w, `{"Result":{"Id":"group-yw-1","Status":"Active"}}`)
		case "/v1/private-avatar/assets":
			if err := json.NewDecoder(r.Body).Decode(&createAssetPayload); err != nil {
				t.Fatalf("decode gateway asset payload: %v", err)
			}
			_, _ = io.WriteString(w, `{"Result":{"Id":"asset-yw-1","Status":"Active"}}`)
		default:
			t.Fatalf("unexpected gateway path: %s", r.URL.Path)
		}
	}))
	t.Cleanup(upstream.Close)

	keyHex := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	key, err := hex.DecodeString(keyHex)
	if err != nil {
		t.Fatalf("decode key: %v", err)
	}
	encryptedToken, err := crypto.Encrypt("gateway-token", key)
	if err != nil {
		t.Fatalf("encrypt token: %v", err)
	}
	legacy := persistencemodel.AICredential{
		AdapterType:  "openai_compat",
		DisplayName:  "Yunwu Gateway",
		BaseURL:      upstream.URL,
		EncryptedKey: encryptedToken,
		MaskedKey:    crypto.MaskKey("gateway-token"),
		IsEnabled:    true,
	}
	if err := db.Create(&legacy).Error; err != nil {
		t.Fatalf("create legacy credential: %v", err)
	}
	plainConfig, _ := json.Marshal(map[string]any{"legacy_credential_id": legacy.ID})
	secrets, _ := json.Marshal(map[string]string{"legacy_encrypted_key": encryptedToken})
	masked, _ := json.Marshal(map[string]string{"legacy_masked_key": crypto.MaskKey("gateway-token")})
	if err := db.Create(&persistencemodel.AIProviderCredential{
		ProviderID:           provider.ProviderID,
		CredentialKey:        "primary",
		CredentialKind:       "api_key",
		EncryptedSecretsJSON: string(secrets),
		MaskedSecretsJSON:    string(masked),
		PlainConfigJSON:      string(plainConfig),
		Status:               persistencemodel.AIProviderCredentialStatusActive,
		IsPrimary:            true,
	}).Error; err != nil {
		t.Fatalf("create provider credential: %v", err)
	}

	handler := NewProviderAssetHandler(db, &config.Config{
		EncryptionKey: keyHex,
	}, nil, nil, keyHex)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		setTestAuthContextUser(c, domainidentity.UserProfile{
			ID:         user.ID,
			Username:   user.Username,
			SystemRole: domainidentity.SystemRoleUser,
			Status:     domainidentity.UserStatusActive,
		})
	})
	router.POST("/provider-assets/providers/:provider_ref/certify", handler.CertifyProviderAsset)

	req := httptest.NewRequest(http.MethodPost, "/provider-assets/providers/yunwu-main/certify", strings.NewReader(`{
		"resource_id": 1,
		"source_url": "https://cdn.example.com/role.png",
		"name": "角色参考",
		"model": "doubao-seedance-2-0-fast-260128"
	}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected certify success, got %d: %s", res.Code, res.Body.String())
	}
	if gatewayAuth != "Bearer gateway-token" {
		t.Fatalf("gateway auth = %q", gatewayAuth)
	}
	if got := createGroupPayload["model"]; got != "doubao-seedance-2-0-fast-260128" {
		t.Fatalf("gateway group model = %#v", got)
	}
	if got := createGroupPayload["GroupType"]; got != "AIGC" {
		t.Fatalf("gateway group type = %#v", got)
	}
	if got := createAssetPayload["URL"]; got != "https://cdn.example.com/role.png" {
		t.Fatalf("gateway url = %#v", got)
	}
	if got := createAssetPayload["AssetType"]; got != "Image" {
		t.Fatalf("gateway asset_type = %#v", got)
	}
	if got := createAssetPayload["GroupId"]; got != "group-yw-1" {
		t.Fatalf("gateway GroupId = %#v", got)
	}
	if !strings.Contains(res.Body.String(), `"asset_uri":"asset://asset-yw-1"`) ||
		!strings.Contains(res.Body.String(), `"model":"doubao-seedance-2-0-fast-260128"`) ||
		!strings.Contains(res.Body.String(), `"provider_id":"yunwu-main"`) ||
		!strings.Contains(res.Body.String(), `"asset_library_backend":"yunwu_gateway"`) {
		t.Fatalf("unexpected certify response: %s", res.Body.String())
	}
	var stored persistencemodel.RawResource
	if err := db.First(&stored, resource.ID).Error; err != nil {
		t.Fatalf("load certified resource: %v", err)
	}
	if !strings.Contains(stored.ProviderAssetCertifications, `"yunwu-main::model:doubao-seedance-2-0-fast-260128"`) ||
		strings.Contains(stored.ProviderAssetCertifications, `"seedance2"`) ||
		!strings.Contains(stored.ProviderAssetCertifications, `"asset://asset-yw-1"`) {
		t.Fatalf("resource provider asset certifications = %s", stored.ProviderAssetCertifications)
	}
	var asset persistencemodel.ProviderAsset
	if err := db.Where("provider_id = ? AND remote_asset_id = ?", "yunwu-main", "asset-yw-1").First(&asset).Error; err != nil {
		t.Fatalf("load yunwu provider asset: %v", err)
	}
	var cert persistencemodel.ProviderAssetModelCertification
	if err := db.Where("provider_asset_id = ?", asset.ID).First(&cert).Error; err != nil {
		t.Fatalf("load yunwu provider asset model certification: %v", err)
	}
	if cert.PublicModelID != "doubao-seedance-2-0-fast-260128" ||
		cert.ProviderModelID != "doubao-seedance-2-0-fast-260128" ||
		cert.AssetURI != "asset://asset-yw-1" {
		t.Fatalf("yunwu provider asset model certification = %#v", cert)
	}
}

func TestProviderAssetSyncUsesYunwuGatewayRemoteLibrary(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-provider-asset-sync-yunwu.db",
		&persistencemodel.AdminSetting{},
		&persistencemodel.AICredential{},
		&persistencemodel.AIProvider{},
		&persistencemodel.AIProviderCredential{},
		&persistencemodel.ProviderAssetGroup{},
		&persistencemodel.ProviderAsset{},
		&persistencemodel.ProviderAssetModelCertification{},
	)
	user := newHandlerExternalUser("alice")
	provider := persistencemodel.AIProvider{
		ProviderID:       "yunwu-main",
		ProviderKind:     persistencemodel.AIProviderKindYunwuGateway,
		ProviderCategory: persistencemodel.AIProviderCategoryAggregatorGateway,
		AdapterKey:       "openai_compat",
		DisplayName:      "Yunwu Gateway",
		IsEnabled:        true,
	}
	if err := db.Create(&provider).Error; err != nil {
		t.Fatalf("create provider: %v", err)
	}

	var seenGroupModel string
	var seenAssetModel string
	var seenAssetGroup string
	var gatewayAuth string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gatewayAuth = r.Header.Get("Authorization")
		if r.Method != http.MethodGet {
			t.Fatalf("unexpected gateway method: %s", r.Method)
		}
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v1/private-avatar/groups/list":
			seenGroupModel = r.URL.Query().Get("model")
			_, _ = io.WriteString(w, `{"items":[{"Id":"group-yw-1","Name":"远端素材组","Status":"Active"}]}`)
		case "/v1/private-avatar/assets/list":
			seenAssetModel = r.URL.Query().Get("model")
			seenAssetGroup = r.URL.Query().Get("GroupId")
			_, _ = io.WriteString(w, `{"items":[{"Id":"asset-yw-1","Name":"远端图片","GroupId":"group-yw-1","Status":"Active"}]}`)
		default:
			t.Fatalf("unexpected gateway path: %s", r.URL.Path)
		}
	}))
	t.Cleanup(upstream.Close)

	keyHex := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	key, err := hex.DecodeString(keyHex)
	if err != nil {
		t.Fatalf("decode key: %v", err)
	}
	encryptedToken, err := crypto.Encrypt("gateway-token", key)
	if err != nil {
		t.Fatalf("encrypt token: %v", err)
	}
	legacy := persistencemodel.AICredential{
		AdapterType:  "openai_compat",
		DisplayName:  "Yunwu Gateway",
		BaseURL:      upstream.URL,
		EncryptedKey: encryptedToken,
		MaskedKey:    crypto.MaskKey("gateway-token"),
		IsEnabled:    true,
	}
	if err := db.Create(&legacy).Error; err != nil {
		t.Fatalf("create legacy credential: %v", err)
	}
	plainConfig, _ := json.Marshal(map[string]any{"legacy_credential_id": legacy.ID})
	secrets, _ := json.Marshal(map[string]string{"legacy_encrypted_key": encryptedToken})
	masked, _ := json.Marshal(map[string]string{"legacy_masked_key": crypto.MaskKey("gateway-token")})
	if err := db.Create(&persistencemodel.AIProviderCredential{
		ProviderID:           provider.ProviderID,
		CredentialKey:        "primary",
		CredentialKind:       "api_key",
		EncryptedSecretsJSON: string(secrets),
		MaskedSecretsJSON:    string(masked),
		PlainConfigJSON:      string(plainConfig),
		Status:               persistencemodel.AIProviderCredentialStatusActive,
		IsPrimary:            true,
	}).Error; err != nil {
		t.Fatalf("create provider credential: %v", err)
	}

	handler := NewProviderAssetHandler(db, &config.Config{
		EncryptionKey: keyHex,
	}, nil, nil, keyHex)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		setTestAuthContextUser(c, domainidentity.UserProfile{
			ID:         user.ID,
			Username:   user.Username,
			SystemRole: domainidentity.SystemRoleUser,
			Status:     domainidentity.UserStatusActive,
		})
	})
	router.POST("/provider-assets/providers/:provider_ref/groups/sync", handler.SyncProviderAssetGroups)
	router.POST("/provider-assets/providers/:provider_ref/groups/:group_ref/assets/sync", handler.SyncProviderAssets)

	model := "doubao-seedance-2-0-fast-260128"
	res := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/provider-assets/providers/yunwu-main/groups/sync?model="+model, nil)
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected group sync success, got %d: %s", res.Code, res.Body.String())
	}
	if gatewayAuth != "Bearer gateway-token" || seenGroupModel != model {
		t.Fatalf("gateway auth/model = %q/%q", gatewayAuth, seenGroupModel)
	}
	var group persistencemodel.ProviderAssetGroup
	if err := db.Where("provider_id = ? AND remote_group_id = ?", "yunwu-main", "group-yw-1").First(&group).Error; err != nil {
		t.Fatalf("load synced group: %v", err)
	}
	if group.ModelScope != "" || group.Origin != persistencemodel.ProviderAssetGroupOriginRemote {
		t.Fatalf("synced group = %#v", group)
	}

	res = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/provider-assets/providers/yunwu-main/groups/group-yw-1/assets/sync?model="+model, nil)
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected asset sync success, got %d: %s", res.Code, res.Body.String())
	}
	if seenAssetModel != model || seenAssetGroup != "group-yw-1" {
		t.Fatalf("asset sync query model/group = %q/%q", seenAssetModel, seenAssetGroup)
	}
	var asset persistencemodel.ProviderAsset
	if err := db.Where("provider_id = ? AND remote_asset_id = ?", "yunwu-main", "asset-yw-1").First(&asset).Error; err != nil {
		t.Fatalf("load synced asset: %v", err)
	}
	var cert persistencemodel.ProviderAssetModelCertification
	if err := db.Where("provider_asset_id = ? AND public_model_id = ?", asset.ID, model).First(&cert).Error; err != nil {
		t.Fatalf("load synced certification: %v", err)
	}
	if asset.GroupID != group.ID || asset.AssetURI != "asset://asset-yw-1" || cert.Status != persistencemodel.ProviderAssetStatusActive {
		t.Fatalf("asset/cert = %#v / %#v", asset, cert)
	}
}

func TestProviderAssetProviderRefsResolveOfficialArkProvider(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-provider-asset-provider-ref.db", &persistencemodel.AIProvider{})
	provider := persistencemodel.AIProvider{
		ProviderID:       "volc-ark-main",
		ProviderKind:     persistencemodel.AIProviderKindVolcengineArk,
		ProviderCategory: persistencemodel.AIProviderCategoryOfficialPlatform,
		AdapterKey:       "volcen",
		DisplayName:      "Ark main",
		IsEnabled:        true,
	}
	if err := db.Create(&provider).Error; err != nil {
		t.Fatalf("create provider: %v", err)
	}
	handler := NewProviderAssetHandler(db, &config.Config{}, nil, nil, "")

	for _, ref := range []string{"volcengine_ark_official", "volc-ark-main", "seedance2"} {
		t.Run(ref, func(t *testing.T) {
			resolved, err := handler.resolveProviderAssetProvider(context.Background(), ref)
			if err != nil {
				t.Fatalf("resolveProviderAssetProvider(%q) error = %v", ref, err)
			}
			if resolved.ProviderID != provider.ProviderID || resolved.ProviderKind != persistencemodel.AIProviderKindVolcengineArk {
				t.Fatalf("resolved = %+v, want provider %q", resolved, provider.ProviderID)
			}
		})
	}
}
