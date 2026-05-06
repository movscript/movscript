package canvas

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"

	"github.com/movscript/movscript/internal/app/entityrelation"
	"github.com/movscript/movscript/internal/domain/canvasruntime"
	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

func (h *Service) persistWorkflowOutputsToResources(ctx context.Context, user *model.User, cv model.Canvas, runID uint, outputs map[string]canvasPortValue) error {
	if h == nil || user == nil || len(outputs) == 0 {
		return nil
	}
	keys := make([]string, 0, len(outputs))
	for key := range outputs {
		if strings.TrimSpace(key) != "" {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	persistedByFingerprint := map[string]*uint{}
	for _, key := range keys {
		value := outputs[key]
		value.Normalize()
		if canvasruntime.PortValueEmpty(value) {
			continue
		}
		if value.ResourceID == nil || *value.ResourceID == 0 {
			fingerprint := canvasPortValuePersistenceFingerprint(value)
			if rid := persistedByFingerprint[fingerprint]; rid != nil {
				value.ResourceID = rid
			} else {
				data, mimeType, ext, err := canvasPortValueResourcePayload(value)
				if err != nil {
					return fmt.Errorf("persist workflow output %q: %w", key, err)
				}
				name := canvasWorkflowOutputResourceName(cv, runID, key, value, ext)
				resource, err := h.createCanvasResourceFromBytes(ctx, user.ID, cv.OrgID, name, data, mimeType)
				if err != nil {
					return fmt.Errorf("persist workflow output %q: %w", key, err)
				}
				value.ResourceID = &resource.ID
				persistedByFingerprint[fingerprint] = &resource.ID
			}
		}
		outputs[key] = value
		h.bindWorkflowOutputResource(ctx, cv, runID, user.ID, key, value)
		h.attachWorkflowOutputTargets(ctx, cv, runID, user.ID, key, value)
	}
	return nil
}

func canvasPortValuePersistenceFingerprint(value canvasPortValue) string {
	value.Normalize()
	raw, _ := json.Marshal(value)
	return string(raw)
}

func canvasWorkflowOutputResourceName(cv model.Canvas, runID uint, key string, value canvasPortValue, ext string) string {
	base := canvasruntime.FirstNonEmptyString(cv.Name, "workflow")
	key = strings.Trim(regexp.MustCompile(`[^a-zA-Z0-9._-]+`).ReplaceAllString(key, "_"), "._-")
	base = strings.Trim(regexp.MustCompile(`[^a-zA-Z0-9._-]+`).ReplaceAllString(base, "_"), "._-")
	if base == "" {
		base = "workflow"
	}
	if key == "" {
		key = "output"
	}
	if ext == "" {
		switch value.Type {
		case "json":
			ext = "json"
		case "image":
			ext = "png"
		case "video":
			ext = "mp4"
		case "audio":
			ext = "mp3"
		default:
			ext = "txt"
		}
	}
	return fmt.Sprintf("%s_run_%d_%s.%s", base, runID, key, ext)
}

func (h *Service) bindWorkflowOutputResource(ctx context.Context, cv model.Canvas, runID uint, userID uint, key string, value canvasPortValue) {
	if h == nil || h.db == nil || cv.ProjectID == nil || value.ResourceID == nil || *value.ResourceID == 0 {
		return
	}
	metadata, _ := json.Marshal(map[string]any{
		"canvas_id":     cv.ID,
		"canvas_run_id": runID,
		"output_key":    key,
		"value_type":    value.Type,
	})
	sourceID := runID
	binding := model.ResourceBinding{
		ProjectID:    *cv.ProjectID,
		ResourceID:   *value.ResourceID,
		OwnerType:    "canvas",
		OwnerID:      cv.ID,
		Role:         "output",
		Slot:         key,
		Status:       "selected",
		SourceType:   "canvas",
		SourceID:     &sourceID,
		MetadataJSON: string(metadata),
		CreatedByID:  &userID,
	}
	_ = h.createBinding(ctx, binding)
}

func (h *Service) attachWorkflowOutputTargets(ctx context.Context, cv model.Canvas, runID uint, userID uint, key string, value canvasPortValue) {
	if h == nil || h.db == nil || cv.ProjectID == nil || value.ResourceID == nil || *value.ResourceID == 0 {
		return
	}
	var targets []model.CanvasOutput
	if err := h.db.
		Where("project_id = ? AND canvas_id = ? AND port_id = ? AND output_type = ? AND status IN ?", *cv.ProjectID, cv.ID, key, "candidate", []string{"pending", "attached"}).
		Find(&targets).Error; err != nil {
		return
	}
	if len(targets) == 0 && key == "value" {
		_ = h.db.
			Where("project_id = ? AND canvas_id = ? AND canvas_node_id = ? AND output_type = ? AND status IN ?", *cv.ProjectID, cv.ID, "final-output", "candidate", []string{"pending", "attached"}).
			Find(&targets).Error
	}
	if len(targets) == 0 && key == "final_output" {
		_ = h.db.
			Where("project_id = ? AND canvas_id = ? AND canvas_node_id = ? AND output_type = ? AND status IN ?", *cv.ProjectID, cv.ID, "final-output", "candidate", []string{"pending", "attached"}).
			Find(&targets).Error
	}
	if len(targets) == 0 {
		return
	}
	for _, target := range targets {
		if target.OwnerType != "asset_slot" || target.OwnerID == 0 {
			continue
		}
		h.attachAssetSlotCandidateOutput(ctx, cv, runID, userID, target, value)
	}
}

func (h *Service) attachAssetSlotCandidateOutput(ctx context.Context, cv model.Canvas, runID uint, userID uint, target model.CanvasOutput, value canvasPortValue) {
	if cv.ProjectID == nil || value.ResourceID == nil || *value.ResourceID == 0 {
		return
	}
	db := h.db.WithContext(ctx).Session(&gorm.Session{SkipHooks: true})
	var sourceSlot model.AssetSlot
	if err := db.First(&sourceSlot, target.OwnerID).Error; err != nil || sourceSlot.ProjectID != *cv.ProjectID {
		return
	}
	name := strings.TrimSpace(sourceSlot.Name)
	if name == "" {
		name = fmt.Sprintf("素材位 #%d", sourceSlot.ID)
	}
	var candidateSlot model.AssetSlot
	err := db.
		Where("project_id = ? AND owner_type = ? AND owner_id = ? AND resource_id = ?", *cv.ProjectID, "asset_slot", sourceSlot.ID, *value.ResourceID).
		Order("id asc").
		First(&candidateSlot).Error
	if err != nil {
		candidateSlot = model.AssetSlot{
			ProjectID:                *cv.ProjectID,
			ProductionID:             sourceSlot.ProductionID,
			CreativeReferenceID:      sourceSlot.CreativeReferenceID,
			CreativeReferenceStateID: sourceSlot.CreativeReferenceStateID,
			OwnerType:                "asset_slot",
			OwnerID:                  &sourceSlot.ID,
			Kind:                     canvasruntime.FirstNonEmptyString(sourceSlot.Kind, value.Type, "image"),
			Name:                     name + " · 生成候选",
			Description:              canvasruntime.FirstNonEmptyString(sourceSlot.Description, sourceSlot.PromptHint),
			SlotKey:                  sourceSlot.SlotKey,
			PromptHint:               sourceSlot.PromptHint,
			Status:                   "candidate",
			Priority:                 canvasruntime.FirstNonEmptyString(sourceSlot.Priority, "normal"),
			ResourceID:               value.ResourceID,
			MetadataJSON:             canvasOutputMetadataJSON(cv.ID, runID, target, value),
		}
		if err := db.Create(&candidateSlot).Error; err != nil {
			return
		}
		if err := entityrelation.SyncCoreEntityRelations(db, &candidateSlot); err != nil {
			return
		}
	}
	sourceID := runID
	var existingBinding model.ResourceBinding
	if err := db.
		Where("project_id = ? AND resource_id = ? AND owner_type = ? AND owner_id = ? AND role = ? AND slot = ? AND version = ?", *cv.ProjectID, *value.ResourceID, "asset_slot", candidateSlot.ID, "output", target.PortID, 1).
		First(&existingBinding).Error; err != nil {
		_ = h.createBinding(ctx, model.ResourceBinding{
			ProjectID:    *cv.ProjectID,
			ResourceID:   *value.ResourceID,
			OwnerType:    "asset_slot",
			OwnerID:      candidateSlot.ID,
			Role:         "output",
			Slot:         target.PortID,
			Status:       "selected",
			SourceType:   "canvas",
			SourceID:     &sourceID,
			IsPrimary:    true,
			MetadataJSON: canvasOutputMetadataJSON(cv.ID, runID, target, value),
			CreatedByID:  &userID,
		})
	}
	var existing model.AssetSlotCandidate
	err = db.
		Where("project_id = ? AND asset_slot_id = ? AND candidate_asset_slot_id = ?", *cv.ProjectID, sourceSlot.ID, candidateSlot.ID).
		First(&existing).Error
	if err != nil {
		existing = model.AssetSlotCandidate{
			ProjectID:            *cv.ProjectID,
			AssetSlotID:          sourceSlot.ID,
			CandidateAssetSlotID: candidateSlot.ID,
			SourceType:           "canvas",
			SourceID:             &runID,
			Status:               "candidate",
			Note:                 "由素材生成画布写回",
		}
		if err := db.Create(&existing).Error; err != nil {
			return
		}
		if err := entityrelation.SyncCoreEntityRelations(db, &existing); err != nil {
			return
		}
	} else {
		existing.SourceType = "canvas"
		existing.SourceID = &runID
		if existing.Status == "" || existing.Status == "pending" {
			existing.Status = "candidate"
		}
		if err := db.Save(&existing).Error; err != nil {
			return
		}
		if err := entityrelation.SyncCoreEntityRelations(db, &existing); err != nil {
			return
		}
	}
	raw, _ := json.Marshal(value)
	target.CanvasRunID = &runID
	target.ResourceID = value.ResourceID
	target.ValueJSON = string(raw)
	target.Status = "attached"
	if err := db.Save(&target).Error; err != nil {
		return
	}
	_ = entityrelation.SyncCoreEntityRelations(db, &target)
}

func canvasOutputMetadataJSON(canvasID uint, runID uint, target model.CanvasOutput, value canvasPortValue) string {
	raw, _ := json.Marshal(map[string]any{
		"canvas_id":        canvasID,
		"canvas_run_id":    runID,
		"canvas_output_id": target.ID,
		"source_port":      target.PortID,
		"value_type":       value.Type,
	})
	return string(raw)
}
