package decision

import (
	"context"
	"encoding/json"
	"errors"

	domaindecision "github.com/movscript/movscript/internal/domain/decision"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	Get(ctx context.Context, target TargetInput) (domaindecision.Context, error)
	ListByTargetRefs(ctx context.Context, target QueryTargetsInput) ([]domaindecision.Context, error)
	Upsert(ctx context.Context, input upsertContextInput) (domaindecision.Context, error)
}

type upsertContextInput struct {
	TargetInput
	Candidates []json.RawMessage
	Selection  json.RawMessage
	ActorID    *uint
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) Get(ctx context.Context, target TargetInput) (domaindecision.Context, error) {
	var row persistencemodel.DecisionContext
	if err := r.db.WithContext(ctx).
		Where("project_id = ? AND target_kind = ? AND target_ref = ?", target.ProjectID, target.TargetKind, target.TargetRef).
		First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domaindecision.Context{}, ErrDecisionNotFound
		}
		return domaindecision.Context{}, err
	}
	return domaindecision.ContextFromModel(row), nil
}

func (r *gormRepository) ListByTargetRefs(ctx context.Context, target QueryTargetsInput) ([]domaindecision.Context, error) {
	var rows []persistencemodel.DecisionContext
	if err := r.db.WithContext(ctx).
		Where("project_id = ? AND target_kind = ? AND target_ref IN ?", target.ProjectID, target.TargetKind, target.TargetRefs).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]domaindecision.Context, 0, len(rows))
	for _, row := range rows {
		out = append(out, domaindecision.ContextFromModel(row))
	}
	return out, nil
}

func (r *gormRepository) Upsert(ctx context.Context, input upsertContextInput) (domaindecision.Context, error) {
	var row persistencemodel.DecisionContext
	if err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		lookupErr := tx.
			Where("project_id = ? AND target_kind = ? AND target_ref = ?", input.ProjectID, input.TargetKind, input.TargetRef).
			First(&row).Error
		if lookupErr != nil && !errors.Is(lookupErr, gorm.ErrRecordNotFound) {
			return lookupErr
		}
		candidatesJSON, err := json.Marshal(input.Candidates)
		if err != nil {
			return err
		}
		selectionJSON := "{}"
		status := domaindecision.StatusOpen
		if len(input.Selection) > 0 {
			selectionJSON = string(input.Selection)
			status = domaindecision.StatusSelected
		}
		if errors.Is(lookupErr, gorm.ErrRecordNotFound) {
			if err := tx.Model(&persistencemodel.DecisionContext{}).Create(map[string]any{
				"project_id":      input.ProjectID,
				"target_kind":     input.TargetKind,
				"target_ref":      input.TargetRef,
				"candidates_json": string(candidatesJSON),
				"selection_json":  selectionJSON,
				"status":          status,
				"created_by":      input.ActorID,
				"updated_by":      input.ActorID,
			}).Error; err != nil {
				return err
			}
			return tx.
				Where("project_id = ? AND target_kind = ? AND target_ref = ?", input.ProjectID, input.TargetKind, input.TargetRef).
				First(&row).Error
		}
		if err := tx.Model(&persistencemodel.DecisionContext{}).
			Where("id = ?", row.ID).
			Updates(map[string]any{
				"candidates_json": string(candidatesJSON),
				"selection_json":  selectionJSON,
				"status":          status,
				"updated_by":      input.ActorID,
			}).Error; err != nil {
			return err
		}
		return tx.First(&row, row.ID).Error
	}); err != nil {
		return domaindecision.Context{}, err
	}
	return domaindecision.ContextFromModel(row), nil
}
