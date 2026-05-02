package workflow

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/movscript/movscript/internal/model"
)

type EntitySemanticValues struct {
	Kind          string         `json:"kind"`
	ID            uint           `json:"id"`
	SchemaVersion int            `json:"schemaVersion"`
	Values        map[string]any `json:"values"`
}

type EntitySchemaMigrationReport struct {
	Kind             string                   `json:"kind"`
	SchemaVersion    int                      `json:"schemaVersion"`
	CurrentVersion   int                      `json:"currentVersion"`
	MinCompatible    int                      `json:"minCompatibleVersion"`
	FieldAliases     map[string][]string      `json:"fieldAliases,omitempty"`
	DeprecatedFields []string                 `json:"deprecatedFields,omitempty"`
	Migrations       []EntityMigration        `json:"migrations,omitempty"`
	Actions          []EntitySchemaActionHint `json:"actions"`
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
	schema, ok := EntitySemanticSchemaForKind(kind)
	if !ok {
		return EntitySemanticValues{}, fmt.Errorf("unsupported entity type %q", kind)
	}
	portValues, err := s.ReadPorts(ctx, kind, id)
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
	related, err := s.readRelatedDetailValues(ctx, kind, id, schema)
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

func (s *EntityIOService) readRelatedDetailValues(ctx context.Context, kind string, id uint, schema EntitySemanticSchema) (map[string]any, error) {
	result := map[string]any{}
	relatedFields := []EntitySemanticField{}
	for _, section := range schema.Sections {
		for _, field := range section.Fields {
			if field.Control == "related_entity_list" {
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

func (s *EntityIOService) relatedItemsForField(ctx context.Context, kind string, id uint, field EntitySemanticField) ([]map[string]any, error) {
	return []map[string]any{}, nil
}

func compactSettings(settings []model.Setting) []map[string]any {
	items := make([]map[string]any, 0, len(settings))
	for _, setting := range settings {
		items = append(items, map[string]any{
			"ID":          setting.ID,
			"kind":        "setting",
			"name":        setting.Name,
			"type":        setting.Type,
			"description": setting.Description,
			"status":      setting.Status,
		})
	}
	return items
}

func compactScripts(scripts []model.Script) []map[string]any {
	items := make([]map[string]any, 0, len(scripts))
	for _, script := range scripts {
		items = append(items, map[string]any{
			"ID":          script.ID,
			"kind":        "script",
			"title":       script.Title,
			"description": script.Description,
			"script_type": script.ScriptType,
			"order":       script.Order,
		})
	}
	return items
}
