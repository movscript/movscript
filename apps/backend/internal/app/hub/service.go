package hub

import (
	"context"
	"errors"
	"strings"

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
