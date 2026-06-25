package hub

import (
	"context"
	"errors"
	"time"

	domainhub "github.com/movscript/movscript/internal/domain/hub"
	"github.com/movscript/movscript/internal/infra/storage"
	"gorm.io/gorm"
)

const (
	KindPlugin   = domainhub.KindPlugin
	KindAsset    = domainhub.KindAsset
	KindTemplate = domainhub.KindTemplate
	KindWorkflow = domainhub.KindWorkflow
	KindSkill    = domainhub.KindSkill

	StatusPending   = domainhub.StatusPending
	StatusPublished = domainhub.StatusPublished
	StatusRejected  = domainhub.StatusRejected
	StatusTakenDown = domainhub.StatusTakenDown
)

var ErrNotFound = errors.New("hub package not found")
var ErrPackageLicenseRequired = errors.New("hub package license required")
var ErrReviewAuthRequired = errors.New("hub package review requires authenticated user")
var ErrInvalidReview = errors.New("invalid hub package review")
var ErrScanBlocked = errors.New("hub package scan blocks publishing")

type Service struct {
	db    *gorm.DB
	repo  repository
	store storage.Storage
}

func NewService(db *gorm.DB, store storage.Storage) *Service {
	return &Service{db: db, repo: &gormRepository{db: db}, store: store}
}

type Package = domainhub.Package

type Download struct {
	Item         Package
	PackageRowID uint
	Key          string
	ContentType  string
	FileName     string
	SHA256       string
}

type DownloadAuditInput struct {
	UserID    *uint
	IPAddress string
	UserAgent string
}

type DownloadAudit struct {
	ID        uint      `json:"id"`
	PackageID string    `json:"packageId"`
	UserID    *uint     `json:"userId,omitempty"`
	IPAddress string    `json:"ipAddress,omitempty"`
	UserAgent string    `json:"userAgent,omitempty"`
	SHA256    string    `json:"sha256,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
}

type PackageVersion struct {
	ID                  uint                          `json:"id"`
	PackageID           string                        `json:"packageId"`
	Version             string                        `json:"version"`
	FileName            string                        `json:"fileName,omitempty"`
	FileSizeBytes       int64                         `json:"fileSizeBytes"`
	FileSize            string                        `json:"fileSize"`
	ContentType         string                        `json:"contentType,omitempty"`
	SHA256              string                        `json:"sha256,omitempty"`
	RequiredProductID   string                        `json:"requiredProductId,omitempty"`
	MinWorkbenchVersion string                        `json:"minWorkbenchVersion,omitempty"`
	MaxWorkbenchVersion string                        `json:"maxWorkbenchVersion,omitempty"`
	Dependencies        []domainhub.PackageDependency `json:"dependencies,omitempty"`
	StorageProvider     string                        `json:"storageProvider,omitempty"`
	ReviewedBy          string                        `json:"reviewedBy,omitempty"`
	ReviewNote          string                        `json:"reviewNote,omitempty"`
	PublishedAt         *time.Time                    `json:"publishedAt,omitempty"`
	CreatedAt           time.Time                     `json:"createdAt"`
}

type ReviewInput struct {
	UserID  uint
	Rating  int
	Comment string
}

type PackageReview struct {
	ID        uint      `json:"id"`
	PackageID string    `json:"packageId"`
	UserID    uint      `json:"userId"`
	Rating    int       `json:"rating"`
	Comment   string    `json:"comment,omitempty"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type ReportInput struct {
	UserID *uint
	Reason string
	Detail string
}

type PackageReport struct {
	ID         uint       `json:"id"`
	PackageID  string     `json:"packageId"`
	UserID     *uint      `json:"userId,omitempty"`
	Reason     string     `json:"reason"`
	Detail     string     `json:"detail,omitempty"`
	Status     string     `json:"status"`
	ReviewedBy string     `json:"reviewedBy,omitempty"`
	ReviewNote string     `json:"reviewNote,omitempty"`
	ResolvedAt *time.Time `json:"resolvedAt,omitempty"`
	CreatedAt  time.Time  `json:"createdAt"`
	UpdatedAt  time.Time  `json:"updatedAt"`
}

type CreatorProfileInput struct {
	Name               string
	DisplayName        string
	Website            string
	ContactEmail       string
	VerificationStatus string
	ReviewNote         string
}

type CreatorProfile struct {
	ID                 uint       `json:"id"`
	Name               string     `json:"name"`
	DisplayName        string     `json:"displayName,omitempty"`
	Website            string     `json:"website,omitempty"`
	ContactEmail       string     `json:"contactEmail,omitempty"`
	VerificationStatus string     `json:"verificationStatus"`
	VerifiedBy         string     `json:"verifiedBy,omitempty"`
	ReviewNote         string     `json:"reviewNote,omitempty"`
	VerifiedAt         *time.Time `json:"verifiedAt,omitempty"`
	CreatedAt          time.Time  `json:"createdAt"`
	UpdatedAt          time.Time  `json:"updatedAt"`
}

type PackageScan struct {
	ID         uint      `json:"id"`
	PackageID  string    `json:"packageId"`
	SHA256     string    `json:"sha256,omitempty"`
	Status     string    `json:"status"`
	Severity   string    `json:"severity"`
	Scanner    string    `json:"scanner"`
	Summary    string    `json:"summary,omitempty"`
	Findings   []string  `json:"findings,omitempty"`
	ScannedAt  time.Time `json:"scannedAt"`
	ReviewedBy string    `json:"reviewedBy,omitempty"`
	ReviewNote string    `json:"reviewNote,omitempty"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

func (s *Service) Seed(ctx context.Context) error {
	return s.repo.Seed(ctx)
}

func (s *Service) List(ctx context.Context, admin bool) ([]Package, error) {
	rows, err := s.repo.List(ctx, admin)
	if err != nil {
		return nil, err
	}
	out := make([]Package, 0, len(rows))
	for _, row := range rows {
		item, err := s.editionPackageForList(ctx, row)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, nil
}

func (s *Service) Download(ctx context.Context, id string, workbenchVersion ...string) (Download, error) {
	row, err := s.repo.Find(ctx, id, false)
	if err != nil {
		return Download{}, err
	}
	if err := s.editionValidateDownload(ctx, row, workbenchVersion...); err != nil {
		return Download{}, err
	}
	item, err := s.editionPackageForDownload(ctx, row)
	if err != nil {
		return Download{}, err
	}
	if s.editionDownloadCountsInline() {
		_ = s.repo.IncrementDownloads(ctx, row.ID)
	}
	return Download{
		Item:         item,
		PackageRowID: row.ID,
		Key:          row.PublicKey,
		ContentType:  domainhub.DefaultString(row.ContentType, "application/octet-stream"),
		FileName:     domainhub.SafeFilename(row.FileName, row.PackageID+".movpkg"),
		SHA256:       row.SHA256,
	}, nil
}

func (s *Service) find(ctx context.Context, id string, admin bool) (domainhub.HubPackage, error) {
	return s.repo.Find(ctx, id, admin)
}
