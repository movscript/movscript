//go:build enterprise

package hub

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"path"
	"time"

	domainhub "github.com/movscript/movscript/internal/domain/hub"
	"github.com/movscript/movscript/internal/domain/model"
)

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
