package workflowio

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/app/entityrelation"
	"github.com/movscript/movscript/internal/domain/model"
	domainworkflow "github.com/movscript/movscript/internal/domain/workflow"
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
		var binding model.ResourceBinding
		q := s.db.WithContext(ctx).
			Where("owner_type = ? AND owner_id = ?", kind, id).
			Where("slot = ?", field.Binding.Slot)
		if err := q.Order("is_primary desc, updated_at desc").First(&binding).Error; err == nil && binding.ResourceID != 0 {
			values[portID] = EntityPortValue{Type: field.ValueType, ResourceIDs: []uint{binding.ResourceID}}
			return
		}
		q = s.db.WithContext(ctx).
			Where("owner_type = ? AND owner_id = ?", kind, id).
			Where("role = ?", field.Binding.Role)
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
	case "script":
		var item model.Script
		if err := s.db.WithContext(ctx).Select("characters", "character_profiles").First(&item, id).Error; err != nil {
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

	if err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		txSvc := &EntityIOService{db: tx.Session(&gorm.Session{SkipHooks: true})}
		oldValues, _ := txSvc.ReadPorts(ctx, kind, id)
		if err := txSvc.writeEntityFields(ctx, kind, id, values); err != nil {
			return err
		}
		if err := syncEntityRelationsForKind(txSvc.db.WithContext(ctx), kind, id); err != nil {
			return err
		}
		if kind == "asset_slot" {
			bindingIDs, err := txSvc.writeAssetSlotCandidates(ctx, id, values["candidates"], projectID, sourceType, meta)
			if err != nil {
				return err
			}
			if len(bindingIDs) > 0 {
				result.BindingIDs = append(result.BindingIDs, bindingIDs...)
			}
		}

		bindingIDsByPort := map[string][]uint{}
		for portID, value := range values {
			if kind == "asset_slot" && portID == "candidates" {
				continue
			}
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
				if err := txSvc.createEntityResourceBinding(ctx, &binding); err != nil {
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
	case "segment":
		return "segments", true
	case "scene_moment":
		return "scene_moments", true
	case "creative_reference":
		return "creative_references", true
	case "asset_slot":
		return "asset_slots", true
	case "content_unit":
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

func (s *EntityIOService) createEntityResourceBinding(ctx context.Context, binding *model.ResourceBinding) error {
	db := s.db.WithContext(ctx)
	if err := db.Create(binding).Error; err != nil {
		return err
	}
	if err := entityrelation.SyncCoreEntityRelations(db, binding); err != nil {
		return err
	}
	if binding.IsPrimary {
		if err := db.Model(&model.ResourceBinding{}).
			Where("project_id = ? AND owner_type = ? AND owner_id = ? AND role = ? AND slot = ? AND id <> ?",
				binding.ProjectID, binding.OwnerType, binding.OwnerID, binding.Role, binding.Slot, binding.ID).
			Update("is_primary", false).Error; err != nil {
			return err
		}
	}
	if binding.OwnerType == "asset_slot" && binding.ResourceID != 0 && binding.Role != "candidate" {
		update := db.Model(&model.AssetSlot{}).
			Where("id = ? AND resource_id IS NULL", binding.OwnerID).
			Update("resource_id", binding.ResourceID)
		if update.Error != nil {
			return update.Error
		}
		if update.RowsAffected > 0 {
			slot := model.AssetSlot{}
			slot.ID = binding.OwnerID
			if err := entityrelation.SyncCoreEntityRelations(db, &slot); err != nil {
				return err
			}
		}
	}
	return nil
}

func (s *EntityIOService) writeAssetSlotCandidates(ctx context.Context, slotID uint, value EntityPortValue, projectID uint, sourceType string, meta EntityWriteMeta) ([]uint, error) {
	if len(value.ResourceIDs) == 0 {
		return nil, nil
	}
	var slot model.AssetSlot
	if err := s.db.WithContext(ctx).First(&slot, slotID).Error; err != nil {
		return nil, fmt.Errorf("asset_slot not found")
	}
	bindingIDs := []uint{}
	for _, resourceID := range value.ResourceIDs {
		if resourceID == 0 {
			continue
		}
		var existingCandidate model.AssetSlotCandidate
		err := s.db.WithContext(ctx).
			Joins("JOIN asset_slots candidate_slots ON candidate_slots.id = asset_slot_candidates.candidate_asset_slot_id").
			Where("asset_slot_candidates.asset_slot_id = ? AND candidate_slots.resource_id = ?", slotID, resourceID).
			First(&existingCandidate).Error
		if err == nil {
			continue
		}
		if err != nil && err != gorm.ErrRecordNotFound {
			return bindingIDs, err
		}
		candidateSlot := model.AssetSlot{
			ProjectID:                projectID,
			ProductionID:             slot.ProductionID,
			CreativeReferenceID:      slot.CreativeReferenceID,
			CreativeReferenceStateID: slot.CreativeReferenceStateID,
			OwnerType:                "asset_slot",
			OwnerID:                  &slotID,
			Kind:                     slot.Kind,
			Name:                     candidateSlotName(slot, resourceID),
			Description:              slot.Description,
			SlotKey:                  slot.SlotKey,
			PromptHint:               slot.PromptHint,
			Status:                   "candidate",
			Priority:                 slot.Priority,
			ResourceID:               &resourceID,
			MetadataJSON:             fmt.Sprintf(`{"source":"asset_slot_candidates","candidate_for_slot_id":%d}`, slotID),
		}
		if err := s.db.WithContext(ctx).Create(&candidateSlot).Error; err != nil {
			return bindingIDs, err
		}
		if err := entityrelation.SyncCoreEntityRelations(s.db.WithContext(ctx), &candidateSlot); err != nil {
			return bindingIDs, err
		}
		candidate := model.AssetSlotCandidate{
			ProjectID:            projectID,
			AssetSlotID:          slotID,
			CandidateAssetSlotID: candidateSlot.ID,
			SourceType:           sourceType,
			Status:               "candidate",
			Note:                 "由素材槽候选集输入创建",
		}
		if meta.CanvasID != 0 {
			candidate.SourceID = &meta.CanvasID
		}
		if err := s.db.WithContext(ctx).Create(&candidate).Error; err != nil {
			return bindingIDs, err
		}
		if err := entityrelation.SyncCoreEntityRelations(s.db.WithContext(ctx), &candidate); err != nil {
			return bindingIDs, err
		}
		binding := model.ResourceBinding{
			ProjectID:    projectID,
			ResourceID:   resourceID,
			OwnerType:    "asset_slot",
			OwnerID:      candidateSlot.ID,
			Role:         "candidate",
			Slot:         "candidates",
			IsPrimary:    true,
			Status:       "selected",
			SourceType:   sourceType,
			CreatedByID:  uintPtrOrNil(meta.UserID),
			MetadataJSON: fmt.Sprintf(`{"canvas_node_id":%q,"canvas_run_id":%d,"asset_slot_id":%d}`, meta.NodeID, meta.RunID, slotID),
		}
		if meta.CanvasID != 0 {
			binding.SourceID = &meta.CanvasID
		}
		if err := s.createEntityResourceBinding(ctx, &binding); err != nil {
			return bindingIDs, err
		}
		bindingIDs = append(bindingIDs, binding.ID)
	}
	return bindingIDs, nil
}

func syncEntityRelationsForKind(db *gorm.DB, kind string, id uint) error {
	switch kind {
	case "segment":
		item := model.Segment{}
		item.ID = id
		return entityrelation.SyncCoreEntityRelations(db, &item)
	case "scene_moment":
		item := model.SceneMoment{}
		item.ID = id
		return entityrelation.SyncCoreEntityRelations(db, &item)
	case "creative_reference":
		item := model.CreativeReference{}
		item.ID = id
		return entityrelation.SyncCoreEntityRelations(db, &item)
	case "asset_slot":
		item := model.AssetSlot{}
		item.ID = id
		return entityrelation.SyncCoreEntityRelations(db, &item)
	case "content_unit":
		item := model.ContentUnit{}
		item.ID = id
		return entityrelation.SyncCoreEntityRelations(db, &item)
	default:
		return nil
	}
}

func candidateSlotName(slot model.AssetSlot, resourceID uint) string {
	base := strings.TrimSpace(slot.Name)
	if base == "" {
		base = fmt.Sprintf("素材位 #%d", slot.ID)
	}
	return fmt.Sprintf("%s · 候选资源 #%d", base, resourceID)
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
