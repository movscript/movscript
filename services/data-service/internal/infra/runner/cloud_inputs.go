package runner

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"

	adminsettings "github.com/movscript/movscript/internal/app/admin/settings"
	"github.com/movscript/movscript/internal/infra/ai"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/infra/upload"
	"log"
	"strconv"
	"time"
)

func (w *Worker) prepareImageInputReferences(job *persistencemodel.Job, mediaList []ai.MediaData) string {
	if len(mediaList) == 0 {
		return ""
	}

	switch w.modelAdapterTypeForJob(job) {
	case ai.AdapterVolcen, ai.AdapterKling:
		// These generation APIs accept provider-readable URLs for reference media.
		// Volcen Files API file_id is supported by Responses multimodal input, but
		// not by the Seedream / Seedance generation endpoints used here.
		w.preparePublicMediaReferences(job, mediaList)
		return ""
	default:
		// OpenAI-compatible image edit paths can consume a provider Files API ID.
		if cloudResult, _ := w.ensureCloudUpload(job, mediaList[0], false); cloudResult.FileID != "" {
			mediaList[0].CloudFileID = cloudResult.FileID
			return cloudResult.FileID
		} else if cloudResult.URL != "" {
			mediaList[0].PresignedURL = cloudResult.URL
		}
		w.preparePublicMediaReferences(job, mediaList)
		return ""
	}
}

// prepareVideoInputReferences uploads reference videos, audio, and any additional
// reference images to the configured public object relay so Volcen/Kling-style video APIs
// that only accept URLs can reach them. The Seedance contents/generations/tasks
// endpoint rejects base64 for video_url entirely, so this must succeed for any
// v2v or multimodal-reference call against Volcen.
func (w *Worker) prepareVideoInputReferences(job *persistencemodel.Job, imageData, videoData, audioData []ai.MediaData) {
	if route, ok := w.catalogRouteForJob(context.Background(), job); ok {
		_ = w.prepareVideoInputReferencesForRoute(job, route, imageData, videoData, audioData)
		return
	}
	if len(imageData) == 0 && len(videoData) == 0 && len(audioData) == 0 {
		return
	}
	if !w.videoRouteRequiresPublicMediaReferences(job) {
		return
	}
	w.preparePublicVideoMediaReferences(job, imageData, videoData, audioData)
}

func (w *Worker) prepareVideoInputReferencesForRoute(job *persistencemodel.Job, route ai.ModelRoute, imageData, videoData, audioData []ai.MediaData) error {
	_, err := w.prepareVideoInputReferencesForRouteWithTrace(job, route, imageData, videoData, audioData)
	return err
}

func (w *Worker) prepareVideoInputReferencesForRouteWithTrace(job *persistencemodel.Job, route ai.ModelRoute, imageData, videoData, audioData []ai.MediaData) ([]ai.ResourceAccessTrace, error) {
	if len(imageData) == 0 && len(videoData) == 0 && len(audioData) == 0 {
		return nil, nil
	}
	requirements := ai.AdapterOperationPublicURLRequirements(w.adapterTypeForRoute(route), route.Capability, route.Operation)
	if !w.videoRouteRequiresPublicMediaReferencesForRoute(route) && !requirements.Image && !requirements.Video {
		return nil, nil
	}
	traces := w.preparePublicVideoMediaReferencesWithTrace(job, imageData, videoData, audioData)
	if requirements.Image {
		if err := requirePreparedPublicMediaURLs("image", route, imageData); err != nil {
			return traces, err
		}
	}
	if requirements.Video {
		if err := requirePreparedPublicMediaURLs("video", route, videoData); err != nil {
			return traces, err
		}
	}
	if requirements.Audio {
		if err := requirePreparedPublicMediaURLs("audio", route, audioData); err != nil {
			return traces, err
		}
	}
	return traces, nil
}

func (w *Worker) preparePublicVideoMediaReferences(job *persistencemodel.Job, imageData, videoData, audioData []ai.MediaData) {
	_ = w.preparePublicVideoMediaReferencesWithTrace(job, imageData, videoData, audioData)
}

func (w *Worker) preparePublicVideoMediaReferencesWithTrace(job *persistencemodel.Job, imageData, videoData, audioData []ai.MediaData) []ai.ResourceAccessTrace {
	var traces []ai.ResourceAccessTrace
	if len(imageData) > 0 {
		traces = append(traces, w.preparePublicMediaReferencesWithTrace(job, imageData, "image")...)
	}
	if len(videoData) > 0 {
		traces = append(traces, w.preparePublicMediaReferencesWithTrace(job, videoData, "video")...)
	}
	if len(audioData) > 0 {
		traces = append(traces, w.preparePublicMediaReferencesWithTrace(job, audioData, "audio")...)
	}
	return traces
}

func (w *Worker) videoRouteRequiresPublicMediaReferences(job *persistencemodel.Job) bool {
	route, ok := w.catalogRouteForJob(context.Background(), job)
	if !ok {
		return false
	}
	return w.videoRouteRequiresPublicMediaReferencesForRoute(route)
}

func (w *Worker) videoRouteRequiresPublicMediaReferencesForRoute(route ai.ModelRoute) bool {
	requirements := ai.AdapterOperationPublicURLRequirements(w.adapterTypeForRoute(route), route.Capability, route.Operation)
	if requirements.Image || requirements.Video || requirements.Audio {
		return true
	}
	switch w.adapterTypeForRoute(route) {
	case ai.AdapterVolcen, ai.AdapterDashScope, ai.AdapterVidu, ai.AdapterYunwuUnifiedVideo:
		return true
	}
	return false
}

func requirePreparedPublicMediaURLs(kind string, route ai.ModelRoute, mediaList []ai.MediaData) error {
	for _, media := range mediaList {
		if media.PresignedURL != "" {
			continue
		}
		resource := "input resource"
		if media.ResourceID != 0 {
			resource = fmt.Sprintf("resource #%d", media.ResourceID)
		}
		return fmt.Errorf("route %d requires public %s URL for %s; configure resource access public URL or object relay before generation", route.RouteBindingID, kind, resource)
	}
	return nil
}

func (w *Worker) preparePublicMediaReferences(job *persistencemodel.Job, mediaList []ai.MediaData) {
	_ = w.preparePublicMediaReferencesWithTrace(job, mediaList, "")
}

func (w *Worker) preparePublicMediaReferencesWithTrace(job *persistencemodel.Job, mediaList []ai.MediaData, resourceType string) []ai.ResourceAccessTrace {
	traces := make([]ai.ResourceAccessTrace, 0, len(mediaList))
	for i := range mediaList {
		trace := newRunnerResourceAccessTrace(mediaList[i], resourceType)
		if mediaList[i].PresignedURL != "" {
			trace.Source = "existing_public_url"
			trace.Status = "resolved"
			trace = annotateRunnerResourceAccessURL(trace, mediaList[i].PresignedURL)
			traces = append(traces, trace)
			continue
		}
		accessURL, accessTrace := w.resourceAccessPublicURLWithTrace(mediaList[i], resourceType)
		if accessTrace.Status != "" {
			trace = accessTrace
		}
		if accessURL != "" {
			mediaList[i].PresignedURL = accessURL
			traces = append(traces, trace)
			continue
		}
		if cloudResult, _ := w.ensureCloudUpload(job, mediaList[i], true); cloudResult.URL != "" {
			mediaList[i].PresignedURL = cloudResult.URL
			trace.Source = "cloud_upload"
			trace.Status = "resolved"
			trace = annotateRunnerResourceAccessURL(trace, cloudResult.URL)
			traces = append(traces, trace)
			continue
		}
		mediaList[i].PresignedURL = ""
		if trace.Source == "" {
			trace.Source = "resource_access_profile"
		}
		if trace.Status == "" || trace.Status == "skipped" {
			trace.Status = "unresolved"
		}
		if trace.Error == "" {
			trace.Error = "public_url_unavailable"
		}
		traces = append(traces, trace)
	}
	return traces
}

func (w *Worker) resourceAccessPublicURL(media ai.MediaData) string {
	accessURL, _ := w.resourceAccessPublicURLWithTrace(media, "")
	return accessURL
}

func (w *Worker) resourceAccessPublicURLWithTrace(media ai.MediaData, resourceType string) (string, ai.ResourceAccessTrace) {
	trace := newRunnerResourceAccessTrace(media, resourceType)
	trace.Source = "resource_access_profile"
	if media.ResourceID == 0 {
		trace.Status = "skipped"
		trace.Error = "resource_id_required"
		return "", trace
	}
	if w == nil || w.db == nil {
		trace.Status = "unavailable"
		trace.Error = "resource_access_database_unavailable"
		return "", trace
	}
	if !w.db.Migrator().HasTable(&persistencemodel.AdminSetting{}) {
		trace.Status = "missing_profile"
		trace.Error = "missing_resource_access_profile"
		return "", trace
	}
	settings, err := adminsettings.NewService(w.db, hex.EncodeToString(w.encryptionKey)).ResourceAccessSettings(context.Background())
	if err != nil {
		log.Printf("[job] resource access settings unavailable for resource #%d: %v", media.ResourceID, err)
		trace.Status = "unavailable"
		trace.Error = err.Error()
		return "", trace
	}
	profile, ok := selectRunnerResourceAccessProfile(settings)
	if !ok {
		trace.Status = "missing_profile"
		trace.Error = "missing_resource_access_profile"
		return "", trace
	}
	trace.ProfileID = strings.TrimSpace(profile.ID)
	trace.ProfileMode = strings.TrimSpace(profile.Mode)
	accessURL, err := signedRunnerResourceAccessURL(profile, media.ResourceID)
	if err != nil {
		log.Printf("[job] resource access URL unavailable for resource #%d: %v", media.ResourceID, err)
		trace.Status = "error"
		trace.Error = err.Error()
		return "", trace
	}
	trace.Status = "resolved"
	trace = annotateRunnerResourceAccessURL(trace, accessURL)
	return accessURL, trace
}

func newRunnerResourceAccessTrace(media ai.MediaData, resourceType string) ai.ResourceAccessTrace {
	mediaType := strings.TrimSpace(media.MimeType)
	if resourceType == "" {
		resourceType = runnerResourceTypeFromMime(mediaType)
	}
	return ai.ResourceAccessTrace{
		ResourceID:   media.ResourceID,
		ResourceType: strings.TrimSpace(resourceType),
		MediaType:    mediaType,
		Transport:    "public_url",
	}
}

func runnerResourceTypeFromMime(mimeType string) string {
	switch {
	case strings.HasPrefix(strings.ToLower(strings.TrimSpace(mimeType)), "image/"):
		return "image"
	case strings.HasPrefix(strings.ToLower(strings.TrimSpace(mimeType)), "video/"):
		return "video"
	case strings.HasPrefix(strings.ToLower(strings.TrimSpace(mimeType)), "audio/"):
		return "audio"
	default:
		return ""
	}
}

func annotateRunnerResourceAccessURL(trace ai.ResourceAccessTrace, accessURL string) ai.ResourceAccessTrace {
	parsed, err := url.Parse(strings.TrimSpace(accessURL))
	if err != nil {
		return trace
	}
	trace.URLHost = parsed.Host
	trace.URLPath = parsed.EscapedPath()
	if expires := strings.TrimSpace(parsed.Query().Get("expires")); expires != "" {
		if value, err := strconv.ParseInt(expires, 10, 64); err == nil {
			trace.ExpiresAt = value
		}
	}
	return trace
}

func selectRunnerResourceAccessProfile(settings adminsettings.ResourceAccessSettings) (adminsettings.ResourceAccessProfile, bool) {
	profileID := strings.TrimSpace(settings.DefaultProfileID)
	for _, profile := range settings.Profiles {
		if !profile.Enabled {
			continue
		}
		if profileID != "" && profile.ID != profileID {
			continue
		}
		if runnerResourceAccessProfileSupportsPublicURL(profile) {
			return profile, true
		}
	}
	if profileID != "" {
		return adminsettings.ResourceAccessProfile{}, false
	}
	for _, profile := range settings.Profiles {
		if profile.Enabled && runnerResourceAccessProfileSupportsPublicURL(profile) {
			return profile, true
		}
	}
	return adminsettings.ResourceAccessProfile{}, false
}

func runnerResourceAccessProfileSupportsPublicURL(profile adminsettings.ResourceAccessProfile) bool {
	return profile.Mode == "public_tunnel" || profile.Mode == "public_backend" || profile.Mode == "object_relay"
}

func signedRunnerResourceAccessURL(profile adminsettings.ResourceAccessProfile, resourceID uint) (string, error) {
	if strings.TrimSpace(profile.PublicBaseURL) == "" {
		return "", fmt.Errorf("resource access profile public_base_url is required")
	}
	if strings.TrimSpace(profile.SigningSecret) == "" {
		return "", fmt.Errorf("resource access profile signing_secret is required")
	}
	expiresSeconds := profile.ExpiresSeconds
	if expiresSeconds <= 0 {
		expiresSeconds = 3600
	}
	expires := time.Now().Add(time.Duration(expiresSeconds) * time.Second).UTC().Unix()
	signature := signRunnerResourceAccessURL(profile, resourceID, expires)
	if signature == "" {
		return "", fmt.Errorf("resource access signature could not be created")
	}
	return fmt.Sprintf("%s/api/v1/resource-access/resources/%d/file?expires=%d&profile=%s&signature=%s",
		strings.TrimRight(profile.PublicBaseURL, "/"),
		resourceID,
		expires,
		url.QueryEscape(profile.ID),
		url.QueryEscape(signature),
	), nil
}

func signRunnerResourceAccessURL(profile adminsettings.ResourceAccessProfile, resourceID uint, expires int64) string {
	secret := strings.TrimSpace(profile.SigningSecret)
	if secret == "" {
		return ""
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(fmt.Sprintf("resource_access:%s:%d:%d", profile.ID, resourceID, expires)))
	return hex.EncodeToString(mac.Sum(nil))
}

func (w *Worker) modelAdapterTypeForJob(job *persistencemodel.Job) string {
	if job == nil {
		return ""
	}
	if route, ok := w.catalogRouteForJob(context.Background(), job); ok {
		if adapterType := w.adapterTypeForRoute(route); adapterType != "" {
			return adapterType
		}
	}
	return ""
}

func (w *Worker) catalogRouteForJob(ctx context.Context, job *persistencemodel.Job) (ai.ModelRoute, bool) {
	if w == nil || w.aiService == nil || job == nil || !jobHasCatalogRouteMetadata(job) {
		return ai.ModelRoute{}, false
	}
	route, err := w.resolveJobModelRoute(ctx, job, job.JobType)
	if err != nil {
		return ai.ModelRoute{}, false
	}
	return route, true
}

func jobHasCatalogRouteMetadata(job *persistencemodel.Job) bool {
	if job == nil {
		return false
	}
	return (job.AIModelCatalogEntryID != nil && *job.AIModelCatalogEntryID != 0) || (job.RouteBindingID != nil && *job.RouteBindingID != 0)
}

func (w *Worker) adapterTypeForRoute(route ai.ModelRoute) string {
	if adapterType := strings.TrimSpace(route.AdapterType); adapterType != "" {
		return adapterType
	}
	if route.CredentialID != 0 && w != nil && w.db != nil && w.db.Migrator().HasTable(&persistencemodel.AICredential{}) {
		var cred persistencemodel.AICredential
		if err := w.db.Where("id = ? AND deleted_at IS NULL", route.CredentialID).First(&cred).Error; err == nil {
			return cred.AdapterType
		}
	}
	return route.SourceType
}

// ensureCloudUpload checks the resource's CloudUploads cache; if no valid entry exists,
// uploads via the provider Files API or configured cloud backends and caches the result.
// Returns zero-value UploadResult if no uploader is enabled or upload fails.
func (w *Worker) ensureCloudUpload(job *persistencemodel.Job, media ai.MediaData, requirePublicURL bool) (upload.UploadResult, uint) {
	// Find the resource ID for this media data (first input resource).
	resourceID := media.ResourceID
	if resourceID == 0 {
		ids := parseResourceIDs(job.InputResourceIDs)
		if job.InputResourceID != nil && len(ids) == 0 {
			ids = []uint{*job.InputResourceID}
		}
		if len(ids) == 0 {
			return upload.UploadResult{}, 0
		}
		resourceID = ids[0]
	}

	var resource persistencemodel.RawResource
	if err := w.db.First(&resource, resourceID).Error; err != nil {
		return upload.UploadResult{}, 0
	}

	// Parse existing cloud uploads cache.
	type cacheEntry struct {
		FileID     string    `json:"file_id,omitempty"`
		URL        string    `json:"url,omitempty"`
		UploadedAt time.Time `json:"uploaded_at"`
	}
	cache := map[string]cacheEntry{}
	if resource.CloudUploads != "" && resource.CloudUploads != "{}" {
		_ = json.Unmarshal([]byte(resource.CloudUploads), &cache)
	}

	// Check if any cached entry is still valid (not older than 24h for file IDs, 7 days for URLs).
	// When a provider file ID is allowed, prefer it over cached public URLs to avoid sending media again.
	if !requirePublicURL {
		for _, entry := range cache {
			if entry.FileID != "" && time.Since(entry.UploadedAt) < 24*time.Hour {
				return upload.UploadResult{FileID: entry.FileID}, 0
			}
		}
	} else {
		for _, entry := range cache {
			if entry.URL != "" && time.Since(entry.UploadedAt) < 7*24*time.Hour {
				return upload.UploadResult{URL: entry.URL}, 0
			}
		}
	}

	filename := resource.Name
	if filename == "" {
		filename = fmt.Sprintf("resource_%d.png", resourceID)
	}
	mimeType := media.MimeType
	if mimeType == "" {
		mimeType = "image/png"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	if !requirePublicURL {
		if uploader, cacheKey := w.providerFileUploaderForJob(ctx, job); uploader != nil {
			fileID, err := uploader.UploadFile(ctx, media.Bytes, filename, mimeType, "")
			if err == nil && fileID != "" {
				cache[cacheKey] = cacheEntry{FileID: fileID, UploadedAt: time.Now()}
				if b, err := json.Marshal(cache); err == nil {
					w.db.Model(&resource).Update("cloud_uploads", string(b))
				}
				return upload.UploadResult{FileID: fileID}, 0
			}
			if err != nil {
				log.Printf("[job] provider file upload for resource #%d failed: %v", resourceID, err)
			}
		}
	}

	svc := w.cloudupService()
	if svc == nil || !svc.HasUploaders() {
		return upload.UploadResult{}, 0
	}

	configID, result, err := svc.UploadWithFallback(ctx, media.Bytes, filename, mimeType)
	if err != nil {
		log.Printf("[job] cloud upload for resource #%d failed: %v", resourceID, err)
		return upload.UploadResult{}, 0
	}

	// Cache the result.
	key := strconv.FormatUint(uint64(configID), 10)
	cache[key] = cacheEntry{
		FileID:     result.FileID,
		URL:        result.URL,
		UploadedAt: time.Now(),
	}
	if b, err := json.Marshal(cache); err == nil {
		w.db.Model(&resource).Update("cloud_uploads", string(b))
	}

	return result, configID
}

func (w *Worker) providerFileUploaderForJob(ctx context.Context, job *persistencemodel.Job) (ai.FileUploader, string) {
	if w == nil || w.aiService == nil || job == nil {
		return nil, ""
	}
	if route, ok := w.catalogRouteForJob(ctx, job); ok {
		return w.aiService.GetFileUploaderForRoute(ctx, job.UserID, route), providerFileUploadCacheKey(job, route)
	}
	return nil, ""
}

func providerFileUploadCacheKey(job *persistencemodel.Job, route ai.ModelRoute) string {
	if route.RouteBindingID != 0 {
		return fmt.Sprintf("ai_route_binding:%d", route.RouteBindingID)
	}
	if route.CatalogEntryID != 0 {
		return fmt.Sprintf("ai_catalog_entry:%d", route.CatalogEntryID)
	}
	return ""
}
