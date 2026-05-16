package canvas

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"

	canvasdomain "github.com/movscript/movscript/internal/domain/canvas"
	domainresourcebinding "github.com/movscript/movscript/internal/domain/resource/binding"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

func (h *Service) persistWorkflowOutputsToResources(ctx context.Context, user *persistencemodel.User, cv persistencemodel.Canvas, runID uint, outputs map[string]canvasPortValue) error {
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
		if canvasdomain.PortValueEmpty(value) {
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

func canvasWorkflowOutputResourceName(cv persistencemodel.Canvas, runID uint, key string, value canvasPortValue, ext string) string {
	base := canvasdomain.FirstNonEmptyString(cv.Name, "workflow")
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

func (h *Service) bindWorkflowOutputResource(ctx context.Context, cv persistencemodel.Canvas, runID uint, userID uint, key string, value canvasPortValue) {
	if h == nil || cv.ProjectID == nil || value.ResourceID == nil || *value.ResourceID == 0 {
		return
	}
	metadata, _ := json.Marshal(map[string]any{
		"canvas_id":     cv.ID,
		"canvas_run_id": runID,
		"output_key":    key,
		"value_type":    value.Type,
	})
	sourceID := runID
	binding := domainresourcebinding.New(domainresourcebinding.CreateInput{
		ProjectID:    *cv.ProjectID,
		ResourceID:   *value.ResourceID,
		OwnerType:    domainresourcebinding.OwnerTypeCanvas,
		OwnerID:      cv.ID,
		Role:         domainresourcebinding.RoleOutput,
		Slot:         key,
		Status:       domainresourcebinding.StatusSelected,
		SourceType:   domainresourcebinding.SourceTypeCanvas,
		SourceID:     &sourceID,
		MetadataJSON: string(metadata),
		CreatedByID:  &userID,
	})
	_ = h.createBinding(ctx, binding)
}

func (h *Service) attachWorkflowOutputTargets(ctx context.Context, cv persistencemodel.Canvas, runID uint, userID uint, key string, value canvasPortValue) {
	if h == nil || cv.ProjectID == nil || value.ResourceID == nil || *value.ResourceID == 0 {
		return
	}
	targets, err := h.canvasRepo().ListCanvasOutputTargets(ctx, CanvasOutputTargetFilter{
		ProjectID:  *cv.ProjectID,
		CanvasID:   cv.ID,
		PortID:     key,
		OutputType: "candidate",
		Statuses:   canvasdomain.AttachableCanvasOutputStatuses(),
	})
	if err != nil {
		return
	}
	if len(targets) == 0 && key == "value" {
		targets, _ = h.canvasRepo().ListCanvasOutputTargets(ctx, CanvasOutputTargetFilter{
			ProjectID:    *cv.ProjectID,
			CanvasID:     cv.ID,
			CanvasNodeID: "final-output",
			OutputType:   "candidate",
			Statuses:     canvasdomain.AttachableCanvasOutputStatuses(),
		})
	}
	if len(targets) == 0 && key == "final_output" {
		targets, _ = h.canvasRepo().ListCanvasOutputTargets(ctx, CanvasOutputTargetFilter{
			ProjectID:    *cv.ProjectID,
			CanvasID:     cv.ID,
			CanvasNodeID: "final-output",
			OutputType:   "candidate",
			Statuses:     canvasdomain.AttachableCanvasOutputStatuses(),
		})
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

func (h *Service) attachAssetSlotCandidateOutput(ctx context.Context, cv persistencemodel.Canvas, runID uint, userID uint, target CanvasOutputTarget, value canvasPortValue) {
	if cv.ProjectID == nil || value.ResourceID == nil || *value.ResourceID == 0 {
		return
	}
	raw, _ := json.Marshal(value)
	_ = h.canvasRepo().attachGeneratedAssetSlotCandidate(ctx, attachGeneratedAssetSlotCandidateInput{
		CanvasID:       cv.ID,
		CanvasRunID:    runID,
		ProjectID:      *cv.ProjectID,
		UserID:         userID,
		ResourceID:     *value.ResourceID,
		BindingSlot:    target.PortID,
		BindingMeta:    canvasOutputMetadataJSON(cv.ID, runID, target, value),
		CandidateNote:  "由素材生成画布写回",
		SourceSlotID:   target.OwnerID,
		OutputTarget:   ptrCanvasOutputTargetRow(target),
		OutputValueRaw: string(raw),
		CandidateNode:  target.CanvasNodeID,
	})
}

func canvasOutputMetadataJSON(canvasID uint, runID uint, target CanvasOutputTarget, value canvasPortValue) string {
	raw, _ := json.Marshal(map[string]any{
		"canvas_id":        canvasID,
		"canvas_run_id":    runID,
		"canvas_output_id": target.ID,
		"source_port":      target.PortID,
		"value_type":       value.Type,
	})
	return string(raw)
}

func ptrCanvasOutputTargetRow(target CanvasOutputTarget) *persistencemodel.CanvasOutput {
	row := target.toRow()
	return &row
}
