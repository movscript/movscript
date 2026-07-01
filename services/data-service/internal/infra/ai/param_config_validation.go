package ai

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

// ValidateModelParamConfig verifies the admin-authored custom_supported_params
// contract before it is saved. Runtime validation still owns request checking;
// this catches broken model contracts early so agents can trust list_models.
func ValidateModelParamConfig(adapterType string, capabilities []string, modelParamConfig string) error {
	return validateModelParamConfigWithBaseParams(DefaultParamsForAdapter(adapterType, capabilities), modelParamConfig)
}

// ValidateModelOperationParamConfig verifies the v2 operation-scoped model
// parameter contract. A non-empty config must be a ModelOperationParamProfile
// object with version=2.
func ValidateModelOperationParamConfig(adapterType string, capabilities []string, modelCapabilitiesJSON string, modelParamConfig string) error {
	if err := ValidateModelOperationParamConfigShape(modelParamConfig); err != nil {
		return err
	}
	if strings.TrimSpace(modelParamConfig) == "" {
		return nil
	}
	var profile ModelOperationParamProfile
	if err := json.Unmarshal([]byte(modelParamConfig), &profile); err != nil {
		return fmt.Errorf("custom_supported_params operation profile is invalid: %w", err)
	}
	operationsByCapability := capabilityJSONOperationsByCapability(modelCapabilitiesJSON, capabilities)
	operationCapability := make(map[string]string)
	for capability, operations := range operationsByCapability {
		for _, operation := range operations {
			operation = strings.TrimSpace(operation)
			if operation != "" {
				operationCapability[operation] = capability
			}
		}
	}
	for operation, capability := range operationCapability {
		baseParams := DefaultParamsForAdapterOperation(adapterType, capability, operation)
		if err := validateProfileParamReferencesWithBaseParams(baseParams, profile.Common); err != nil {
			return fmt.Errorf("custom_supported_params.common for operation %q: %w", operation, err)
		}
	}
	for operation, operationProfile := range profile.ByOperation {
		operation = strings.TrimSpace(operation)
		capability := operationCapability[operation]
		if operation == "" || capability == "" {
			return fmt.Errorf("custom_supported_params.by_operation contains unknown operation %q", operation)
		}
		baseParams := DefaultParamsForAdapterOperation(adapterType, capability, operation)
		baseParams = applyModelParamProfile(baseParams, profile.Common)
		if err := validateProfileParamReferencesWithBaseParams(baseParams, operationProfile); err != nil {
			return fmt.Errorf("custom_supported_params.by_operation.%s: %w", operation, err)
		}
	}
	return nil
}

// ValidateModelOperationParamConfigShape verifies only the v2 profile envelope and
// parameter definitions. Use this when the catalog entry has not yet been bound to
// an adapter; route binding validation performs adapter reference checks later.
func ValidateModelOperationParamConfigShape(modelParamConfig string) error {
	if strings.TrimSpace(modelParamConfig) == "" {
		return nil
	}
	var raw map[string]any
	if err := json.Unmarshal([]byte(modelParamConfig), &raw); err != nil {
		return fmt.Errorf("custom_supported_params must be a valid ModelOperationParamProfile object: %w", err)
	}
	if err := validateRawOperationProfileShape(raw); err != nil {
		return err
	}
	var profile ModelOperationParamProfile
	if err := json.Unmarshal([]byte(modelParamConfig), &profile); err != nil {
		return fmt.Errorf("custom_supported_params operation profile is invalid: %w", err)
	}
	if err := validateOperationProfileParamDefs(profile); err != nil {
		return err
	}
	return nil
}

func ValidateModelParamConfigWithBaseParams(baseParams []ParamDef, modelParamConfig string) error {
	return validateModelParamConfigWithBaseParams(baseParams, modelParamConfig)
}

func validateModelParamConfigWithBaseParams(baseParams []ParamDef, modelParamConfig string) error {
	if strings.TrimSpace(modelParamConfig) == "" {
		return nil
	}
	var raw any
	if err := json.Unmarshal([]byte(modelParamConfig), &raw); err != nil {
		return fmt.Errorf("custom_supported_params must be valid JSON: %w", err)
	}
	switch rawValue := raw.(type) {
	case []any:
		if err := validateRawParamNullFields(raw); err != nil {
			return err
		}
		var params []ParamDef
		if err := json.Unmarshal([]byte(modelParamConfig), &params); err != nil {
			return fmt.Errorf("custom_supported_params legacy array is invalid: %w", err)
		}
		return validateParamDefSet(NormalizeParamDefsForUI(params), true)
	case map[string]any:
		if err := validateRawParamNullFields(raw); err != nil {
			return err
		}
		if err := validateRawProfileShape(rawValue); err != nil {
			return err
		}
		var profile ModelParamProfile
		if err := json.Unmarshal([]byte(modelParamConfig), &profile); err != nil {
			return fmt.Errorf("custom_supported_params profile is invalid: %w", err)
		}
		if err := validateProfileParamDefs(profile); err != nil {
			return err
		}
		baseParams = NormalizeParamDefsForUI(cloneParamDefs(baseParams))
		if err := validateProfileParamReferencesWithBaseParams(baseParams, profile); err != nil {
			return err
		}
		params := applyModelParamProfile(baseParams, profile)
		return validateParamDefSet(NormalizeParamDefsForUI(params), len(baseParams) > 0)
	default:
		return fmt.Errorf("custom_supported_params must be either a ParamDef array or a ModelParamProfile object")
	}
}

func ResolveEffectiveParamsWithBaseParams(baseParams []ParamDef, modelParamConfig string) ([]ParamDef, bool) {
	baseParams = NormalizeParamDefsForUI(cloneParamDefs(baseParams))
	if strings.TrimSpace(modelParamConfig) == "" {
		return baseParams, false
	}
	var legacy []ParamDef
	if err := json.Unmarshal([]byte(modelParamConfig), &legacy); err == nil {
		return NormalizeParamDefsForUI(legacy), true
	}
	var profile ModelParamProfile
	if err := json.Unmarshal([]byte(modelParamConfig), &profile); err != nil {
		return nil, true
	}
	params := applyModelParamProfile(baseParams, profile)
	return NormalizeParamDefsForUI(params), true
}

func validateRawParamNullFields(raw any) error {
	switch value := raw.(type) {
	case []any:
		for i, item := range value {
			param, ok := item.(map[string]any)
			if !ok {
				return fmt.Errorf("custom_supported_params[%d] must be a parameter definition object", i)
			}
			if err := validateRawParamNullField(param, fmt.Sprintf("custom_supported_params[%d]", i)); err != nil {
				return err
			}
			if err := validateRawParamKnownFields(param, fmt.Sprintf("custom_supported_params[%d]", i)); err != nil {
				return err
			}
			if err := validateRawParamFieldTypes(param, fmt.Sprintf("custom_supported_params[%d]", i)); err != nil {
				return err
			}
			if err := validateRawParamRuleFields(param, fmt.Sprintf("custom_supported_params[%d]", i)); err != nil {
				return err
			}
		}
	case map[string]any:
		for _, field := range []string{"allow", "deny", "override", "add"} {
			if fieldValue, exists := value[field]; exists && fieldValue == nil {
				return fmt.Errorf("custom_supported_params.%s must not be null", field)
			}
		}
		if override, ok := value["override"].(map[string]any); ok {
			for key, item := range override {
				param, ok := item.(map[string]any)
				if !ok {
					continue
				}
				if err := validateRawParamNullField(param, fmt.Sprintf("custom_supported_params.override.%s", key)); err != nil {
					return err
				}
				if err := validateRawParamKnownFields(param, fmt.Sprintf("custom_supported_params.override.%s", key)); err != nil {
					return err
				}
				if err := validateRawParamFieldTypes(param, fmt.Sprintf("custom_supported_params.override.%s", key)); err != nil {
					return err
				}
				if err := validateRawParamRuleFields(param, fmt.Sprintf("custom_supported_params.override.%s", key)); err != nil {
					return err
				}
			}
		}
		if add, ok := value["add"].([]any); ok {
			for i, item := range add {
				param, ok := item.(map[string]any)
				if !ok {
					continue
				}
				if err := validateRawParamNullField(param, fmt.Sprintf("custom_supported_params.add[%d]", i)); err != nil {
					return err
				}
				if err := validateRawParamKnownFields(param, fmt.Sprintf("custom_supported_params.add[%d]", i)); err != nil {
					return err
				}
				if err := validateRawParamFieldTypes(param, fmt.Sprintf("custom_supported_params.add[%d]", i)); err != nil {
					return err
				}
				if err := validateRawParamRuleFields(param, fmt.Sprintf("custom_supported_params.add[%d]", i)); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func validateRawProfileShape(profile map[string]any) error {
	allowedFields := map[string]bool{"allow": true, "deny": true, "override": true, "add": true}
	for field := range profile {
		if !allowedFields[field] {
			return fmt.Errorf("custom_supported_params profile contains unknown field %q", field)
		}
	}
	for _, field := range []string{"allow", "deny"} {
		if value, exists := profile[field]; exists {
			items, ok := value.([]any)
			if !ok {
				return fmt.Errorf("custom_supported_params.%s must be an array of parameter keys", field)
			}
			for i, item := range items {
				if _, ok := item.(string); !ok {
					return fmt.Errorf("custom_supported_params.%s[%d] must be a parameter key string", field, i)
				}
			}
		}
	}
	if value, exists := profile["override"]; exists {
		items, ok := value.(map[string]any)
		if !ok {
			return fmt.Errorf("custom_supported_params.override must be an object keyed by parameter name")
		}
		for key, item := range items {
			if _, ok := item.(map[string]any); !ok {
				return fmt.Errorf("custom_supported_params.override.%s must be a parameter definition object", key)
			}
		}
	}
	if value, exists := profile["add"]; exists {
		items, ok := value.([]any)
		if !ok {
			return fmt.Errorf("custom_supported_params.add must be an array of parameter definition objects")
		}
		for i, item := range items {
			if _, ok := item.(map[string]any); !ok {
				return fmt.Errorf("custom_supported_params.add[%d] must be a parameter definition object", i)
			}
		}
	}
	return nil
}

func validateRawOperationProfileShape(profile map[string]any) error {
	allowedFields := map[string]bool{"version": true, "common": true, "by_operation": true}
	for field := range profile {
		if !allowedFields[field] {
			return fmt.Errorf("custom_supported_params operation profile contains unknown field %q", field)
		}
	}
	version, ok := profile["version"].(float64)
	if !ok || version != 2 {
		return fmt.Errorf("custom_supported_params.version must be 2")
	}
	if rawCommon, exists := profile["common"]; exists {
		common, ok := rawCommon.(map[string]any)
		if !ok {
			return fmt.Errorf("custom_supported_params.common must be a ModelParamProfile object")
		}
		if err := validateRawParamNullFields(common); err != nil {
			return err
		}
		if err := validateRawProfileShape(common); err != nil {
			return err
		}
	}
	if rawByOperation, exists := profile["by_operation"]; exists {
		byOperation, ok := rawByOperation.(map[string]any)
		if !ok {
			return fmt.Errorf("custom_supported_params.by_operation must be an object keyed by operation")
		}
		for operation, rawOperationProfile := range byOperation {
			operationProfile, ok := rawOperationProfile.(map[string]any)
			if !ok {
				return fmt.Errorf("custom_supported_params.by_operation.%s must be a ModelParamProfile object", operation)
			}
			if err := validateRawParamNullFields(operationProfile); err != nil {
				return err
			}
			if err := validateRawProfileShape(operationProfile); err != nil {
				return err
			}
		}
	}
	return nil
}

func validateRawParamNullField(param map[string]any, path string) error {
	for _, field := range []string{
		"key", "label", "type", "options", "default", "min", "max", "step",
		"json_schema", "conflicts_with", "conditional_enum", "conditional_const", "requires_value",
	} {
		if value, exists := param[field]; exists && value == nil {
			return fmt.Errorf("%s.%s must not be null", path, field)
		}
	}
	return nil
}

func validateRawParamKnownFields(param map[string]any, path string) error {
	allowedFields := map[string]bool{
		"key": true, "label": true, "type": true, "options": true, "default": true,
		"min": true, "max": true, "step": true, "json_schema": true,
		"conflicts_with": true, "conditional_enum": true, "conditional_const": true, "requires_value": true,
	}
	for field := range param {
		if !allowedFields[field] {
			return fmt.Errorf("%s contains unknown field %q", path, field)
		}
	}
	return nil
}

func validateRawParamFieldTypes(param map[string]any, path string) error {
	for _, field := range []string{"key", "label", "type"} {
		if value, exists := param[field]; exists {
			if _, ok := value.(string); !ok {
				return fmt.Errorf("%s.%s must be a string", path, field)
			}
		}
	}
	for _, field := range []string{"min", "max", "step"} {
		if value, exists := param[field]; exists {
			if _, ok := value.(float64); !ok {
				return fmt.Errorf("%s.%s must be a number", path, field)
			}
		}
	}
	for _, field := range []string{"options", "conflicts_with", "conditional_enum", "conditional_const", "requires_value"} {
		if value, exists := param[field]; exists {
			items, ok := value.([]any)
			if !ok {
				return fmt.Errorf("%s.%s must be an array", path, field)
			}
			if field == "options" || field == "conflicts_with" {
				for i, item := range items {
					if _, ok := item.(string); !ok {
						return fmt.Errorf("%s.%s[%d] must be a string", path, field, i)
					}
				}
			}
		}
	}
	if value, exists := param["json_schema"]; exists {
		if _, ok := value.(map[string]any); !ok {
			return fmt.Errorf("%s.json_schema must be an object", path)
		}
	}
	return nil
}

func validateRawParamRuleFields(param map[string]any, path string) error {
	if err := validateRawObjectArrayFields(param["conditional_enum"], path+".conditional_enum", map[string]bool{
		"when_param": true, "when_value": true, "options": true,
	}); err != nil {
		return err
	}
	if err := validateRawRuleNullFields(param["conditional_enum"], path+".conditional_enum"); err != nil {
		return err
	}
	if err := validateRawConditionalEnumFieldTypes(param["conditional_enum"], path+".conditional_enum"); err != nil {
		return err
	}
	if err := validateRawObjectArrayFields(param["conditional_const"], path+".conditional_const", map[string]bool{
		"when_param": true, "when_value": true, "value": true,
	}); err != nil {
		return err
	}
	if err := validateRawRuleNullFields(param["conditional_const"], path+".conditional_const"); err != nil {
		return err
	}
	if err := validateRawRuleStringField(param["conditional_const"], path+".conditional_const", "when_param"); err != nil {
		return err
	}
	if err := validateRawObjectArrayFields(param["requires_value"], path+".requires_value", map[string]bool{
		"param": true, "value": true,
	}); err != nil {
		return err
	}
	if err := validateRawRuleNullFields(param["requires_value"], path+".requires_value"); err != nil {
		return err
	}
	return validateRawRuleStringField(param["requires_value"], path+".requires_value", "param")
}

func validateRawObjectArrayFields(value any, path string, allowed map[string]bool) error {
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	for i, item := range items {
		obj, ok := item.(map[string]any)
		if !ok {
			return fmt.Errorf("%s[%d] must be an object", path, i)
		}
		for field := range obj {
			if !allowed[field] {
				return fmt.Errorf("%s[%d] contains unknown field %q", path, i, field)
			}
		}
	}
	return nil
}

func validateRawRuleNullFields(value any, path string) error {
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	for i, item := range items {
		obj, ok := item.(map[string]any)
		if !ok {
			continue
		}
		for field, raw := range obj {
			if raw == nil {
				return fmt.Errorf("%s[%d].%s must not be null", path, i, field)
			}
		}
	}
	return nil
}

func validateRawConditionalEnumFieldTypes(value any, path string) error {
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	for i, item := range items {
		obj, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if raw, exists := obj["when_param"]; exists {
			if _, ok := raw.(string); !ok {
				return fmt.Errorf("%s[%d].when_param must be a string", path, i)
			}
		}
		if raw, exists := obj["options"]; exists {
			options, ok := raw.([]any)
			if !ok {
				return fmt.Errorf("%s[%d].options must be an array", path, i)
			}
			for j, option := range options {
				if _, ok := option.(string); !ok {
					return fmt.Errorf("%s[%d].options[%d] must be a string", path, i, j)
				}
			}
		}
	}
	return nil
}

func validateRawRuleStringField(value any, path string, field string) error {
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	for i, item := range items {
		obj, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if raw, exists := obj[field]; exists {
			if _, ok := raw.(string); !ok {
				return fmt.Errorf("%s[%d].%s must be a string", path, i, field)
			}
		}
	}
	return nil
}

func validateProfileParamDefs(profile ModelParamProfile) error {
	for key, param := range profile.Override {
		param = normalizeParamDefKey(param)
		overrideKey := normalizeParamKey(key)
		if param.Key != "" && param.Key != overrideKey {
			return fmt.Errorf("custom_supported_params.override.%s: parameter key %q must match override key %q", key, param.Key, overrideKey)
		}
		param.Key = overrideKey
		if param.Key == "" {
			return fmt.Errorf("custom_supported_params.override.%s: parameter key is required", key)
		}
		if param.Type != "" {
			if err := validateParamDefShape(param); err != nil {
				return fmt.Errorf("custom_supported_params.override.%s: %w", key, err)
			}
		}
	}
	for i, param := range profile.Add {
		param = normalizeParamDefKey(param)
		if err := validateParamDefShape(param); err != nil {
			return fmt.Errorf("custom_supported_params.add[%d]: %w", i, err)
		}
		if strings.TrimSpace(param.Label) == "" {
			return fmt.Errorf("custom_supported_params.add[%d]: parameter %q label is required", i, param.Key)
		}
	}
	return nil
}

func validateOperationProfileParamDefs(profile ModelOperationParamProfile) error {
	if err := validateProfileParamDefs(profile.Common); err != nil {
		return fmt.Errorf("custom_supported_params.common: %w", err)
	}
	for operation, operationProfile := range profile.ByOperation {
		if err := validateProfileParamDefs(operationProfile); err != nil {
			return fmt.Errorf("custom_supported_params.by_operation.%s: %w", strings.TrimSpace(operation), err)
		}
	}
	return nil
}

func validateProfileParamReferences(adapterType string, capabilities []string, profile ModelParamProfile) error {
	return validateProfileParamReferencesWithBaseParams(DefaultParamsForAdapter(adapterType, capabilities), profile)
}

func validateProfileParamReferencesWithBaseParams(baseParams []ParamDef, profile ModelParamProfile) error {
	known := make(map[string]bool)
	baseKnown := make(map[string]bool)
	for _, param := range baseParams {
		if key := normalizeParamKey(param.Key); key != "" {
			known[key] = true
			baseKnown[key] = true
		}
	}
	overrideKnown := make(map[string]bool)
	for key, param := range profile.Override {
		param = normalizeParamDefKey(param)
		if param.Key == "" {
			param.Key = normalizeParamKey(key)
		}
		if param.Key != "" {
			known[param.Key] = true
			overrideKnown[param.Key] = true
		}
	}
	addKnown := make(map[string]bool)
	for _, param := range profile.Add {
		if key := normalizeParamKey(param.Key); key != "" {
			if addKnown[key] {
				return fmt.Errorf("custom_supported_params.add contains duplicate parameter key %q", key)
			}
			if baseKnown[key] || overrideKnown[key] {
				return fmt.Errorf("custom_supported_params.add parameter %q already exists; use override to modify existing parameters", key)
			}
			addKnown[key] = true
			known[key] = true
		}
	}
	allow, err := validateProfileKeyList("allow", profile.Allow, known)
	if err != nil {
		return err
	}
	deny, err := validateProfileKeyList("deny", profile.Deny, known)
	if err != nil {
		return err
	}
	for key := range allow {
		if deny[key] {
			return fmt.Errorf("custom_supported_params profile references parameter %q in both allow and deny", key)
		}
	}
	return nil
}

func validateProfileKeyList(field string, values []string, known map[string]bool) (map[string]bool, error) {
	seen := make(map[string]bool, len(values))
	for _, value := range values {
		key := normalizeParamKey(value)
		if key == "" {
			return seen, fmt.Errorf("custom_supported_params.%s contains an empty parameter key", field)
		}
		if seen[key] {
			return seen, fmt.Errorf("custom_supported_params.%s contains duplicate parameter key %q", field, key)
		}
		if !known[key] {
			return seen, fmt.Errorf("custom_supported_params.%s references unknown parameter %q", field, key)
		}
		seen[key] = true
	}
	return seen, nil
}

func validateParamDefSet(params []ParamDef, requireLabels bool) error {
	seen := make(map[string]bool, len(params))
	byKey := make(map[string]ParamDef, len(params))
	for i, param := range params {
		param = normalizeParamDefKey(param)
		if err := validateParamDefShape(param); err != nil {
			return fmt.Errorf("custom_supported_params[%d]: %w", i, err)
		}
		if requireLabels && strings.TrimSpace(param.Label) == "" {
			return fmt.Errorf("custom_supported_params[%d]: parameter %q label is required", i, param.Key)
		}
		if seen[param.Key] {
			return fmt.Errorf("custom_supported_params contains duplicate parameter key %q", param.Key)
		}
		seen[param.Key] = true
		byKey[param.Key] = param
	}
	for _, param := range params {
		param = normalizeParamDefKey(param)
		for _, other := range param.ConflictsWith {
			if other != "" && !seen[normalizeParamKey(other)] {
				return fmt.Errorf("parameter %q conflicts_with unknown parameter %q", param.Key, other)
			}
		}
		for _, rule := range param.ConditionalEnum {
			if rule.WhenParam != "" && !seen[normalizeParamKey(rule.WhenParam)] {
				return fmt.Errorf("parameter %q conditional_enum references unknown parameter %q", param.Key, rule.WhenParam)
			}
			whenParam := byKey[normalizeParamKey(rule.WhenParam)]
			if err := validateConfigParamValue(whenParam, rule.WhenValue); err != nil {
				return fmt.Errorf("parameter %q conditional_enum.when_value is invalid for parameter %q: %w", param.Key, whenParam.Key, err)
			}
			for _, option := range rule.Options {
				if err := validateConfigParamValue(param, option); err != nil {
					return fmt.Errorf("parameter %q conditional_enum option %q is invalid: %w", param.Key, option, err)
				}
			}
		}
		for _, rule := range param.ConditionalConst {
			if rule.WhenParam != "" && !seen[normalizeParamKey(rule.WhenParam)] {
				return fmt.Errorf("parameter %q conditional_const references unknown parameter %q", param.Key, rule.WhenParam)
			}
			whenParam := byKey[normalizeParamKey(rule.WhenParam)]
			if err := validateConfigParamValue(whenParam, rule.WhenValue); err != nil {
				return fmt.Errorf("parameter %q conditional_const.when_value is invalid for parameter %q: %w", param.Key, whenParam.Key, err)
			}
			if err := validateConfigParamValue(param, rule.Value); err != nil {
				return fmt.Errorf("parameter %q conditional_const.value is invalid: %w", param.Key, err)
			}
		}
		for _, rule := range param.RequiresValue {
			if rule.Param != "" && !seen[normalizeParamKey(rule.Param)] {
				return fmt.Errorf("parameter %q requires_value references unknown parameter %q", param.Key, rule.Param)
			}
			requiredParam := byKey[normalizeParamKey(rule.Param)]
			if err := validateConfigParamValue(requiredParam, rule.Value); err != nil {
				return fmt.Errorf("parameter %q requires_value.value is invalid for parameter %q: %w", param.Key, requiredParam.Key, err)
			}
		}
	}
	return nil
}

func validateParamDefShape(param ParamDef) error {
	if param.Key == "" {
		return fmt.Errorf("parameter key is required")
	}
	switch param.Type {
	case "select", "number", "boolean", "string":
	default:
		return fmt.Errorf("parameter %q has unsupported type %q", param.Key, param.Type)
	}
	if param.Type == "select" && len(param.Options) == 0 {
		return fmt.Errorf("select parameter %q must define options", param.Key)
	}
	if param.Type == "select" {
		if err := validateStringOptions("select parameter "+param.Key+" options", param.Options); err != nil {
			return err
		}
	}
	if param.Type == "number" && param.hasMin() && param.hasMax() && param.Min > param.Max {
		return fmt.Errorf("number parameter %q has min greater than max", param.Key)
	}
	if param.Type == "number" && param.hasStep() && param.Step <= 0 {
		return fmt.Errorf("number parameter %q step must be greater than zero", param.Key)
	}
	if param.Default != nil {
		if err := validateParamDefaultValue(param); err != nil {
			return err
		}
	}
	if err := validateParamJSONSchemaConfig(param); err != nil {
		return err
	}
	for i, rule := range param.ConditionalEnum {
		if normalizeParamKey(rule.WhenParam) == "" {
			return fmt.Errorf("parameter %q conditional_enum[%d].when_param is required", param.Key, i)
		}
		if len(rule.Options) == 0 {
			return fmt.Errorf("parameter %q conditional_enum[%d].options is required", param.Key, i)
		}
		if err := validateStringOptions(fmt.Sprintf("parameter %q conditional_enum[%d].options", param.Key, i), rule.Options); err != nil {
			return err
		}
	}
	for i, rule := range param.ConditionalConst {
		if normalizeParamKey(rule.WhenParam) == "" {
			return fmt.Errorf("parameter %q conditional_const[%d].when_param is required", param.Key, i)
		}
	}
	for i, rule := range param.RequiresValue {
		if normalizeParamKey(rule.Param) == "" {
			return fmt.Errorf("parameter %q requires_value[%d].param is required", param.Key, i)
		}
	}
	return nil
}

func validateStringOptions(label string, options []string) error {
	seen := make(map[string]bool, len(options))
	for _, option := range options {
		if strings.TrimSpace(option) == "" {
			return fmt.Errorf("%s contains an empty option", label)
		}
		if seen[option] {
			return fmt.Errorf("%s contains duplicate option %q", label, option)
		}
		seen[option] = true
	}
	return nil
}

func validateParamJSONSchemaConfig(param ParamDef) error {
	if len(param.JSONSchema) == 0 {
		return nil
	}
	if raw, ok := param.JSONSchema["enum"]; ok {
		values, ok := strictScalarSlice(raw)
		if !ok || len(values) == 0 {
			return fmt.Errorf("parameter %q json_schema.enum must be a non-empty scalar array", param.Key)
		}
	}
	if raw, ok := param.JSONSchema["pattern"]; ok {
		pattern, ok := strictStringValue(raw)
		if !ok {
			return fmt.Errorf("parameter %q json_schema.pattern must be a string", param.Key)
		}
		if _, err := regexp.Compile(pattern); err != nil {
			return fmt.Errorf("parameter %q json_schema.pattern must be a valid regexp: %w", param.Key, err)
		}
	}
	if raw, ok := param.JSONSchema["x_movscript_image_size"]; ok {
		if err := validateImageSizeSchemaConfig(param.Key, raw); err != nil {
			return err
		}
	}
	min, hasMin, minOK := strictJSONSchemaNumber(param.JSONSchema, "minimum")
	if !minOK {
		return fmt.Errorf("parameter %q json_schema.minimum must be a number", param.Key)
	}
	max, hasMax, maxOK := strictJSONSchemaNumber(param.JSONSchema, "maximum")
	if !maxOK {
		return fmt.Errorf("parameter %q json_schema.maximum must be a number", param.Key)
	}
	multiple, hasMultiple, multipleOK := strictJSONSchemaNumber(param.JSONSchema, "multipleOf")
	if !multipleOK {
		return fmt.Errorf("parameter %q json_schema.multipleOf must be a number", param.Key)
	}
	if hasMin && hasMax && min > max {
		return fmt.Errorf("parameter %q json_schema.minimum is greater than maximum", param.Key)
	}
	if hasMultiple && multiple <= 0 {
		return fmt.Errorf("parameter %q json_schema.multipleOf must be greater than zero", param.Key)
	}
	if param.Default != nil {
		if err := validateParamJSONSchemaKeywords(param.Key, param.JSONSchema, param.Default); err != nil {
			return fmt.Errorf("parameter %q default does not satisfy json_schema: %w", param.Key, err)
		}
	}
	return nil
}

func validateImageSizeSchemaConfig(paramKey string, raw any) error {
	items, ok := raw.(map[string]any)
	if !ok {
		return fmt.Errorf("parameter %q json_schema.x_movscript_image_size must be an object", paramKey)
	}
	allowed := map[string]bool{
		"allow_auto":         true,
		"width_multiple_of":  true,
		"height_multiple_of": true,
		"max_width":          true,
		"max_height":         true,
		"min_aspect_ratio":   true,
		"max_aspect_ratio":   true,
	}
	for key, value := range items {
		if !allowed[key] {
			return fmt.Errorf("parameter %q json_schema.x_movscript_image_size has unknown key %q", paramKey, key)
		}
		switch key {
		case "allow_auto":
			if _, ok := strictBoolValue(value); !ok {
				return fmt.Errorf("parameter %q json_schema.x_movscript_image_size.allow_auto must be a boolean", paramKey)
			}
		case "width_multiple_of", "height_multiple_of", "max_width", "max_height":
			n, ok := strictNumberValue(value)
			if !ok || !isWholeNumber(n) || n <= 0 {
				return fmt.Errorf("parameter %q json_schema.x_movscript_image_size.%s must be a positive integer", paramKey, key)
			}
		case "min_aspect_ratio", "max_aspect_ratio":
			n, ok := strictNumberValue(value)
			if !ok || n <= 0 {
				return fmt.Errorf("parameter %q json_schema.x_movscript_image_size.%s must be a positive number", paramKey, key)
			}
		}
	}
	minAspect, hasMinAspect, minOK := strictJSONSchemaNumber(items, "min_aspect_ratio")
	maxAspect, hasMaxAspect, maxOK := strictJSONSchemaNumber(items, "max_aspect_ratio")
	if !minOK || !maxOK {
		return fmt.Errorf("parameter %q json_schema.x_movscript_image_size aspect ratio bounds must be numbers", paramKey)
	}
	if hasMinAspect && hasMaxAspect && minAspect > maxAspect {
		return fmt.Errorf("parameter %q json_schema.x_movscript_image_size.min_aspect_ratio is greater than max_aspect_ratio", paramKey)
	}
	return nil
}

func strictJSONSchemaNumber(schema map[string]any, key string) (float64, bool, bool) {
	value, ok := schema[key]
	if !ok {
		return 0, false, true
	}
	switch v := value.(type) {
	case float64:
		return v, true, true
	case int:
		return float64(v), true, true
	case int64:
		return float64(v), true, true
	case json.Number:
		n, err := v.Float64()
		return n, true, err == nil
	default:
		return 0, true, false
	}
}

func strictScalarSlice(value any) ([]any, bool) {
	switch items := value.(type) {
	case []any:
		out := make([]any, 0, len(items))
		for _, item := range items {
			if !isComparableScalar(item) {
				return nil, false
			}
			out = append(out, item)
		}
		return out, true
	case []int:
		out := make([]any, 0, len(items))
		for _, item := range items {
			out = append(out, item)
		}
		return out, true
	case []string:
		out := make([]any, 0, len(items))
		for _, item := range items {
			out = append(out, item)
		}
		return out, true
	case []float64:
		out := make([]any, 0, len(items))
		for _, item := range items {
			out = append(out, item)
		}
		return out, true
	case []bool:
		out := make([]any, 0, len(items))
		for _, item := range items {
			out = append(out, item)
		}
		return out, true
	default:
		return nil, false
	}
}

func validateConfigParamValue(param ParamDef, value any) error {
	switch param.Type {
	case "select":
		v, ok := strictStringValue(value)
		if !ok {
			return fmt.Errorf("value must be a string option")
		}
		if len(param.Options) > 0 && !containsString(param.Options, v) {
			return fmt.Errorf("value %q is not in options", v)
		}
	case "number":
		v, ok := strictNumberValue(value)
		if !ok {
			return fmt.Errorf("value must be a number")
		}
		if param.hasMin() && v < param.Min {
			return fmt.Errorf("value is less than min")
		}
		if param.hasMax() && v > param.Max {
			return fmt.Errorf("value is greater than max")
		}
	case "boolean":
		if _, ok := strictBoolValue(value); !ok {
			return fmt.Errorf("value must be a boolean")
		}
	case "string", "":
		if _, ok := strictStringValue(value); !ok {
			return fmt.Errorf("value must be a string")
		}
	default:
		return fmt.Errorf("parameter %q has unsupported type %q", param.Key, param.Type)
	}
	if err := validateParamJSONSchemaKeywords(param.Key, param.JSONSchema, value); err != nil {
		return err
	}
	return nil
}

func validateParamDefaultValue(param ParamDef) error {
	switch param.Type {
	case "select":
		value, ok := strictStringValue(param.Default)
		if !ok {
			return fmt.Errorf("select parameter %q default must be a string option", param.Key)
		}
		if len(param.Options) > 0 && !containsString(param.Options, value) {
			return fmt.Errorf("select parameter %q default %q is not in options", param.Key, value)
		}
	case "number":
		value, ok := strictNumberValue(param.Default)
		if !ok {
			return fmt.Errorf("number parameter %q default must be a number", param.Key)
		}
		if param.hasMin() && value < param.Min {
			return fmt.Errorf("number parameter %q default is less than min", param.Key)
		}
		if param.hasMax() && value > param.Max {
			return fmt.Errorf("number parameter %q default is greater than max", param.Key)
		}
	case "boolean":
		if _, ok := strictBoolValue(param.Default); !ok {
			return fmt.Errorf("boolean parameter %q default must be a boolean", param.Key)
		}
	case "string", "":
		if _, ok := strictStringValue(param.Default); !ok {
			return fmt.Errorf("string parameter %q default must be a string", param.Key)
		}
	}
	return nil
}
