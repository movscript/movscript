package ai

import (
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
)

// GenRequest is the canonical front-end request for any generation job.
// It is transport-agnostic (HTTP handler maps JSON fields to this struct).
type GenRequest struct {
	RuntimeModelID  uint
	OutputType      string   // use CapabilityFamily* constants
	InputModalities []string // "text" | "image" | "video" present in this request
	ImageCount      int      // number of image resources attached
	VideoCount      int      // number of video resources attached
}

// ValidateGenRequest checks whether the requested output type and inputs are
// compatible with the given model definition. Returns a user-facing error if not.
func ValidateGenRequest(def *ModelDef, req GenRequest) error {
	if def == nil {
		return fmt.Errorf("model definition not found")
	}

	// 1. Verify the model supports the requested output type.
	if !hasCap(def, req.OutputType) {
		return unsupportedOutputTypeError(req.OutputType, def.DisplayName, def.Capabilities)
	}

	// 2. Verify image count does not exceed model limit.
	if def.MaxInputImages > 0 && req.ImageCount > def.MaxInputImages {
		return invalidInputCountError(
			"image",
			fmt.Sprintf("model %q supports at most %d image input(s), but %d were provided", def.DisplayName, def.MaxInputImages, req.ImageCount),
			requiredImageInputMin(req.OutputType),
			def.MaxInputImages,
			req.ImageCount,
		)
	}
	if def.MaxInputImages == 0 && req.ImageCount > 0 {
		return invalidInputCountError(
			"image",
			fmt.Sprintf("model %q does not accept image inputs", def.DisplayName),
			0,
			0,
			req.ImageCount,
		)
	}

	// 3. Verify video count does not exceed model limit.
	if def.MaxInputVideos > 0 && req.VideoCount > def.MaxInputVideos {
		return invalidInputCountError(
			"video",
			fmt.Sprintf("model %q supports at most %d video input(s), but %d were provided", def.DisplayName, def.MaxInputVideos, req.VideoCount),
			requiredVideoInputMin(req.OutputType),
			def.MaxInputVideos,
			req.VideoCount,
		)
	}
	if def.MaxInputVideos == 0 && req.VideoCount > 0 {
		return invalidInputCountError(
			"video",
			fmt.Sprintf("model %q does not accept video inputs", def.DisplayName),
			0,
			0,
			req.VideoCount,
		)
	}

	return nil
}

func requiredImageInputMin(outputType string) int {
	return 0
}

func requiredVideoInputMin(outputType string) int {
	return 0
}

// hasCap reports whether the model def includes the given capability string.
func hasCap(def *ModelDef, cap string) bool {
	for _, c := range def.Capabilities {
		if c == cap {
			return true
		}
	}
	return false
}

// ValidateGenerationParams validates user-configurable generation parameters
// against the model-declared SupportedParams. It is intentionally provider
// neutral; provider adapters still translate validated params to native fields.
func ValidateGenerationParams(def *ModelDef, jobType, extraParams, aspectRatio string, duration int) error {
	_, err := ValidateAndNormalizeGenerationParams(def, jobType, extraParams, aspectRatio, duration)
	return err
}

// ValidateAndNormalizeGenerationParams validates user params against the
// resolved model schema and returns canonical-key params for request builders.
func ValidateAndNormalizeGenerationParams(def *ModelDef, jobType, extraParams, aspectRatio string, duration int) (map[string]any, error) {
	return ValidateAndNormalizeGenerationParamsForOperation(def, jobType, "", extraParams, aspectRatio, duration)
}

// ValidateAndNormalizeGenerationParamsForOperation validates params against the
// operation-scoped public model contract when an operation is known.
func ValidateAndNormalizeGenerationParamsForOperation(def *ModelDef, jobType, operation, extraParams, aspectRatio string, duration int) (map[string]any, error) {
	if def == nil {
		return nil, fmt.Errorf("model definition not found")
	}

	params, err := parseExtraParams(extraParams)
	if err != nil {
		return nil, err
	}

	if aspectRatio != "" {
		params["aspect_ratio"] = aspectRatio
	}
	if duration != 0 {
		params["duration"] = duration
	}
	params = CanonicalizeGenerationParams(params)
	if len(params) == 0 {
		return params, nil
	}
	supportedParams, supportedParamsExplicit, err := generationSupportedParamsForOperation(def, operation)
	if err != nil {
		return nil, err
	}
	if len(supportedParams) == 0 {
		if supportedParamsExplicit {
			for key := range params {
				return nil, unsupportedParameterError(key, def.DisplayName)
			}
		}
		return params, nil
	}

	supported := make(map[string]ParamDef, len(supportedParams))
	for _, p := range supportedParams {
		supported[p.Key] = p
	}

	for key, val := range params {
		p, ok := supported[key]
		if !ok {
			return nil, unsupportedParameterError(key, def.DisplayName)
		}
		if err := validateParamValue(p, val); err != nil {
			return nil, err
		}
	}

	if supportedParamsExplicit {
		if err := validateDeclaredParamRules(params, supportedParams); err != nil {
			return nil, err
		}
	} else {
		if err := validateCrossParamRules(params); err != nil {
			return nil, err
		}
	}
	return params, nil
}

const (
	seedreamSequentialImageTotalLimit = 15
	totalLimitSchemaKey               = "x_movscript_total_limit"
)

type generationOutputTotalLimitRule struct {
	InputKind   string
	MaxTotal    int
	OutputParam string
	WhenParam   string
	WhenValue   any
}

func ValidateGenerationOutputCardinality(def *ModelDef, outputType string, params map[string]any, inputImageCount int) error {
	if def == nil || outputType != CapabilityFamilyImageGeneration {
		return nil
	}
	handled, err := validateDeclaredOutputTotalLimits(def, params, inputImageCount)
	if handled || err != nil {
		return err
	}
	if !isSeedreamImageModel(def) {
		return nil
	}
	return validateGenerationOutputTotalLimit(params, inputImageCount, generationOutputTotalLimitRule{
		InputKind:   "image",
		MaxTotal:    seedreamSequentialImageTotalLimit,
		OutputParam: "image_count",
		WhenParam:   "sequential_image_generation",
		WhenValue:   "auto",
	})
}

func validateDeclaredOutputTotalLimits(def *ModelDef, params map[string]any, inputImageCount int) (bool, error) {
	supportedParams, _, err := generationSupportedParamsForOperation(def, "")
	if err != nil {
		return false, err
	}
	handled := false
	for _, param := range supportedParams {
		rule, ok := totalLimitRuleFromParam(param)
		if !ok {
			continue
		}
		handled = true
		if err := validateGenerationOutputTotalLimit(params, inputImageCount, rule); err != nil {
			return true, err
		}
	}
	return handled, nil
}

func totalLimitRuleFromParam(param ParamDef) (generationOutputTotalLimitRule, bool) {
	raw, ok := param.JSONSchema[totalLimitSchemaKey]
	if !ok {
		return generationOutputTotalLimitRule{}, false
	}
	items, ok := raw.(map[string]any)
	if !ok {
		return generationOutputTotalLimitRule{}, false
	}
	rule := generationOutputTotalLimitRule{OutputParam: param.Key}
	if inputKind, ok := strictStringValue(items["input_kind"]); ok {
		rule.InputKind = inputKind
	}
	if maxTotal, ok := strictNumberValue(items["max_total"]); ok && isWholeNumber(maxTotal) {
		rule.MaxTotal = int(maxTotal)
	}
	if outputParam, ok := strictStringValue(items["output_param"]); ok && strings.TrimSpace(outputParam) != "" {
		rule.OutputParam = outputParam
	}
	if whenParam, ok := strictStringValue(items["when_param"]); ok {
		rule.WhenParam = whenParam
		rule.WhenValue = items["when_value"]
	}
	if rule.InputKind == "" || rule.MaxTotal <= 0 || strings.TrimSpace(rule.OutputParam) == "" {
		return generationOutputTotalLimitRule{}, false
	}
	return rule, true
}

func validateGenerationOutputTotalLimit(params map[string]any, inputImageCount int, rule generationOutputTotalLimitRule) error {
	if rule.InputKind != "image" || rule.MaxTotal <= 0 {
		return nil
	}
	if rule.WhenParam != "" && !conditionalParamMatches(params[rule.WhenParam], rule.WhenValue) {
		return nil
	}
	outputCountValue, ok := paramValueByKeyOrAlias(params, rule.OutputParam)
	if !ok {
		return nil
	}
	outputCount, ok := positiveWholeIntValue(outputCountValue)
	if !ok {
		return nil
	}
	total := inputImageCount + outputCount
	if total <= rule.MaxTotal {
		return nil
	}
	allowedGenerated := rule.MaxTotal - inputImageCount
	if allowedGenerated < 1 {
		allowedGenerated = 1
	}
	outputParam := rule.OutputParam
	err := invalidParamCombinationError(
		fmt.Sprintf("image generation supports at most %d total image(s): %d input image(s) + %d generated image(s) were requested", rule.MaxTotal, inputImageCount, outputCount),
		outputParam,
		"input_images",
	)
	err.SuggestedFix = map[string]any{outputParam: allowedGenerated}
	return err
}

func paramValueByKeyOrAlias(params map[string]any, key string) (any, bool) {
	if value, ok := params[key]; ok {
		return value, true
	}
	for _, alias := range paramKeyAliases(key) {
		if value, ok := params[alias]; ok {
			return value, true
		}
	}
	return nil, false
}

func isSeedreamImageModel(def *ModelDef) bool {
	if def == nil {
		return false
	}
	haystack := strings.ToLower(strings.Join([]string{def.ID, def.ModelID, def.DisplayName}, " "))
	return strings.EqualFold(strings.TrimSpace(def.Lab), "seed") && strings.Contains(haystack, "seedream")
}

func positiveWholeIntValue(value any) (int, bool) {
	number, ok := numberValue(value)
	if !ok || number <= 0 || !isWholeNumber(number) {
		return 0, false
	}
	return int(number), true
}

func generationSupportedParamsForOperation(def *ModelDef, operation string) ([]ParamDef, bool, error) {
	operation = strings.TrimSpace(operation)
	if operation != "" && len(def.SupportedParamsByOperation) > 0 {
		params, ok := def.SupportedParamsByOperation[operation]
		if !ok {
			return nil, true, fmt.Errorf("model %q does not declare generation params for operation %q", def.DisplayName, operation)
		}
		return params, true, nil
	}
	if operation == "" && len(def.SupportedParamsByOperation) == 1 && len(def.SupportedParams) == 0 && !def.SupportedParamsExplicit {
		for _, params := range def.SupportedParamsByOperation {
			return params, true, nil
		}
	}
	return def.SupportedParams, def.SupportedParamsExplicit, nil
}

func paramKeyAliases(key string) []string {
	switch key {
	case "aspect_ratio":
		return []string{"ratio"}
	case "ratio":
		return []string{"aspect_ratio"}
	case "duration":
		return []string{"duration_seconds"}
	case "duration_seconds":
		return []string{"duration"}
	case "image_size":
		return []string{"size"}
	case "size":
		return []string{"image_size"}
	case "prompt_strength":
		return []string{"guidance_scale"}
	case "guidance_scale":
		return []string{"prompt_strength"}
	case "image_count":
		return []string{"max_images"}
	case "max_images":
		return []string{"image_count"}
	case "fixed_camera":
		return []string{"camera_fixed"}
	case "camera_fixed":
		return []string{"fixed_camera"}
	case "audio":
		return []string{"generate_audio"}
	case "generate_audio":
		return []string{"audio"}
	default:
		return nil
	}
}

func parseExtraParams(raw string) (map[string]any, error) {
	if strings.TrimSpace(raw) == "" {
		return map[string]any{}, nil
	}
	var params map[string]any
	if err := json.Unmarshal([]byte(raw), &params); err != nil {
		return nil, fmt.Errorf("extra_params must be valid JSON: %w", err)
	}
	if params == nil {
		params = map[string]any{}
	}
	return params, nil
}

func validateParamValue(p ParamDef, val any) error {
	switch p.Type {
	case "select":
		s, ok := stringValue(val)
		if !ok {
			return invalidParamTypeError(p.Key, "a string option")
		}
		if len(p.Options) > 0 && !containsString(p.Options, s) {
			return invalidParamOptionError(p.Key, p.Options)
		}
	case "number":
		n, ok := numberValue(val)
		if !ok {
			return invalidParamTypeError(p.Key, "a number")
		}
		if p.hasMin() && n < p.Min {
			return invalidParamRangeError(p.Key, ">=", p.Min)
		}
		if p.hasMax() && n > p.Max {
			return invalidParamRangeError(p.Key, "<=", p.Max)
		}
		if p.Step >= 1 && !isWholeNumber(n) {
			return invalidParamTypeError(p.Key, "an integer")
		}
	case "boolean":
		if _, ok := boolValue(val); !ok {
			return invalidParamTypeError(p.Key, "a boolean")
		}
	case "string":
		if _, ok := strictStringValue(val); !ok {
			return invalidParamTypeError(p.Key, "a string")
		}
	default:
		if p.Key == "size" || p.Key == "image_size" {
			if err := validateSizeParam(p.Key, val); err != nil {
				return err
			}
		}
	}
	if p.Key == "size" || p.Key == "image_size" {
		if err := validateSizeParam(p.Key, val); err != nil {
			return err
		}
	}
	if err := validateParamJSONSchemaKeywords(p.Key, p.JSONSchema, val); err != nil {
		return err
	}
	return nil
}

func validateParamJSONSchemaKeywords(key string, schema map[string]any, val any) error {
	if len(schema) == 0 {
		return nil
	}
	if enumRaw, ok := schema["enum"]; ok {
		enumValues := scalarSlice(enumRaw)
		if len(enumValues) > 0 && !scalarSliceContains(enumValues, val) {
			err := invalidParamCombinationError("parameter \""+key+"\" must match one of the declared schema enum values", key)
			err.Code = "INVALID_PARAMETER_OPTION"
			err.AllowedValues = cloneScalarValues(enumValues)
			if len(enumValues) > 0 {
				err.SuggestedFix = map[string]any{key: enumValues[0]}
			}
			return err
		}
	}
	if patternRaw, ok := schema["pattern"]; ok {
		pattern, ok := strictStringValue(patternRaw)
		if !ok {
			return invalidParamCombinationError("parameter \""+key+"\" declares an invalid schema pattern", key)
		}
		value, ok := strictStringValue(val)
		if !ok {
			return invalidParamTypeError(key, "a string")
		}
		matched, err := regexp.MatchString(pattern, value)
		if err != nil {
			return invalidParamCombinationError("parameter \""+key+"\" declares an invalid schema pattern", key)
		}
		if !matched {
			err := invalidParamCombinationError("parameter \""+key+"\" must match the declared schema pattern", key)
			err.Code = "INVALID_PARAMETER_FORMAT"
			return err
		}
	}
	if min, ok := schemaNumberKeyword(schema, "minimum"); ok {
		n, valueOK := numberValue(val)
		if !valueOK {
			return invalidParamTypeError(key, "a number")
		}
		if n < min {
			return invalidParamRangeError(key, ">=", min)
		}
	}
	if max, ok := schemaNumberKeyword(schema, "maximum"); ok {
		n, valueOK := numberValue(val)
		if !valueOK {
			return invalidParamTypeError(key, "a number")
		}
		if n > max {
			return invalidParamRangeError(key, "<=", max)
		}
	}
	if multiple, ok := schemaNumberKeyword(schema, "multipleOf"); ok && multiple != 0 {
		n, valueOK := numberValue(val)
		if !valueOK {
			return invalidParamTypeError(key, "a number")
		}
		ratio := n / multiple
		if math.Abs(ratio-math.Round(ratio)) > 1e-9 {
			return invalidParamCombinationError("parameter \""+key+"\" must be a multiple of the declared schema step", key)
		}
	}
	if constraints, ok := imageSizeConstraintsFromSchema(schema); ok {
		if err := validateImageSizeConstraints(key, constraints, val); err != nil {
			return err
		}
	}
	return nil
}

type imageSizeSchemaConstraints struct {
	AllowAuto        bool
	WidthMultipleOf  int
	HeightMultipleOf int
	MaxWidth         int
	MaxHeight        int
	MinAspectRatio   float64
	MaxAspectRatio   float64
}

func imageSizeConstraintsFromSchema(schema map[string]any) (imageSizeSchemaConstraints, bool) {
	raw, ok := schema["x_movscript_image_size"]
	if !ok {
		return imageSizeSchemaConstraints{}, false
	}
	items, ok := raw.(map[string]any)
	if !ok {
		return imageSizeSchemaConstraints{}, true
	}
	out := imageSizeSchemaConstraints{}
	if value, ok := items["allow_auto"]; ok {
		out.AllowAuto, _ = strictBoolValue(value)
	}
	out.WidthMultipleOf = intSchemaKeyword(items, "width_multiple_of")
	out.HeightMultipleOf = intSchemaKeyword(items, "height_multiple_of")
	out.MaxWidth = intSchemaKeyword(items, "max_width")
	out.MaxHeight = intSchemaKeyword(items, "max_height")
	out.MinAspectRatio = numberSchemaKeyword(items, "min_aspect_ratio")
	out.MaxAspectRatio = numberSchemaKeyword(items, "max_aspect_ratio")
	return out, true
}

func validateImageSizeConstraints(key string, constraints imageSizeSchemaConstraints, val any) error {
	value, ok := strictStringValue(val)
	if !ok {
		return invalidParamTypeError(key, "a string")
	}
	if value == "auto" {
		if constraints.AllowAuto {
			return nil
		}
		return invalidParamCombinationError("parameter \""+key+"\" cannot be auto", key)
	}
	width, height, ok := parseImageSize(value)
	if !ok {
		return fmt.Errorf("parameter %q must be a preset or WxH size", key)
	}
	if constraints.WidthMultipleOf > 0 && width%constraints.WidthMultipleOf != 0 {
		return invalidParamCombinationError("parameter \""+key+"\" width must be divisible by the declared schema multiple", key)
	}
	if constraints.HeightMultipleOf > 0 && height%constraints.HeightMultipleOf != 0 {
		return invalidParamCombinationError("parameter \""+key+"\" height must be divisible by the declared schema multiple", key)
	}
	if constraints.MaxWidth > 0 && width > constraints.MaxWidth {
		return invalidParamRangeError(key, "<=", float64(constraints.MaxWidth))
	}
	if constraints.MaxHeight > 0 && height > constraints.MaxHeight {
		return invalidParamRangeError(key, "<=", float64(constraints.MaxHeight))
	}
	ratio := float64(width) / float64(height)
	if constraints.MinAspectRatio > 0 && ratio < constraints.MinAspectRatio {
		return invalidParamCombinationError("parameter \""+key+"\" aspect ratio is below the declared schema minimum", key)
	}
	if constraints.MaxAspectRatio > 0 && ratio > constraints.MaxAspectRatio {
		return invalidParamCombinationError("parameter \""+key+"\" aspect ratio is above the declared schema maximum", key)
	}
	return nil
}

func validateCrossParamRules(params map[string]any) error {
	_, hasFrames := params["frames"]
	_, hasDuration := params["duration"]
	if hasFrames && hasDuration {
		if frames, ok := numberValue(params["frames"]); ok && frames != 0 {
			if duration, ok := numberValue(params["duration"]); ok && duration != 0 {
				return invalidParamCombinationError("parameters \"frames\" and \"duration\" cannot be used together", "frames", "duration")
			}
		}
	}

	if workspace, ok := boolValue(params["workspace"]); ok && workspace {
		if lastFrame, ok := boolValue(params["return_last_frame"]); ok && lastFrame {
			return invalidParamCombinationError("parameter \"return_last_frame\" cannot be true when \"workspace\" is true", "return_last_frame", "workspace")
		}
		if tier, ok := stringValue(params["service_tier"]); ok && tier == "flex" {
			return invalidParamCombinationError("parameter \"service_tier\" cannot be flex when \"workspace\" is true", "service_tier", "workspace")
		}
		if resolution, ok := stringValue(params["resolution"]); ok && resolution != "" && resolution != "480p" {
			err := invalidParamCombinationError("parameter \"resolution\" must be 480p when \"workspace\" is true", "resolution", "workspace")
			err.AllowedValues = []any{"480p"}
			err.SuggestedFix = map[string]any{"resolution": "480p"}
			return err
		}
	}

	if maxImages, ok := numberValue(params["image_count"]); ok && maxImages > 0 {
		mode, _ := stringValue(params["sequential_image_generation"])
		if mode != "auto" {
			err := invalidParamCombinationError("parameter \"image_count\" only applies when \"sequential_image_generation\" is auto", "image_count", "sequential_image_generation")
			err.SuggestedFix = map[string]any{"sequential_image_generation": "auto"}
			return err
		}
	}

	if frames, ok := numberValue(params["frames"]); ok && frames != 0 {
		if !isWholeNumber(frames) || frames < 29 || frames > 289 || int64(frames-25)%4 != 0 {
			return invalidParamCombinationError("parameter \"frames\" must be in [29,289] and match 25 + 4n", "frames")
		}
	}
	return nil
}

func validateDeclaredParamRules(params map[string]any, supported []ParamDef) error {
	for _, p := range supported {
		if !paramHasNonZeroValue(params[p.Key]) {
			continue
		}
		for _, other := range p.ConflictsWith {
			if paramHasNonZeroValue(params[other]) {
				err := invalidParamCombinationError("parameters \""+p.Key+"\" and \""+other+"\" cannot be used together", p.Key, other)
				err.SuggestedFix = map[string]any{other: nil}
				return err
			}
		}
		for _, item := range p.ConditionalEnum {
			if !conditionalParamMatches(params[item.WhenParam], item.WhenValue) {
				continue
			}
			value, ok := stringValue(params[p.Key])
			if !ok || value == "" || containsString(item.Options, value) {
				continue
			}
			err := invalidParamCombinationError("parameter \""+p.Key+"\" must be one of the allowed values for \""+item.WhenParam+"\"", p.Key, item.WhenParam)
			err.AllowedValues = stringValuesToAny(item.Options)
			if len(item.Options) > 0 {
				err.SuggestedFix = map[string]any{p.Key: item.Options[0]}
			}
			return err
		}
		for _, item := range p.ConditionalConst {
			if !conditionalParamMatches(params[item.WhenParam], item.WhenValue) {
				continue
			}
			if _, exists := params[p.Key]; !exists {
				continue
			}
			if conditionalParamMatches(params[p.Key], item.Value) {
				continue
			}
			err := invalidParamCombinationError("parameter \""+p.Key+"\" must have the required value for \""+item.WhenParam+"\"", p.Key, item.WhenParam)
			err.SuggestedFix = map[string]any{p.Key: item.Value}
			return err
		}
		for _, item := range p.RequiresValue {
			if !paramHasNonZeroValue(params[p.Key]) {
				continue
			}
			if conditionalParamMatches(params[item.Param], item.Value) {
				continue
			}
			err := invalidParamCombinationError("parameter \""+p.Key+"\" requires \""+item.Param+"\" to have the required value", p.Key, item.Param)
			err.SuggestedFix = map[string]any{item.Param: item.Value}
			return err
		}
	}
	return nil
}

func paramHasNonZeroValue(value any) bool {
	switch v := value.(type) {
	case nil:
		return false
	case string:
		return v != ""
	case bool:
		return v
	default:
		if n, ok := numberValue(value); ok {
			return n != 0
		}
		return true
	}
}

func conditionalParamMatches(actual, expected any) bool {
	if expectedBool, ok := expected.(bool); ok {
		actualBool, actualOK := boolValue(actual)
		return actualOK && actualBool == expectedBool
	}
	if expectedString, ok := stringValue(expected); ok {
		actualString, actualOK := stringValue(actual)
		return actualOK && actualString == expectedString
	}
	if expectedNumber, ok := numberValue(expected); ok {
		actualNumber, actualOK := numberValue(actual)
		return actualOK && actualNumber == expectedNumber
	}
	return actual == expected
}

var sizePattern = regexp.MustCompile(`^\d+x\d+$`)

func validateSizeParam(key string, val any) error {
	s, ok := stringValue(val)
	if !ok || s == "" {
		return nil
	}
	switch s {
	case "auto", "adaptive", "1K", "2K", "3K", "4K":
		return nil
	}
	if !sizePattern.MatchString(s) {
		return fmt.Errorf("parameter %q must be a preset or WxH size", key)
	}
	w, h, ok := parseImageSize(s)
	if !ok || w <= 0 || h <= 0 {
		return fmt.Errorf("parameter %q must be a positive WxH size", key)
	}
	return nil
}

func parseImageSize(value string) (int, int, bool) {
	if !sizePattern.MatchString(value) {
		return 0, 0, false
	}
	parts := strings.Split(value, "x")
	w, err := strconv.Atoi(parts[0])
	if err != nil {
		return 0, 0, false
	}
	h, err := strconv.Atoi(parts[1])
	if err != nil {
		return 0, 0, false
	}
	return w, h, w > 0 && h > 0
}

func containsString(values []string, target string) bool {
	for _, v := range values {
		if v == target {
			return true
		}
	}
	return false
}

func stringValue(v any) (string, bool) {
	switch t := v.(type) {
	case string:
		return t, true
	case float64:
		if isWholeNumber(t) {
			return strconv.FormatInt(int64(t), 10), true
		}
		return strconv.FormatFloat(t, 'f', -1, 64), true
	case int:
		return strconv.Itoa(t), true
	case int64:
		return strconv.FormatInt(t, 10), true
	case bool:
		if t {
			return "true", true
		}
		return "false", true
	default:
		return "", false
	}
}

func strictStringValue(v any) (string, bool) {
	s, ok := v.(string)
	return s, ok
}

func strictBoolValue(v any) (bool, bool) {
	b, ok := v.(bool)
	return b, ok
}

func strictNumberValue(v any) (float64, bool) {
	switch t := v.(type) {
	case float64:
		return t, true
	case int:
		return float64(t), true
	case int64:
		return float64(t), true
	case json.Number:
		n, err := t.Float64()
		return n, err == nil
	default:
		return 0, false
	}
}

func schemaNumberKeyword(schema map[string]any, key string) (float64, bool) {
	value, ok := schema[key]
	if !ok {
		return 0, false
	}
	return numberValue(value)
}

func numberSchemaKeyword(schema map[string]any, key string) float64 {
	value, ok := schemaNumberKeyword(schema, key)
	if !ok {
		return 0
	}
	return value
}

func intSchemaKeyword(schema map[string]any, key string) int {
	value, ok := schemaNumberKeyword(schema, key)
	if !ok || !isWholeNumber(value) {
		return 0
	}
	return int(value)
}

func scalarSlice(value any) []any {
	switch items := value.(type) {
	case []any:
		out := make([]any, 0, len(items))
		for _, item := range items {
			if isComparableScalar(item) {
				out = append(out, item)
			}
		}
		return out
	case []int:
		out := make([]any, 0, len(items))
		for _, item := range items {
			out = append(out, item)
		}
		return out
	case []string:
		out := make([]any, 0, len(items))
		for _, item := range items {
			out = append(out, item)
		}
		return out
	case []float64:
		out := make([]any, 0, len(items))
		for _, item := range items {
			out = append(out, item)
		}
		return out
	case []bool:
		out := make([]any, 0, len(items))
		for _, item := range items {
			out = append(out, item)
		}
		return out
	default:
		return nil
	}
}

func scalarSliceContains(values []any, target any) bool {
	for _, value := range values {
		if conditionalParamMatches(target, value) {
			return true
		}
	}
	return false
}

func cloneScalarValues(values []any) []any {
	return append([]any{}, values...)
}

func isComparableScalar(value any) bool {
	switch value.(type) {
	case string, float64, int, int64, bool:
		return true
	default:
		return false
	}
}

func numberValue(v any) (float64, bool) {
	switch t := v.(type) {
	case float64:
		return t, true
	case int:
		return float64(t), true
	case int64:
		return float64(t), true
	case json.Number:
		n, err := t.Float64()
		return n, err == nil
	case string:
		n, err := strconv.ParseFloat(strings.TrimSpace(t), 64)
		return n, err == nil
	default:
		return 0, false
	}
}

func boolValue(v any) (bool, bool) {
	switch t := v.(type) {
	case bool:
		return t, true
	case string:
		switch strings.ToLower(strings.TrimSpace(t)) {
		case "true", "1", "yes", "on":
			return true, true
		case "false", "0", "no", "off":
			return false, true
		}
	}
	return false, false
}

func isWholeNumber(n float64) bool {
	return math.Trunc(n) == n
}
