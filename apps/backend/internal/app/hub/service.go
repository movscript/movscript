package hub

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"path"
	"strings"
	"time"

	domainhub "github.com/movscript/movscript/internal/domain/hub"
	"github.com/movscript/movscript/internal/domain/model"
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

type Service struct {
	db    *gorm.DB
	store storage.Storage
}

func NewService(db *gorm.DB, store storage.Storage) *Service {
	return &Service{db: db, store: store}
}

type Package = domainhub.Package

type CreateInput struct {
	Title         string
	Kind          string
	Category      string
	Creator       string
	License       string
	Summary       string
	Tags          []string
	Version       string
	FileSizeBytes int64
	FileName      string
	ContentType   string
	Compatibility string
	Repository    string
	SubmittedBy   string
	Body          io.Reader
}

type PatchInput struct {
	Title         *string  `json:"title"`
	Category      *string  `json:"category"`
	Signal        *string  `json:"signal"`
	Summary       *string  `json:"summary"`
	Tags          []string `json:"tags"`
	Rating        *float64 `json:"rating"`
	Compatibility *string  `json:"compatibility"`
	Repository    *string  `json:"repository"`
	Status        *string  `json:"status"`
	ReviewNote    *string  `json:"reviewNote"`
}

type Download struct {
	Item        Package
	Key         string
	ContentType string
	FileName    string
}

func (s *Service) Seed(ctx context.Context) error {
	var count int64
	if err := s.db.WithContext(ctx).Model(&model.HubPackage{}).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	for _, item := range domainhub.SeedPackages() {
		row := domainhub.NewSeedPackageRow(item)
		if err := s.db.WithContext(ctx).Create(&row).Error; err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) List(ctx context.Context, admin bool) ([]Package, error) {
	var rows []model.HubPackage
	q := s.db.WithContext(ctx).Order("updated_at desc")
	if !admin {
		q = q.Where("status = ?", StatusPublished)
	}
	if err := q.Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]Package, 0, len(rows))
	for _, row := range rows {
		out = append(out, domainhub.ToPackage(row))
	}
	return out, nil
}

func (s *Service) Create(ctx context.Context, in CreateInput) (Package, error) {
	id := domainhub.Slugify(in.Title)
	if id == "" {
		id = "pkg-" + randomHex()
	}
	id = s.uniqueID(ctx, id)
	key := path.Join("hub", "staging", time.Now().UTC().Format("2006/01/02"), id+"-"+randomHex()+path.Ext(in.FileName))
	contentType := domainhub.DefaultString(in.ContentType, "application/octet-stream")
	if err := s.store.Put(ctx, key, in.Body, in.FileSizeBytes, contentType); err != nil {
		return Package{}, err
	}
	row := domainhub.NewDraftPackage(id, domainhub.CreateDraftInput{
		Title:           in.Title,
		Kind:            in.Kind,
		Category:        in.Category,
		Creator:         in.Creator,
		License:         in.License,
		Summary:         in.Summary,
		Tags:            in.Tags,
		Version:         in.Version,
		FileSizeBytes:   in.FileSizeBytes,
		FileName:        in.FileName,
		ContentType:     contentType,
		Compatibility:   in.Compatibility,
		Repository:      in.Repository,
		SubmittedBy:     in.SubmittedBy,
		StagingProvider: s.store.Backend(),
		StagingKey:      key,
	})
	if err := s.db.WithContext(ctx).Create(&row).Error; err != nil {
		return Package{}, err
	}
	return domainhub.ToPackage(row), nil
}

func (s *Service) Patch(ctx context.Context, id, reviewer string, in PatchInput) (Package, error) {
	row, err := s.find(ctx, id, true)
	if err != nil {
		return Package{}, err
	}
	domainhub.ApplyPatch(&row, reviewer, domainhub.PatchInput{
		Title:         in.Title,
		Category:      in.Category,
		Signal:        in.Signal,
		Summary:       in.Summary,
		Tags:          in.Tags,
		Rating:        in.Rating,
		Compatibility: in.Compatibility,
		Repository:    in.Repository,
		Status:        in.Status,
		ReviewNote:    in.ReviewNote,
	}, time.Now().UTC())
	if err := s.db.WithContext(ctx).Save(&row).Error; err != nil {
		return Package{}, err
	}
	row, err = s.find(ctx, id, true)
	if err != nil {
		return Package{}, err
	}
	return domainhub.ToPackage(row), nil
}

func (s *Service) Publish(ctx context.Context, id, reviewer, note string) (Package, error) {
	row, err := s.find(ctx, id, true)
	if err != nil {
		return Package{}, err
	}
	if row.StagingKey == "" {
		return Package{}, errors.New("package has no staged object")
	}
	publicKey := path.Join("hub", "packages", row.Kind, row.PackageID, row.Version, domainhub.SafeFilename(row.FileName, row.PackageID+".movpkg"))
	rc, size, contentType, err := s.store.GetObject(ctx, row.StagingKey, -1, -1)
	if err != nil {
		return Package{}, err
	}
	defer rc.Close()
	if err := s.store.Put(ctx, publicKey, rc, size, domainhub.DefaultString(row.ContentType, contentType)); err != nil {
		return Package{}, err
	}
	domainhub.ApplyPublish(&row, reviewer, note, s.store.Backend(), publicKey, time.Now().UTC())
	if err := s.db.WithContext(ctx).Save(&row).Error; err != nil {
		return Package{}, err
	}
	row, err = s.find(ctx, id, true)
	if err != nil {
		return Package{}, err
	}
	return domainhub.ToPackage(row), nil
}

func (s *Service) Reject(ctx context.Context, id, reviewer, note string) (Package, error) {
	status := StatusRejected
	return s.Patch(ctx, id, reviewer, PatchInput{Status: &status, ReviewNote: &note})
}

func (s *Service) TakeDown(ctx context.Context, id, reviewer, note string) (Package, error) {
	status := StatusTakenDown
	return s.Patch(ctx, id, reviewer, PatchInput{Status: &status, ReviewNote: &note})
}

func (s *Service) Download(ctx context.Context, id string) (Download, error) {
	row, err := s.find(ctx, id, false)
	if err != nil {
		return Download{}, err
	}
	_ = s.db.WithContext(ctx).Model(&row).UpdateColumn("downloads", gorm.Expr("downloads + 1")).Error
	item := domainhub.ToPackage(row)
	return Download{
		Item:        item,
		Key:         row.PublicKey,
		ContentType: domainhub.DefaultString(row.ContentType, "application/octet-stream"),
		FileName:    domainhub.SafeFilename(row.FileName, row.PackageID+".movpkg"),
	}, nil
}

func (s *Service) find(ctx context.Context, id string, admin bool) (model.HubPackage, error) {
	var row model.HubPackage
	q := s.db.WithContext(ctx).Where("package_id = ?", strings.TrimSpace(id))
	if !admin {
		q = q.Where("status = ?", StatusPublished)
	}
	if err := q.First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return model.HubPackage{}, ErrNotFound
		}
		return model.HubPackage{}, err
	}
	return row, nil
}

func (s *Service) uniqueID(ctx context.Context, base string) string {
	id := base
	for i := 0; i < 20; i++ {
		var count int64
		_ = s.db.WithContext(ctx).Model(&model.HubPackage{}).Where("package_id = ?", id).Count(&count).Error
		if count == 0 {
			return id
		}
		id = fmt.Sprintf("%s-%d", base, i+2)
	}
	return base + "-" + randomHex()
}

func splitTags(v string) []string {
	return domainhub.SplitTags(v)
}

func randomHex() string {
	var b [4]byte
	if _, err := rand.Read(b[:]); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b[:])
}
