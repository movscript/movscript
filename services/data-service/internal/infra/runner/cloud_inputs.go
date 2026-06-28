package runner

import (
	"context"
	"encoding/json"
	"fmt"
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
	if len(imageData) == 0 && len(videoData) == 0 && len(audioData) == 0 {
		return nil
	}
	requirements := ai.RouteCapabilityPublicURLRequirements(route.RouteCapabilitiesJSON, route.Capability)
	if !w.videoRouteRequiresPublicMediaReferencesForRoute(route) && !requirements.Image && !requirements.Video {
		return nil
	}
	w.preparePublicVideoMediaReferences(job, imageData, videoData, audioData)
	if requirements.Image {
		if err := requirePreparedPublicMediaURLs("image", route, imageData); err != nil {
			return err
		}
	}
	if requirements.Video {
		if err := requirePreparedPublicMediaURLs("video", route, videoData); err != nil {
			return err
		}
	}
	return nil
}

func (w *Worker) preparePublicVideoMediaReferences(job *persistencemodel.Job, imageData, videoData, audioData []ai.MediaData) {
	if len(imageData) > 0 {
		w.preparePublicMediaReferences(job, imageData)
	}
	if len(videoData) > 0 {
		w.preparePublicMediaReferences(job, videoData)
	}
	if len(audioData) > 0 {
		w.preparePublicMediaReferences(job, audioData)
	}
}

func (w *Worker) videoRouteRequiresPublicMediaReferences(job *persistencemodel.Job) bool {
	route, ok := w.catalogRouteForJob(context.Background(), job)
	if !ok {
		return false
	}
	return w.videoRouteRequiresPublicMediaReferencesForRoute(route)
}

func (w *Worker) videoRouteRequiresPublicMediaReferencesForRoute(route ai.ModelRoute) bool {
	requirements := ai.RouteCapabilityPublicURLRequirements(route.RouteCapabilitiesJSON, route.Capability)
	if requirements.Image || requirements.Video {
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
		return fmt.Errorf("route %d requires public %s URL for %s; configure public storage or provide a resource with cached public URL before generation", route.RouteBindingID, kind, resource)
	}
	return nil
}

func (w *Worker) preparePublicMediaReferences(job *persistencemodel.Job, mediaList []ai.MediaData) {
	for i := range mediaList {
		if mediaList[i].PresignedURL != "" {
			continue
		}
		if cloudResult, _ := w.ensureCloudUpload(job, mediaList[i], true); cloudResult.URL != "" {
			mediaList[i].PresignedURL = cloudResult.URL
			continue
		}
		mediaList[i].PresignedURL = ""
	}
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
