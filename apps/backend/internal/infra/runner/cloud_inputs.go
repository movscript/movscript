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

	switch w.modelAdapterType(job.ModelConfigID) {
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

// prepareVideoInputReferences uploads reference videos (and any additional reference
// images) to the configured public object relay so Volcen/Kling-style video APIs
// that only accept URLs can reach them. The Seedance contents/generations/tasks
// endpoint rejects base64 for video_url entirely, so this must succeed for any
// v2v or multimodal-reference call against Volcen.
func (w *Worker) prepareVideoInputReferences(job *persistencemodel.Job, imageData, videoData []ai.MediaData) {
	if len(imageData) == 0 && len(videoData) == 0 {
		return
	}
	if w.modelAdapterType(job.ModelConfigID) != ai.AdapterVolcen {
		return
	}
	if len(imageData) > 0 {
		w.preparePublicMediaReferences(job, imageData)
	}
	if len(videoData) > 0 {
		w.preparePublicMediaReferences(job, videoData)
	}
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

func (w *Worker) modelAdapterType(modelConfigID uint) string {
	var row struct {
		AdapterType string
	}
	if err := w.db.Model(&persistencemodel.AIModelConfig{}).
		Select("ai_credentials.adapter_type AS adapter_type").
		Joins("JOIN ai_credentials ON ai_credentials.id = ai_model_configs.credential_id").
		Where("ai_model_configs.id = ?", modelConfigID).
		Scan(&row).Error; err != nil {
		return ""
	}
	return row.AdapterType
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
		if uploader := w.aiService.GetFileUploader(job.ModelConfigID); uploader != nil {
			fileID, err := uploader.UploadFile(ctx, media.Bytes, filename, mimeType, "")
			if err == nil && fileID != "" {
				key := fmt.Sprintf("ai_model_config:%d", job.ModelConfigID)
				cache[key] = cacheEntry{FileID: fileID, UploadedAt: time.Now()}
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
