package ai

import "fmt"

// GenRequest is the canonical front-end request for any generation job.
// It is transport-agnostic (HTTP handler maps JSON fields to this struct).
type GenRequest struct {
	ModelConfigID    uint
	OutputType       string   // use Capability* constants
	InputModalities  []string // "text" | "image" | "video" present in this request
	ImageCount       int      // number of image resources attached
	VideoCount       int      // number of video resources attached
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
