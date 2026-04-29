package workflow

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

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
	schema, ok := EntitySchemaForKind(kind)
	if !ok {
		return nil, fmt.Errorf("unsupported entity type %q", kind)
	}
	values := map[string]EntityPortValue{}

	if err := s.readStoredPorts(ctx, schema, id, values); err != nil {
		return nil, err
	}
	if err := s.readComputedPorts(ctx, kind, id, values); err != nil {
		return nil, err
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

	for _, section := range schema.Sections {
		for _, field := range section.Fields {
			if field.Workflow.Readable && field.Binding != nil {
				addBinding(field.Workflow.PortID)
			}
		}
	}
	return values, nil
}

func (s *EntityIOService) readStoredPorts(ctx context.Context, schema EntitySchema, id uint, values map[string]EntityPortValue) error {
	table, ok := entityTableName(schema.Kind)
	if !ok {
		return fmt.Errorf("unsupported entity type %q", schema.Kind)
	}
	fieldsByColumn := map[string][]EntitySchemaField{}
	columns := []string{"id"}
	seen := map[string]bool{"id": true}
	for _, section := range schema.Sections {
		for _, field := range section.Fields {
			if !field.Workflow.Readable || field.Storage == nil || strings.TrimSpace(field.Storage.Column) == "" {
				continue
			}
			column := strings.TrimSpace(field.Storage.Column)
			fieldsByColumn[column] = append(fieldsByColumn[column], field)
			if !seen[column] {
				seen[column] = true
				columns = append(columns, column)
			}
		}
	}
	sort.Strings(columns[1:])
	row := map[string]any{}
	if err := s.db.WithContext(ctx).Table(table).Select(columns).Where("id = ?", id).Take(&row).Error; err != nil {
		return fmt.Errorf("%s not found", entityLabel(schema.Kind))
	}
	for column, fields := range fieldsByColumn {
		text := storedColumnText(row[column])
		if strings.TrimSpace(text) == "" {
			continue
		}
		for _, field := range fields {
			value := EntityPortValue{Type: field.ValueType, Text: text}
			if field.ValueType == "number" {
				if n, err := strconv.ParseFloat(strings.TrimSpace(text), 64); err == nil {
					value.Number = &n
				}
			}
			values[field.Workflow.PortID] = value
		}
	}
	return nil
}

func (s *EntityIOService) readComputedPorts(ctx context.Context, kind string, id uint, values map[string]EntityPortValue) error {
	addComputedText := func(portID string, text string) {
		field, ok := EntityFieldForPort(kind, portID)
		if !ok || !field.Workflow.Readable || strings.TrimSpace(text) == "" {
			return
		}
		values[portID] = EntityPortValue{Type: field.ValueType, Text: text}
	}
	switch kind {
	case "script":
		var item model.Script
		if err := s.db.WithContext(ctx).Select("characters", "character_profiles").First(&item, id).Error; err != nil {
			return fmt.Errorf("script not found")
		}
		addComputedText("characters", firstNonEmpty(item.CharacterProfiles, item.Characters))
	case "episode":
		var item model.Episode
		if err := s.db.WithContext(ctx).Select("script_id").First(&item, id).Error; err != nil {
			return fmt.Errorf("episode not found")
		}
		if item.ScriptID != nil {
			var script model.Script
			if err := s.db.WithContext(ctx).Select("content").First(&script, *item.ScriptID).Error; err == nil {
				addComputedText("script", script.Content)
			}
		}
	case "storyboard":
		var item model.Storyboard
		if err := s.db.WithContext(ctx).Select("description", "actions", "dialogue", "atmosphere").First(&item, id).Error; err != nil {
			return fmt.Errorf("storyboard not found")
		}
		addComputedText("prompt", strings.TrimSpace(strings.Join([]string{item.Description, item.Actions, item.Dialogue, item.Atmosphere}, "\n")))
	case "shot":
		var item model.Shot
		if err := s.db.WithContext(ctx).Select("prompt", "final_prompt").First(&item, id).Error; err != nil {
			return fmt.Errorf("shot not found")
		}
		addComputedText("prompt", firstNonEmpty(item.FinalPrompt, item.Prompt))
	}
	return nil
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
	table, ok := entityTableName(kind)
	if !ok {
		return 0, fmt.Errorf("unsupported entity type %q", kind)
	}
	row := map[string]any{}
	if err := s.db.WithContext(ctx).Table(table).Select("project_id").Where("id = ?", id).Take(&row).Error; err != nil {
		return 0, fmt.Errorf("%s not found", entityLabel(kind))
	}
	projectID, err := storedColumnUint(row["project_id"])
	if err != nil || projectID == 0 {
		return 0, fmt.Errorf("%s project_id is missing", entityLabel(kind))
	}
	return projectID, nil
}

func entityTableName(kind string) (string, bool) {
	switch kind {
	case "script":
		return "scripts", true
	case "setting":
		return "settings", true
	case "asset":
		return "assets", true
	case "episode":
		return "episodes", true
	case "scene":
		return "scenes", true
	case "storyboard":
		return "storyboards", true
	case "shot":
		return "shots", true
	case "final_video":
		return "final_videos", true
	default:
		return "", false
	}
}

func entityLabel(kind string) string {
	switch kind {
	case "final_video":
		return "final video"
	default:
		return strings.ReplaceAll(kind, "_", " ")
	}
}

func storedColumnText(value any) string {
	switch v := value.(type) {
	case nil:
		return ""
	case string:
		return v
	case []byte:
		return string(v)
	case fmt.Stringer:
		return v.String()
	default:
		b, err := json.Marshal(v)
		if err != nil {
			return fmt.Sprint(v)
		}
		return string(b)
	}
}

func storedColumnUint(value any) (uint, error) {
	switch v := value.(type) {
	case nil:
		return 0, fmt.Errorf("missing value")
	case uint:
		return v, nil
	case uint64:
		return uint(v), nil
	case uint32:
		return uint(v), nil
	case int:
		if v < 0 {
			return 0, fmt.Errorf("negative value")
		}
		return uint(v), nil
	case int64:
		if v < 0 {
			return 0, fmt.Errorf("negative value")
		}
		return uint(v), nil
	case int32:
		if v < 0 {
			return 0, fmt.Errorf("negative value")
		}
		return uint(v), nil
	case float64:
		if v < 0 {
			return 0, fmt.Errorf("negative value")
		}
		return uint(v), nil
	case []byte:
		n, err := strconv.ParseUint(string(v), 10, 64)
		return uint(n), err
	case string:
		n, err := strconv.ParseUint(v, 10, 64)
		return uint(n), err
	default:
		n, err := strconv.ParseUint(fmt.Sprint(v), 10, 64)
		return uint(n), err
	}
}

func ValidateEntityReadPorts(kind string, portIDs []string) error {
	if _, ok := EntitySchemaForKind(kind); !ok {
		return fmt.Errorf("unsupported entity type %q", kind)
	}
	for _, portID := range portIDs {
		portID = strings.TrimSpace(portID)
		if portID == "" {
			continue
		}
		field, ok := EntityFieldForPort(kind, portID)
		if !ok {
			return fmt.Errorf("unknown port %q for entity type %q", portID, kind)
		}
		if !field.Workflow.Readable {
			return fmt.Errorf("port %q is not readable", portID)
		}
	}
	return nil
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
	table, ok := entityTableName(kind)
	if !ok {
		return fmt.Errorf("unsupported entity type %q", kind)
	}
	updates["updated_at"] = time.Now()
	return s.db.WithContext(ctx).Table(table).Where("id = ?", id).Updates(updates).Error
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
		if field.ValueType == "number" && value.Number != nil {
			updates[field.Storage.Column] = *value.Number
		} else {
			updates[field.Storage.Column] = text
		}
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
