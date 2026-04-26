package genjob

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/ai"
	"github.com/movscript/movscript/internal/cloudup"
	"github.com/movscript/movscript/internal/model"
	"github.com/movscript/movscript/internal/storage"
	"gorm.io/gorm"
)

// Worker is a pool of goroutines that execute pending GenJob records.
type Worker struct {
	db            *gorm.DB
	aiService     *ai.AIService
	store         storage.Storage
	encryptionKey []byte
	client        *http.Client
}

func NewWorker(db *gorm.DB, aiService *ai.AIService, store storage.Storage, encryptionKey []byte) *Worker {
	return &Worker{
		db:            db,
		aiService:     aiService,
		store:         store,
		encryptionKey: encryptionKey,
		client:        &http.Client{Timeout: 10 * time.Minute},
	}
}

// cloudupService loads enabled cloud file configs from DB and builds a cloudup.Service.
// Returns nil (no error) if no configs are enabled — callers must check HasUploaders().
func (w *Worker) cloudupService() *cloudup.Service {
	var rows []model.CloudFileConfig
	if err := w.db.Where("is_enabled = true AND deleted_at IS NULL").Order("priority asc").Find(&rows).Error; err != nil {
		return nil
	}
	svc, err := cloudup.NewFromDBConfigs(rows, w.encryptionKey)
	if err != nil {
		log.Printf("[genjob] cloudup init error: %v", err)
		return nil
	}
	return svc
}

// Start launches n worker goroutines. Cancel ctx to stop them gracefully.
func (w *Worker) Start(ctx context.Context, n int) {
	for i := 0; i < n; i++ {
		go w.loop(ctx)
	}
}

func (w *Worker) loop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-time.After(2 * time.Second):
			w.processOne(ctx)
		}
	}
}

// processOne atomically claims one pending job and executes it.
func (w *Worker) processOne(ctx context.Context) {
	var job model.GenJob
	// Atomically claim a pending job using PostgreSQL FOR UPDATE SKIP LOCKED.
	result := w.db.Raw(`
		UPDATE gen_jobs SET status='running', started_at=NOW(), updated_at=NOW()
		WHERE id = (
			SELECT id FROM gen_jobs
			WHERE status='pending' AND deleted_at IS NULL
			ORDER BY created_at
			LIMIT 1
			FOR UPDATE SKIP LOCKED
		)
		RETURNING *
	`).Scan(&job)

	if result.Error != nil || job.ID == 0 {
		return
	}

	log.Printf("[genjob] picked job #%d type=%s user=%d", job.ID, job.JobType, job.UserID)

	if err := w.execute(ctx, &job); err != nil {
		now := time.Now()
		w.db.Model(&job).Updates(map[string]any{
			"status":      StatusFailed,
			"error_msg":   err.Error(),
			"finished_at": &now,
		})
		log.Printf("[genjob] job #%d failed: %v", job.ID, err)
	}
}

func (w *Worker) execute(ctx context.Context, job *model.GenJob) error {
	callCtx, cancel := context.WithTimeout(ctx, 8*time.Minute)
	defer cancel()

	// Attach a debug recorder so adapters can capture the raw HTTP exchange.
	debugCtx, debugResult := ai.WithDebugRecorder(callCtx)

	// Resolve @[resource:ID] mentions in the prompt.
	// This populates InputResourceID (legacy) and merges mention IDs into InputResourceIDs.
	// All mention markers are stripped from the prompt text sent to the model.
	job.Prompt, job.InputResourceID, job.InputResourceIDs = w.resolveMentions(job.Prompt, job.InputResourceID, job.InputResourceIDs)

	// Parse extra params (size, quality, duration, aspect_ratio, etc.)
	var extra map[string]interface{}
	if job.ExtraParams != "" {
		_ = json.Unmarshal([]byte(job.ExtraParams), &extra)
	}
	if extra == nil {
		extra = map[string]interface{}{}
	}

	getString := func(key string) string {
		if v, ok := extra[key]; ok {
			if s, ok := v.(string); ok {
				return s
			}
		}
		return ""
	}
	getInt := func(key string) int {
		if v, ok := extra[key]; ok {
			switch n := v.(type) {
			case float64:
				return int(n)
			case int:
				return n
			}
		}
		return 0
	}

	// Load all input resources as raw bytes from storage, classified by type.
	imageData, videoData := w.loadInputResources(job)

	var resultURL string
	var mimeType string

	// Determine effective output type from job_type.
	outputType := job.JobType

	// Resolve the model def ID for debug context.
	modelDefID := ""
	if mcfg := w.loadModelConfig(job.ModelConfigID); mcfg != nil {
		modelDefID = mcfg.ModelDefID
	}

	// Pre-populate job-level context in the debug record before any adapter call.
	debugResult.JobType = outputType
	debugResult.JobModelDefID = modelDefID
	debugResult.JobResolvedPrompt = job.Prompt
	debugResult.JobInputResourceIDs = parseResourceIDs(job.InputResourceIDs)
	if job.InputResourceID != nil {
		// ensure legacy single ID is included
		found := false
		for _, id := range debugResult.JobInputResourceIDs {
			if id == *job.InputResourceID {
				found = true
				break
			}
		}
		if !found {
			debugResult.JobInputResourceIDs = append(debugResult.JobInputResourceIDs, *job.InputResourceID)
		}
	}

	switch outputType {
	case ai.CapabilityImage:
		req := ai.ImageRequest{
			Prompt:      job.Prompt,
			N:           1,
			Size:        getString("size"),
			Quality:     getString("quality"),
			Style:       getString("style"),
			AspectRatio: firstNonEmpty(job.AspectRatio, getString("aspect_ratio")),
		}
		if len(imageData) > 0 {
			req.InputImageBytes = imageData[0].Bytes
			req.InputImageMime = imageData[0].MimeType
		}
		resp, err := w.aiService.CallImage(debugCtx, job.UserID, job.ModelConfigID, req)
		if err != nil {
			w.saveDebugInfo(job, debugResult)
			return fmt.Errorf("image generation: %w", err)
		}
		if len(resp.URLs) == 0 {
			return fmt.Errorf("no image URL returned by provider")
		}
		resultURL = resp.URLs[0]
		mimeType = "image/png"

	case ai.CapabilityImageEdit:
		if len(imageData) == 0 {
			return fmt.Errorf("image_edit job requires an image input but none was found (job #%d)", job.ID)
		}
		req := ai.ImageRequest{
			Prompt:      job.Prompt,
			N:           1,
			Size:        getString("size"),
			Quality:     getString("quality"),
			Style:       getString("style"),
			AspectRatio: firstNonEmpty(job.AspectRatio, getString("aspect_ratio")),
		}

		// Try cloud upload first (avoids large multipart body that causes EOF on some providers).
		firstImage := imageData[0]
		if cloudResult, configID := w.ensureCloudUpload(job, firstImage); cloudResult.FileID != "" {
			req.CloudFileID = cloudResult.FileID
			_ = configID
		} else if cloudResult.URL != "" {
			req.InputImage = cloudResult.URL
		} else {
			req.InputImageBytes = firstImage.Bytes
			req.InputImageMime = firstImage.MimeType
		}

		resp, err := w.aiService.CallImage(debugCtx, job.UserID, job.ModelConfigID, req)
		if err != nil {
			w.saveDebugInfo(job, debugResult)
			return fmt.Errorf("image generation: %w", err)
		}
		if len(resp.URLs) == 0 {
			return fmt.Errorf("no image URL returned by provider")
		}
		resultURL = resp.URLs[0]
		mimeType = "image/png"

	case ai.CapabilityVideo, ai.CapabilityVideoI2V, ai.CapabilityVideoV2V:
		dur := job.Duration
		if dur == 0 {
			dur = getInt("duration")
		}
		req := ai.VideoRequest{
			Prompt:         job.Prompt,
			Duration:       dur,
			AspectRatio:    firstNonEmpty(job.AspectRatio, getString("aspect_ratio")),
			Quality:        getString("quality"),
			Size:           getString("size"),
			ResolutionName: getString("resolution_name"),
			Preset:         getString("preset"),
			InputImageDataList: imageData,
		}
		if len(videoData) > 0 {
			req.InputVideoData = &videoData[0]
		}
		resp, err := w.aiService.CallVideo(debugCtx, job.UserID, job.ModelConfigID, req)
		if err != nil {
			w.saveDebugInfo(job, debugResult)
			return fmt.Errorf("video generation: %w", err)
		}
		// If the adapter downloaded bytes directly (auth-gated content), save them now.
		if len(resp.ContentBytes) > 0 {
			resourceID, err := w.saveBytes(callCtx, job, resp.ContentBytes, "video/mp4")
			if err != nil {
				return fmt.Errorf("save result: %w", err)
			}
			now := time.Now()
			updates := map[string]any{
				"status":             StatusSucceeded,
				"output_resource_id": resourceID,
				"finished_at":        &now,
			}
			if debugResult != nil {
				if b, err := json.Marshal(debugResult); err == nil {
					updates["debug_info"] = string(b)
				}
			}
			w.db.Model(job).Updates(updates)
			log.Printf("[genjob] job #%d succeeded → resource #%d", job.ID, resourceID)
			return nil
		}
		resultURL = resp.URL
		if resultURL == "" {
			resultURL = resp.TaskID
		}
		if resultURL == "" {
			return fmt.Errorf("no video URL returned by provider")
		}
		mimeType = "video/mp4"

	default:
		return fmt.Errorf("unsupported output type %q", outputType)
	}

	resourceID, err := w.saveResult(callCtx, job, resultURL, mimeType)
	if err != nil {
		return fmt.Errorf("save result: %w", err)
	}

	now := time.Now()
	updates := map[string]any{
		"status":             StatusSucceeded,
		"output_resource_id": resourceID,
		"finished_at":        &now,
	}
	if debugResult != nil {
		if b, err := json.Marshal(debugResult); err == nil {
			updates["debug_info"] = string(b)
		}
	}
	w.db.Model(job).Updates(updates)
	log.Printf("[genjob] job #%d succeeded → resource #%d", job.ID, resourceID)
	return nil
}

// ensureCloudUpload checks the resource's CloudUploads cache; if no valid entry exists,
// uploads via the configured cloud backends and caches the result.
// Returns zero-value UploadResult if no cloud configs are enabled or upload fails.
func (w *Worker) ensureCloudUpload(job *model.GenJob, media ai.MediaData) (cloudup.UploadResult, uint) {
	// Find the resource ID for this media data (first input resource).
	ids := parseResourceIDs(job.InputResourceIDs)
	if job.InputResourceID != nil && len(ids) == 0 {
		ids = []uint{*job.InputResourceID}
	}
	if len(ids) == 0 {
		return cloudup.UploadResult{}, 0
	}
	resourceID := ids[0]

	var resource model.RawResource
	if err := w.db.First(&resource, resourceID).Error; err != nil {
		return cloudup.UploadResult{}, 0
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
	for _, entry := range cache {
		age := time.Since(entry.UploadedAt)
		if entry.FileID != "" && age < 24*time.Hour {
			return cloudup.UploadResult{FileID: entry.FileID}, 0
		}
		if entry.URL != "" && age < 7*24*time.Hour {
			return cloudup.UploadResult{URL: entry.URL}, 0
		}
	}

	svc := w.cloudupService()
	if svc == nil || !svc.HasUploaders() {
		return cloudup.UploadResult{}, 0
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

	configID, result, err := svc.UploadWithFallback(ctx, media.Bytes, filename, mimeType)
	if err != nil {
		log.Printf("[genjob] cloud upload for resource #%d failed: %v", resourceID, err)
		return cloudup.UploadResult{}, 0
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

func (w *Worker) saveDebugInfo(job *model.GenJob, result *ai.DebugCallResult) {
	if result == nil {
		return
	}
	// Always save: job context fields are pre-populated before any adapter call,
	// so debug_info is useful even when the HTTP exchange wasn't recorded.
	if b, err := json.Marshal(result); err == nil {
		w.db.Model(job).Update("debug_info", string(b))
	}
}

// saveBytes stores raw bytes directly (used when the adapter downloads auth-gated content).
func (w *Worker) saveBytes(ctx context.Context, job *model.GenJob, data []byte, mimeType string) (uint, error) {
	resType := typeFromMime(mimeType)
	name := fmt.Sprintf("genjob_%d_%s.%s", job.ID, resType, extFromMime(mimeType))
	key := fmt.Sprintf("gen_%d_%s", job.ID, name)

	r := model.RawResource{
		OwnerID:        job.UserID,
		Type:           resType,
		Name:           name,
		MimeType:       mimeType,
		Size:           int64(len(data)),
		FilePath:       "pending",
		StorageBackend: w.store.Backend(),
		StorageKey:     key,
	}
	if err := w.db.Create(&r).Error; err != nil {
		return 0, fmt.Errorf("create resource record: %w", err)
	}
	if err := w.store.Put(ctx, key, bytes.NewReader(data), int64(len(data)), mimeType); err != nil {
		w.db.Delete(&r)
		return 0, fmt.Errorf("store file: %w", err)
	}
	w.db.Model(&r).Update("file_path", "stored:"+key)
	return r.ID, nil
}

// saveResult downloads the provider URL (or decodes a data URI), stores it, and creates a RawResource record.
func (w *Worker) saveResult(ctx context.Context, job *model.GenJob, providerURL, mimeType string) (uint, error) {
	var data []byte

	if strings.HasPrefix(providerURL, "data:") {
		// data URI: data:<mime>;base64,<encoded>
		rest := providerURL[5:] // strip "data:"
		semi := strings.Index(rest, ";")
		comma := strings.Index(rest, ",")
		if semi < 0 || comma < 0 || comma <= semi {
			return 0, fmt.Errorf("malformed data URI")
		}
		mimeType = rest[:semi]
		encoded := rest[comma+1:]
		var err error
		data, err = base64.StdEncoding.DecodeString(encoded)
		if err != nil {
			return 0, fmt.Errorf("decode data URI: %w", err)
		}
	} else {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, providerURL, nil)
		if err != nil {
			return 0, fmt.Errorf("build download request: %w", err)
		}
		resp, err := w.client.Do(req)
		if err != nil {
			return 0, fmt.Errorf("download from provider: %w", err)
		}
		defer resp.Body.Close()

		if ct := resp.Header.Get("Content-Type"); ct != "" {
			mimeType = ct
		}
		data, err = io.ReadAll(resp.Body)
		if err != nil {
			return 0, fmt.Errorf("read response body: %w", err)
		}
	}

	resType := typeFromMime(mimeType)
	name := fmt.Sprintf("genjob_%d_%s.%s", job.ID, resType, extFromMime(mimeType))
	key := fmt.Sprintf("gen_%d_%s", job.ID, name)

	r := model.RawResource{
		OwnerID:        job.UserID,
		Type:           resType,
		Name:           name,
		MimeType:       mimeType,
		Size:           int64(len(data)),
		FilePath:       "pending",
		StorageBackend: w.store.Backend(),
		StorageKey:     key,
	}
	if err := w.db.Create(&r).Error; err != nil {
		return 0, fmt.Errorf("create resource record: %w", err)
	}

	if err := w.store.Put(ctx, key, bytes.NewReader(data), int64(len(data)), mimeType); err != nil {
		w.db.Delete(&r)
		return 0, fmt.Errorf("store file: %w", err)
	}

	w.db.Model(&r).Update("file_path", "stored:"+key)
	return r.ID, nil
}

func (w *Worker) resourceURL(id *uint) (string, error) {
	var r model.RawResource
	if err := w.db.First(&r, id).Error; err != nil {
		return "", err
	}
	if r.StorageKey != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		url, err := w.store.DirectURL(ctx, r.StorageKey)
		if err == nil && url != "" {
			return url, nil
		}
	}
	return r.FilePath, nil
}

// loadInputResources reads all input resource bytes from storage, classified by type.
// It reads both the new InputResourceIDs JSON array and the legacy InputResourceID field.
func (w *Worker) loadInputResources(job *model.GenJob) (imageData, videoData []ai.MediaData) {
	ids := parseResourceIDs(job.InputResourceIDs)
	// Append legacy single ID if not already in the list.
	if job.InputResourceID != nil {
		seen := false
		for _, id := range ids {
			if id == *job.InputResourceID {
				seen = true
				break
			}
		}
		if !seen {
			ids = append(ids, *job.InputResourceID)
		}
	}
	if len(ids) == 0 {
		return nil, nil
	}

	var resources []model.RawResource
	if err := w.db.Where("id IN ?", ids).Find(&resources).Error; err != nil {
		return nil, nil
	}
	// Preserve order of ids.
	byID := make(map[uint]model.RawResource, len(resources))
	for _, r := range resources {
		byID[r.ID] = r
	}
	for _, id := range ids {
		r, ok := byID[id]
		if !ok {
			continue
		}
		data, mime, presigned, err := w.readResourceBytes(r)
		if err != nil || len(data) == 0 {
			log.Printf("[genjob] failed to read resource #%d: %v", r.ID, err)
			continue
		}
		md := ai.MediaData{Bytes: data, MimeType: mime, PresignedURL: presigned}
		switch r.Type {
		case "image":
			imageData = append(imageData, md)
		case "video":
			videoData = append(videoData, md)
		}
	}
	return imageData, videoData
}

// readResourceBytes reads a resource's bytes directly from storage and generates a presigned URL.
func (w *Worker) readResourceBytes(r model.RawResource) ([]byte, string, string, error) {
	if r.StorageKey == "" {
		return nil, "", "", fmt.Errorf("resource #%d has no storage key", r.ID)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	rc, _, mimeType, err := w.store.GetObject(ctx, r.StorageKey, -1, -1)
	if err != nil {
		return nil, "", "", fmt.Errorf("get object %q: %w", r.StorageKey, err)
	}
	defer rc.Close()
	data, err := io.ReadAll(rc)
	if err != nil {
		return nil, "", "", fmt.Errorf("read object %q: %w", r.StorageKey, err)
	}
	if mimeType == "" {
		mimeType = r.MimeType
	}
	presigned, _ := w.store.DirectURL(ctx, r.StorageKey)
	return data, mimeType, presigned, nil
}

func parseResourceIDs(s string) []uint {
	if s == "" || s == "[]" {
		return nil
	}
	var ids []uint
	_ = json.Unmarshal([]byte(s), &ids)
	return ids
}

// resolveMentions parses @[resource:ID] markers in the prompt.
// Each marker is replaced with "图片N" (N = order of first appearance, 1-based).
// All mentioned resource IDs are merged into existingInputIDs so that
// loadInputResources picks them up. The first mentioned resource is also promoted
// to InputResourceID for backward-compat.
func (w *Worker) resolveMentions(prompt string, existingInput *uint, existingInputIDs string) (string, *uint, string) {
	re := regexp.MustCompile(`@\[resource:(\d+)\]`)
	inputID := existingInput

	// First pass: collect ordered unique resource IDs from the prompt.
	var order []uint
	seen := map[uint]int{} // id → 1-based label index
	for _, sub := range re.FindAllStringSubmatch(prompt, -1) {
		id64, err := strconv.ParseUint(sub[1], 10, 64)
		if err != nil {
			continue
		}
		id := uint(id64)
		if _, ok := seen[id]; !ok {
			order = append(order, id)
			seen[id] = len(order) // 1-based
		}
	}

	// Promote first mentioned resource to InputResourceID if not already set.
	if len(order) > 0 && inputID == nil {
		first := order[0]
		inputID = &first
	}

	// Merge mention IDs into InputResourceIDs (deduplicating against existing entries).
	mergedIDs := parseResourceIDs(existingInputIDs)
	existing := make(map[uint]bool, len(mergedIDs))
	for _, id := range mergedIDs {
		existing[id] = true
	}
	for _, id := range order {
		if !existing[id] {
			mergedIDs = append(mergedIDs, id)
		}
	}
	mergedIDsJSON := ""
	if len(mergedIDs) > 0 {
		if b, err := json.Marshal(mergedIDs); err == nil {
			mergedIDsJSON = string(b)
		}
	}

	// Second pass: replace each marker with "图片N".
	cleaned := re.ReplaceAllStringFunc(prompt, func(match string) string {
		sub := re.FindStringSubmatch(match)
		if len(sub) < 2 {
			return ""
		}
		id64, err := strconv.ParseUint(sub[1], 10, 64)
		if err != nil {
			return ""
		}
		id := uint(id64)
		return fmt.Sprintf("图片%d", seen[id])
	})

	cleaned = strings.TrimSpace(cleaned)
	return cleaned, inputID, mergedIDsJSON
}

// firstNonEmpty returns the first non-empty string from the arguments.
func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

func typeFromMime(mime string) string {
	switch {
	case strings.HasPrefix(mime, "image/"):
		return "image"
	case strings.HasPrefix(mime, "video/"):
		return "video"
	case strings.HasPrefix(mime, "audio/"):
		return "audio"
	}
	return "image"
}

func extFromMime(mime string) string {
	switch mime {
	case "image/png":
		return "png"
	case "image/jpeg":
		return "jpg"
	case "image/webp":
		return "webp"
	case "video/mp4":
		return "mp4"
	case "video/webm":
		return "webm"
	default:
		if strings.HasPrefix(mime, "image/") {
			return "png"
		}
		return "mp4"
	}
}

// loadModelConfig fetches the AIModelConfig by ID. Returns nil if not found.
func (w *Worker) loadModelConfig(id uint) *model.AIModelConfig {
	var cfg model.AIModelConfig
	if err := w.db.First(&cfg, id).Error; err != nil {
		return nil
	}
	return &cfg
}
