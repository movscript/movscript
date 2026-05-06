package jobrunner

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/domain/media"
	"github.com/movscript/movscript/internal/domain/model"
	"github.com/movscript/movscript/internal/infra/ai"
)

func (w *Worker) saveDebugInfo(job *model.Job, result *ai.DebugCallResult) {
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
func (w *Worker) saveBytes(ctx context.Context, job *model.Job, data []byte, mimeType string) (uint, error) {
	if normalized, normalizedMime, changed, err := media.NormalizeVideoForBrowser(ctx, data, mimeType); err != nil {
		log.Printf("[job] video normalization skipped for job #%d: %v", job.ID, err)
	} else if changed {
		data = normalized
		mimeType = normalizedMime
	}
	resType := typeFromMime(mimeType)
	name := fmt.Sprintf("job_%d_%s.%s", job.ID, resType, extFromMime(mimeType))
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
func (w *Worker) saveResult(ctx context.Context, job *model.Job, providerURL, mimeType string) (uint, error) {
	var data []byte
	providerURL = strings.TrimSpace(providerURL)
	if err := validateProviderResultURL(providerURL); err != nil {
		return 0, err
	}

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

	if normalized, normalizedMime, changed, err := media.NormalizeVideoForBrowser(ctx, data, mimeType); err != nil {
		log.Printf("[job] video normalization skipped for job #%d: %v", job.ID, err)
	} else if changed {
		data = normalized
		mimeType = normalizedMime
	}

	resType := typeFromMime(mimeType)
	name := fmt.Sprintf("job_%d_%s.%s", job.ID, resType, extFromMime(mimeType))
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
func (w *Worker) loadInputResources(job *model.Job) (imageData, videoData []ai.MediaData) {
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
			log.Printf("[job] failed to read resource #%d: %v", r.ID, err)
			continue
		}
		md := ai.MediaData{Bytes: data, MimeType: mime, PresignedURL: presigned, ResourceID: r.ID}
		switch r.Type {
		case "image":
			imageData = append(imageData, md)
		case "video":
			videoData = append(videoData, md)
		}
	}
	return imageData, videoData
}

// readResourceBytes reads a resource's bytes directly from the internal resource store.
// The returned URL is intentionally empty: storage DirectURL may point at a private
// MinIO hostname and must not be passed to external AI providers.
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
	return data, mimeType, "", nil
}
