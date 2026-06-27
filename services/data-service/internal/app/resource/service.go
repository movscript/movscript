package resource

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/movscript/auth-service/pkg/authidentity"
	domainresource "github.com/movscript/movscript/internal/domain/resource"
	"github.com/movscript/movscript/internal/infra/ai"
	"github.com/movscript/movscript/internal/infra/cache"
	"github.com/movscript/movscript/internal/infra/storage"
	"gorm.io/gorm"
)

var (
	ErrNotFound                          = errors.New("resource not found")
	ErrFolderNotFound                    = errors.New("resource folder not found")
	ErrForbidden                         = errors.New("resource access denied")
	ErrNoStorageKey                      = errors.New("resource has no storage key")
	ErrDuplicateName                     = errors.New("resource filename already exists")
	ErrResourceInUse                     = errors.New("resource is still referenced")
	ErrInvalidDerivative                 = errors.New("invalid resource derivative")
	ErrInvalidProviderAssetCertification = errors.New("invalid provider asset certification")
)

type Service struct {
	repo     repository
	store    storage.Storage
	verifier ai.ImageVerificationClient
	cache    cache.Cache
}

const listCacheTTL = 60 * time.Second

func NewService(db *gorm.DB, store storage.Storage, verifier ai.ImageVerificationClient, cacheStore ...cache.Cache) *Service {
	return NewServiceWithIdentity(db, store, verifier, nil, cacheStore...)
}

func NewServiceWithIdentity(db *gorm.DB, store storage.Storage, verifier ai.ImageVerificationClient, identity authidentity.OrgDirectory, cacheStore ...cache.Cache) *Service {
	var c cache.Cache
	if len(cacheStore) > 0 {
		c = cacheStore[0]
	}
	if c == nil {
		c = cache.NewNoop()
	}
	return &Service{repo: &gormRepository{db: db, identity: identity}, store: store, verifier: verifier, cache: c}
}

type ListInput struct {
	UserID   uint
	OrgID    *uint
	FolderID string
	Scope    string
	Type     string
	Query    string
	Page     int
	PageSize int
}

type Page struct {
	Total    int64                        `json:"total"`
	Items    []domainresource.RawResource `json:"items"`
	Page     int                          `json:"page"`
	PageSize int                          `json:"page_size"`
}

type UploadInput struct {
	UserID     uint
	OrgID      *uint
	FolderID   string
	Filename   string
	MimeType   string
	Size       int64
	Data       []byte
	Derivative *UploadDerivativeInput
}

type UploadDerivativeInput struct {
	Operation        string
	Tool             string
	InputResourceIDs []uint
	Params           json.RawMessage
}

type UpdateInput struct {
	UserID   uint
	OrgID    *uint
	ID       uint
	FolderID *uint
	Name     string
}

type VerifyImageInput struct {
	UserID uint
	OrgID  *uint
	ID     uint
}

type RecordProviderAssetCertificationInput struct {
	UserID        uint
	OrgID         *uint
	ID            uint
	Provider      string
	Certification map[string]any
}

type RecordProviderGeneratedArtifactInput struct {
	UserID   uint
	OrgID    *uint
	ID       uint
	Artifact map[string]any
}

func (s *Service) List(ctx context.Context, input ListInput) ([]domainresource.RawResource, *Page, error) {
	version, _ := s.cache.GetVersion(ctx, resourceListNamespace(input.UserID, input.OrgID))
	cacheKey := resourceListCacheKey(input, version)
	var cached cachedListResult
	if ok, err := s.cache.GetJSON(ctx, cacheKey, &cached); err == nil && ok {
		if cached.Page != nil {
			cached.Page.Items = cached.Resources
		}
		return cached.Resources, cached.Page, nil
	}
	resources, page, err := s.repo.List(ctx, input)
	if err == nil {
		_ = s.cache.SetJSON(ctx, cacheKey, cachedListResult{Resources: resources, Page: page}, listCacheTTL)
	}
	return resources, page, err
}

func (s *Service) Upload(ctx context.Context, input UploadInput) (domainresource.RawResource, error) {
	mimeType := normalizeUploadMimeType(input.MimeType, input.Filename)
	filename := strings.TrimSpace(input.Filename)
	data := input.Data
	size := input.Size
	if err := s.ensureUniqueResourceName(ctx, input.UserID, input.OrgID, filename, 0); err != nil {
		return domainresource.RawResource{}, err
	}
	blob, err := s.ensureBlobForData(ctx, data, mimeType)
	if err != nil {
		return domainresource.RawResource{}, err
	}
	derivative, err := s.prepareUploadDerivative(ctx, input)
	if err != nil {
		return domainresource.RawResource{}, err
	}

	var r domainresource.RawResource
	if err := s.repo.Transaction(ctx, func(repo repository) error {
		folderID, err := repo.UploadFolderID(ctx, input.UserID, input.OrgID, input.FolderID)
		if err != nil {
			return err
		}
		if err := s.ensureUniqueResourceNameWithRepo(ctx, repo, input.UserID, input.OrgID, filename, 0); err != nil {
			return err
		}
		r = domainresource.NewUploadedResource(domainresource.NewUploadedResourceSpec{
			OwnerID:        input.UserID,
			OrgID:          input.OrgID,
			FolderID:       folderID,
			Name:           filename,
			MimeType:       mimeType,
			Size:           size,
			StorageBackend: s.store.Backend(),
		})
		r.BlobID = &blob.ID
		r.FilePath = "stored:" + blob.StorageKey
		r.StorageKey = blob.StorageKey
		r.StorageBackend = blob.StorageBackend
		if err := repo.CreateResource(ctx, &r); err != nil {
			return err
		}
		if derivative != nil {
			derivative.OutputResourceID = r.ID
			if err := repo.CreateDerivative(ctx, *derivative); err != nil {
				return err
			}
		}
		return repo.IncrementBlobRef(ctx, blob.ID)
	}); err != nil {
		return domainresource.RawResource{}, err
	}
	s.bumpListVersion(ctx, input.UserID, input.OrgID)
	return r, nil
}

func (s *Service) prepareUploadDerivative(ctx context.Context, input UploadInput) (*resourceDerivative, error) {
	if input.Derivative == nil {
		return nil, nil
	}
	operation := strings.TrimSpace(input.Derivative.Operation)
	if operation == "" {
		return nil, fmt.Errorf("%w: operation is required", ErrInvalidDerivative)
	}
	for _, resourceID := range input.Derivative.InputResourceIDs {
		if resourceID == 0 {
			return nil, fmt.Errorf("%w: input_resource_ids must be positive", ErrInvalidDerivative)
		}
		if _, err := s.repo.GetVisible(ctx, resourceID, input.UserID, input.OrgID); err != nil {
			return nil, err
		}
	}
	inputIDs, err := json.Marshal(input.Derivative.InputResourceIDs)
	if err != nil {
		return nil, fmt.Errorf("%w: input_resource_ids", ErrInvalidDerivative)
	}
	params := input.Derivative.Params
	if len(params) == 0 {
		params = json.RawMessage(`{}`)
	}
	if !json.Valid(params) {
		return nil, fmt.Errorf("%w: params must be valid JSON", ErrInvalidDerivative)
	}
	return &resourceDerivative{
		Operation:        operation,
		Tool:             strings.TrimSpace(input.Derivative.Tool),
		InputResourceIDs: string(inputIDs),
		Params:           string(params),
	}, nil
}

func (s *Service) GetVisible(ctx context.Context, id uint, userID uint, orgID *uint) (domainresource.RawResource, error) {
	return s.repo.GetVisible(ctx, id, userID, orgID)
}

func (s *Service) GetSignedResource(ctx context.Context, id uint) (domainresource.RawResource, error) {
	return s.repo.GetByID(ctx, id)
}

func (s *Service) Usages(ctx context.Context, id uint, userID uint, orgID *uint) (UsageSummary, error) {
	if _, err := s.repo.GetVisible(ctx, id, userID, orgID); err != nil {
		return UsageSummary{}, err
	}
	return s.repo.ResourceUsages(ctx, UsageInput{ResourceID: id, UserID: userID, OrgID: orgID})
}

func (s *Service) AdoptToTeam(ctx context.Context, id uint, userID uint, orgID *uint) (domainresource.RawResource, error) {
	resource, err := s.repo.AdoptOwnedPersonalResourceToOrg(ctx, id, userID, orgID)
	if err != nil {
		return resource, err
	}
	s.bumpListVersion(ctx, userID, nil)
	s.bumpListVersion(ctx, userID, orgID)
	return resource, nil
}

func (s *Service) Delete(ctx context.Context, id uint, userID uint, orgID *uint) error {
	if err := s.repo.Transaction(ctx, func(repo repository) error {
		r, err := repo.GetOwned(ctx, id, userID, orgID)
		if err != nil {
			return err
		}
		refs, err := repo.ResourceReferenceCount(ctx, r.ID)
		if err != nil {
			return err
		}
		if refs > 0 {
			return ErrResourceInUse
		}
		if err := repo.DeleteResourceRecord(ctx, &r); err != nil {
			return err
		}
		if r.BlobID != nil {
			return repo.DecrementBlobRef(ctx, *r.BlobID)
		}
		return nil
	}); err != nil {
		return err
	}
	s.bumpListVersion(ctx, userID, orgID)
	return nil
}

func (s *Service) Update(ctx context.Context, input UpdateInput) (domainresource.RawResource, error) {
	r, err := s.repo.GetOwned(ctx, input.ID, input.UserID, input.OrgID)
	if err != nil {
		return r, err
	}
	var updates domainresource.UpdateSpec
	if input.FolderID != nil {
		if *input.FolderID == 0 {
			updates.ClearFolder = true
		} else {
			folderID, err := s.repo.UploadFolderID(ctx, input.UserID, input.OrgID, strconv.FormatUint(uint64(*input.FolderID), 10))
			if err != nil {
				return r, err
			}
			if folderID == nil {
				return r, ErrFolderNotFound
			}
			updates.FolderID = folderID
		}
	}
	if name := strings.TrimSpace(input.Name); name != "" {
		if err := s.ensureUniqueResourceName(ctx, input.UserID, input.OrgID, name, r.ID); err != nil {
			return r, err
		}
		updates.Name = &name
	}
	if !updates.Empty() {
		if err := s.repo.UpdateResourceRecord(ctx, &r, updates); err != nil {
			return r, err
		}
	}
	if err := s.repo.ReloadResource(ctx, &r); err != nil {
		return r, err
	}
	s.bumpListVersion(ctx, input.UserID, input.OrgID)
	return r, nil
}

func (s *Service) ensureUniqueResourceName(ctx context.Context, userID uint, orgID *uint, name string, excludeID uint) error {
	return s.ensureUniqueResourceNameWithRepo(ctx, s.repo, userID, orgID, name, excludeID)
}

func (s *Service) ensureUniqueResourceNameWithRepo(ctx context.Context, repo repository, userID uint, orgID *uint, name string, excludeID uint) error {
	if strings.TrimSpace(name) == "" {
		return nil
	}
	exists, err := repo.ResourceNameExists(ctx, resourceNameScope{
		UserID:    userID,
		OrgID:     orgID,
		Name:      name,
		ExcludeID: excludeID,
	})
	if err != nil {
		return err
	}
	if exists {
		return ErrDuplicateName
	}
	return nil
}

func (s *Service) ensureBlobForData(ctx context.Context, data []byte, mimeType string) (resourceBlob, error) {
	return s.ensureBlobForDataWithRepo(ctx, s.repo, data, mimeType)
}

func (s *Service) ensureBlobForDataWithRepo(ctx context.Context, repo repository, data []byte, mimeType string) (resourceBlob, error) {
	hash := sha256Hex(data)
	if existing, ok, err := repo.FindBlobByHash(ctx, hash); err != nil {
		return resourceBlob{}, err
	} else if ok {
		return existing, nil
	}
	key := domainresource.GenerateBlobStorageKey(hash)
	if err := s.store.Put(ctx, key, bytes.NewReader(data), int64(len(data)), mimeType); err != nil {
		return resourceBlob{}, err
	}
	blob := resourceBlob{
		Hash:           hash,
		StorageBackend: s.store.Backend(),
		StorageKey:     key,
		Size:           int64(len(data)),
		MimeType:       mimeType,
	}
	if err := repo.CreateBlob(ctx, &blob); err != nil {
		if existing, ok, findErr := repo.FindBlobByHash(ctx, hash); findErr != nil {
			return resourceBlob{}, findErr
		} else if ok {
			return existing, nil
		}
		return resourceBlob{}, err
	}
	return blob, nil
}

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func (s *Service) VerifyImage(ctx context.Context, input VerifyImageInput) (domainresource.RawResource, error) {
	r, err := s.repo.GetOwned(ctx, input.ID, input.UserID, input.OrgID)
	if err != nil {
		return r, err
	}
	if r.Type != "image" {
		return r, errors.New("resource is not an image")
	}
	if s.verifier == nil {
		return r, errors.New("image verifier is not configured")
	}
	ref, err := s.buildVerificationRef(ctx, r)
	if err != nil {
		return r, err
	}
	result, err := s.verifier.VerifyImage(ctx, ai.ImageVerificationRequest{
		ImageURL: ref,
		MimeType: r.MimeType,
	})
	if err != nil {
		status := string(ai.ImageVerificationRejected)
		errText := err.Error()
		_ = s.repo.UpdateResourceRecord(ctx, &r, domainresource.UpdateSpec{
			VerificationStatus:   &status,
			VerificationRef:      &ref,
			VerificationProvider: ptrString("seeaance"),
			VerificationError:    &errText,
		})
		return r, err
	}
	status := string(result.Status)
	if status == "" {
		status = string(ai.ImageVerificationPending)
	}
	verifiedAt := result.CheckedAt
	if verifiedAt.IsZero() {
		verifiedAt = time.Now().UTC()
	}
	updates := domainresource.UpdateSpec{
		VerificationStatus:   &status,
		VerificationRef:      &result.Ref,
		VerifiedAt:           &verifiedAt,
		VerificationProvider: &result.Provider,
		VerificationError:    stringPtr(result.Message),
	}
	if err := s.repo.UpdateResourceRecord(ctx, &r, updates); err != nil {
		return r, err
	}
	if err := s.repo.ReloadResource(ctx, &r); err != nil {
		return r, err
	}
	return r, nil
}

func (s *Service) RecordProviderAssetCertification(ctx context.Context, input RecordProviderAssetCertificationInput) (domainresource.RawResource, error) {
	r, err := s.repo.GetVisible(ctx, input.ID, input.UserID, input.OrgID)
	if err != nil {
		return r, err
	}
	provider := strings.TrimSpace(input.Provider)
	if provider == "" {
		return r, fmt.Errorf("%w: provider_id is required", ErrInvalidProviderAssetCertification)
	}
	certification := copyProviderAssetCertification(input.Certification)
	if len(certification) == 0 {
		return r, fmt.Errorf("%w: certification is empty", ErrInvalidProviderAssetCertification)
	}
	certificationProviderID := strings.TrimSpace(stringValue(certification["provider_id"]))
	if certificationProviderID == "" {
		certification["provider_id"] = provider
	} else if certificationProviderID != provider {
		return r, fmt.Errorf("%w: certification provider_id %q does not match provider %q", ErrInvalidProviderAssetCertification, certificationProviderID, provider)
	}
	if strings.TrimSpace(stringValue(certification["provider"])) == "" {
		certification["provider"] = provider
	}
	certifications := copyProviderAssetCertifications(r.ProviderAssetCertifications)
	certifications[providerAssetCertificationStorageKey(provider, certification)] = certification
	updates := domainresource.UpdateSpec{ProviderAssetCertifications: certifications}
	if err := s.repo.UpdateResourceRecord(ctx, &r, updates); err != nil {
		return r, err
	}
	if err := s.repo.ReloadResource(ctx, &r); err != nil {
		return r, err
	}
	s.bumpListVersion(ctx, input.UserID, input.OrgID)
	return r, nil
}

func providerAssetCertificationStorageKey(provider string, certification map[string]any) string {
	provider = strings.TrimSpace(provider)
	model := strings.TrimSpace(stringValue(certification["model"]))
	backend := strings.TrimSpace(stringValue(certification["asset_library_backend"]))
	if provider != "" && model != "" && backend == "yunwu_gateway" {
		return provider + "::model:" + model
	}
	return provider
}

func (s *Service) RecordProviderGeneratedArtifact(ctx context.Context, input RecordProviderGeneratedArtifactInput) (domainresource.RawResource, error) {
	r, err := s.repo.GetVisible(ctx, input.ID, input.UserID, input.OrgID)
	if err != nil {
		return r, err
	}
	artifact := copyProviderAssetCertification(input.Artifact)
	if len(artifact) == 0 {
		return r, errors.New("provider generated artifact metadata is empty")
	}
	updates := domainresource.UpdateSpec{ProviderGeneratedArtifact: artifact}
	if err := s.repo.UpdateResourceRecord(ctx, &r, updates); err != nil {
		return r, err
	}
	if err := s.repo.ReloadResource(ctx, &r); err != nil {
		return r, err
	}
	s.bumpListVersion(ctx, input.UserID, input.OrgID)
	return r, nil
}

func copyProviderAssetCertifications(value map[string]any) map[string]any {
	out := make(map[string]any, len(value)+1)
	for key, item := range value {
		out[key] = item
	}
	return out
}

func copyProviderAssetCertification(value map[string]any) map[string]any {
	out := make(map[string]any, len(value))
	for key, item := range value {
		out[key] = item
	}
	return out
}

func stringValue(value any) string {
	if s, ok := value.(string); ok {
		return s
	}
	return ""
}

func (s *Service) buildVerificationRef(ctx context.Context, r domainresource.RawResource) (string, error) {
	if r.StorageKey != "" && s.store != nil {
		if url, err := s.store.DirectURL(ctx, r.StorageKey); err == nil && url != "" {
			return url, nil
		}
	}
	if r.URL != "" {
		return r.URL, nil
	}
	if r.DirectURL != "" {
		return r.DirectURL, nil
	}
	if r.FilePath != "" {
		return "file://" + r.FilePath, nil
	}
	return "", errors.New("resource has no verifiable reference")
}

type cachedListResult struct {
	Resources []domainresource.RawResource `json:"resources"`
	Page      *Page                        `json:"page,omitempty"`
}

func (s *Service) bumpListVersion(ctx context.Context, userID uint, orgID *uint) {
	_, _ = s.cache.BumpVersion(ctx, resourceListNamespace(userID, orgID))
}

func resourceListNamespace(userID uint, orgID *uint) string {
	return fmt.Sprintf("resources:user:%d:org:%s", userID, orgIDCachePart(orgID))
}

func resourceListCacheKey(input ListInput, version int64) string {
	values := url.Values{}
	values.Set("folder_id", strings.TrimSpace(input.FolderID))
	values.Set("scope", strings.TrimSpace(input.Scope))
	values.Set("type", strings.TrimSpace(input.Type))
	values.Set("q", strings.TrimSpace(input.Query))
	values.Set("page", strconv.Itoa(input.Page))
	values.Set("page_size", strconv.Itoa(input.PageSize))
	return fmt.Sprintf("%s:v%d:%s", resourceListNamespace(input.UserID, input.OrgID), version, values.Encode())
}

func orgIDCachePart(orgID *uint) string {
	if orgID == nil {
		return "none"
	}
	return strconv.FormatUint(uint64(*orgID), 10)
}

func ptrString(value string) *string {
	return &value
}

func stringPtr(value string) *string {
	return &value
}

func MimeToType(mime, filename string) string {
	return domainresource.MimeToType(mime, filename)
}

func normalizeUploadMimeType(mimeType, filename string) string {
	base := strings.TrimSpace(strings.Split(mimeType, ";")[0])
	if base != "" && base != "application/octet-stream" {
		return mimeType
	}
	switch strings.ToLower(filepath.Ext(filename)) {
	case ".heic":
		return "image/heic"
	case ".heif":
		return "image/heif"
	default:
		return mimeType
	}
}

func GenerateStorageKey(resourceID uint, filename string) string {
	return domainresource.GenerateStorageKey(resourceID, filename)
}
