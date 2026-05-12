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
			if p.Step != 0 {
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
		properties[p.Key] = prop
	}
	rules = append(rules, paramSchemaConflictRules(normalized)...)
	rules = append(rules, paramSchemaConditionalEnumRules(normalized)...)
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
