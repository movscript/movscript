package workflow

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	relationapp "github.com/movscript/movscript/internal/app/relation"
	domainrelation "github.com/movscript/movscript/internal/domain/relation"
	domainworkflow "github.com/movscript/movscript/internal/domain/workflow"
)

type EntitySemanticValues struct {
	Kind          string         `json:"kind"`
	ID            uint           `json:"id"`
	SchemaVersion int            `json:"schemaVersion"`
	Values        map[string]any `json:"values"`
}

type EntitySchemaMigrationReport struct {
	Kind             string                           `json:"kind"`
	SchemaVersion    int                              `json:"schemaVersion"`
	CurrentVersion   int                              `json:"currentVersion"`
	MinCompatible    int                              `json:"minCompatibleVersion"`
	FieldAliases     map[string][]string              `json:"fieldAliases,omitempty"`
	DeprecatedFields []string                         `json:"deprecatedFields,omitempty"`
	Migrations       []domainworkflow.EntityMigration `json:"migrations,omitempty"`
	Actions          []EntitySchemaActionHint         `json:"actions"`
}

type EntitySchemaActionHint struct {
	Kind        string `json:"kind"`
	FieldID     string `json:"fieldId,omitempty"`
	FromFieldID string `json:"fromFieldId,omitempty"`
	ToFieldID   string `json:"toFieldId,omitempty"`
	Description string `json:"description"`
}

func EntitySchemaMigrationReportForKind(kind string) (EntitySchemaMigrationReport, error) {
	schema, ok := EntitySchemaForKind(kind)
	if !ok {
		return EntitySchemaMigrationReport{}, fmt.Errorf("unsupported entity type %q", kind)
	}
	compat := schema.Compatibility
	report := EntitySchemaMigrationReport{
		Kind:             kind,
		SchemaVersion:    schema.SchemaVersion,
		CurrentVersion:   compat.CurrentVersion,
		MinCompatible:    compat.MinCompatibleVersion,
		FieldAliases:     compat.FieldAliases,
		DeprecatedFields: compat.DeprecatedFields,
		Migrations:       compat.Migrations,
		Actions:          make([]EntitySchemaActionHint, 0, len(compat.Migrations)+len(compat.FieldAliases)+len(compat.DeprecatedFields)),
	}
	for fieldID, aliases := range compat.FieldAliases {
		for _, alias := range aliases {
			report.Actions = append(report.Actions, EntitySchemaActionHint{
				Kind:        "field_alias",
				FieldID:     fieldID,
				FromFieldID: alias,
				ToFieldID:   fieldID,
				Description: fmt.Sprintf("Accept legacy field or port %q as %q.", alias, fieldID),
			})
		}
	}
	for _, fieldID := range compat.DeprecatedFields {
		report.Actions = append(report.Actions, EntitySchemaActionHint{
			Kind:        "deprecated",
			FieldID:     fieldID,
			Description: fmt.Sprintf("Field %q remains readable for compatibility but should not be used for new writes.", fieldID),
		})
	}
	for _, migration := range compat.Migrations {
		report.Actions = append(report.Actions, EntitySchemaActionHint{
			Kind:        migration.Kind,
			FieldID:     migration.FieldID,
			FromFieldID: migration.FromFieldID,
			ToFieldID:   migration.ToFieldID,
			Description: migration.Description,
		})
	}
	return report, nil
}

func (s *EntityIOService) ReadDetailValues(ctx context.Context, kind string, id uint) (EntitySemanticValues, error) {
	return s.ReadDetailValuesByFields(ctx, kind, id, nil)
}

func (s *EntityIOService) ReadDetailValuesByFields(ctx context.Context, kind string, id uint, fieldIDs []string) (EntitySemanticValues, error) {
	schema, ok := EntitySemanticSchemaForKind(kind)
	if !ok {
		return EntitySemanticValues{}, fmt.Errorf("unsupported entity type %q", kind)
	}
	selection, err := resolveEntityPortSelection(kind, fieldIDs)
	if err != nil {
		return EntitySemanticValues{}, err
	}
	portValues, err := s.ReadPortsByIDs(ctx, kind, id, fieldIDs)
	if err != nil {
		return EntitySemanticValues{}, err
	}
	values := map[string]any{}
	for _, section := range schema.Sections {
		for _, field := range section.Fields {
			portID := EntityWorkflowPortID(field)
			if value, ok := portValues[portID]; ok {
				values[field.ID] = detailNativeValue(field, value)
			}
		}
	}
	related, err := s.readRelatedDetailValues(ctx, kind, id, schema, selection)
	if err != nil {
		return EntitySemanticValues{}, err
	}
	for fieldID, value := range related {
		values[fieldID] = value
	}
	return EntitySemanticValues{
		Kind:          kind,
		ID:            id,
		SchemaVersion: schema.SchemaVersion,
		Values:        values,
	}, nil
}

func detailNativeValue(field EntitySemanticField, value EntityPortValue) any {
	if field.Binding != nil {
		if field.Binding.IsPrimary && len(value.ResourceIDs) > 0 {
			return value.ResourceIDs[0]
		}
		return value.ResourceIDs
	}
	switch field.ValueType {
	case "number":
		if value.Number != nil {
			return *value.Number
		}
	case "boolean":
		if value.Boolean != nil {
			return *value.Boolean
		}
	case "json":
		if value.JSON != nil {
			return value.JSON
		}
		var parsed any
		if strings.TrimSpace(value.Text) != "" && json.Unmarshal([]byte(value.Text), &parsed) == nil {
			return parsed
		}
	}
	if value.Text != "" {
		return value.Text
	}
	if len(value.ResourceIDs) > 0 {
		return value.ResourceIDs
	}
	return nil
}

func (s *EntityIOService) readRelatedDetailValues(ctx context.Context, kind string, id uint, schema domainworkflow.EntitySemanticSchema, selection map[string]struct{}) (map[string]any, error) {
	result := map[string]any{}
	relatedFields := []domainworkflow.EntitySemanticField{}
	for _, section := range schema.Sections {
		for _, field := range section.Fields {
			if field.Control == "related_entity_list" {
				if !entityPortSelected(selection, EntityWorkflowPortID(field)) {
					continue
				}
				relatedFields = append(relatedFields, field)
			}
		}
	}
	if len(relatedFields) == 0 {
		return result, nil
	}
	for _, field := range relatedFields {
		items, err := s.relatedItemsForField(ctx, kind, id, field)
		if err != nil {
			return nil, err
		}
		result[field.ID] = items
	}
	return result, nil
}

func (s *EntityIOService) relatedItemsForField(ctx context.Context, kind string, id uint, field domainworkflow.EntitySemanticField) ([]map[string]any, error) {
	if kind == domainworkflow.EntityKindAssetSlot && field.ID == "candidates" {
		candidates, err := s.assetSlotCandidatesFromRelations(ctx, id)
		if err != nil {
			return nil, err
		}
		items := make([]map[string]any, 0, len(candidates))
		for _, candidate := range candidates {
			item := map[string]any{
				"ID":                      candidate.ID,
				"candidate_asset_slot_id": candidate.CandidateAssetSlotID,
				"source_type":             candidate.SourceType,
				"score":                   candidate.Score,
				"status":                  candidate.Status,
				"note":                    candidate.Note,
			}
			if candidate.CandidateAssetSlot != nil {
				item["candidate_asset_slot"] = compactAssetSlot(*candidate.CandidateAssetSlot)
			}
			items = append(items, item)
		}
		return items, nil
	}
	if kind == domainworkflow.EntityKindContentUnit && field.ID == "generated_media" {
		bindings, err := s.listResourceBindings(ctx, kind, id, relationBindingFilter{Slot: "generated_media"})
		if err != nil {
			return nil, err
		}
		items := make([]map[string]any, 0, len(bindings))
		for _, binding := range bindings {
			item := map[string]any{
				"ID":          binding.ID,
				"resource_id": binding.ResourceID,
				"owner_type":  binding.OwnerType,
				"owner_id":    binding.OwnerID,
				"role":        binding.Role,
				"slot":        binding.Slot,
				"status":      binding.Status,
				"source_type": binding.SourceType,
			}
			if binding.ResourceID > 0 {
				item["resource"] = map[string]any{
					"ID":        binding.ResourceID,
					"type":      binding.ResourceType,
					"name":      binding.ResourceName,
					"mime_type": binding.ResourceMime,
				}
			}
			items = append(items, item)
		}
		sort.SliceStable(items, func(i, j int) bool {
			return fmt.Sprint(items[i]["ID"]) > fmt.Sprint(items[j]["ID"])
		})
		return items, nil
	}
	return []map[string]any{}, nil
}

func (s *EntityIOService) assetSlotCandidatesFromRelations(ctx context.Context, assetSlotID uint) ([]assetSlotCandidateProjection, error) {
	projectID, err := s.ProjectID(ctx, domainworkflow.EntityKindAssetSlot, assetSlotID, nil)
	if err != nil {
		return nil, err
	}
	edges, err := s.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: projectID,
		Category:  domainrelation.CategoryAsset,
		Type:      domainrelation.TypeCandidateFor,
		Target:    domainrelation.NewEntityRef("asset_slot", assetSlotID),
	})
	if err != nil {
		return nil, err
	}
	candidateSlotIDs := make([]uint, 0, len(edges))
	for _, edge := range edges {
		if edge.Source.Type == "asset_slot" {
			candidateSlotIDs = append(candidateSlotIDs, edge.Source.ID)
		}
	}
	slots, err := s.repo.LoadAssetSlots(ctx, candidateSlotIDs)
	if err != nil {
		return nil, err
	}
	slotsByID := make(map[uint]assetSlotProjection, len(slots))
	for _, slot := range slots {
		slotsByID[slot.ID] = slot
	}
	items := make([]assetSlotCandidateProjection, 0, len(edges))
	for _, edge := range edges {
		if edge.Source.Type != "asset_slot" {
			continue
		}
		item := assetSlotCandidateProjection{
			ID:                   relationMetadataUint(edge.Metadata, "asset_slot_candidate_id"),
			CandidateAssetSlotID: edge.Source.ID,
			SourceType:           edge.Origin,
			Score:                edge.Weight,
			Status:               edge.Status,
			Note:                 edge.Evidence,
		}
		if slot, ok := slotsByID[edge.Source.ID]; ok {
			item.CandidateAssetSlot = &slot
		}
		items = append(items, item)
	}
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].Status != items[j].Status {
			return items[i].Status > items[j].Status
		}
		if items[i].Score != items[j].Score {
			return items[i].Score > items[j].Score
		}
		return items[i].ID > items[j].ID
	})
	return items, nil
}

func compactAssetSlot(slot assetSlotProjection) map[string]any {
	item := map[string]any{
		"ID":          slot.ID,
		"kind":        slot.Kind,
		"name":        slot.Name,
		"description": slot.Description,
		"status":      slot.Status,
		"resource_id": slot.ResourceID,
	}
	if slot.Resource != nil {
		resourceURL := ""
		if slot.Resource.ID != 0 {
			resourceURL = fmt.Sprintf("/api/v1/resources/%d/file", slot.Resource.ID)
		}
		item["resource"] = map[string]any{
			"ID":        slot.Resource.ID,
			"type":      slot.Resource.Type,
			"name":      slot.Resource.Name,
			"url":       resourceURL,
			"mime_type": slot.Resource.MimeType,
		}
	}
	return item
}
