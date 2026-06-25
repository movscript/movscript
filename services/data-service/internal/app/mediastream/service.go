package mediastream

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"path"
	"strings"
	"time"

	domainresource "github.com/movscript/movscript/internal/domain/resource"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/infra/storage"
	"gorm.io/gorm"
)

var (
	ErrNotFound          = errors.New("media stream artifact not found")
	ErrForbidden         = errors.New("media stream artifact access denied")
	ErrInvalidManifest   = errors.New("invalid HLS manifest")
	ErrInvalidSegment    = errors.New("invalid HLS segment")
	ErrInvalidProvenance = errors.New("invalid media stream provenance")
)

type Service struct {
	db    *gorm.DB
	store storage.Storage
}

func NewService(db *gorm.DB, store storage.Storage) *Service {
	return &Service{db: db, store: store}
}

type SegmentInput struct {
	Name     string
	MimeType string
	Size     int64
	Data     []byte
}

type UploadInput struct {
	UserID             uint
	OrgID              *uint
	ProjectID          *uint
	SourceResourceID   *uint
	SourceDerivativeID *uint
	Title              string
	ManifestName       string
	ManifestMimeType   string
	ManifestData       []byte
	Segments           []SegmentInput
	DurationMs         int
	Width              int
	Height             int
	ExpiresAt          *time.Time
}

type SegmentDescriptor struct {
	Name       string `json:"name"`
	StorageKey string `json:"storage_key"`
	MimeType   string `json:"mime_type"`
	Size       int64  `json:"size"`
}

type ObjectResult struct {
	Body        io.ReadCloser
	Size        int64
	ContentType string
}

type SegmentURLResolver func(SegmentDescriptor) string

type CleanupExpiredInput struct {
	Now    time.Time
	Limit  int
	DryRun bool
}

type CleanupExpiredResult struct {
	Backend        string `json:"backend"`
	DryRun         bool   `json:"dry_run"`
	Candidates     int    `json:"candidates"`
	Deleted        int    `json:"deleted"`
	ObjectsDeleted int    `json:"objects_deleted"`
	FreedBytes     int64  `json:"freed_bytes"`
}

type CleanupLoopOptions struct {
	Interval time.Duration
	Limit    int
	Now      func() time.Time
	OnResult func(CleanupExpiredResult)
	OnError  func(error)
}

func (s *Service) Upload(ctx context.Context, input UploadInput) (persistencemodel.MediaStreamArtifact, []SegmentDescriptor, error) {
	if err := s.validateUploadScope(ctx, input); err != nil {
		return persistencemodel.MediaStreamArtifact{}, nil, err
	}
	if len(input.ManifestData) == 0 {
		return persistencemodel.MediaStreamArtifact{}, nil, fmt.Errorf("%w: manifest is required", ErrInvalidManifest)
	}
	if len(input.Segments) == 0 {
		return persistencemodel.MediaStreamArtifact{}, nil, fmt.Errorf("%w: at least one segment is required", ErrInvalidSegment)
	}
	manifestName := sanitizeManifestName(input.ManifestName)
	basePrefix := fmt.Sprintf("media-streams/%s", randomID())
	manifestKey := path.Join(basePrefix, manifestName)
	segments := make([]SegmentDescriptor, 0, len(input.Segments))
	seenSegments := map[string]struct{}{}
	for _, segment := range input.Segments {
		name := sanitizeSegmentName(segment.Name)
		if name == "" {
			return persistencemodel.MediaStreamArtifact{}, nil, fmt.Errorf("%w: segment filename is required", ErrInvalidSegment)
		}
		if _, ok := seenSegments[name]; ok {
			return persistencemodel.MediaStreamArtifact{}, nil, fmt.Errorf("%w: duplicate segment %s", ErrInvalidSegment, name)
		}
		seenSegments[name] = struct{}{}
		segments = append(segments, SegmentDescriptor{
			Name:       name,
			StorageKey: path.Join(basePrefix, "segments", name),
			MimeType:   normalizeSegmentMimeType(segment.MimeType, name),
			Size:       int64(len(segment.Data)),
		})
	}
	if err := validateManifestReferences(input.ManifestData, input.Segments, seenSegments); err != nil {
		return persistencemodel.MediaStreamArtifact{}, nil, err
	}

	segmentsJSON, err := json.Marshal(segments)
	if err != nil {
		return persistencemodel.MediaStreamArtifact{}, nil, err
	}

	artifact := persistencemodel.MediaStreamArtifact{
		OwnerID:            input.UserID,
		OrgID:              input.OrgID,
		ProjectID:          input.ProjectID,
		SourceResourceID:   input.SourceResourceID,
		SourceDerivativeID: input.SourceDerivativeID,
		Title:              strings.TrimSpace(input.Title),
		Status:             "ready",
		MimeType:           normalizeManifestMimeType(input.ManifestMimeType),
		StorageBackend:     s.store.Backend(),
		ManifestStorageKey: manifestKey,
		BaseStoragePrefix:  basePrefix,
		Segments:           string(segmentsJSON),
		DurationMs:         maxInt(input.DurationMs, 0),
		Width:              maxInt(input.Width, 0),
		Height:             maxInt(input.Height, 0),
		ExpiresAt:          input.ExpiresAt,
	}

	if err := s.store.Put(ctx, manifestKey, bytes.NewReader(input.ManifestData), int64(len(input.ManifestData)), artifact.MimeType); err != nil {
		return persistencemodel.MediaStreamArtifact{}, nil, err
	}
	for index, segment := range input.Segments {
		if err := s.store.Put(ctx, segments[index].StorageKey, bytes.NewReader(segment.Data), int64(len(segment.Data)), segments[index].MimeType); err != nil {
			return persistencemodel.MediaStreamArtifact{}, nil, err
		}
	}
	if err := s.db.WithContext(ctx).Create(&artifact).Error; err != nil {
		return persistencemodel.MediaStreamArtifact{}, nil, err
	}
	return artifact, segments, nil
}

func (s *Service) GetVisible(ctx context.Context, id uint, userID uint, orgID *uint) (persistencemodel.MediaStreamArtifact, []SegmentDescriptor, error) {
	var artifact persistencemodel.MediaStreamArtifact
	if err := s.db.WithContext(ctx).First(&artifact, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return artifact, nil, ErrNotFound
		}
		return artifact, nil, err
	}
	if !streamVisibleTo(artifact, userID, orgID) {
		return artifact, nil, ErrForbidden
	}
	if strings.TrimSpace(artifact.Status) != "" && artifact.Status != "ready" {
		return artifact, nil, ErrNotFound
	}
	if streamExpired(artifact, time.Now().UTC()) {
		return artifact, nil, ErrNotFound
	}
	segments, err := parseSegments(artifact.Segments)
	return artifact, segments, err
}

func (s *Service) CleanupExpired(ctx context.Context, input CleanupExpiredInput) (CleanupExpiredResult, error) {
	result := CleanupExpiredResult{
		Backend: s.store.Backend(),
		DryRun:  input.DryRun,
	}
	now := input.Now.UTC()
	if now.IsZero() {
		now = time.Now().UTC()
	}
	var artifacts []persistencemodel.MediaStreamArtifact
	if err := s.db.WithContext(ctx).
		Where("storage_backend = ? AND expires_at IS NOT NULL AND expires_at <= ?", result.Backend, now).
		Order("expires_at ASC, id ASC").
		Limit(normalizeCleanupLimit(input.Limit)).
		Find(&artifacts).Error; err != nil {
		return result, err
	}
	result.Candidates = len(artifacts)
	for _, artifact := range artifacts {
		segments, err := parseSegments(artifact.Segments)
		if err != nil {
			return result, err
		}
		for _, segment := range segments {
			result.FreedBytes += segment.Size
		}
		if input.DryRun {
			continue
		}
		if err := s.store.Delete(ctx, artifact.ManifestStorageKey); err != nil {
			return result, err
		}
		result.ObjectsDeleted++
		for _, segment := range segments {
			if err := s.store.Delete(ctx, segment.StorageKey); err != nil {
				return result, err
			}
			result.ObjectsDeleted++
		}
		if err := s.db.WithContext(ctx).Model(&artifact).Update("status", "expired").Error; err != nil {
			return result, err
		}
		if err := s.db.WithContext(ctx).Delete(&artifact).Error; err != nil {
			return result, err
		}
		result.Deleted++
	}
	return result, nil
}

func (s *Service) RunExpiredCleanupLoop(ctx context.Context, options CleanupLoopOptions) {
	if options.Interval <= 0 {
		return
	}
	ticker := time.NewTicker(options.Interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			now := time.Now().UTC()
			if options.Now != nil {
				now = options.Now().UTC()
			}
			result, err := s.CleanupExpired(ctx, CleanupExpiredInput{
				Now:   now,
				Limit: options.Limit,
			})
			if err != nil {
				if options.OnError != nil {
					options.OnError(err)
				}
				continue
			}
			if options.OnResult != nil {
				options.OnResult(result)
			}
		}
	}
}

func (s *Service) OpenManifest(ctx context.Context, id uint, userID uint, orgID *uint) (ObjectResult, error) {
	artifact, _, err := s.GetVisible(ctx, id, userID, orgID)
	if err != nil {
		return ObjectResult{}, err
	}
	body, size, contentType, err := s.store.GetObject(ctx, artifact.ManifestStorageKey, -1, -1)
	if err != nil {
		return ObjectResult{}, err
	}
	return ObjectResult{Body: body, Size: size, ContentType: fallbackString(contentType, artifact.MimeType)}, nil
}

func (s *Service) OpenPresignedManifest(ctx context.Context, id uint, userID uint, orgID *uint, fallback SegmentURLResolver) (ObjectResult, error) {
	artifact, segments, err := s.GetVisible(ctx, id, userID, orgID)
	if err != nil {
		return ObjectResult{}, err
	}
	body, _, contentType, err := s.store.GetObject(ctx, artifact.ManifestStorageKey, -1, -1)
	if err != nil {
		return ObjectResult{}, err
	}
	manifest, readErr := io.ReadAll(body)
	closeErr := body.Close()
	if readErr != nil {
		return ObjectResult{}, readErr
	}
	if closeErr != nil {
		return ObjectResult{}, closeErr
	}
	urls := make(map[string]string, len(segments))
	for _, segment := range segments {
		directURL := ""
		if !strings.HasSuffix(strings.ToLower(segment.Name), ".m3u8") {
			directURL, _ = s.store.DirectURL(ctx, segment.StorageKey)
		}
		if directURL == "" && fallback != nil {
			directURL = fallback(segment)
		}
		if directURL != "" {
			urls[segment.Name] = directURL
		}
	}
	rewritten := rewriteManifestReferences(manifest, urls)
	return ObjectResult{
		Body:        io.NopCloser(bytes.NewReader(rewritten)),
		Size:        int64(len(rewritten)),
		ContentType: fallbackString(contentType, artifact.MimeType),
	}, nil
}

func (s *Service) OpenSegment(ctx context.Context, id uint, segmentName string, userID uint, orgID *uint) (ObjectResult, error) {
	_, segments, err := s.GetVisible(ctx, id, userID, orgID)
	if err != nil {
		return ObjectResult{}, err
	}
	segmentName = sanitizeSegmentName(segmentName)
	for _, segment := range segments {
		if segment.Name != segmentName {
			continue
		}
		body, size, contentType, err := s.store.GetObject(ctx, segment.StorageKey, -1, -1)
		if err != nil {
			return ObjectResult{}, err
		}
		return ObjectResult{Body: body, Size: size, ContentType: fallbackString(contentType, segment.MimeType)}, nil
	}
	return ObjectResult{}, ErrNotFound
}

func (s *Service) validateUploadScope(ctx context.Context, input UploadInput) error {
	if input.ProjectID != nil {
		if err := s.validateProjectScope(ctx, *input.ProjectID, input.UserID, input.OrgID); err != nil {
			return err
		}
	}
	if input.SourceResourceID != nil {
		if err := s.validateResourceScope(ctx, *input.SourceResourceID, input.UserID, input.OrgID); err != nil {
			return err
		}
	}
	if input.SourceDerivativeID != nil {
		if err := s.validateDerivativeScope(ctx, *input.SourceDerivativeID, input.SourceResourceID, input.UserID, input.OrgID); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) validateProjectScope(ctx context.Context, projectID uint, userID uint, orgID *uint) error {
	var project persistencemodel.Project
	if err := s.db.WithContext(ctx).Select("id, owner_id, org_id").First(&project, projectID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrForbidden
		}
		return err
	}
	if orgID != nil {
		if project.OrgID != nil && *project.OrgID == *orgID {
			return nil
		}
		return ErrForbidden
	}
	if project.OrgID == nil && project.OwnerID == userID {
		return nil
	}
	var count int64
	if err := s.db.WithContext(ctx).Model(&persistencemodel.ProjectMember{}).
		Where("project_id = ? AND user_id = ?", projectID, userID).
		Count(&count).Error; err != nil {
		return err
	}
	if count > 0 && project.OrgID == nil {
		return nil
	}
	return ErrForbidden
}

func (s *Service) validateResourceScope(ctx context.Context, resourceID uint, userID uint, orgID *uint) error {
	resource, err := s.loadVisibleResource(ctx, resourceID, userID, orgID)
	if err != nil {
		return err
	}
	if resource.OrgID != nil && orgID != nil && *resource.OrgID == *orgID {
		return nil
	}
	if resource.OrgID == nil && resource.OwnerID == userID {
		return nil
	}
	return ErrForbidden
}

func (s *Service) validateDerivativeScope(ctx context.Context, derivativeID uint, sourceResourceID *uint, userID uint, orgID *uint) error {
	var derivative persistencemodel.ResourceDerivative
	if err := s.db.WithContext(ctx).First(&derivative, derivativeID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrForbidden
		}
		return err
	}
	if sourceResourceID != nil && derivative.OutputResourceID != *sourceResourceID {
		return fmt.Errorf("%w: source_derivative_id does not match source_resource_id", ErrInvalidProvenance)
	}
	return s.validateResourceScope(ctx, derivative.OutputResourceID, userID, orgID)
}

func (s *Service) loadVisibleResource(ctx context.Context, resourceID uint, userID uint, orgID *uint) (persistencemodel.RawResource, error) {
	var resource persistencemodel.RawResource
	if err := s.db.WithContext(ctx).First(&resource, resourceID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return resource, ErrForbidden
		}
		return resource, err
	}
	if resource.OrgID != nil && orgID != nil && *resource.OrgID == *orgID {
		return resource, nil
	}
	if domainresource.InOrgScope(resource.OrgID, orgID, resource.OwnerID, userID, true) && resource.OwnerID == userID {
		return resource, nil
	}
	return resource, ErrForbidden
}

func parseSegments(value string) ([]SegmentDescriptor, error) {
	var segments []SegmentDescriptor
	if strings.TrimSpace(value) == "" {
		return segments, nil
	}
	if err := json.Unmarshal([]byte(value), &segments); err != nil {
		return nil, err
	}
	return segments, nil
}

func rewriteManifestReferences(manifest []byte, urls map[string]string) []byte {
	lines := strings.Split(string(manifest), "\n")
	for index, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		if strings.HasPrefix(trimmed, "#EXT-X-MAP:") {
			lines[index] = replaceManifestAttributeURI(line, urls)
			continue
		}
		if strings.HasPrefix(trimmed, "#") {
			continue
		}
		if url := urls[trimmed]; url != "" {
			lines[index] = url
		}
	}
	return []byte(strings.Join(lines, "\n"))
}

func replaceManifestAttributeURI(line string, urls map[string]string) string {
	return replaceManifestAttribute(line, "URI", func(value string) string {
		if url := urls[value]; url != "" {
			return url
		}
		return value
	})
}

func replaceManifestAttribute(line string, key string, replace func(string) string) string {
	prefix := key + "=\""
	index := strings.Index(line, prefix)
	if index < 0 {
		return line
	}
	valueStart := index + len(prefix)
	valueEnd := strings.Index(line[valueStart:], "\"")
	if valueEnd < 0 {
		return line
	}
	valueEnd += valueStart
	next := replace(line[valueStart:valueEnd])
	return line[:valueStart] + next + line[valueEnd:]
}

func validateManifestReferences(manifest []byte, segmentInputs []SegmentInput, segments map[string]struct{}) error {
	if err := validateSingleManifestReferences(manifest, segments); err != nil {
		return err
	}
	for _, segment := range segmentInputs {
		if !strings.HasSuffix(strings.ToLower(sanitizeSegmentName(segment.Name)), ".m3u8") {
			continue
		}
		if err := validateSingleManifestReferences(segment.Data, segments); err != nil {
			return err
		}
	}
	return nil
}

func validateSingleManifestReferences(manifest []byte, segments map[string]struct{}) error {
	for _, reference := range manifestReferences(manifest) {
		name := sanitizeSegmentName(reference)
		if name == "" || name != reference {
			return fmt.Errorf("%w: manifest references unsupported path %q", ErrInvalidManifest, reference)
		}
		if _, ok := segments[name]; !ok {
			return fmt.Errorf("%w: manifest references missing segment %q", ErrInvalidManifest, name)
		}
	}
	return nil
}

func manifestReferences(manifest []byte) []string {
	var references []string
	for _, line := range strings.Split(string(manifest), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if strings.HasPrefix(line, "#EXT-X-MAP:") {
			if uri := manifestAttribute(line, "URI"); uri != "" {
				references = append(references, uri)
			}
			continue
		}
		if strings.HasPrefix(line, "#") {
			continue
		}
		references = append(references, line)
	}
	return references
}

func manifestAttribute(line string, key string) string {
	prefix := key + "="
	index := strings.Index(line, prefix)
	if index < 0 {
		return ""
	}
	value := strings.TrimSpace(line[index+len(prefix):])
	if strings.HasPrefix(value, "\"") {
		value = strings.TrimPrefix(value, "\"")
		if end := strings.Index(value, "\""); end >= 0 {
			return value[:end]
		}
		return ""
	}
	if end := strings.Index(value, ","); end >= 0 {
		value = value[:end]
	}
	return strings.TrimSpace(value)
}

func streamVisibleTo(artifact persistencemodel.MediaStreamArtifact, userID uint, orgID *uint) bool {
	if artifact.OwnerID == userID && artifact.OrgID == nil && orgID == nil {
		return true
	}
	if artifact.OwnerID == userID && artifact.OrgID == nil && orgID != nil {
		return true
	}
	return artifact.OrgID != nil && orgID != nil && *artifact.OrgID == *orgID
}

func streamExpired(artifact persistencemodel.MediaStreamArtifact, now time.Time) bool {
	return artifact.ExpiresAt != nil && !artifact.ExpiresAt.After(now)
}

func sanitizeManifestName(value string) string {
	value = sanitizeFilename(value)
	if value == "" {
		return "manifest.m3u8"
	}
	if !strings.HasSuffix(strings.ToLower(value), ".m3u8") {
		return value + ".m3u8"
	}
	return value
}

func sanitizeSegmentName(value string) string {
	value = sanitizeFilename(value)
	lower := strings.ToLower(value)
	if strings.HasSuffix(lower, ".ts") || strings.HasSuffix(lower, ".m4s") || strings.HasSuffix(lower, ".mp4") || strings.HasSuffix(lower, ".aac") || strings.HasSuffix(lower, ".m3u8") {
		return value
	}
	return ""
}

func sanitizeFilename(value string) string {
	value = strings.TrimSpace(strings.ReplaceAll(value, "\\", "/"))
	value = path.Base(value)
	value = strings.Trim(value, ". ")
	if value == "." || value == "/" {
		return ""
	}
	return strings.Map(func(r rune) rune {
		switch r {
		case 0, '/', '\\', ':', '*', '?', '"', '<', '>', '|':
			return -1
		default:
			return r
		}
	}, value)
}

func normalizeManifestMimeType(value string) string {
	value = strings.TrimSpace(value)
	if value != "" {
		return value
	}
	return "application/vnd.apple.mpegurl"
}

func normalizeSegmentMimeType(value string, name string) string {
	value = strings.TrimSpace(value)
	if value != "" {
		return value
	}
	if strings.HasSuffix(strings.ToLower(name), ".m4s") {
		return "video/iso.segment"
	}
	if strings.HasSuffix(strings.ToLower(name), ".m3u8") {
		return "application/vnd.apple.mpegurl"
	}
	if strings.HasSuffix(strings.ToLower(name), ".mp4") {
		return "video/mp4"
	}
	if strings.HasSuffix(strings.ToLower(name), ".aac") {
		return "audio/aac"
	}
	return "video/mp2t"
}

func randomID() string {
	var bytes [12]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "stream"
	}
	return hex.EncodeToString(bytes[:])
}

func fallbackString(value string, fallback string) string {
	if strings.TrimSpace(value) != "" {
		return value
	}
	return fallback
}

func maxInt(value int, min int) int {
	if value < min {
		return min
	}
	return value
}

func normalizeCleanupLimit(value int) int {
	if value <= 0 {
		return 100
	}
	if value > 1000 {
		return 1000
	}
	return value
}
