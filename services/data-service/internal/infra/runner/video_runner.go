package runner

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/movscript/movscript/internal/infra/ai"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

func (w *Worker) runVideoJob(ctx context.Context, debugCtx context.Context, job *persistencemodel.Job, params generationParams, imageData []ai.MediaData, videoData []ai.MediaData, audioData []ai.MediaData, sm *jobStateMachine, debugResult *ai.DebugCallResult) error {
	dur := job.Duration
	if dur == 0 {
		dur = params.Int("duration")
	}
	route, err := w.resolveJobModelRoute(ctx, job, job.JobType)
	if err != nil {
		return err
	}
	annotateDebugRouteContext(debugResult, route, job.JobType)
	supportsProviderAssetURI := w.routeSupportsProviderAssetURI(ctx, route)
	if debugResult != nil {
		debugResult.ResourceDiagnostics = w.providerAssetDiagnosticsForJob(ctx, job, route, supportsProviderAssetURI)
	}
	var certifiedAssets []certifiedProviderAsset
	if supportsProviderAssetURI {
		certifiedAssets = w.certifiedProviderAssetsForJob(job, route.ProviderID, route.ProviderModelID, route.ModelID)
		imageData, videoData, audioData = filterCertifiedProviderAssetMediaInputs(certifiedAssets, imageData, videoData, audioData)
	}
	// Some video routes require provider-reachable media URLs. Fail before the
	// adapter call when the route contract cannot be satisfied locally.
	resourceAccessTrace, err := w.prepareVideoInputReferencesForRouteWithTrace(job, route, imageData, videoData, audioData)
	if debugResult != nil && len(resourceAccessTrace) > 0 {
		debugResult.ResourceAccessTrace = resourceAccessTrace
	}
	if err != nil {
		return err
	}
	req := w.buildVideoRequest(job, params, dur, imageData, videoData, audioData, certifiedAssets)
	if job.ProviderTaskID != "" {
		return w.pollVideoProviderTask(ctx, debugCtx, job, dur, sm, debugResult)
	}
	if w.aiService.SupportsVideoTasksRoute(ctx, job.UserID, route) {
		return w.submitVideoProviderTask(ctx, debugCtx, job, req, sm, debugResult)
	}
	return w.callVideoProvider(ctx, debugCtx, job, req, sm, debugResult)
}

func (w *Worker) buildVideoRequest(job *persistencemodel.Job, params generationParams, dur int, imageData []ai.MediaData, videoData []ai.MediaData, audioData []ai.MediaData, certifiedAssets []certifiedProviderAsset) ai.VideoRequest {
	req := ai.VideoRequest{
		Prompt:                job.Prompt,
		Duration:              dur,
		Frames:                params.Int("frames"),
		Seed:                  params.Int64Ptr("seed"),
		AspectRatio:           firstNonEmpty(job.AspectRatio, params.String("aspect_ratio"), params.String("ratio")),
		Ratio:                 firstNonEmpty(params.String("ratio"), job.AspectRatio, params.String("aspect_ratio")),
		Quality:               params.String("quality"),
		Size:                  params.String("size"),
		ResolutionName:        firstNonEmpty(params.String("resolution"), params.String("resolution_name")),
		Preset:                params.String("preset"),
		CameraFixed:           params.BoolPtr("camera_fixed"),
		Watermark:             params.BoolPtr("watermark"),
		GenerateAudio:         params.BoolPtr("generate_audio"),
		AudioType:             params.String("audio_type"),
		ReturnLastFrame:       params.BoolPtr("return_last_frame"),
		ServiceTier:           params.String("service_tier"),
		ExecutionExpiresAfter: params.Int("execution_expires_after"),
		Workspace:             params.BoolPtr("workspace"),
		WebSearch:             params.Bool("web_search"),
		MovementAmplitude:     params.String("movement_amplitude"),
		OffPeak:               params.BoolPtr("off_peak"),
		Payload:               params.String("payload"),
		InputImageDataList:    imageData,
	}
	if len(videoData) > 0 {
		req.InputVideoData = &videoData[0]
	}
	if len(audioData) > 0 {
		req.InputAudioData = &audioData[0]
	}
	if len(certifiedAssets) > 0 {
		applyCertifiedProviderAssetsToVideoRequest(certifiedAssets, &req, imageData, videoData, audioData)
	}
	return req
}

func (w *Worker) routeSupportsProviderAssetURI(ctx context.Context, route ai.ModelRoute) bool {
	providerID := strings.TrimSpace(route.ProviderID)
	if providerID == "" || providerID == persistencemodel.ModelRouteSourceRelayGateway {
		return false
	}
	return providerTemplateSupportsAssetType(w.providerKindForAssetRoute(ctx, route), "image")
}

func (w *Worker) providerAssetDiagnosticsForJob(ctx context.Context, job *persistencemodel.Job, route ai.ModelRoute, supportsProviderAssetURI bool) []ai.ResourceDiagnostic {
	if w == nil || w.db == nil || job == nil {
		return nil
	}
	ids := parseResourceIDs(job.InputResourceIDs)
	if job.InputResourceID != nil && *job.InputResourceID != 0 && !hasUint(ids, *job.InputResourceID) {
		ids = append(ids, *job.InputResourceID)
	}
	if len(ids) == 0 {
		return nil
	}
	providerID := strings.TrimSpace(route.ProviderID)
	providerKind := strings.TrimSpace(route.ProviderKind)
	if providerKind == "" {
		providerKind = w.providerKindForAssetRoute(ctx, route)
	}
	var resources []persistencemodel.RawResource
	if err := w.db.Select("id", "type", "mime_type", "provider_asset_certifications", "provider_generated_artifact").Where("id IN ?", ids).Find(&resources).Error; err != nil {
		return nil
	}
	byID := make(map[uint]persistencemodel.RawResource, len(resources))
	for _, resource := range resources {
		byID[resource.ID] = resource
	}
	out := make([]ai.ResourceDiagnostic, 0, len(ids))
	for _, id := range ids {
		resource, ok := byID[id]
		if !ok {
			out = append(out, ai.ResourceDiagnostic{
				ResourceID:               id,
				ProviderID:               providerID,
				ProviderKind:             providerKind,
				SupportsProviderAssetURI: supportsProviderAssetURI,
				Mode:                     "unavailable",
				Reason:                   "resource_not_found",
				NextAction:               "Use an existing RawResource ID or upload the resource before generation.",
			})
			continue
		}
		out = append(out, providerAssetDiagnosticForResource(resource, providerID, providerKind, []string{route.ProviderModelID, route.ModelID}, supportsProviderAssetURI))
	}
	return out
}

func providerAssetDiagnosticForResource(resource persistencemodel.RawResource, providerID string, providerKind string, modelCandidates []string, supportsProviderAssetURI bool) ai.ResourceDiagnostic {
	modality := providerAssetResourceModality(resource)
	diagnostic := ai.ResourceDiagnostic{
		ResourceID:               resource.ID,
		ResourceType:             modality,
		ProviderID:               providerID,
		ProviderKind:             providerKind,
		SupportsProviderAssetURI: supportsProviderAssetURI,
		Mode:                     "public_url",
		Reason:                   "provider_asset_uri_not_used",
		Trust:                    providerGeneratedArtifactTrustSummary(resource.ProviderGeneratedArtifact),
	}
	if !supportsProviderAssetURI {
		diagnostic.Reason = "provider_asset_uri_unsupported_by_route_provider"
		diagnostic.NextAction = "Use a Provider that declares asset library capability, or keep this input as a normal URL/file reference."
		return diagnostic
	}
	if modality != "image" {
		diagnostic.Reason = "provider_asset_uri_unsupported_resource_type"
		diagnostic.NextAction = "Only image RawResources are currently registered as provider assets."
		return diagnostic
	}
	certification := providerAssetCertificationForProvider(resource.ProviderAssetCertifications, providerID, modelCandidates...)
	if len(certification) == 0 {
		keys, providers := providerAssetCertificationKeySummaries(resource.ProviderAssetCertifications)
		diagnostic.AvailableCertificationKeys = keys
		diagnostic.AvailableCertificationProviders = providers
		if len(providers) > 0 || len(keys) > 0 {
			diagnostic.Reason = "provider_asset_certification_provider_mismatch"
			diagnostic.NextAction = "Certify this RawResource with the current Route Provider; provider assets cannot be reused across provider account boundaries."
		} else {
			diagnostic.Reason = "missing_provider_asset_certification"
			diagnostic.NextAction = "Certify this RawResource through the provider asset library before running models that require asset:// inputs."
		}
		return diagnostic
	}
	diagnostic.CertificationProviderID = firstNonEmpty(stringValue(certification["provider_id"]), providerID)
	diagnostic.CertificationStatus = strings.TrimSpace(stringValue(certification["status"]))
	diagnostic.AssetGroupID = strings.TrimSpace(firstNonEmpty(stringValue(certification["asset_group_id"]), stringValue(certification["group_id"])))
	assetURI := assetURIFromProviderAssetCertification(certification)
	if !providerAssetCertificationActive(certification) {
		diagnostic.Reason = "provider_asset_certification_not_active"
		diagnostic.NextAction = "Wait for certification to finish, recheck provider asset status, or retry certification."
		return diagnostic
	}
	if assetURI == "" {
		diagnostic.Reason = "provider_asset_certification_missing_asset_uri"
		diagnostic.NextAction = "Retry provider asset certification so the RawResource stores an asset:// URI."
		return diagnostic
	}
	diagnostic.Mode = "provider_asset_uri"
	diagnostic.Reason = "active_provider_asset_certification"
	diagnostic.AssetURI = assetURI
	diagnostic.NextAction = ""
	return diagnostic
}

func (w *Worker) providerKindForAssetRoute(ctx context.Context, route ai.ModelRoute) string {
	providerID := strings.TrimSpace(route.ProviderID)
	if providerID == "" {
		return ""
	}
	if w != nil && w.db != nil && w.db.Migrator().HasTable(&persistencemodel.AIProvider{}) {
		var provider persistencemodel.AIProvider
		if err := w.db.WithContext(ctx).
			Select("provider_kind").
			Where("provider_id = ? AND is_enabled = true", providerID).
			First(&provider).Error; err == nil {
			return strings.TrimSpace(provider.ProviderKind)
		}
	}
	if kind, _, ok := strings.Cut(providerID, ":"); ok && providerTemplateSupportsAssetType(kind, "image") {
		return strings.TrimSpace(kind)
	}
	return ""
}

func providerTemplateSupportsAssetType(providerKind string, assetType string) bool {
	providerKind = strings.TrimSpace(providerKind)
	assetType = strings.ToLower(strings.TrimSpace(assetType))
	if providerKind == "" || assetType == "" {
		return false
	}
	for _, template := range ai.ProviderTemplates() {
		if strings.TrimSpace(template.ProviderKind) != providerKind {
			continue
		}
		if !boolMapValue(template.Capabilities, "asset_library") {
			return false
		}
		return anyStringListContains(template.AssetLibraryCapabilities["asset_types"], assetType)
	}
	return false
}

func applyCertifiedProviderAssetsToVideoRequest(certifiedAssets []certifiedProviderAsset, req *ai.VideoRequest, imageData []ai.MediaData, videoData []ai.MediaData, audioData []ai.MediaData) {
	if len(certifiedAssets) == 0 {
		return
	}
	imageIDs := mediaResourceIDSet(imageData)
	videoIDs := mediaResourceIDSet(videoData)
	audioIDs := mediaResourceIDSet(audioData)
	mappedImageIDs := map[uint]bool{}
	mappedVideoIDs := map[uint]bool{}
	mappedAudioIDs := map[uint]bool{}
	for _, asset := range certifiedAssets {
		assetURI := strings.TrimSpace(asset.AssetURI)
		if !strings.HasPrefix(assetURI, "asset://") {
			continue
		}
		switch providerAssetModality(asset, imageIDs, videoIDs, audioIDs) {
		case "video":
			if req.InputVideo == "" {
				req.InputVideo = assetURI
			}
			mappedVideoIDs[asset.ResourceID] = true
		case "audio":
			if req.InputAudio == "" {
				req.InputAudio = assetURI
			}
			mappedAudioIDs[asset.ResourceID] = true
		default:
			if !hasString(req.InputImages, assetURI) {
				req.InputImages = append(req.InputImages, assetURI)
			}
			mappedImageIDs[asset.ResourceID] = true
		}
	}
	if len(mappedImageIDs) > 0 {
		req.InputImageDataList = filterUnmappedMediaData(req.InputImageDataList, mappedImageIDs)
	}
	if req.InputVideoData != nil && mappedVideoIDs[req.InputVideoData.ResourceID] {
		req.InputVideoData = nil
	}
	if req.InputAudioData != nil && mappedAudioIDs[req.InputAudioData.ResourceID] {
		req.InputAudioData = nil
	}
}

func filterCertifiedProviderAssetMediaInputs(certifiedAssets []certifiedProviderAsset, imageData []ai.MediaData, videoData []ai.MediaData, audioData []ai.MediaData) ([]ai.MediaData, []ai.MediaData, []ai.MediaData) {
	if len(certifiedAssets) == 0 {
		return imageData, videoData, audioData
	}
	imageIDs := mediaResourceIDSet(imageData)
	videoIDs := mediaResourceIDSet(videoData)
	audioIDs := mediaResourceIDSet(audioData)
	mappedImageIDs := map[uint]bool{}
	mappedVideoIDs := map[uint]bool{}
	mappedAudioIDs := map[uint]bool{}
	for _, asset := range certifiedAssets {
		if !strings.HasPrefix(strings.TrimSpace(asset.AssetURI), "asset://") {
			continue
		}
		switch providerAssetModality(asset, imageIDs, videoIDs, audioIDs) {
		case "video":
			mappedVideoIDs[asset.ResourceID] = true
		case "audio":
			mappedAudioIDs[asset.ResourceID] = true
		default:
			mappedImageIDs[asset.ResourceID] = true
		}
	}
	return filterUnmappedMediaData(imageData, mappedImageIDs), filterUnmappedMediaData(videoData, mappedVideoIDs), filterUnmappedMediaData(audioData, mappedAudioIDs)
}

type certifiedProviderAsset struct {
	ResourceID uint
	ProviderID string
	AssetURI   string
	Modality   string
}

func (w *Worker) certifiedProviderAssetsForJob(job *persistencemodel.Job, providerID string, modelCandidates ...string) []certifiedProviderAsset {
	if w == nil || w.db == nil || job == nil {
		return nil
	}
	providerID = strings.TrimSpace(providerID)
	if providerID == "" {
		return nil
	}
	ids := parseResourceIDs(job.InputResourceIDs)
	if job.InputResourceID != nil && *job.InputResourceID != 0 && !hasUint(ids, *job.InputResourceID) {
		ids = append(ids, *job.InputResourceID)
	}
	if len(ids) == 0 {
		return nil
	}
	var resources []persistencemodel.RawResource
	if err := w.db.Select("id", "type", "mime_type", "provider_asset_certifications").Where("id IN ?", ids).Find(&resources).Error; err != nil {
		return nil
	}
	byID := make(map[uint]persistencemodel.RawResource, len(resources))
	for _, resource := range resources {
		byID[resource.ID] = resource
	}
	out := make([]certifiedProviderAsset, 0, len(resources))
	for _, id := range ids {
		resource, ok := byID[id]
		if !ok {
			continue
		}
		modality := providerAssetResourceModality(resource)
		if modality != "image" {
			continue
		}
		assetURI := w.activeProviderAssetURIForResource(resource.ID, resource.ProviderAssetCertifications, providerID, modelCandidates...)
		if assetURI == "" {
			continue
		}
		out = append(out, certifiedProviderAsset{
			ResourceID: resource.ID,
			ProviderID: providerID,
			AssetURI:   assetURI,
			Modality:   modality,
		})
	}
	return out
}

func (w *Worker) activeProviderAssetURIForResource(resourceID uint, legacyCertifications string, providerID string, modelCandidates ...string) string {
	if w != nil && w.db != nil && w.db.Migrator().HasTable(&persistencemodel.ProviderAsset{}) && w.db.Migrator().HasTable(&persistencemodel.ProviderAssetModelCertification{}) {
		if assetURI := w.activeProviderAssetURIFromReadModel(resourceID, providerID, modelCandidates...); assetURI != "" {
			return assetURI
		}
	}
	return activeProviderAssetURI(legacyCertifications, providerID, modelCandidates...)
}

func (w *Worker) activeProviderAssetURIFromReadModel(resourceID uint, providerID string, modelCandidates ...string) string {
	providerID = strings.TrimSpace(providerID)
	if resourceID == 0 || providerID == "" || w == nil || w.db == nil {
		return ""
	}
	models := normalizedProviderAssetModels(modelCandidates...)
	for _, model := range models {
		if assetURI := w.findActiveProviderAssetURI(resourceID, providerID, model); assetURI != "" {
			return assetURI
		}
	}
	if len(models) == 0 {
		return w.findActiveProviderAssetURI(resourceID, providerID, "")
	}
	return ""
}

func (w *Worker) findActiveProviderAssetURI(resourceID uint, providerID string, model string) string {
	var row struct {
		AssetURI string
	}
	query := w.db.Table("provider_assets AS pa").
		Select("pa.asset_uri").
		Joins("JOIN provider_asset_model_certifications AS cert ON cert.provider_asset_id = pa.id").
		Where("pa.deleted_at IS NULL AND cert.deleted_at IS NULL").
		Where("pa.provider_id = ? AND cert.provider_id = ?", providerID, providerID).
		Where("pa.source_resource_id = ?", resourceID).
		Where("pa.status = ? AND cert.status = ?", persistencemodel.ProviderAssetStatusActive, persistencemodel.ProviderAssetStatusActive).
		Where("pa.asset_uri <> ''")
	if strings.TrimSpace(model) != "" {
		query = query.Where("cert.public_model_id = ? OR cert.provider_model_id = ?", model, model)
	}
	if err := query.Order("cert.updated_at DESC, pa.updated_at DESC").Limit(1).Scan(&row).Error; err != nil {
		return ""
	}
	return strings.TrimSpace(row.AssetURI)
}

func activeProviderAssetURI(raw string, providerID string, modelCandidates ...string) string {
	certification := providerAssetCertificationForProvider(raw, providerID, modelCandidates...)
	if !providerAssetCertificationActive(certification) {
		return ""
	}
	return assetURIFromProviderAssetCertification(certification)
}

func assetURIFromProviderAssetCertification(certification map[string]any) string {
	if assetURI := stringValue(certification["asset_uri"]); strings.HasPrefix(strings.TrimSpace(assetURI), "asset://") {
		return strings.TrimSpace(assetURI)
	}
	if hubAssetID := stringValue(certification["hub_asset_id"]); strings.TrimSpace(hubAssetID) != "" {
		return "asset://" + strings.TrimSpace(hubAssetID)
	}
	return ""
}

func providerAssetCertificationForProvider(raw string, providerID string, modelCandidates ...string) map[string]any {
	raw = strings.TrimSpace(raw)
	providerID = strings.TrimSpace(providerID)
	if raw == "" || raw == "{}" || raw == "null" {
		return nil
	}
	if providerID == "" {
		return nil
	}
	var certifications map[string]any
	if err := json.Unmarshal([]byte(raw), &certifications); err != nil {
		return nil
	}
	models := normalizedProviderAssetModels(modelCandidates...)
	if len(models) == 0 {
		if certification := mapValue(certifications[providerID]); len(certification) > 0 {
			return certification
		}
		for _, value := range certifications {
			certification := mapValue(value)
			if strings.TrimSpace(stringValue(certification["provider_id"])) == providerID {
				return certification
			}
		}
		return nil
	}
	var legacy map[string]any
	if certification := mapValue(certifications[providerID]); len(certification) > 0 {
		if providerAssetCertificationHasModel(certification, models) {
			return certification
		}
		if providerAssetCertificationModel(certification) == "" {
			legacy = certification
		}
	}
	for _, value := range certifications {
		certification := mapValue(value)
		if strings.TrimSpace(stringValue(certification["provider_id"])) != providerID {
			continue
		}
		if providerAssetCertificationHasModel(certification, models) {
			return certification
		}
		if legacy == nil && providerAssetCertificationModel(certification) == "" {
			legacy = certification
		}
	}
	return legacy
}

func normalizedProviderAssetModels(values ...string) []string {
	out := make([]string, 0, len(values))
	seen := map[string]bool{}
	for _, value := range values {
		model := strings.TrimSpace(value)
		if model == "" || seen[model] {
			continue
		}
		out = append(out, model)
		seen[model] = true
	}
	return out
}

func providerAssetCertificationModel(certification map[string]any) string {
	return strings.TrimSpace(firstNonEmpty(
		stringValue(certification["model"]),
		stringValue(certification["provider_model_id"]),
		stringValue(certification["public_model_id"]),
	))
}

func providerAssetCertificationHasModel(certification map[string]any, models []string) bool {
	certModel := providerAssetCertificationModel(certification)
	for _, model := range models {
		if certModel == model {
			return true
		}
	}
	return false
}

func providerAssetCertificationKeySummaries(raw string) ([]string, []string) {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "{}" || raw == "null" {
		return nil, nil
	}
	var certifications map[string]any
	if err := json.Unmarshal([]byte(raw), &certifications); err != nil {
		return nil, nil
	}
	keys := make([]string, 0, len(certifications))
	providers := make([]string, 0, len(certifications))
	seenProviders := map[string]bool{}
	for key, value := range certifications {
		if key = strings.TrimSpace(key); key != "" {
			keys = append(keys, key)
		}
		certification := mapValue(value)
		providerID := strings.TrimSpace(stringValue(certification["provider_id"]))
		if providerID != "" && !seenProviders[providerID] {
			providers = append(providers, providerID)
			seenProviders[providerID] = true
		}
	}
	return keys, providers
}

func providerGeneratedArtifactTrustSummary(raw string) map[string]any {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "{}" || raw == "null" {
		return nil
	}
	var metadata map[string]any
	if err := json.Unmarshal([]byte(raw), &metadata); err != nil {
		return nil
	}
	out := map[string]any{}
	for _, key := range []string{
		"origin_provider_id",
		"origin_provider_kind",
		"origin_provider_model_id",
		"origin_route_binding_id",
		"original_provider_artifact",
		"derivation_state",
		"trust_claim",
		"provider_trust",
	} {
		if value, ok := metadata[key]; ok {
			out[key] = value
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func providerAssetCertificationActive(certification map[string]any) bool {
	return strings.EqualFold(strings.TrimSpace(stringValue(certification["status"])), "active")
}

func providerAssetResourceModality(resource persistencemodel.RawResource) string {
	switch strings.ToLower(strings.TrimSpace(resource.Type)) {
	case "image", "video", "audio":
		return strings.ToLower(strings.TrimSpace(resource.Type))
	}
	return typeFromMime(resource.MimeType)
}

func mediaResourceIDSet(items []ai.MediaData) map[uint]bool {
	out := make(map[uint]bool, len(items))
	for _, item := range items {
		if item.ResourceID != 0 {
			out[item.ResourceID] = true
		}
	}
	return out
}

func providerAssetModality(asset certifiedProviderAsset, imageIDs map[uint]bool, videoIDs map[uint]bool, audioIDs map[uint]bool) string {
	value := strings.ToLower(strings.TrimSpace(asset.Modality))
	switch value {
	case "image", "video", "audio":
		return value
	}
	if videoIDs[asset.ResourceID] {
		return "video"
	}
	if audioIDs[asset.ResourceID] {
		return "audio"
	}
	if imageIDs[asset.ResourceID] {
		return "image"
	}
	return "image"
}

func filterUnmappedMediaData(items []ai.MediaData, mappedIDs map[uint]bool) []ai.MediaData {
	out := items[:0]
	for _, item := range items {
		if item.ResourceID != 0 && mappedIDs[item.ResourceID] {
			continue
		}
		out = append(out, item)
	}
	return out
}

func hasString(items []string, value string) bool {
	for _, item := range items {
		if item == value {
			return true
		}
	}
	return false
}

func hasUint(items []uint, value uint) bool {
	for _, item := range items {
		if item == value {
			return true
		}
	}
	return false
}

func stringValue(value any) string {
	if s, ok := value.(string); ok {
		return s
	}
	return ""
}

func mapValue(value any) map[string]any {
	if value == nil {
		return nil
	}
	if m, ok := value.(map[string]any); ok {
		return m
	}
	return nil
}

func boolMapValue(values map[string]any, key string) bool {
	if values == nil {
		return false
	}
	switch value := values[key].(type) {
	case bool:
		return value
	case string:
		return strings.EqualFold(strings.TrimSpace(value), "true")
	default:
		return false
	}
}

func anyStringListContains(value any, expected string) bool {
	expected = strings.ToLower(strings.TrimSpace(expected))
	switch items := value.(type) {
	case []string:
		for _, item := range items {
			if strings.ToLower(strings.TrimSpace(item)) == expected {
				return true
			}
		}
	case []any:
		for _, item := range items {
			if strings.ToLower(strings.TrimSpace(stringValue(item))) == expected {
				return true
			}
		}
	}
	return false
}

func (w *Worker) pollVideoProviderTask(ctx context.Context, debugCtx context.Context, job *persistencemodel.Job, duration int, sm *jobStateMachine, debugResult *ai.DebugCallResult) error {
	sm.enter(StatePollingProviderTask, fmt.Sprintf("poll provider task %s", job.ProviderTaskID))
	if err := w.abortIfCancelled(ctx, job, sm); err != nil {
		return err
	}
	resp, err := callProviderWithTimeout(debugCtx, providerPollTimeout, func(ctx context.Context) (ai.VideoResponse, error) {
		route, err := w.resolveJobModelRoute(ctx, job, job.JobType)
		if err != nil {
			return ai.VideoResponse{}, err
		}
		return w.aiService.CallVideoPollWithRouteUsage(ctx, job.UserID, route, job.ProviderTaskID, job.ProviderTaskKind, duration, w.usageContext(job))
	})
	w.saveDebugInfo(job, debugResult)
	w.appendProviderTaskEvent(job, "poll", resp, err)
	if err := w.abortIfCancelled(ctx, job, sm); err != nil {
		return err
	}
	if err != nil {
		if resp.Status == ai.VideoStatusFailed {
			w.markProviderTaskFailed(job, resp, err)
			sm.fail(fmt.Errorf("%s", firstNonEmpty(resp.Message, err.Error())))
			return nil
		}
		sm.succeed("provider poll deferred")
		w.scheduleProviderPoll(job, firstNonEmpty(resp.Message, err.Error()), sm)
		return nil
	}
	sm.succeed(firstNonEmpty(resp.Status, "provider task polled"))
	switch resp.Status {
	case ai.VideoStatusSucceeded:
		if err := w.abortIfCancelled(ctx, job, sm); err != nil {
			return err
		}
		return w.completeVideoSuccess(ctx, job, resp, sm, debugResult)
	case ai.VideoStatusCancelled:
		w.markProviderTaskCancelled(job, resp, firstNonEmpty(resp.Message, "video generation cancelled"))
		sm.cancel(firstNonEmpty(resp.Message, "provider task cancelled"))
		return nil
	case ai.VideoStatusFailed:
		w.markProviderTaskFailed(job, resp, fmt.Errorf("%s", firstNonEmpty(resp.Message, "video generation failed")))
		sm.fail(fmt.Errorf("%s", firstNonEmpty(resp.Message, "video generation failed")))
		return nil
	default:
		w.scheduleProviderPoll(job, firstNonEmpty(resp.Status, "provider task still running"), sm)
		return nil
	}
}

func (w *Worker) submitVideoProviderTask(ctx context.Context, debugCtx context.Context, job *persistencemodel.Job, req ai.VideoRequest, sm *jobStateMachine, debugResult *ai.DebugCallResult) error {
	sm.enter(StateSubmittingProviderTask, "submit async video provider task")
	resp, err := callProviderWithTimeout(debugCtx, providerCallTimeout, func(ctx context.Context) (ai.VideoResponse, error) {
		route, err := w.resolveJobModelRoute(ctx, job, job.JobType)
		if err != nil {
			return ai.VideoResponse{}, err
		}
		return w.aiService.CallVideoStartWithRouteUsage(ctx, job.UserID, route, req, w.usageContext(job))
	})
	w.saveDebugInfo(job, debugResult)
	w.appendProviderTaskEvent(job, "submit", resp, err)
	if err != nil {
		return fmt.Errorf("video task submission: %w", err)
	}
	sm.succeed("video provider accepted task")
	if w.isJobCancelled(job.ID) {
		job.ProviderTaskID = resp.TaskID
		job.ProviderTaskKind = resp.TaskKind
		if resp.TaskID != "" {
			cancelResp, cancelErr := w.cancelProviderTask(ctx, job, resp.TaskID, resp.TaskKind)
			w.appendProviderTaskEvent(job, "cancel_after_submit", cancelResp, cancelErr)
		}
		sm.cancel("job cancelled after provider task submission")
		return errJobCancelled
	}
	if resp.URL != "" || len(resp.ContentBytes) > 0 {
		if err := w.abortIfCancelled(ctx, job, sm); err != nil {
			return err
		}
		return w.completeVideoSuccess(ctx, job, resp, sm, debugResult)
	}
	if resp.TaskID == "" {
		return fmt.Errorf("video provider accepted task but returned no task ID")
	}
	w.scheduleSubmittedProviderTask(job, resp, sm)
	return nil
}

func (w *Worker) callVideoProvider(ctx context.Context, debugCtx context.Context, job *persistencemodel.Job, req ai.VideoRequest, sm *jobStateMachine, debugResult *ai.DebugCallResult) error {
	sm.enter(StateCallingProvider, "call video provider")
	if err := w.abortIfCancelled(ctx, job, sm); err != nil {
		return err
	}
	route, err := w.resolveJobModelRoute(ctx, job, job.JobType)
	if err != nil {
		return err
	}
	annotateDebugRouteContext(debugResult, route, job.JobType)
	resp, err := callProviderWithTimeout(debugCtx, providerCallTimeout, func(ctx context.Context) (ai.VideoResponse, error) {
		return w.aiService.CallVideoWithRouteUsage(ctx, job.UserID, route, req, w.usageContext(job))
	})
	if err != nil {
		w.saveDebugInfo(job, debugResult)
		return fmt.Errorf("video generation: %w", err)
	}
	sm.succeed("video provider returned")
	return w.completeVideoSuccess(ctx, job, resp, sm, debugResult)
}
