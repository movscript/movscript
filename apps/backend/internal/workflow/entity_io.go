package workflow

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

type EntityPortValue struct {
	Type        string
	Text        string
	JSON        any
	Number      *float64
	Boolean     *bool
	ResourceIDs []uint
}

type EntityWriteMeta struct {
	CanvasID   uint
	RunID      uint
	NodeID     string
	UserID     uint
	ProjectID  *uint
	SourceType string
}

type EntityWriteResult struct {
	ProjectID         uint
	PrimaryResourceID *uint
	BindingIDs        []uint
}

type EntityIOService struct {
	db *gorm.DB
}

func NewEntityIOService(db *gorm.DB) *EntityIOService {
	return &EntityIOService{db: db}
}

func (s *EntityIOService) ReadPorts(ctx context.Context, kind string, id uint) (map[string]EntityPortValue, error) {
	if _, ok := EntitySchemaForKind(kind); !ok {
		return nil, fmt.Errorf("unsupported entity type %q", kind)
	}
	values := map[string]EntityPortValue{}
	addText := func(portID string, text string) {
		field, ok := EntityFieldForPort(kind, portID)
		if !ok || !field.Workflow.Readable || strings.TrimSpace(text) == "" {
			return
		}
		values[portID] = EntityPortValue{Type: field.ValueType, Text: text}
	}
	addBinding := func(portID string) {
		field, ok := EntityFieldForPort(kind, portID)
		if !ok || !field.Workflow.Readable || field.Binding == nil {
			return
		}
		var binding model.ResourceBinding
		q := s.db.WithContext(ctx).
			Where("owner_type = ? AND owner_id = ?", kind, id).
			Where("slot = ? OR role = ?", field.Binding.Slot, field.Binding.Role)
		if err := q.Order("is_primary desc, updated_at desc").First(&binding).Error; err == nil && binding.ResourceID != 0 {
			values[portID] = EntityPortValue{Type: field.ValueType, ResourceIDs: []uint{binding.ResourceID}}
		}
	}

	switch kind {
	case "script":
		var item model.Script
		if err := s.db.WithContext(ctx).First(&item, id).Error; err != nil {
			return nil, fmt.Errorf("script not found")
		}
		addText("title", item.Title)
		addText("description", item.Description)
		addText("content", item.Content)
		addText("summary", item.Summary)
		addText("characters", firstNonEmpty(item.CharacterProfiles, item.Characters))
		addText("character_profiles", item.CharacterProfiles)
		addText("character_relationships", item.CharacterRelationships)
		addText("settings", item.CoreSettings)
		addText("background", item.Background)
		addText("scenes_desc", item.ScenesDesc)
		addText("hook", item.Hook)
		addText("plot_summary", item.PlotSummary)
		addText("script_points", item.ScriptPoints)
	case "setting":
		var item model.Setting
		if err := s.db.WithContext(ctx).First(&item, id).Error; err != nil {
			return nil, fmt.Errorf("setting not found")
		}
		addText("name", item.Name)
		addText("alias", item.Alias)
		addText("type", item.Type)
		addText("description", item.Description)
		addText("content", item.Content)
		addText("status", item.Status)
		addText("importance", item.Importance)
		addText("tags", item.Tags)
		addText("profile_json", item.ProfileJSON)
	case "asset":
		var item model.Asset
		if err := s.db.WithContext(ctx).First(&item, id).Error; err != nil {
			return nil, fmt.Errorf("asset not found")
		}
		addText("name", item.Name)
		addText("type", item.Type)
		addText("description", item.Description)
		addText("variant_name", item.VariantName)
		addText("costume", item.Costume)
		addText("time_of_day", item.TimeOfDay)
		addText("period", item.Period)
		addText("state", item.State)
		addText("style_profile", item.StyleProfile)
		addText("prompt", item.Prompt)
		addText("negative_prompt", item.NegativePrompt)
	case "episode":
		var item model.Episode
		if err := s.db.WithContext(ctx).First(&item, id).Error; err != nil {
			return nil, fmt.Errorf("episode not found")
		}
		addText("title", item.Title)
		addText("synopsis", item.Synopsis)
		if item.ScriptID != nil {
			var script model.Script
			if err := s.db.WithContext(ctx).First(&script, *item.ScriptID).Error; err == nil {
				addText("script", script.Content)
			}
		}
	case "scene":
		var item model.Scene
		if err := s.db.WithContext(ctx).First(&item, id).Error; err != nil {
			return nil, fmt.Errorf("scene not found")
		}
		addText("title", item.Title)
		addText("notes", item.Notes)
		addText("location", item.Location)
		addText("time_of_day", item.TimeOfDay)
	case "storyboard":
		var item model.Storyboard
		if err := s.db.WithContext(ctx).First(&item, id).Error; err != nil {
			return nil, fmt.Errorf("storyboard not found")
		}
		addText("title", item.Title)
		addText("description", item.Description)
		addText("notes", item.Notes)
		addText("characters", item.Characters)
		addText("actions", item.Actions)
		addText("dialogue", item.Dialogue)
		addText("atmosphere", item.Atmosphere)
		addText("prompt", strings.TrimSpace(strings.Join([]string{item.Description, item.Actions, item.Dialogue, item.Atmosphere}, "\n")))
		addText("camera_angle", item.CameraAngle)
		addText("camera_movement", item.CameraMovement)
		addText("depth_of_field", item.DepthOfField)
		addText("lighting", item.Lighting)
		addText("shot_size", item.ShotSize)
		addText("angle", item.Angle)
		addText("movement", item.Movement)
		addText("focal_length", item.FocalLength)
		addText("pacing", item.Pacing)
		addText("intent", item.Intent)
	case "shot":
		var item model.Shot
		if err := s.db.WithContext(ctx).First(&item, id).Error; err != nil {
			return nil, fmt.Errorf("shot not found")
		}
		addText("description", item.Description)
		addText("prompt", firstNonEmpty(item.FinalPrompt, item.Prompt))
		addText("final_description", item.FinalDescription)
		addText("final_prompt", item.FinalPrompt)
	case "final_video":
		var item model.FinalVideo
		if err := s.db.WithContext(ctx).First(&item, id).Error; err != nil {
			return nil, fmt.Errorf("final video not found")
		}
		addText("title", item.Title)
		addText("description", item.Description)
	default:
		return nil, fmt.Errorf("unsupported entity type %q", kind)
	}

	schema, _ := EntitySchemaForKind(kind)
	for _, section := range schema.Sections {
		for _, field := range section.Fields {
			if field.Workflow.Readable && field.Binding != nil {
				addBinding(field.Workflow.PortID)
			}
		}
	}
	return values, nil
}

func (s *EntityIOService) WritePorts(ctx context.Context, kind string, id uint, values map[string]EntityPortValue, meta EntityWriteMeta) (EntityWriteResult, error) {
	var result EntityWriteResult
	if len(values) == 0 {
		return result, nil
	}
	projectID, err := s.ProjectID(ctx, kind, id, meta.ProjectID)
	if err != nil {
		return result, err
	}
	result.ProjectID = projectID

	if err := validateEntityPortValues(kind, values); err != nil {
		return result, err
	}

	sourceType := strings.TrimSpace(meta.SourceType)
	if sourceType == "" {
		sourceType = "canvas"
	}

	if err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		txSvc := &EntityIOService{db: tx}
		oldValues, _ := txSvc.ReadPorts(ctx, kind, id)
		if err := txSvc.writeEntityFields(ctx, kind, id, values); err != nil {
			return err
		}

		bindingIDsByPort := map[string][]uint{}
		for portID, value := range values {
			field, ok := EntityFieldForPort(kind, portID)
			if !ok || field.Binding == nil {
				continue
			}
			for _, resourceID := range value.ResourceIDs {
				if resourceID == 0 {
					continue
				}
				if result.PrimaryResourceID == nil {
					rid := resourceID
					result.PrimaryResourceID = &rid
				}
				binding := model.ResourceBinding{
					ProjectID:    projectID,
					ResourceID:   resourceID,
					OwnerType:    kind,
					OwnerID:      id,
					Role:         field.Binding.Role,
					Slot:         field.Binding.Slot,
					IsPrimary:    field.Binding.IsPrimary,
					Status:       "selected",
					SourceType:   sourceType,
					CreatedByID:  uintPtrOrNil(meta.UserID),
					MetadataJSON: fmt.Sprintf(`{"canvas_node_id":%q,"canvas_run_id":%d}`, meta.NodeID, meta.RunID),
				}
				if meta.CanvasID != 0 {
					binding.SourceID = &meta.CanvasID
				}
				if err := tx.WithContext(ctx).Create(&binding).Error; err != nil {
					return err
				}
				result.BindingIDs = append(result.BindingIDs, binding.ID)
				bindingIDsByPort[portID] = append(bindingIDsByPort[portID], binding.ID)
			}
		}
		return txSvc.createEntityWriteAudits(ctx, kind, id, values, oldValues, bindingIDsByPort, meta)
	}); err != nil {
		return result, err
	}

	return result, nil
}

func (s *EntityIOService) ProjectID(ctx context.Context, kind string, id uint, fallback *uint) (uint, error) {
	if fallback != nil && *fallback != 0 {
		return *fallback, nil
	}
	var projectID uint
	switch kind {
	case "script":
		var item model.Script
		if err := s.db.WithContext(ctx).Select("project_id").First(&item, id).Error; err != nil {
			return 0, fmt.Errorf("script not found")
		}
		projectID = item.ProjectID
	case "asset":
		var item model.Asset
		if err := s.db.WithContext(ctx).Select("project_id").First(&item, id).Error; err != nil {
			return 0, fmt.Errorf("asset not found")
		}
		projectID = item.ProjectID
	case "setting":
		var item model.Setting
		if err := s.db.WithContext(ctx).Select("project_id").First(&item, id).Error; err != nil {
			return 0, fmt.Errorf("setting not found")
		}
		projectID = item.ProjectID
	case "episode":
		var item model.Episode
		if err := s.db.WithContext(ctx).Select("project_id").First(&item, id).Error; err != nil {
			return 0, fmt.Errorf("episode not found")
		}
		projectID = item.ProjectID
	case "scene":
		var item model.Scene
		if err := s.db.WithContext(ctx).Select("project_id").First(&item, id).Error; err != nil {
			return 0, fmt.Errorf("scene not found")
		}
		projectID = item.ProjectID
	case "storyboard":
		var item model.Storyboard
		if err := s.db.WithContext(ctx).Select("project_id").First(&item, id).Error; err != nil {
			return 0, fmt.Errorf("storyboard not found")
		}
		projectID = item.ProjectID
	case "shot":
		var item model.Shot
		if err := s.db.WithContext(ctx).Select("project_id").First(&item, id).Error; err != nil {
			return 0, fmt.Errorf("shot not found")
		}
		projectID = item.ProjectID
	case "final_video":
		var item model.FinalVideo
		if err := s.db.WithContext(ctx).Select("project_id").First(&item, id).Error; err != nil {
			return 0, fmt.Errorf("final video not found")
		}
		projectID = item.ProjectID
	default:
		return 0, fmt.Errorf("unsupported entity type %q", kind)
	}
	return projectID, nil
}

func validateEntityPortValues(kind string, values map[string]EntityPortValue) error {
	schema, ok := EntitySchemaForKind(kind)
	if !ok {
		return fmt.Errorf("unsupported entity type %q", kind)
	}
	for _, section := range schema.Sections {
		for _, field := range section.Fields {
			if field.Workflow.Writable && field.Workflow.Required {
				if _, ok := values[field.Workflow.PortID]; !ok {
					return fmt.Errorf("port %q is required", field.Workflow.PortID)
				}
			}
		}
	}
	for portID, value := range values {
		field, ok := EntityFieldForPort(kind, portID)
		if !ok {
			return fmt.Errorf("unknown port %q for entity type %q", portID, kind)
		}
		if !field.Workflow.Writable {
			return fmt.Errorf("port %q is not writable", portID)
		}
		if field.Workflow.MaxCount > 0 && len(value.ResourceIDs) > field.Workflow.MaxCount {
			return fmt.Errorf("port %q allows at most %d values", portID, field.Workflow.MaxCount)
		}
		if field.Binding != nil && !field.Binding.Multiple && len(value.ResourceIDs) > 1 {
			return fmt.Errorf("port %q allows only one resource", portID)
		}
		if err := validateEntityPortType(field, value); err != nil {
			return err
		}
	}
	return nil
}

func validateEntityPortType(field EntitySchemaField, value EntityPortValue) error {
	valueType := strings.TrimSpace(value.Type)
	if valueType == "" {
		valueType = field.ValueType
	}
	if valueType != field.ValueType && !(field.ValueType == "resource" && isMediaPortType(valueType)) {
		return fmt.Errorf("port %q expects %s, got %s", field.Workflow.PortID, field.ValueType, valueType)
	}
	switch field.ValueType {
	case "text", "json", "number", "boolean":
		if strings.TrimSpace(entityPortValueText(value)) == "" && value.JSON == nil && value.Number == nil && value.Boolean == nil && len(value.ResourceIDs) == 0 {
			return fmt.Errorf("port %q requires an inline value", field.Workflow.PortID)
		}
	case "resource", "image", "video", "audio":
		if len(value.ResourceIDs) == 0 {
			return fmt.Errorf("port %q requires a resource", field.Workflow.PortID)
		}
	default:
		return nil
	}
	return nil
}

func isMediaPortType(valueType string) bool {
	switch valueType {
	case "image", "video", "audio":
		return true
	default:
		return false
	}
}

func entityPortValueText(value EntityPortValue) string {
	if value.Text != "" {
		return value.Text
	}
	if value.JSON != nil {
		if b, err := json.Marshal(value.JSON); err == nil {
			return string(b)
		}
	}
	if value.Number != nil {
		return strconv.FormatFloat(*value.Number, 'f', -1, 64)
	}
	if value.Boolean != nil {
		return strconv.FormatBool(*value.Boolean)
	}
	return ""
}

func (s *EntityIOService) writeEntityFields(ctx context.Context, kind string, id uint, values map[string]EntityPortValue) error {
	updates := entityFieldUpdates(kind, values)
	if len(updates) == 0 {
		return nil
	}
	switch kind {
	case "script":
		return s.db.WithContext(ctx).Model(&model.Script{}).Where("id = ?", id).Updates(updates).Error
	case "setting":
		return s.db.WithContext(ctx).Model(&model.Setting{}).Where("id = ?", id).Updates(updates).Error
	case "asset":
		return s.db.WithContext(ctx).Model(&model.Asset{}).Where("id = ?", id).Updates(updates).Error
	case "episode":
		return s.db.WithContext(ctx).Model(&model.Episode{}).Where("id = ?", id).Updates(updates).Error
	case "scene":
		return s.db.WithContext(ctx).Model(&model.Scene{}).Where("id = ?", id).Updates(updates).Error
	case "storyboard":
		return s.db.WithContext(ctx).Model(&model.Storyboard{}).Where("id = ?", id).Updates(updates).Error
	case "shot":
		return s.db.WithContext(ctx).Model(&model.Shot{}).Where("id = ?", id).Updates(updates).Error
	case "final_video":
		return s.db.WithContext(ctx).Model(&model.FinalVideo{}).Where("id = ?", id).Updates(updates).Error
	default:
		return fmt.Errorf("unsupported entity type %q", kind)
	}
}

func entityFieldUpdates(kind string, values map[string]EntityPortValue) map[string]any {
	updates := map[string]any{}
	for portID, value := range values {
		text := strings.TrimSpace(entityPortValueText(value))
		if text == "" {
			continue
		}
		field, ok := EntityFieldForPort(kind, portID)
		if !ok || field.Storage == nil || strings.TrimSpace(field.Storage.Column) == "" {
			continue
		}
		updates[field.Storage.Column] = text
		switch kind + "." + portID {
		case "shot.prompt":
			updates["prompt"] = text
			updates["final_prompt"] = text
		}
	}
	return updates
}

func (s *EntityIOService) createEntityWriteAudits(
	ctx context.Context,
	kind string,
	id uint,
	values map[string]EntityPortValue,
	oldValues map[string]EntityPortValue,
	bindingIDsByPort map[string][]uint,
	meta EntityWriteMeta,
) error {
	audits := buildEntityWriteAudits(kind, id, values, oldValues, bindingIDsByPort, meta)
	if len(audits) == 0 {
		return nil
	}
	return s.db.WithContext(ctx).Create(&audits).Error
}

func buildEntityWriteAudits(
	kind string,
	id uint,
	values map[string]EntityPortValue,
	oldValues map[string]EntityPortValue,
	bindingIDsByPort map[string][]uint,
	meta EntityWriteMeta,
) []model.CanvasEntityWriteAudit {
	audits := make([]model.CanvasEntityWriteAudit, 0, len(values))
	for portID, value := range values {
		newValueJSON := mustMarshalString(entityPortValueAuditPayload(value))
		oldValueJSON := ""
		if oldValue, ok := oldValues[portID]; ok {
			oldValueJSON = mustMarshalString(entityPortValueAuditPayload(oldValue))
		}
		audits = append(audits, model.CanvasEntityWriteAudit{
			CanvasID:           meta.CanvasID,
			CanvasRunID:        meta.RunID,
			CanvasNodeID:       meta.NodeID,
			PortID:             portID,
			EntityKind:         kind,
			EntityID:           id,
			UserID:             meta.UserID,
			OldValueJSON:       oldValueJSON,
			NewValueJSON:       newValueJSON,
			ResourceBindingIDs: mustMarshalString(bindingIDsByPort[portID]),
		})
	}
	return audits
}

func entityPortValueAuditPayload(value EntityPortValue) map[string]any {
	payload := map[string]any{
		"type": value.Type,
	}
	if strings.TrimSpace(value.Text) != "" {
		payload["text"] = value.Text
	}
	if value.JSON != nil {
		payload["json"] = value.JSON
	}
	if value.Number != nil {
		payload["number"] = *value.Number
	}
	if value.Boolean != nil {
		payload["boolean"] = *value.Boolean
	}
	if len(value.ResourceIDs) > 0 {
		payload["resource_ids"] = value.ResourceIDs
	}
	return payload
}

func mustMarshalString(value any) string {
	b, _ := json.Marshal(value)
	return string(b)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func uintPtrOrNil(value uint) *uint {
	if value == 0 {
		return nil
	}
	return &value
}
