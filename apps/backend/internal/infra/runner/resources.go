package runner

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
	"unicode"

	domainresource "github.com/movscript/movscript/internal/domain/resource"
	"github.com/movscript/movscript/internal/infra/ai"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

func (w *Worker) saveDebugInfo(job *persistencemodel.Job, result *ai.DebugCallResult) {
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
func (w *Worker) saveBytes(ctx context.Context, job *persistencemodel.Job, data []byte, mimeType string) (uint, error) {
	resType := typeFromMime(mimeType)
	name, err := w.uniqueGeneratedResourceName(job, generatedResourceName(job, resType, extFromMime(mimeType)))
	if err != nil {
		return 0, err
	}
	blob, err := w.ensureResourceBlob(ctx, data, mimeType)
	if err != nil {
		return 0, err
	}

	r := persistencemodel.RawResource{
		OwnerID:        job.UserID,
		OrgID:          job.OrgID,
		BlobID:         &blob.ID,
		Type:           resType,
		Name:           name,
		MimeType:       mimeType,
		Size:           int64(len(data)),
		FilePath:       "stored:" + blob.StorageKey,
		StorageBackend: blob.StorageBackend,
		StorageKey:     blob.StorageKey,
	}
	if err := w.db.Create(&r).Error; err != nil {
		return 0, fmt.Errorf("create resource record: %w", err)
	}
	if err := w.incrementResourceBlobRef(blob.ID); err != nil {
		w.db.Delete(&r)
		return 0, fmt.Errorf("increment resource blob ref: %w", err)
	}
	return r.ID, nil
}

// saveResult downloads the provider URL (or decodes a data URI), stores it, and creates a RawResource record.
func (w *Worker) saveResult(ctx context.Context, job *persistencemodel.Job, providerURL, mimeType string) (uint, error) {
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

	resType := typeFromMime(mimeType)
	name, err := w.uniqueGeneratedResourceName(job, generatedResourceName(job, resType, extFromMime(mimeType)))
	if err != nil {
		return 0, err
	}
	blob, err := w.ensureResourceBlob(ctx, data, mimeType)
	if err != nil {
		return 0, err
	}

	r := persistencemodel.RawResource{
		OwnerID:        job.UserID,
		OrgID:          job.OrgID,
		BlobID:         &blob.ID,
		Type:           resType,
		Name:           name,
		MimeType:       mimeType,
		Size:           int64(len(data)),
		FilePath:       "stored:" + blob.StorageKey,
		StorageBackend: blob.StorageBackend,
		StorageKey:     blob.StorageKey,
	}
	if err := w.db.Create(&r).Error; err != nil {
		return 0, fmt.Errorf("create resource record: %w", err)
	}
	if err := w.incrementResourceBlobRef(blob.ID); err != nil {
		w.db.Delete(&r)
		return 0, fmt.Errorf("increment resource blob ref: %w", err)
	}
	return r.ID, nil
}

func (w *Worker) ensureResourceBlob(ctx context.Context, data []byte, mimeType string) (persistencemodel.ResourceBlob, error) {
	hash := sha256Hex(data)
	var existing persistencemodel.ResourceBlob
	if err := w.db.Where("hash = ?", hash).First(&existing).Error; err == nil {
		return existing, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return persistencemodel.ResourceBlob{}, fmt.Errorf("find resource blob: %w", err)
	}
	key := domainresource.GenerateBlobStorageKey(hash)
	if err := w.store.Put(ctx, key, bytes.NewReader(data), int64(len(data)), mimeType); err != nil {
		return persistencemodel.ResourceBlob{}, fmt.Errorf("store file: %w", err)
	}
	blob := persistencemodel.ResourceBlob{
		Hash:           hash,
		StorageBackend: w.store.Backend(),
		StorageKey:     key,
		Size:           int64(len(data)),
		MimeType:       mimeType,
	}
	if err := w.db.Create(&blob).Error; err != nil {
		if findErr := w.db.Where("hash = ?", hash).First(&existing).Error; findErr == nil {
			return existing, nil
		} else if !errors.Is(findErr, gorm.ErrRecordNotFound) {
			return persistencemodel.ResourceBlob{}, fmt.Errorf("find resource blob after create conflict: %w", findErr)
		}
		return persistencemodel.ResourceBlob{}, fmt.Errorf("create resource blob: %w", err)
	}
	return blob, nil
}

func (w *Worker) incrementResourceBlobRef(blobID uint) error {
	return w.db.
		Model(&persistencemodel.ResourceBlob{}).
		Where("id = ?", blobID).
		UpdateColumn("ref_count", gorm.Expr("ref_count + ?", 1)).Error
}

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func generatedResourceName(job *persistencemodel.Job, resType string, ext string) string {
	base := generatedResourceBaseName(strings.TrimSpace(job.Title))
	if base == "" {
		base = fmt.Sprintf("job_%d_%s", job.ID, resType)
	}
	ext = strings.TrimPrefix(strings.TrimSpace(ext), ".")
	if ext == "" {
		return base
	}
	return base + "." + ext
}

func (w *Worker) uniqueGeneratedResourceName(job *persistencemodel.Job, name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		name = fmt.Sprintf("job_%d_file", job.ID)
	}
	if exists, err := w.generatedResourceNameExists(job, name); err != nil {
		return "", fmt.Errorf("check resource filename: %w", err)
	} else if !exists {
		return name, nil
	}
	base, ext := splitResourceName(name)
	for suffix := 2; suffix < 10000; suffix++ {
		candidate := fmt.Sprintf("%s (%d)%s", base, suffix, ext)
		exists, err := w.generatedResourceNameExists(job, candidate)
		if err != nil {
			return "", fmt.Errorf("check resource filename: %w", err)
		}
		if !exists {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("resource filename already exists: %s", name)
}

func (w *Worker) generatedResourceNameExists(job *persistencemodel.Job, name string) (bool, error) {
	q := w.db.Model(&persistencemodel.RawResource{}).Where("LOWER(name) = LOWER(?)", strings.TrimSpace(name))
	if job.OrgID == nil {
		q = q.Where("owner_id = ? AND org_id IS NULL", job.UserID)
	} else {
		q = q.Where("org_id = ?", *job.OrgID)
	}
	var count int64
	if err := q.Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func splitResourceName(name string) (string, string) {
	dot := strings.LastIndex(name, ".")
	if dot <= 0 || dot == len(name)-1 {
		return name, ""
	}
	return strings.TrimSpace(name[:dot]), name[dot:]
}

func generatedResourceBaseName(title string) string {
	const maxRunes = 80
	var b strings.Builder
	lastWasUnderscore := false
	written := 0
	for _, r := range title {
		if written >= maxRunes {
			break
		}
		keep := unicode.IsLetter(r) || unicode.IsDigit(r) || r == '-' || r == '_' || r == ' '
		if keep {
			b.WriteRune(r)
			lastWasUnderscore = false
		} else if !lastWasUnderscore {
			b.WriteRune('_')
			lastWasUnderscore = true
		}
		written++
	}
	return strings.Trim(b.String(), " ._")
}

func (w *Worker) resourceURL(id *uint) (string, error) {
	var r persistencemodel.RawResource
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
func (w *Worker) loadInputResources(job *persistencemodel.Job) (imageData, videoData, audioData, textData []ai.MediaData) {
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
		return nil, nil, nil, nil
	}

	var resources []persistencemodel.RawResource
	if err := w.db.Where("id IN ?", ids).Find(&resources).Error; err != nil {
		return nil, nil, nil, nil
	}
	// Preserve order of ids.
	byID := make(map[uint]persistencemodel.RawResource, len(resources))
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
		case "audio":
			audioData = append(audioData, md)
		case "text", "subtitle":
			textData = append(textData, md)
		}
	}
	return imageData, videoData, audioData, textData
}

// readResourceBytes reads a resource's bytes directly from the internal resource store.
// The returned URL is intentionally empty: storage DirectURL may point at a private
// MinIO hostname and must not be passed to external AI providers.
func (w *Worker) readResourceBytes(r persistencemodel.RawResource) ([]byte, string, string, error) {
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
