package scriptpreview

import (
	"context"
	"errors"

	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var ErrDraftNotFound = errors.New("script preview draft not found")

type DraftSnapshot struct {
	ProjectID            uint
	DraftID              string
	Title                string
	SourceType           string
	SourceText           string
	Status               string
	PreviewStatus        string
	ConfirmedAt          string
	StoryboardRevisionID string
	PreviewTimelineID    string
	SnapshotJSON         string
	DurationSec          float64
	SavedAt              string
}

type DraftStore interface {
	SaveDraftSnapshot(ctx context.Context, snapshot DraftSnapshot) error
	GetDraftSnapshot(ctx context.Context, projectID uint, draftID string) (DraftSnapshot, error)
	GetLatestDraftSnapshot(ctx context.Context, projectID uint) (DraftSnapshot, error)
}

type gormDraftStore struct {
	db *gorm.DB
}

func NewGormDraftStore(db *gorm.DB) DraftStore {
	return &gormDraftStore{db: db}
}

func (s *gormDraftStore) SaveDraftSnapshot(ctx context.Context, snapshot DraftSnapshot) error {
	record := model.ScriptPreviewDraft{
		ProjectID:            snapshot.ProjectID,
		DraftID:              snapshot.DraftID,
		Title:                snapshot.Title,
		SourceType:           snapshot.SourceType,
		SourceText:           snapshot.SourceText,
		Status:               snapshot.Status,
		PreviewStatus:        snapshot.PreviewStatus,
		ConfirmedAt:          snapshot.ConfirmedAt,
		StoryboardRevisionID: snapshot.StoryboardRevisionID,
		PreviewTimelineID:    snapshot.PreviewTimelineID,
		SnapshotJSON:         snapshot.SnapshotJSON,
		DurationSec:          snapshot.DurationSec,
		SavedAt:              snapshot.SavedAt,
	}
	return s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "project_id"}, {Name: "draft_id"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"title",
			"source_type",
			"source_text",
			"status",
			"preview_status",
			"confirmed_at",
			"storyboard_revision_id",
			"preview_timeline_id",
			"snapshot_json",
			"duration_sec",
			"saved_at",
			"updated_at",
		}),
	}).Create(&record).Error
}

func (s *gormDraftStore) GetDraftSnapshot(ctx context.Context, projectID uint, draftID string) (DraftSnapshot, error) {
	var record model.ScriptPreviewDraft
	err := s.db.WithContext(ctx).
		Where("project_id = ? AND draft_id = ? AND status <> ?", projectID, draftID, "archived").
		First(&record).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return DraftSnapshot{}, ErrDraftNotFound
		}
		return DraftSnapshot{}, err
	}
	return draftSnapshotFromRecord(record), nil
}

func (s *gormDraftStore) GetLatestDraftSnapshot(ctx context.Context, projectID uint) (DraftSnapshot, error) {
	var record model.ScriptPreviewDraft
	err := s.db.WithContext(ctx).
		Where("project_id = ? AND status <> ?", projectID, "archived").
		Order("updated_at desc").
		First(&record).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return DraftSnapshot{}, ErrDraftNotFound
		}
		return DraftSnapshot{}, err
	}
	return draftSnapshotFromRecord(record), nil
}

func draftSnapshotFromRecord(record model.ScriptPreviewDraft) DraftSnapshot {
	return DraftSnapshot{
		ProjectID:            record.ProjectID,
		DraftID:              record.DraftID,
		Title:                record.Title,
		SourceType:           record.SourceType,
		SourceText:           record.SourceText,
		Status:               record.Status,
		PreviewStatus:        record.PreviewStatus,
		ConfirmedAt:          record.ConfirmedAt,
		StoryboardRevisionID: record.StoryboardRevisionID,
		PreviewTimelineID:    record.PreviewTimelineID,
		SnapshotJSON:         record.SnapshotJSON,
		DurationSec:          record.DurationSec,
		SavedAt:              record.SavedAt,
	}
}
