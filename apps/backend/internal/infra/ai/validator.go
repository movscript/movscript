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
	ModelConfigID   uint
	OutputType      string   // use Capability* constants
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

	// 2. Verify input constraints per output type.
	switch req.OutputType {
	case CapabilityImageEdit:
		// image_edit requires at least one image input.
		if req.ImageCount == 0 {
			return invalidInputCountError(
				"image",
				fmt.Sprintf("output type %q requires an image input but none was provided", req.OutputType),
				1,
				def.MaxInputImages,
				req.ImageCount,
			)
		}

	case CapabilityVideoI2V:
		// image-to-video requires at least one image input.
		if req.ImageCount == 0 {
			return invalidInputCountError(
				"image",
				fmt.Sprintf("output type %q requires an image input but none was provided", req.OutputType),
				1,
				def.MaxInputImages,
				req.ImageCount,
			)
		}

	case CapabilityVideoV2V:
		// video-to-video requires at least one video input.
		if req.VideoCount == 0 {
			return invalidInputCountError(
				"video",
				fmt.Sprintf("output type %q requires a video input but none was provided", req.OutputType),
				1,
				def.MaxInputVideos,
				req.VideoCount,
			)
		}
	}

	// 3. Verify image count does not exceed model limit.
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

	// 4. Verify video count does not exceed model limit.
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
	if outputType == CapabilityImageEdit || outputType == CapabilityVideoI2V {
		return 1
	}
	return 0
}

func requiredVideoInputMin(outputType string) int {
	if outputType == CapabilityVideoV2V {
		return 1
	}
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
	if len(def.SupportedParams) == 0 {
		if def.SupportedParamsExplicit {
			for key := range params {
				return nil, unsupportedParameterError(key, def.DisplayName)
			}
		}
		return params, nil
	}

	supported := make(map[string]ParamDef, len(def.SupportedParams))
	for _, p := range def.SupportedParams {
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

	if err := validateDeclaredParamRules(params, supported); err != nil {
		return nil, err
	}
	if !def.SupportedParamsExplicit {
		if err := validateCrossParamRules(params); err != nil {
			return nil, err
		}
	}
	return params, nil
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
			return validateSizeParam(p.Key, val)
		}
	}
	if p.Key == "size" || p.Key == "image_size" {
		return validateSizeParam(p.Key, val)
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

	if draft, ok := boolValue(params["draft"]); ok && draft {
		if lastFrame, ok := boolValue(params["return_last_frame"]); ok && lastFrame {
			return invalidParamCombinationError("parameter \"return_last_frame\" cannot be true when \"draft\" is true", "return_last_frame", "draft")
		}
		if tier, ok := stringValue(params["service_tier"]); ok && tier == "flex" {
			return invalidParamCombinationError("parameter \"service_tier\" cannot be flex when \"draft\" is true", "service_tier", "draft")
		}
		if resolution, ok := stringValue(params["resolution"]); ok && resolution != "" && resolution != "480p" {
			err := invalidParamCombinationError("parameter \"resolution\" must be 480p when \"draft\" is true", "resolution", "draft")
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

func validateDeclaredParamRules(params map[string]any, supported map[string]ParamDef) error {
	for key, p := range supported {
		if !paramHasNonZeroValue(params[key]) {
			continue
		}
		for _, other := range p.ConflictsWith {
			if paramHasNonZeroValue(params[other]) {
				err := invalidParamCombinationError("parameters \""+key+"\" and \""+other+"\" cannot be used together", key, other)
				err.SuggestedFix = map[string]any{other: nil}
				return err
			}
		}
		for _, item := range p.ConditionalEnum {
			if !conditionalParamMatches(params[item.WhenParam], item.WhenValue) {
				continue
			}
			value, ok := stringValue(params[key])
			if !ok || value == "" || containsString(item.Options, value) {
				continue
			}
			err := invalidParamCombinationError("parameter \""+key+"\" must be one of the allowed values for \""+item.WhenParam+"\"", key, item.WhenParam)
			err.AllowedValues = stringValuesToAny(item.Options)
			if len(item.Options) > 0 {
				err.SuggestedFix = map[string]any{key: item.Options[0]}
			}
			return err
		}
		for _, item := range p.ConditionalConst {
			if !conditionalParamMatches(params[item.WhenParam], item.WhenValue) {
				continue
			}
			if _, exists := params[key]; !exists {
				continue
			}
			if conditionalParamMatches(params[key], item.Value) {
				continue
			}
			err := invalidParamCombinationError("parameter \""+key+"\" must have the required value for \""+item.WhenParam+"\"", key, item.WhenParam)
			err.SuggestedFix = map[string]any{key: item.Value}
			return err
		}
		for _, item := range p.RequiresValue {
			if !paramHasNonZeroValue(params[key]) {
				continue
			}
			if conditionalParamMatches(params[item.Param], item.Value) {
				continue
			}
			err := invalidParamCombinationError("parameter \""+key+"\" requires \""+item.Param+"\" to have the required value", key, item.Param)
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
	case "adaptive", "1K", "2K", "3K", "4K":
		return nil
	}
	if !sizePattern.MatchString(s) {
		return fmt.Errorf("parameter %q must be a preset or WxH size", key)
	}
	parts := strings.Split(s, "x")
	w, _ := strconv.Atoi(parts[0])
	h, _ := strconv.Atoi(parts[1])
	if w <= 0 || h <= 0 {
		return fmt.Errorf("parameter %q must be a positive WxH size", key)
	}
	return nil
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
