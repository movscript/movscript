package handler

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	adminai "github.com/movscript/movscript/internal/app/admin/ai"
	adminsettings "github.com/movscript/movscript/internal/app/admin/settings"
	appresource "github.com/movscript/movscript/internal/app/resource"
	domainresource "github.com/movscript/movscript/internal/domain/resource"
	"github.com/movscript/movscript/internal/infra/ai"
	"github.com/movscript/movscript/internal/infra/cache"
	"github.com/movscript/movscript/internal/infra/config"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/infra/storage"
	"github.com/movscript/movscript/internal/interfaces/http/api"
	"gorm.io/gorm"
)

type ProviderAssetHandler struct {
	db       *gorm.DB
	cfg      *config.Config
	store    storage.Storage
	resource *appresource.Service
	settings *adminsettings.Service
	client   *http.Client

	encryptionKey []byte
}

func NewProviderAssetHandler(db *gorm.DB, cfg *config.Config, store storage.Storage, verifier ai.ImageVerificationClient, encryptionKeyHex string, cacheStore ...cache.Cache) *ProviderAssetHandler {
	encryptionKey, _ := hex.DecodeString(encryptionKeyHex)
	return &ProviderAssetHandler{
		db:            db,
		cfg:           cfg,
		store:         store,
		resource:      appresource.NewService(db, store, verifier, cacheStore...),
		settings:      adminsettings.NewService(db, encryptionKeyHex),
		client:        &http.Client{Timeout: 120 * time.Second},
		encryptionKey: encryptionKey,
	}
}

type providerAssetCertifyRequest struct {
	Provider          string `json:"provider"`
	ResourceID        uint   `json:"resource_id" binding:"required"`
	SourceURL         string `json:"source_url"`
	SourceCandidateID string `json:"source_candidate_id"`
	ProjectID         string `json:"project_id"`
	ProjectName       string `json:"project_name"`
	SettingID         string `json:"setting_id"`
	Name              string `json:"name"`
	AllowPrivateURLs  bool   `json:"allow_private_urls"`
	TimeoutMS         int    `json:"timeout_ms"`
}

type providerAssetProviderRef struct {
	ProviderID       string
	ProviderKind     string
	ProviderCategory string
}

func (h *ProviderAssetHandler) CertifySeedance2(c *gin.Context) {
	h.certifyVolcArkAsset(c, "seedance2")
}

func (h *ProviderAssetHandler) CertifyProviderAsset(c *gin.Context) {
	providerRef := strings.TrimSpace(c.Param("provider_ref"))
	if unescaped, err := url.PathUnescape(providerRef); err == nil {
		providerRef = unescaped
	}
	h.certifyVolcArkAsset(c, providerRef)
}

func (h *ProviderAssetHandler) certifyVolcArkAsset(c *gin.Context, providerRef string) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, api.AuthRequired())
		return
	}
	var body providerAssetCertifyRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	providerRef = strings.TrimSpace(providerRef)
	bodyProvider := strings.TrimSpace(body.Provider)
	if providerRef == "" {
		providerRef = bodyProvider
	} else if bodyProvider != "" && normalizeProviderAssetProvider(bodyProvider) != normalizeProviderAssetProvider(providerRef) {
		c.JSON(http.StatusBadRequest, api.InvalidInput("provider path and request body do not match"))
		return
	}
	provider, err := h.resolveVolcArkAssetProvider(c.Request.Context(), providerRef)
	if err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	resource, err := h.resource.GetVisible(c.Request.Context(), body.ResourceID, user.ID, currentOrgID(c))
	if err != nil {
		h.writeResourceError(c, err)
		return
	}
	if !strings.HasPrefix(strings.ToLower(resource.MimeType), "image/") && resource.Type != "image" {
		c.JSON(http.StatusBadRequest, api.InvalidInput("Seedance2 asset certification requires an image RawResource"))
		return
	}

	sourceURL := strings.TrimSpace(body.SourceURL)
	if sourceURL == "" {
		var err error
		sourceURL, err = h.signedPublicResourceURL(c.Request.Context(), resource.ID)
		if err != nil {
			c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
			return
		}
	}
	if !body.AllowPrivateURLs && isPrivateProviderAssetURL(sourceURL) {
		c.JSON(http.StatusBadRequest, api.InvalidInput("provider asset source_url is not publicly reachable; configure MOVSCRIPT_PROVIDER_ASSET_PUBLIC_BASE_URL to a tunnel/public backend URL or pass a public source_url"))
		return
	}

	arkClient, err := h.volcArkAssetClient(c.Request.Context(), provider.ProviderID)
	if err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	timeout := time.Duration(body.TimeoutMS) * time.Millisecond
	if timeout < time.Second {
		timeout = 120 * time.Second
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), timeout)
	defer cancel()

	groupScope := providerAssetGroupScope(body.ProjectID, body.ProjectName, body.SettingID)
	group, err := h.ensureVolcArkAIGCAssetGroup(ctx, arkClient, groupScope, body.ProjectID, body.ProjectName, body.SettingID)
	if err != nil {
		c.JSON(http.StatusBadGateway, api.InvalidInput(err.Error()))
		return
	}
	created, err := h.createVolcArkImageAsset(ctx, arkClient, group, sourceURL, providerAssetName(body.Name, resource))
	if err != nil {
		c.JSON(http.StatusBadGateway, api.InvalidInput(err.Error()))
		return
	}
	certification, err := providerAssetCertification(provider, sourceURL, resource.ID, body.SourceCandidateID, arkClient.BaseURL, created)
	if err != nil {
		c.JSON(http.StatusBadGateway, api.InvalidInput(err.Error()))
		return
	}
	updatedResource, err := h.resource.RecordProviderAssetCertification(ctx, appresource.RecordProviderAssetCertificationInput{
		UserID:        user.ID,
		OrgID:         currentOrgID(c),
		ID:            resource.ID,
		Provider:      provider.ProviderID,
		Certification: certification,
	})
	if err != nil {
		h.writeResourceError(c, err)
		return
	}
	h.populateCertifiedResourceURL(c, &updatedResource)
	c.JSON(http.StatusOK, gin.H{
		"status":             "succeeded",
		"provider":           provider.ProviderID,
		"provider_id":        provider.ProviderID,
		"provider_kind":      provider.ProviderKind,
		"source_resource_id": resource.ID,
		"source_url":         sourceURL,
		"certification":      certification,
		"asset_uri":          certification["asset_uri"],
		"hub_asset_id":       certification["hub_asset_id"],
		"resource":           updatedResource,
	})
}

func (h *ProviderAssetHandler) resolveVolcArkAssetProvider(ctx context.Context, requested string) (providerAssetProviderRef, error) {
	requested = normalizeProviderAssetProvider(requested)
	if h == nil || h.db == nil || !h.db.Migrator().HasTable(&persistencemodel.AIProvider{}) {
		if providerAssetProviderIsLegacyAlias(requested) || providerAssetProviderIsDefaultVolcArk(requested) {
			return providerAssetProviderRef{
				ProviderID:       requested,
				ProviderKind:     persistencemodel.AIProviderKindVolcengineArk,
				ProviderCategory: persistencemodel.AIProviderCategoryOfficialPlatform,
			}, nil
		}
		return providerAssetProviderRef{}, fmt.Errorf("unsupported provider asset certification provider: %s", requested)
	}

	var provider persistencemodel.AIProvider
	query := h.db.WithContext(ctx).
		Where("provider_kind = ? AND is_enabled = true", persistencemodel.AIProviderKindVolcengineArk)
	if providerAssetProviderIsLegacyAlias(requested) || providerAssetProviderIsDefaultVolcArk(requested) {
		query = query.Order("id ASC")
	} else {
		query = query.Where("provider_id = ?", requested)
	}
	if err := query.First(&provider).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			if providerAssetProviderIsLegacyAlias(requested) {
				return providerAssetProviderRef{}, fmt.Errorf("no enabled Volcengine Ark official provider is configured; create one in Admin > Providers before certifying assets")
			}
			return providerAssetProviderRef{}, fmt.Errorf("provider %q is not an enabled Volcengine Ark official provider", requested)
		}
		return providerAssetProviderRef{}, err
	}
	return providerAssetProviderRef{
		ProviderID:       strings.TrimSpace(provider.ProviderID),
		ProviderKind:     strings.TrimSpace(provider.ProviderKind),
		ProviderCategory: strings.TrimSpace(provider.ProviderCategory),
	}, nil
}

func (h *ProviderAssetHandler) writeResourceError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, appresource.ErrNotFound):
		c.JSON(http.StatusNotFound, api.NotFound("resource not found"))
	case errors.Is(err, appresource.ErrForbidden):
		c.JSON(http.StatusForbidden, api.Forbidden("forbidden"))
	default:
		c.JSON(http.StatusInternalServerError, api.Internal(err.Error()))
	}
}

func (h *ProviderAssetHandler) ServeSignedResourceFile(c *gin.Context) {
	id64, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id64 == 0 {
		c.JSON(http.StatusBadRequest, api.InvalidInput("invalid resource id"))
		return
	}
	expires, err := strconv.ParseInt(c.Query("expires"), 10, 64)
	if err != nil || expires <= time.Now().Unix() {
		c.JSON(http.StatusForbidden, api.Forbidden("resource URL expired"))
		return
	}
	signature := strings.TrimSpace(c.Query("signature"))
	if !h.verifySignedResourceURL(uint(id64), expires, signature) {
		c.JSON(http.StatusForbidden, api.Forbidden("invalid resource URL signature"))
		return
	}
	var row persistencemodel.RawResource
	if err := h.db.WithContext(c.Request.Context()).
		Where("id = ?", uint(id64)).
		First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, api.NotFound("resource not found"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("failed to load resource"))
		return
	}
	serveResourceFile(c, h.store, domainresource.RawResourceFromModel(row))
}

func (h *ProviderAssetHandler) populateCertifiedResourceURL(c *gin.Context, resource *domainresource.RawResource) {
	resource.URL = resourceURL(c, resource.ID)
}

type volcArkAssetClient struct {
	BaseURL         string
	Region          string
	AccessKeyID     string
	SecretAccessKey string
	ProviderID      string
	ConfigSource    string
}

func (h *ProviderAssetHandler) providerAssetLibraryService() *adminai.Service {
	if h == nil || h.db == nil {
		return nil
	}
	return adminai.NewService(h.db, h.encryptionKey, nil)
}

func (h *ProviderAssetHandler) volcArkAssetClient(ctx context.Context, providerID string) (volcArkAssetClient, error) {
	providerID = strings.TrimSpace(providerID)
	if service := h.providerAssetLibraryService(); service != nil && providerID != "" {
		settings, err := service.GetProviderAssetLibrarySettingsWithSecret(ctx, providerID)
		if err == nil {
			client := volcArkAssetClient{
				BaseURL:         normalizeVolcArkOpenAPIBaseURL(settings.ArkOpenAPIBaseURL),
				Region:          strings.TrimSpace(settings.ArkRegion),
				AccessKeyID:     strings.TrimSpace(settings.ArkAccessKeyID),
				SecretAccessKey: strings.TrimSpace(settings.ArkSecretAccessKey),
				ProviderID:      providerID,
				ConfigSource:    "provider",
			}
			if client.Region == "" {
				client.Region = "cn-beijing"
			}
			if client.AccessKeyID != "" && client.SecretAccessKey != "" {
				return client, nil
			}
		}
	}
	if h.settings == nil {
		return volcArkAssetClient{}, fmt.Errorf("provider asset settings service is unavailable")
	}
	settings, err := h.settings.ProviderAssetSettings(ctx)
	if err != nil {
		return volcArkAssetClient{}, fmt.Errorf("failed to load provider asset settings: %w", err)
	}
	client := volcArkAssetClient{
		BaseURL:         normalizeVolcArkOpenAPIBaseURL(settings.ArkOpenAPIBaseURL),
		Region:          strings.TrimSpace(settings.ArkRegion),
		AccessKeyID:     strings.TrimSpace(settings.ArkAccessKeyID),
		SecretAccessKey: strings.TrimSpace(settings.ArkSecretAccessKey),
		ProviderID:      providerID,
		ConfigSource:    "admin_settings",
	}
	if client.Region == "" {
		client.Region = "cn-beijing"
	}
	if client.AccessKeyID == "" || client.SecretAccessKey == "" {
		return volcArkAssetClient{}, fmt.Errorf("Volcengine Ark asset API requires Access Key ID and Secret Access Key in Admin > Providers > Provider Asset Library")
	}
	return client, nil
}

func (h *ProviderAssetHandler) ensureVolcArkAIGCAssetGroup(ctx context.Context, client volcArkAssetClient, scope string, projectID string, projectName string, settingID string) (adminsettings.ProviderAssetGroupState, error) {
	if client.ConfigSource == "provider" && strings.TrimSpace(client.ProviderID) != "" {
		return h.ensureProviderVolcArkAIGCAssetGroup(ctx, client, scope, projectID, projectName, settingID)
	}
	settings, err := h.settings.ProviderAssetSettings(ctx)
	if err != nil {
		return adminsettings.ProviderAssetGroupState{}, fmt.Errorf("failed to load provider asset settings: %w", err)
	}
	scope = providerAssetGroupScope(projectID, projectName, settingID)
	if existing, ok := settings.ArkAssetGroups[scope]; ok && strings.TrimSpace(existing.ID) != "" {
		return existing, nil
	}
	groupName := providerAssetGroupName(scope, projectID, projectName, settingID)
	group := adminsettings.ProviderAssetGroupState{
		Name:        groupName,
		Scope:       scope,
		ProjectName: strings.TrimSpace(projectName),
		SettingID:   strings.TrimSpace(settingID),
	}
	created, err := h.createVolcArkAIGCAssetGroup(ctx, client, group)
	if err != nil {
		return adminsettings.ProviderAssetGroupState{}, err
	}
	group.ID = firstString(created, "id", "Id", "group_id", "GroupId")
	if group.ID == "" {
		return adminsettings.ProviderAssetGroupState{}, fmt.Errorf("Volcengine Ark CreateAssetGroup response did not include a group ID")
	}
	updated, err := h.settings.UpsertProviderAssetGroup(ctx, scope, group)
	if err != nil {
		return adminsettings.ProviderAssetGroupState{}, fmt.Errorf("failed to store provider asset group: %w", err)
	}
	return updated.ArkAssetGroups[scope], nil
}

func (h *ProviderAssetHandler) ensureProviderVolcArkAIGCAssetGroup(ctx context.Context, client volcArkAssetClient, scope string, projectID string, projectName string, settingID string) (adminsettings.ProviderAssetGroupState, error) {
	service := h.providerAssetLibraryService()
	if service == nil {
		return adminsettings.ProviderAssetGroupState{}, fmt.Errorf("provider asset library service is unavailable")
	}
	settings, err := service.GetProviderAssetLibrarySettingsWithSecret(ctx, client.ProviderID)
	if err != nil {
		return adminsettings.ProviderAssetGroupState{}, fmt.Errorf("failed to load provider asset library settings: %w", err)
	}
	scope = providerAssetGroupScope(projectID, projectName, settingID)
	if existing, ok := settings.ArkAssetGroups[scope]; ok && strings.TrimSpace(existing.ID) != "" {
		return existing, nil
	}
	groupName := providerAssetGroupName(scope, projectID, projectName, settingID)
	group := adminsettings.ProviderAssetGroupState{
		Name:        groupName,
		Scope:       scope,
		ProjectName: strings.TrimSpace(projectName),
		SettingID:   strings.TrimSpace(settingID),
	}
	created, err := h.createVolcArkAIGCAssetGroup(ctx, client, group)
	if err != nil {
		return adminsettings.ProviderAssetGroupState{}, err
	}
	group.ID = firstString(created, "id", "Id", "group_id", "GroupId")
	if group.ID == "" {
		return adminsettings.ProviderAssetGroupState{}, fmt.Errorf("Volcengine Ark CreateAssetGroup response did not include a group ID")
	}
	updated, err := service.UpsertProviderAssetLibraryGroup(ctx, client.ProviderID, scope, group)
	if err != nil {
		return adminsettings.ProviderAssetGroupState{}, fmt.Errorf("failed to store provider asset group: %w", err)
	}
	return updated.ArkAssetGroups[scope], nil
}

func (h *ProviderAssetHandler) createVolcArkAIGCAssetGroup(ctx context.Context, client volcArkAssetClient, group adminsettings.ProviderAssetGroupState) (map[string]any, error) {
	payload := map[string]any{
		"Name":        group.Name,
		"GroupType":   "AIGC",
		"Description": "MovScript managed AIGC asset group",
	}
	if strings.TrimSpace(group.ProjectName) != "" {
		payload["ProjectName"] = strings.TrimSpace(group.ProjectName)
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, client.BaseURL+"/?Action=CreateAssetGroup&Version=2024-01-01", bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	signVolcArkOpenAPIRequest(req, raw, client, time.Now().UTC())
	res, err := h.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("Volcengine Ark CreateAssetGroup request failed: %w", err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 2*1024*1024))
	decoded := decodeProviderAssetResponse(body)
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("Volcengine Ark CreateAssetGroup failed: HTTP %d %s", res.StatusCode, providerAssetErrorText(decoded, body))
	}
	if msg := providerAssetBusinessError(decoded); msg != "" {
		return nil, fmt.Errorf("Volcengine Ark CreateAssetGroup failed: %s", msg)
	}
	assetGroup := unwrapProviderAssetGroup(decoded)
	if len(assetGroup) == 0 {
		return nil, fmt.Errorf("Volcengine Ark CreateAssetGroup response did not include an asset group object")
	}
	return assetGroup, nil
}

func (h *ProviderAssetHandler) createVolcArkImageAsset(ctx context.Context, client volcArkAssetClient, group adminsettings.ProviderAssetGroupState, sourceURL string, name string) (map[string]any, error) {
	payload := map[string]any{
		"GroupId":   group.ID,
		"URL":       sourceURL,
		"Name":      name,
		"AssetType": "Image",
	}
	if strings.TrimSpace(group.ProjectName) != "" {
		payload["ProjectName"] = strings.TrimSpace(group.ProjectName)
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, client.BaseURL+"/?Action=CreateAsset&Version=2024-01-01", bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	signVolcArkOpenAPIRequest(req, raw, client, time.Now().UTC())
	res, err := h.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("Volcengine Ark CreateAsset request failed: %w", err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 2*1024*1024))
	decoded := decodeProviderAssetResponse(body)
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("Volcengine Ark CreateAsset failed: HTTP %d %s", res.StatusCode, providerAssetErrorText(decoded, body))
	}
	if msg := providerAssetBusinessError(decoded); msg != "" {
		return nil, fmt.Errorf("Volcengine Ark CreateAsset failed: %s", msg)
	}
	asset := unwrapProviderAsset(decoded)
	if len(asset) == 0 {
		return nil, fmt.Errorf("Volcengine Ark CreateAsset response did not include an asset object")
	}
	asset["asset_group_id"] = group.ID
	return asset, nil
}

func (h *ProviderAssetHandler) signedPublicResourceURL(ctx context.Context, resourceID uint) (string, error) {
	publicBaseURL := ""
	if h.cfg != nil {
		publicBaseURL = strings.TrimSpace(h.cfg.ProviderAssetPublicBaseURL)
	}
	if h.settings != nil {
		if settings, err := h.settings.ProviderAssetSettings(ctx); err == nil && strings.TrimSpace(settings.PublicBaseURL) != "" {
			publicBaseURL = strings.TrimSpace(settings.PublicBaseURL)
		}
	}
	if publicBaseURL == "" {
		return "", fmt.Errorf("public provider asset base URL is required when source_url is omitted; configure it in Admin > System Settings > Provider Asset Library")
	}
	expires := time.Now().Add(30 * time.Minute).Unix()
	signature := h.signResourceURL(ctx, resourceID, expires)
	if signature == "" {
		return "", fmt.Errorf("provider asset signing secret is required")
	}
	return fmt.Sprintf("%s/api/v1/provider-assets/resources/%d/file?expires=%d&signature=%s",
		strings.TrimRight(publicBaseURL, "/"),
		resourceID,
		expires,
		url.QueryEscape(signature),
	), nil
}

func (h *ProviderAssetHandler) signResourceURL(ctx context.Context, resourceID uint, expires int64) string {
	secret := providerAssetSigningSecret(h.cfg)
	if h.settings != nil {
		if settings, err := h.settings.ProviderAssetSettings(ctx); err == nil && strings.TrimSpace(settings.SigningSecret) != "" {
			secret = strings.TrimSpace(settings.SigningSecret)
		}
	}
	if secret == "" {
		return ""
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(providerAssetSignaturePayload(resourceID, expires)))
	return hex.EncodeToString(mac.Sum(nil))
}

func (h *ProviderAssetHandler) verifySignedResourceURL(resourceID uint, expires int64, signature string) bool {
	expected := h.signResourceURL(context.Background(), resourceID, expires)
	if expected == "" || signature == "" {
		return false
	}
	return hmac.Equal([]byte(expected), []byte(signature))
}

func providerAssetSignaturePayload(resourceID uint, expires int64) string {
	return fmt.Sprintf("provider_asset_resource:%d:%d", resourceID, expires)
}

func providerAssetSigningSecret(cfg *config.Config) string {
	if cfg == nil {
		return ""
	}
	if strings.TrimSpace(cfg.ProviderAssetSigningSecret) != "" {
		return strings.TrimSpace(cfg.ProviderAssetSigningSecret)
	}
	return strings.TrimSpace(cfg.GitProxyTokenSecret)
}

func signVolcArkOpenAPIRequest(req *http.Request, payload []byte, client volcArkAssetClient, now time.Time) {
	const algorithm = "HMAC-SHA256"
	const service = "ark"
	dateTime := now.UTC().Format("20060102T150405Z")
	date := now.UTC().Format("20060102")
	payloadHash := sha256Hex(payload)
	req.Header.Set("X-Date", dateTime)
	req.Header.Set("X-Content-Sha256", payloadHash)

	signedHeaders := []string{"content-type", "host", "x-content-sha256", "x-date"}
	canonicalHeaders := strings.Join([]string{
		"content-type:" + strings.TrimSpace(req.Header.Get("Content-Type")),
		"host:" + req.URL.Host,
		"x-content-sha256:" + payloadHash,
		"x-date:" + dateTime,
	}, "\n") + "\n"
	canonicalURI := req.URL.EscapedPath()
	if canonicalURI == "" {
		canonicalURI = "/"
	}
	canonicalRequest := strings.Join([]string{
		req.Method,
		canonicalURI,
		canonicalQueryString(req.URL.Query()),
		canonicalHeaders,
		strings.Join(signedHeaders, ";"),
		payloadHash,
	}, "\n")
	scope := strings.Join([]string{date, client.Region, service, "request"}, "/")
	stringToSign := strings.Join([]string{
		algorithm,
		dateTime,
		scope,
		sha256Hex([]byte(canonicalRequest)),
	}, "\n")
	signingKey := volcOpenAPISigningKey(client.SecretAccessKey, date, client.Region, service)
	signature := hex.EncodeToString(hmacSHA256(signingKey, []byte(stringToSign)))
	req.Header.Set("Authorization", fmt.Sprintf("%s Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		algorithm,
		client.AccessKeyID,
		scope,
		strings.Join(signedHeaders, ";"),
		signature,
	))
}

func canonicalQueryString(values url.Values) string {
	if len(values) == 0 {
		return ""
	}
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(values))
	for _, key := range keys {
		vals := append([]string(nil), values[key]...)
		sort.Strings(vals)
		for _, value := range vals {
			parts = append(parts, url.QueryEscape(key)+"="+url.QueryEscape(value))
		}
	}
	return strings.Join(parts, "&")
}

func volcOpenAPISigningKey(secret, date, region, service string) []byte {
	kDate := hmacSHA256([]byte(secret), []byte(date))
	kRegion := hmacSHA256(kDate, []byte(region))
	kService := hmacSHA256(kRegion, []byte(service))
	return hmacSHA256(kService, []byte("request"))
}

func hmacSHA256(key, data []byte) []byte {
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write(data)
	return mac.Sum(nil)
}

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func normalizeProviderAssetProvider(value string) string {
	provider := strings.TrimSpace(value)
	if provider == "" {
		return persistencemodel.AIProviderKindVolcengineArk
	}
	alias := strings.ToLower(provider)
	if alias == "jimeng" || alias == "jimeng2" || alias == "seedance" {
		return persistencemodel.AIProviderKindVolcengineArk
	}
	return provider
}

func providerAssetProviderIsLegacyAlias(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "seedance2", "seedance", "jimeng", "jimeng2", "volcen", "volcengine_ark", "ark":
		return true
	default:
		return false
	}
}

func providerAssetProviderIsDefaultVolcArk(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", persistencemodel.AIProviderKindVolcengineArk:
		return true
	default:
		return false
	}
}

func normalizeVolcArkOpenAPIBaseURL(value string) string {
	baseURL := strings.TrimRight(strings.TrimSpace(value), "/")
	if baseURL == "" {
		return "https://ark.cn-beijing.volcengineapi.com"
	}
	return baseURL
}

func providerAssetName(name string, resource domainresource.RawResource) string {
	normalized := strings.TrimSpace(name)
	if normalized == "" {
		normalized = strings.TrimSpace(resource.Name)
	}
	if normalized == "" {
		normalized = fmt.Sprintf("resource-%d", resource.ID)
	}
	if len([]rune(normalized)) > 48 {
		return string([]rune(normalized)[:48])
	}
	return normalized
}

func providerAssetGroupScope(projectID string, projectName string, settingID string) string {
	projectKey := strings.TrimSpace(projectID)
	if projectKey == "" {
		projectKey = strings.TrimSpace(projectName)
	}
	settingKey := strings.TrimSpace(settingID)
	switch {
	case projectKey != "" && settingKey != "":
		return "project:" + projectKey + ":setting:" + settingKey
	case projectKey != "":
		return "project:" + projectKey
	default:
		return "global"
	}
}

func providerAssetGroupName(scope string, projectID string, projectName string, settingID string) string {
	projectLabel := strings.TrimSpace(projectName)
	if projectLabel == "" {
		projectLabel = strings.TrimSpace(projectID)
	}
	settingLabel := strings.TrimSpace(settingID)
	name := "movscript-global-aigc-assets"
	if projectLabel != "" && settingLabel != "" {
		name = "movscript-" + projectLabel + "-" + settingLabel
	} else if projectLabel != "" {
		name = "movscript-" + projectLabel + "-aigc-assets"
	} else if strings.TrimSpace(scope) != "" && scope != "global" {
		name = "movscript-" + strings.TrimSpace(scope)
	}
	return truncateProviderAssetName(providerAssetSanitizeName(name), 64)
}

func providerAssetSanitizeName(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "movscript-aigc-assets"
	}
	replacer := strings.NewReplacer("/", "-", "\\", "-", ":", "-", "\n", "-", "\r", "-", "\t", "-")
	value = replacer.Replace(value)
	for strings.Contains(value, "--") {
		value = strings.ReplaceAll(value, "--", "-")
	}
	return strings.Trim(value, "- ")
}

func truncateProviderAssetName(value string, limit int) string {
	runes := []rune(strings.TrimSpace(value))
	if len(runes) == 0 {
		return "movscript-aigc-assets"
	}
	if len(runes) <= limit {
		return string(runes)
	}
	return string(runes[:limit])
}

func decodeProviderAssetResponse(body []byte) any {
	if len(bytes.TrimSpace(body)) == 0 {
		return map[string]any{}
	}
	var decoded any
	if err := json.Unmarshal(body, &decoded); err != nil {
		return map[string]any{"_raw": string(body)}
	}
	return decoded
}

func providerAssetCertification(provider providerAssetProviderRef, sourceURL string, resourceID uint, candidateID string, arkOpenAPIBaseURL string, created map[string]any) (map[string]any, error) {
	hubAssetID := firstString(created, "id", "Id", "asset_id", "assetId", "AssetId", "hub_asset_id")
	assetURI := firstString(created, "asset_uri", "assetUri", "AssetURI", "URI", "asset_url", "assetUrl")
	if assetURI == "" && hubAssetID != "" {
		assetURI = "asset://" + hubAssetID
	}
	if assetURI == "" {
		return nil, fmt.Errorf("Volcengine Ark CreateAsset response did not include asset URI or asset ID")
	}
	rawStatus := firstString(created, "status", "Status")
	if rawStatus == "" {
		rawStatus = "processing"
	}
	now := time.Now().UTC().Format(time.RFC3339)
	cert := map[string]any{
		"provider":             provider.ProviderID,
		"provider_id":          provider.ProviderID,
		"provider_kind":        provider.ProviderKind,
		"provider_category":    provider.ProviderCategory,
		"asset_type":           "image",
		"status":               providerAssetStatus(rawStatus),
		"asset_uri":            assetURI,
		"source_resource_id":   resourceID,
		"source_url":           sourceURL,
		"source_hash":          providerAssetSourceHash(resourceID, sourceURL, candidateID),
		"certified_at":         now,
		"updated_at":           now,
		"ark_openapi_base_url": arkOpenAPIBaseURL,
		"raw_status":           rawStatus,
	}
	if hubAssetID != "" {
		cert["hub_asset_id"] = hubAssetID
	}
	if groupID := firstString(created, "asset_group_id", "GroupId", "group_id"); groupID != "" {
		cert["asset_group_id"] = groupID
	}
	if assetURL := firstString(created, "asset_url", "assetUrl"); assetURL != "" {
		cert["asset_url"] = assetURL
	}
	if strings.TrimSpace(candidateID) != "" {
		cert["source_candidate_id"] = strings.TrimSpace(candidateID)
	}
	return cert, nil
}

func providerAssetSourceHash(resourceID uint, sourceURL string, candidateID string) string {
	sum := sha256.Sum256([]byte(fmt.Sprintf("%d\x00%s\x00%s", resourceID, sourceURL, strings.TrimSpace(candidateID))))
	return hex.EncodeToString(sum[:])
}

func providerAssetStatus(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "active", "succeeded", "success", "ready", "completed", "done":
		return "active"
	case "failed", "error", "rejected":
		return "failed"
	case "stale":
		return "stale"
	case "processing", "pending", "created", "queued", "running":
		return "processing"
	default:
		return "unknown"
	}
}

func firstString(value map[string]any, keys ...string) string {
	for _, key := range keys {
		raw, ok := value[key]
		if !ok || raw == nil {
			continue
		}
		switch v := raw.(type) {
		case string:
			if strings.TrimSpace(v) != "" {
				return strings.TrimSpace(v)
			}
		case float64:
			if v == float64(int64(v)) {
				return strconv.FormatInt(int64(v), 10)
			}
			return strconv.FormatFloat(v, 'f', -1, 64)
		default:
			text := strings.TrimSpace(fmt.Sprint(v))
			if text != "" && text != "<nil>" {
				return text
			}
		}
	}
	return ""
}

func unwrapProviderAsset(payload any) map[string]any {
	asset, _ := unwrapProviderAssetAtDepth(payload, 0)
	return asset
}

func unwrapProviderAssetGroup(payload any) map[string]any {
	group, _ := unwrapProviderAssetGroupAtDepth(payload, 0)
	return group
}

func unwrapProviderAssetGroupAtDepth(payload any, depth int) (map[string]any, bool) {
	if depth > 5 || payload == nil {
		return nil, false
	}
	switch value := payload.(type) {
	case map[string]any:
		if firstString(value, "id", "Id", "group_id", "GroupId") != "" {
			return value, true
		}
		for _, key := range []string{"Data", "Result", "ResponseMetadata", "data", "result", "asset_group", "assetGroup", "group", "item", "record", "body", "payload"} {
			if found, ok := unwrapProviderAssetGroupAtDepth(value[key], depth+1); ok {
				return found, true
			}
		}
		if items, ok := value["items"].([]any); ok {
			for _, item := range items {
				if found, ok := unwrapProviderAssetGroupAtDepth(item, depth+1); ok {
					return found, true
				}
			}
		}
	case []any:
		for _, item := range value {
			if found, ok := unwrapProviderAssetGroupAtDepth(item, depth+1); ok {
				return found, true
			}
		}
	}
	return nil, false
}

func unwrapProviderAssetAtDepth(payload any, depth int) (map[string]any, bool) {
	if depth > 5 || payload == nil {
		return nil, false
	}
	switch value := payload.(type) {
	case map[string]any:
		if firstString(value, "id", "Id", "asset_id", "assetId", "AssetId", "URI", "asset_uri") != "" {
			return value, true
		}
		for _, key := range []string{"Data", "Result", "ResponseMetadata", "data", "result", "asset", "item", "record", "body", "payload"} {
			if found, ok := unwrapProviderAssetAtDepth(value[key], depth+1); ok {
				return found, true
			}
		}
		if items, ok := value["items"].([]any); ok {
			for _, item := range items {
				if found, ok := unwrapProviderAssetAtDepth(item, depth+1); ok {
					return found, true
				}
			}
		}
	case []any:
		for _, item := range value {
			if found, ok := unwrapProviderAssetAtDepth(item, depth+1); ok {
				return found, true
			}
		}
	}
	return nil, false
}

func providerAssetBusinessError(payload any) string {
	obj, ok := payload.(map[string]any)
	if !ok {
		return ""
	}
	if text := firstString(obj, "error", "Error"); text != "" {
		return text
	}
	if meta, ok := obj["ResponseMetadata"].(map[string]any); ok {
		if errObj, ok := meta["Error"].(map[string]any); ok {
			if text := firstString(errObj, "Message", "Code"); text != "" {
				return text
			}
		}
	}
	if success, ok := obj["success"].(bool); ok && !success {
		if text := firstString(obj, "message", "msg", "detail"); text != "" {
			return text
		}
		return "gateway business failure"
	}
	return ""
}

func providerAssetErrorText(decoded any, raw []byte) string {
	if msg := providerAssetBusinessError(decoded); msg != "" {
		return msg
	}
	if text := strings.TrimSpace(string(raw)); text != "" {
		if len(text) > 1000 {
			return text[:1000]
		}
		return text
	}
	return ""
}

func isPrivateProviderAssetURL(value string) bool {
	parsed, err := url.Parse(value)
	if err != nil {
		return true
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return true
	}
	host := strings.ToLower(parsed.Hostname())
	if host == "localhost" || strings.HasSuffix(host, ".localhost") {
		return true
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return false
	}
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsUnspecified()
}
