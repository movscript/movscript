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
		OwnerID:                   job.UserID,
		OrgID:                     job.OrgID,
		BlobID:                    &blob.ID,
		Type:                      resType,
		Name:                      name,
		MimeType:                  mimeType,
		Size:                      int64(len(data)),
		FilePath:                  "stored:" + blob.StorageKey,
		StorageBackend:            blob.StorageBackend,
		StorageKey:                blob.StorageKey,
		ProviderGeneratedArtifact: providerGeneratedArtifactMetadata(job, resType, mimeType, time.Now().UTC()),
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
		OwnerID:                   job.UserID,
		OrgID:                     job.OrgID,
		BlobID:                    &blob.ID,
		Type:                      resType,
		Name:                      name,
		MimeType:                  mimeType,
		Size:                      int64(len(data)),
		FilePath:                  "stored:" + blob.StorageKey,
		StorageBackend:            blob.StorageBackend,
		StorageKey:                blob.StorageKey,
		ProviderGeneratedArtifact: providerGeneratedArtifactMetadata(job, resType, mimeType, time.Now().UTC()),
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

func providerGeneratedArtifactMetadata(job *persistencemodel.Job, outputKind string, mimeType string, generatedAt time.Time) string {
	if job == nil {
		return "{}"
	}
	model := providerGeneratedArtifactModelSnapshot(job.RequestContext)
	modelID := firstNonEmpty(model.Identifier, model.ModelDefID)
	family := providerGeneratedArtifactModelFamily(modelID, job.JobType)
	inputResourceIDs := providerGeneratedArtifactInputResourceIDs(job)
	metadata := map[string]any{
		"schema":        "movscript.provider_generated_artifact.v1",
		"source_kind":   "generation_job",
		"source_job_id": job.ID,
		"output_kind":   outputKind,
		"mime_type":     mimeType,
		"generated_at":  generatedAt.Format(time.RFC3339),
		"face_content":  "unknown",
	}
	if model.ProviderName != "" {
		metadata["provider"] = model.ProviderName
	}
	if model.ProviderID != "" {
		metadata["origin_provider_id"] = model.ProviderID
	}
	if model.ProviderKind != "" {
		metadata["origin_provider_kind"] = model.ProviderKind
	}
	if model.AdapterKey != "" {
		metadata["origin_adapter_key"] = model.AdapterKey
	}
	if model.RouteBindingID != 0 {
		metadata["origin_route_binding_id"] = model.RouteBindingID
	}
	if model.CatalogEntryID != 0 {
		metadata["origin_catalog_entry_id"] = model.CatalogEntryID
	}
	if model.ProviderModelID != "" {
		metadata["origin_provider_model_id"] = model.ProviderModelID
	}
	if modelID != "" {
		metadata["model_id"] = modelID
	}
	metadata["original_provider_artifact"] = true
	metadata["derivation_state"] = "original"
	if family != "" {
		metadata["model_family"] = family
	}
	if len(inputResourceIDs) > 0 {
		metadata["input_resource_ids"] = inputResourceIDs
	}
	if claim := providerGeneratedArtifactTrustClaim(model, family, outputKind, generatedAt); claim != nil {
		metadata["trust_claim"] = claim
		metadata["provider_trust"] = claim
	}
	raw, err := json.Marshal(metadata)
	if err != nil {
		return "{}"
	}
	return string(raw)
}

type providerGeneratedArtifactModel struct {
	Identifier      string
	ModelDefID      string
	ProviderName    string
	ProviderID      string
	ProviderKind    string
	AdapterKey      string
	CatalogEntryID  uint
	RouteBindingID  uint
	ProviderModelID string
}

func providerGeneratedArtifactModelSnapshot(requestContext string) providerGeneratedArtifactModel {
	var body struct {
		Model struct {
			Identifier   string `json:"identifier"`
			ModelDefID   string `json:"model_def_id"`
			ProviderName string `json:"provider_name"`
		} `json:"model"`
		Route struct {
			ModelID         string `json:"model_id"`
			CatalogEntryID  uint   `json:"catalog_entry_id"`
			RouteBindingID  uint   `json:"route_binding_id"`
			ProviderID      string `json:"provider_id"`
			ProviderKind    string `json:"provider_kind"`
			AdapterKey      string `json:"adapter_key"`
			ProviderModelID string `json:"provider_model_id"`
		} `json:"route"`
		ModelID string `json:"model_id"`
	}
	if err := json.Unmarshal([]byte(requestContext), &body); err != nil {
		return providerGeneratedArtifactModel{}
	}
	return providerGeneratedArtifactModel{
		Identifier:      firstNonEmpty(body.Model.Identifier, body.Route.ModelID, body.ModelID),
		ModelDefID:      body.Model.ModelDefID,
		ProviderName:    body.Model.ProviderName,
		ProviderID:      strings.TrimSpace(body.Route.ProviderID),
		ProviderKind:    strings.TrimSpace(body.Route.ProviderKind),
		AdapterKey:      strings.TrimSpace(body.Route.AdapterKey),
		CatalogEntryID:  body.Route.CatalogEntryID,
		RouteBindingID:  body.Route.RouteBindingID,
		ProviderModelID: strings.TrimSpace(body.Route.ProviderModelID),
	}
}

func providerGeneratedArtifactInputResourceIDs(job *persistencemodel.Job) []uint {
	ids := make([]uint, 0)
	if job.InputResourceID != nil && *job.InputResourceID > 0 {
		ids = append(ids, *job.InputResourceID)
	}
	var list []uint
	if err := json.Unmarshal([]byte(job.InputResourceIDs), &list); err == nil {
		for _, id := range list {
			if id > 0 && !uintSliceContains(ids, id) {
				ids = append(ids, id)
			}
		}
	}
	return ids
}

func providerGeneratedArtifactModelFamily(modelID string, jobType string) string {
	normalized := strings.ToLower(strings.ReplaceAll(modelID+" "+jobType, "_", "-"))
	switch {
	case strings.Contains(normalized, "seedance2") || strings.Contains(normalized, "seedance-2") || strings.Contains(normalized, "seedance 2"):
		return "seedance2"
	case strings.Contains(normalized, "seedream") && strings.Contains(normalized, "5") && strings.Contains(normalized, "lite"):
		return "seedream5_lite"
	default:
		return ""
	}
}

func providerGeneratedArtifactTrustClaim(model providerGeneratedArtifactModel, modelFamily string, outputKind string, generatedAt time.Time) map[string]any {
	if strings.TrimSpace(model.ProviderID) == "" || strings.TrimSpace(model.ProviderKind) == "" {
		return nil
	}
	policy, ok := providerGeneratedArtifactTrustPolicy(model.ProviderKind)
	if !ok {
		return nil
	}
	trustedFamily := providerGeneratedArtifactTrustPolicyFamily(modelFamily, stringSliceValue(policy["trusted_model_families"]))
	if trustedFamily == "" {
		return nil
	}
	var applicability string
	var effectiveFrom time.Time
	switch {
	case providerGeneratedArtifactCanonicalTrustFamily(modelFamily) == "seedance-2.0" && strings.EqualFold(strings.TrimSpace(outputKind), "video"):
		applicability = "seedance2_face_video"
		effectiveFrom = time.Date(2026, 3, 11, 0, 0, 0, 0, time.UTC)
	case providerGeneratedArtifactCanonicalTrustFamily(modelFamily) == "seedream-lite" && strings.EqualFold(strings.TrimSpace(outputKind), "image"):
		applicability = "seedream5_lite_face_image"
		effectiveFrom = time.Date(2026, 4, 16, 0, 0, 0, 0, time.UTC)
	default:
		return nil
	}
	claim := map[string]any{
		"scope":                      applicability,
		"effective_from":             effectiveFrom.Format(time.RFC3339),
		"validity_days":              30,
		"generated_at":               generatedAt.Format(time.RFC3339),
		"expires_at":                 generatedAt.AddDate(0, 0, 30).Format(time.RFC3339),
		"status":                     "needs_face_confirmation",
		"face_content":               "unknown",
		"trusted_model_family":       trustedFamily,
		"requires_original_artifact": boolMapValue(policy, "requires_original_artifact"),
		"origin_provider_id":         strings.TrimSpace(model.ProviderID),
		"origin_provider_kind":       strings.TrimSpace(model.ProviderKind),
	}
	if policyID := strings.TrimSpace(stringValue(policy["policy_id"])); policyID != "" {
		claim["policy_id"] = policyID
	}
	if policyScope := strings.TrimSpace(stringValue(policy["scope"])); policyScope != "" {
		claim["policy_scope"] = policyScope
	}
	if generatedAt.Before(effectiveFrom) {
		claim["status"] = "not_effective"
	}
	return claim
}

func providerGeneratedArtifactTrustPolicy(providerKind string) (map[string]any, bool) {
	providerKind = strings.TrimSpace(providerKind)
	if providerKind == "" {
		return nil, false
	}
	for _, template := range ai.ProviderTemplates() {
		if strings.TrimSpace(template.ProviderKind) != providerKind {
			continue
		}
		if !boolMapValue(template.Capabilities, "generated_artifact_trust") || len(template.GeneratedArtifactTrustPolicy) == 0 {
			return nil, false
		}
		return template.GeneratedArtifactTrustPolicy, true
	}
	return nil, false
}

func providerGeneratedArtifactTrustPolicyFamily(modelFamily string, trustedFamilies []string) string {
	canonical := providerGeneratedArtifactCanonicalTrustFamily(modelFamily)
	if canonical == "" {
		return ""
	}
	for _, family := range trustedFamilies {
		if providerGeneratedArtifactCanonicalTrustFamily(family) == canonical {
			return strings.TrimSpace(family)
		}
	}
	return ""
}

func providerGeneratedArtifactCanonicalTrustFamily(value string) string {
	normalized := strings.ToLower(strings.TrimSpace(value))
	normalized = strings.NewReplacer("_", "-", ".", "-", " ", "-", ":", "-", "/", "-").Replace(normalized)
	switch {
	case strings.Contains(normalized, "seedance") && strings.Contains(normalized, "2"):
		return "seedance-2.0"
	case strings.Contains(normalized, "seedream") && strings.Contains(normalized, "lite"):
		return "seedream-lite"
	default:
		return normalized
	}
}

func stringSliceValue(value any) []string {
	switch items := value.(type) {
	case []string:
		out := make([]string, 0, len(items))
		for _, item := range items {
			if item = strings.TrimSpace(item); item != "" {
				out = append(out, item)
			}
		}
		return out
	case []any:
		out := make([]string, 0, len(items))
		for _, item := range items {
			if value := strings.TrimSpace(stringValue(item)); value != "" {
				out = append(out, value)
			}
		}
		return out
	default:
		return nil
	}
}

func uintSliceContains(values []uint, needle uint) bool {
	for _, value := range values {
		if value == needle {
			return true
		}
	}
	return false
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
