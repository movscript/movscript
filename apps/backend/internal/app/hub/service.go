package hub

import (
	"context"
	"errors"

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

type Service struct {
	repo  repository
	store storage.Storage
}

func NewService(db *gorm.DB, store storage.Storage) *Service {
	return &Service{repo: &gormRepository{db: db}, store: store}
}

type Package = domainhub.Package

type Download struct {
	Item        Package
	Key         string
	ContentType string
	FileName    string
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
		out = append(out, domainhub.ToPackage(row))
	}
	return out, nil
}

func (s *Service) Download(ctx context.Context, id string) (Download, error) {
	row, err := s.repo.Find(ctx, id, false)
	if err != nil {
		return Download{}, err
	}
	_ = s.repo.IncrementDownloads(ctx, row.ID)
	item := domainhub.ToPackage(row)
	return Download{
		Item:        item,
		Key:         row.PublicKey,
		ContentType: domainhub.DefaultString(row.ContentType, "application/octet-stream"),
		FileName:    domainhub.SafeFilename(row.FileName, row.PackageID+".movpkg"),
	}, nil
}
