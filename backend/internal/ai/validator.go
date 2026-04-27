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
		return fmt.Errorf("model %q does not support output type %q", def.DisplayName, req.OutputType)
	}

	// 2. Verify input constraints per output type.
	switch req.OutputType {
	case CapabilityImageEdit:
		// image_edit requires at least one image input.
		if req.ImageCount == 0 {
			return fmt.Errorf("output type %q requires an image input but none was provided", req.OutputType)
		}

	case CapabilityVideoI2V:
		// image-to-video requires at least one image input.
		if req.ImageCount == 0 {
			return fmt.Errorf("output type %q requires an image input but none was provided", req.OutputType)
		}

	case CapabilityVideoV2V:
		// video-to-video requires at least one video input.
		if req.VideoCount == 0 {
			return fmt.Errorf("output type %q requires a video input but none was provided", req.OutputType)
		}
	}

	// 3. Verify image count does not exceed model limit.
	if def.MaxInputImages > 0 && req.ImageCount > def.MaxInputImages {
		return fmt.Errorf("model %q supports at most %d image input(s), but %d were provided",
			def.DisplayName, def.MaxInputImages, req.ImageCount)
	}
	if def.MaxInputImages == 0 && req.ImageCount > 0 {
		return fmt.Errorf("model %q does not accept image inputs", def.DisplayName)
	}

	// 4. Verify video count does not exceed model limit.
	if def.MaxInputVideos > 0 && req.VideoCount > def.MaxInputVideos {
		return fmt.Errorf("model %q supports at most %d video input(s), but %d were provided",
			def.DisplayName, def.MaxInputVideos, req.VideoCount)
	}
	if def.MaxInputVideos == 0 && req.VideoCount > 0 {
		return fmt.Errorf("model %q does not accept video inputs", def.DisplayName)
	}

	return nil
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
	if def == nil {
		return fmt.Errorf("model definition not found")
	}

	params, err := parseExtraParams(extraParams)
	if err != nil {
		return err
	}

	if aspectRatio != "" {
		params["aspect_ratio"] = aspectRatio
	}
	if duration != 0 {
		params["duration"] = duration
	}
	if len(params) == 0 {
		return nil
	}
	if len(def.SupportedParams) == 0 {
		return nil
	}

	supported := make(map[string]ParamDef, len(def.SupportedParams))
	for _, p := range def.SupportedParams {
		supported[p.Key] = p
	}

	for key, val := range params {
		p, ok := supported[key]
		if !ok {
			return fmt.Errorf("parameter %q is not supported by model %q", key, def.DisplayName)
		}
		if err := validateParamValue(p, val); err != nil {
			return err
		}
	}

	return validateCrossParamRules(params)
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
			return fmt.Errorf("parameter %q must be a string option", p.Key)
		}
		if len(p.Options) > 0 && !containsString(p.Options, s) {
			return fmt.Errorf("parameter %q must be one of [%s]", p.Key, strings.Join(p.Options, ", "))
		}
	case "number":
		n, ok := numberValue(val)
		if !ok {
			return fmt.Errorf("parameter %q must be a number", p.Key)
		}
		if p.Min != 0 && n < p.Min {
			return fmt.Errorf("parameter %q must be >= %v", p.Key, p.Min)
		}
		if p.Max != 0 && n > p.Max {
			return fmt.Errorf("parameter %q must be <= %v", p.Key, p.Max)
		}
		if p.Step >= 1 && !isWholeNumber(n) {
			return fmt.Errorf("parameter %q must be an integer", p.Key)
		}
	case "boolean":
		if _, ok := boolValue(val); !ok {
			return fmt.Errorf("parameter %q must be a boolean", p.Key)
		}
	default:
		if p.Key == "size" {
			return validateSizeParam(p.Key, val)
		}
	}
	if p.Key == "size" {
		return validateSizeParam(p.Key, val)
	}
	return nil
}

func validateCrossParamRules(params map[string]any) error {
	_, hasFrames := params["frames"]
	_, hasDuration := params["duration"]
	if hasFrames && hasDuration {
		if frames, ok := numberValue(params["frames"]); ok && frames != 0 {
			if duration, ok := numberValue(params["duration"]); ok && duration != 0 {
				return fmt.Errorf("parameters \"frames\" and \"duration\" cannot be used together")
			}
		}
	}

	if draft, ok := boolValue(params["draft"]); ok && draft {
		if lastFrame, ok := boolValue(params["return_last_frame"]); ok && lastFrame {
			return fmt.Errorf("parameter \"return_last_frame\" cannot be true when \"draft\" is true")
		}
		if tier, ok := stringValue(params["service_tier"]); ok && tier == "flex" {
			return fmt.Errorf("parameter \"service_tier\" cannot be flex when \"draft\" is true")
		}
		if resolution, ok := stringValue(params["resolution"]); ok && resolution != "" && resolution != "480p" {
			return fmt.Errorf("parameter \"resolution\" must be 480p when \"draft\" is true")
		}
	}

	if maxImages, ok := numberValue(params["max_images"]); ok && maxImages > 0 {
		mode, _ := stringValue(params["sequential_image_generation"])
		if mode != "auto" {
			return fmt.Errorf("parameter \"max_images\" only applies when \"sequential_image_generation\" is auto")
		}
	}

	if frames, ok := numberValue(params["frames"]); ok && frames != 0 {
		if !isWholeNumber(frames) || frames < 29 || frames > 289 || int64(frames-25)%4 != 0 {
			return fmt.Errorf("parameter \"frames\" must be in [29,289] and match 25 + 4n")
		}
	}
	return nil
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
