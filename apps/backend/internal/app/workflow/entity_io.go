package workflow

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"

	domainworkflow "github.com/movscript/movscript/internal/domain/workflow"
	"gorm.io/gorm"
)

type EntityPortValue struct {
	Type        string
	Text        string
	JSON        json.RawMessage
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
	repo repository
}

func NewEntityIOService(db *gorm.DB) *EntityIOService {
	return &EntityIOService{repo: &gormRepository{db: db}}
}

func (s *EntityIOService) ReadPorts(ctx context.Context, kind string, id uint) (map[string]EntityPortValue, error) {
	return s.ReadPortsByIDs(ctx, kind, id, nil)
}

func (s *EntityIOService) ReadPortsByIDs(ctx context.Context, kind string, id uint, portIDs []string) (map[string]EntityPortValue, error) {
	schema, ok := EntitySchemaForKind(kind)
	if !ok {
		return nil, fmt.Errorf("unsupported entity type %q", kind)
	}
	selection, err := resolveEntityPortSelection(kind, portIDs)
	if err != nil {
		return nil, err
	}
	values := map[string]EntityPortValue{}

	if err := s.readStoredPorts(ctx, schema, id, values, selection); err != nil {
		return nil, err
	}
	if err := s.readComputedPorts(ctx, kind, id, values, selection); err != nil {
		return nil, err
	}

	addBinding := func(portID string) {
		if !entityPortSelected(selection, portID) {
			return
		}
		field, ok := EntityFieldForPort(kind, portID)
		if !ok || !field.Workflow.Readable || field.Binding == nil {
			return
		}
		if field.Binding.Multiple {
			bindings, err := s.repo.ListBindingsBySlot(ctx, kind, id, field.Binding.Slot)
			if err != nil {
				return
			}
			resourceIDs := make([]uint, 0, len(bindings))
			seen := map[uint]bool{}
			for _, binding := range bindings {
				if binding.ResourceID == 0 || seen[binding.ResourceID] {
					continue
				}
				seen[binding.ResourceID] = true
				resourceIDs = append(resourceIDs, binding.ResourceID)
			}
			if len(resourceIDs) > 0 {
				values[portID] = EntityPortValue{Type: field.ValueType, ResourceIDs: resourceIDs}
			}
			return
		}
		if binding, ok, _ := s.repo.FirstBindingBySlot(ctx, kind, id, field.Binding.Slot); ok {
			values[portID] = EntityPortValue{Type: field.ValueType, ResourceIDs: []uint{binding.ResourceID}}
			return
		}
		if binding, ok, _ := s.repo.FirstBindingByRole(ctx, kind, id, field.Binding.Role); ok {
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

func (s *EntityIOService) readStoredPorts(ctx context.Context, schema EntitySchema, id uint, values map[string]EntityPortValue, selection map[string]struct{}) error {
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
			if !entityPortSelected(selection, field.Workflow.PortID) {
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
	row, err := s.repo.LoadEntityRow(ctx, table, columns, id)
	if err != nil {
		return fmt.Errorf("%s not found", entityLabel(schema.Kind))
	}
	for column, fields := range fieldsByColumn {
		text := row.Text(column)
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

func (s *EntityIOService) readComputedPorts(ctx context.Context, kind string, id uint, values map[string]EntityPortValue, selection map[string]struct{}) error {
	addComputedText := func(portID string, text string) {
		if !entityPortSelected(selection, portID) {
			return
		}
		field, ok := EntityFieldForPort(kind, portID)
		if !ok || !field.Workflow.Readable || strings.TrimSpace(text) == "" {
			return
		}
		values[portID] = EntityPortValue{Type: field.ValueType, Text: text}
	}
	switch kind {
	case domainworkflow.EntityKindScript:
		item, err := s.repo.LoadScriptComputedFields(ctx, id)
		if err != nil {
			return fmt.Errorf("script not found")
		}
		addComputedText("characters", firstNonEmpty(item.CharacterProfiles, item.Characters))
	}
	return nil
}

func (s *EntityIOService) WritePorts(ctx context.Context, kind string, id uint, values map[string]EntityPortValue, meta EntityWriteMeta) (EntityWriteResult, error) {
	var result EntityWriteResult
	if len(values) == 0 {
		return result, nil
	}
	values, err := NormalizeEntityPortValues(kind, values)
	if err != nil {
		return result, err
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

	return s.repo.WriteEntityPorts(ctx, kind, id, values, projectID, sourceType, meta)
}

func NormalizeEntityPortValues(kind string, values map[string]EntityPortValue) (map[string]EntityPortValue, error) {
	if _, ok := EntitySchemaForKind(kind); !ok {
		return nil, fmt.Errorf("unsupported entity type %q", kind)
	}
	normalized := map[string]EntityPortValue{}
	for portID, value := range values {
		field, ok := EntityFieldForPort(kind, portID)
		if !ok {
			return nil, fmt.Errorf("unknown port %q for entity type %q", portID, kind)
		}
		canonicalPortID := field.Workflow.PortID
		if canonicalPortID == "" {
			canonicalPortID = field.ID
		}
		normalized[canonicalPortID] = mergeEntityPortValue(normalized[canonicalPortID], value)
	}
	return normalized, nil
}

func mergeEntityPortValue(existing EntityPortValue, next EntityPortValue) EntityPortValue {
	if entityPortValueEmpty(existing) {
		return next
	}
	if strings.TrimSpace(next.Type) != "" {
		existing.Type = next.Type
	}
	if strings.TrimSpace(next.Text) != "" {
		existing.Text = next.Text
	}
	if next.JSON != nil {
		existing.JSON = next.JSON
	}
	if next.Number != nil {
		existing.Number = next.Number
	}
	if next.Boolean != nil {
		existing.Boolean = next.Boolean
	}
	if len(next.ResourceIDs) > 0 {
		seen := map[uint]bool{}
		for _, id := range existing.ResourceIDs {
			seen[id] = true
		}
		for _, id := range next.ResourceIDs {
			if !seen[id] {
				existing.ResourceIDs = append(existing.ResourceIDs, id)
				seen[id] = true
			}
		}
	}
	return existing
}

func entityPortValueEmpty(value EntityPortValue) bool {
	return strings.TrimSpace(value.Type) == "" &&
		strings.TrimSpace(value.Text) == "" &&
		value.JSON == nil &&
		value.Number == nil &&
		value.Boolean == nil &&
		len(value.ResourceIDs) == 0
}

func (s *EntityIOService) ProjectID(ctx context.Context, kind string, id uint, fallback *uint) (uint, error) {
	if fallback != nil && *fallback != 0 {
		return *fallback, nil
	}
	table, ok := entityTableName(kind)
	if !ok {
		return 0, fmt.Errorf("unsupported entity type %q", kind)
	}
	row, err := s.repo.LoadEntityRow(ctx, table, []string{"project_id"}, id)
	if err != nil {
		return 0, fmt.Errorf("%s not found", entityLabel(kind))
	}
	projectID, err := row.Uint("project_id")
	if err != nil || projectID == 0 {
		return 0, fmt.Errorf("%s project_id is missing", entityLabel(kind))
	}
	return projectID, nil
}

func entityTableName(kind string) (string, bool) {
	switch kind {
	case domainworkflow.EntityKindScript:
		return "scripts", true
	case domainworkflow.EntityKindSegment:
		return "segments", true
	case domainworkflow.EntityKindSceneMoment:
		return "scene_moments", true
	case domainworkflow.EntityKindCreativeReference:
		return "creative_references", true
	case domainworkflow.EntityKindAssetSlot:
		return "asset_slots", true
	case domainworkflow.EntityKindContentUnit:
		return "content_units", true
	default:
		return "", false
	}
}

func entityLabel(kind string) string {
	return strings.ReplaceAll(kind, "_", " ")
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

func resolveEntityPortSelection(kind string, portIDs []string) (map[string]struct{}, error) {
	if len(portIDs) == 0 {
		return nil, nil
	}
	selection := map[string]struct{}{}
	for _, portID := range portIDs {
		portID = strings.TrimSpace(portID)
		if portID == "" {
			continue
		}
		field, ok := EntityFieldForPort(kind, portID)
		if !ok {
			return nil, fmt.Errorf("unknown port %q for entity type %q", portID, kind)
		}
		if !field.Workflow.Readable {
			return nil, fmt.Errorf("port %q is not readable", portID)
		}
		selection[field.Workflow.PortID] = struct{}{}
	}
	if len(selection) == 0 {
		return nil, nil
	}
	return selection, nil
}

func entityPortSelected(selection map[string]struct{}, portID string) bool {
	if len(selection) == 0 {
		return true
	}
	_, ok := selection[portID]
	return ok
}

func validateEntityPortValues(kind string, values map[string]EntityPortValue) error {
	normalized, err := NormalizeEntityPortValues(kind, values)
	if err != nil {
		return err
	}
	values = normalized
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

func validateEntityPortType(field domainworkflow.EntitySchemaField, value EntityPortValue) error {
	valueType := strings.TrimSpace(value.Type)
	if valueType == "" {
		valueType = field.ValueType
	}
	if valueType != field.ValueType && !((field.ValueType == "resource" && isMediaPortType(valueType)) || (valueType == "resource" && isMediaPortType(field.ValueType))) {
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
	case "image", "video", "audio", "text":
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

func entityFieldUpdates(kind string, values map[string]EntityPortValue) map[string]any {
	updates := map[string]any{}
	for portID, value := range values {
		text := strings.TrimSpace(entityPortValueText(value))
		if text == "" && len(value.ResourceIDs) == 0 {
			continue
		}
		field, ok := EntityFieldForPort(kind, portID)
		if !ok || field.Storage == nil || strings.TrimSpace(field.Storage.Column) == "" {
			continue
		}
		if field.ValueType == "number" && value.Number != nil {
			updates[field.Storage.Column] = *value.Number
		} else if field.ValueType == "number" && len(value.ResourceIDs) > 0 {
			updates[field.Storage.Column] = value.ResourceIDs[0]
		} else {
			updates[field.Storage.Column] = text
		}
	}
	return updates
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
