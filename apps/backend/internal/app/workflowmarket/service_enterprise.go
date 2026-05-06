//go:build enterprise

package workflowmarket

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/domain/model"
	domainmarket "github.com/movscript/movscript/internal/domain/workflowmarket"
	"gorm.io/gorm"
)

type PublishInput struct {
	WorkflowKey string
	Description string
	Tags        []string
}

type CloneInput struct {
	Name      string
	ProjectID *uint
	Stage     string
}

func (s *Service) Publish(ctx context.Context, id uint, userID uint, input PublishInput) (model.Canvas, error) {
	cv, err := s.loadOwnedWorkflow(ctx, id, userID)
	if err != nil {
		return model.Canvas{}, err
	}
	workflowKey := strings.TrimSpace(input.WorkflowKey)
	if workflowKey == "" {
		workflowKey = strings.TrimSpace(cv.WorkflowKey)
	}
	if workflowKey == "" {
		workflowKey = fmt.Sprintf("user.%d.workflow.%d", userID, cv.ID)
	}
	if !domainmarket.ValidWorkflowKey(workflowKey) {
		return model.Canvas{}, ErrInvalidWorkflowKey
	}
	tagsRaw, _ := json.Marshal(domainmarket.CleanTags(input.Tags))
	now := time.Now()
	updates := map[string]any{
		"visibility":    "public",
		"workflow_key":  workflowKey,
		"workflow_tags": string(tagsRaw),
		"published_at":  &now,
	}
	if strings.TrimSpace(input.Description) != "" {
		updates["description"] = strings.TrimSpace(input.Description)
	}
	if err := s.db.WithContext(ctx).Model(&cv).Updates(updates).Error; err != nil {
		return model.Canvas{}, err
	}
	if err := s.db.WithContext(ctx).Preload("Nodes").Preload("Edges").First(&cv, cv.ID).Error; err != nil {
		return model.Canvas{}, err
	}
	return cv, nil
}

func (s *Service) Unpublish(ctx context.Context, id uint, userID uint) (model.Canvas, error) {
	cv, err := s.loadOwnedWorkflow(ctx, id, userID)
	if err != nil {
		return model.Canvas{}, err
	}
	if err := s.db.WithContext(ctx).Model(&cv).Updates(map[string]any{
		"visibility":   "private",
		"published_at": nil,
	}).Error; err != nil {
		return model.Canvas{}, err
	}
	cv.Visibility = "private"
	cv.PublishedAt = nil
	return cv, nil
}

func (s *Service) Clone(ctx context.Context, id uint, userID uint, input CloneInput) (model.Canvas, error) {
	var source model.Canvas
	if err := s.db.WithContext(ctx).Preload("Nodes").Preload("Edges").First(&source, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return model.Canvas{}, ErrWorkflowNotFound
		}
		return model.Canvas{}, err
	}
	if source.CanvasType != "workflow" {
		return model.Canvas{}, ErrInvalidWorkflow
	}
	if source.OwnerID != userID && source.Visibility != "public" {
		return model.Canvas{}, ErrForbidden
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		name = source.Name + " Copy"
	}
	return s.cloneWorkflowCanvas(ctx, source, userID, name, input.ProjectID, input.Stage)
}

func (s *Service) loadOwnedWorkflow(ctx context.Context, id uint, userID uint) (model.Canvas, error) {
	var cv model.Canvas
	if err := s.db.WithContext(ctx).Preload("Nodes").Preload("Edges").First(&cv, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return model.Canvas{}, ErrWorkflowNotFound
		}
		return model.Canvas{}, err
	}
	if cv.OwnerID != userID {
		return model.Canvas{}, ErrForbidden
	}
	if cv.CanvasType != "workflow" {
		return model.Canvas{}, ErrInvalidWorkflow
	}
	return cv, nil
}

func (s *Service) cloneWorkflowCanvas(ctx context.Context, source model.Canvas, ownerID uint, name string, projectID *uint, stage string) (model.Canvas, error) {
	cv := model.Canvas{
		OwnerID:      ownerID,
		Name:         name,
		Description:  source.Description,
		CanvasType:   "workflow",
		ProjectID:    projectID,
		Stage:        stage,
		Visibility:   "private",
		WorkflowTags: source.WorkflowTags,
	}
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&cv).Error; err != nil {
			return err
		}
		nodes := make([]model.CanvasNode, 0, len(source.Nodes))
		for _, node := range source.Nodes {
			node.ID = 0
			node.CanvasID = cv.ID
			node.CreatedAt = time.Time{}
			node.UpdatedAt = time.Time{}
			node.DeletedAt = gorm.DeletedAt{}
			nodes = append(nodes, node)
		}
		edges := make([]model.CanvasEdge, 0, len(source.Edges))
		for _, edge := range source.Edges {
			edge.ID = 0
			edge.CanvasID = cv.ID
			edge.CreatedAt = time.Time{}
			edge.UpdatedAt = time.Time{}
			edge.DeletedAt = gorm.DeletedAt{}
			edges = append(edges, edge)
		}
		if len(nodes) > 0 {
			if err := tx.Create(&nodes).Error; err != nil {
				return err
			}
		}
		if len(edges) > 0 {
			if err := tx.Create(&edges).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return model.Canvas{}, err
	}
	if err := s.db.WithContext(ctx).Preload("Nodes").Preload("Edges").First(&cv, cv.ID).Error; err != nil {
		return model.Canvas{}, err
	}
	return cv, nil
}
