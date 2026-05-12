package ai

// ParamsSchema converts resolved ParamDef controls into a JSON Schema object.
// It is intentionally small and provider-neutral so agents and plugin UIs can
// preflight model-specific generation parameters without knowing adapter code.
func ParamsSchema(params []ParamDef) map[string]any {
	properties := map[string]any{}
	rules := make([]any, 0)
	normalized := NormalizeParamDefsForUI(params)
	for _, p := range normalized {
		if p.Key == "" {
			continue
		}
		prop := map[string]any{}
		if p.Label != "" {
			prop["title"] = p.Label
		}
		switch p.Type {
		case "select":
			prop["type"] = "string"
			if len(p.Options) > 0 {
				prop["enum"] = append([]string{}, p.Options...)
			}
		case "number":
			prop["type"] = "number"
			if p.Min != 0 {
				prop["minimum"] = p.Min
			}
			if p.Max != 0 {
				prop["maximum"] = p.Max
			}
			if p.Step != 0 && !paramJSONSchemaHasEnum(p.JSONSchema) {
				prop["multipleOf"] = p.Step
			}
		case "boolean":
			prop["type"] = "boolean"
		default:
			prop["type"] = "string"
		}
		if p.Default != nil {
			prop["default"] = p.Default
		}
		for key, value := range p.JSONSchema {
			if key == "" {
				continue
			}
			if value == nil {
				delete(prop, key)
				continue
			}
			prop[key] = cloneSchemaValue(value)
		}
		properties[p.Key] = prop
	}
	rules = append(rules, paramSchemaConflictRules(normalized)...)
	rules = append(rules, paramSchemaConditionalEnumRules(normalized)...)
	rules = append(rules, paramSchemaConditionalConstRules(normalized)...)
	rules = append(rules, paramSchemaRequiresValueRules(normalized)...)
	schema := map[string]any{
		"type":                 "object",
		"properties":           properties,
		"additionalProperties": false,
	}
	if len(rules) > 0 {
		schema["allOf"] = rules
	}
	return schema
}

func paramJSONSchemaHasEnum(schema map[string]any) bool {
	if len(schema) == 0 {
		return false
	}
	_, ok := schema["enum"]
	return ok
}

func cloneSchemaValue(value any) any {
	switch v := value.(type) {
	case []string:
		return append([]string{}, v...)
	case []int:
		return append([]int{}, v...)
	case []any:
		out := make([]any, len(v))
		for i, item := range v {
			out[i] = cloneSchemaValue(item)
		}
		return out
	case map[string]any:
		out := make(map[string]any, len(v))
		for key, item := range v {
			out[key] = cloneSchemaValue(item)
		}
		return out
	default:
		return v
	}
}

func paramSchemaConflictRules(params []ParamDef) []any {
	var rules []any
	seen := map[string]bool{}
	for _, p := range params {
		if p.Key == "" {
			continue
		}
		for _, other := range p.ConflictsWith {
			if other == "" {
				continue
			}
			key := p.Key + "\x00" + other
			reverse := other + "\x00" + p.Key
			if seen[key] || seen[reverse] {
				continue
			}
			seen[key] = true
			rules = append(rules, map[string]any{
				"not": map[string]any{
					"required": []string{p.Key, other},
				},
				"description": "parameters \"" + p.Key + "\" and \"" + other + "\" cannot be used together",
			})
		}
	}
	return rules
}

func paramSchemaConditionalEnumRules(params []ParamDef) []any {
	var rules []any
	for _, p := range params {
		if p.Key == "" {
			continue
		}
		for _, item := range p.ConditionalEnum {
			if item.WhenParam == "" || len(item.Options) == 0 {
				continue
			}
			rules = append(rules, map[string]any{
				"if": map[string]any{
					"properties": map[string]any{
						item.WhenParam: map[string]any{"const": item.WhenValue},
					},
					"required": []string{item.WhenParam},
				},
				"then": map[string]any{
					"properties": map[string]any{
						p.Key: map[string]any{"enum": append([]string{}, item.Options...)},
					},
				},
				"description": "parameter \"" + p.Key + "\" has restricted options when \"" + item.WhenParam + "\" is set",
			})
		}
	}
	return rules
}

func paramSchemaConditionalConstRules(params []ParamDef) []any {
	var rules []any
	for _, p := range params {
		if p.Key == "" {
			continue
		}
		for _, item := range p.ConditionalConst {
			if item.WhenParam == "" {
				continue
			}
			rules = append(rules, map[string]any{
				"if": map[string]any{
					"properties": map[string]any{
						item.WhenParam: map[string]any{"const": item.WhenValue},
					},
					"required": []string{item.WhenParam},
				},
				"then": map[string]any{
					"properties": map[string]any{
						p.Key: map[string]any{"const": item.Value},
					},
				},
				"description": "parameter \"" + p.Key + "\" has a required value when \"" + item.WhenParam + "\" is set",
			})
		}
	}
	return rules
}

func paramSchemaRequiresValueRules(params []ParamDef) []any {
	var rules []any
	for _, p := range params {
		if p.Key == "" {
			continue
		}
		for _, item := range p.RequiresValue {
			if item.Param == "" {
				continue
			}
			rules = append(rules, map[string]any{
				"if": map[string]any{
					"required": []string{p.Key},
				},
				"then": map[string]any{
					"properties": map[string]any{
						item.Param: map[string]any{"const": item.Value},
					},
					"required": []string{item.Param},
				},
				"description": "parameter \"" + p.Key + "\" requires \"" + item.Param + "\" to have a specific value",
			})
		}
	}
	return rules
}
