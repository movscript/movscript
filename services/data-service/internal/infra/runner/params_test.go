package runner

import "testing"

func TestGenerationParamsAccessors(t *testing.T) {
	params := parseGenerationParams(`{
		"size": "1024x1024",
		"duration": "8",
		"frames": 24,
		"seed": "42",
		"guidance_scale": "7.5",
		"web_search": "true",
		"watermark": false
	}`)

	if got := params.String("size"); got != "1024x1024" {
		t.Fatalf("String(size) = %q", got)
	}
	if got := params.Int("duration"); got != 8 {
		t.Fatalf("Int(duration) = %d", got)
	}
	if got := params.Int("frames"); got != 24 {
		t.Fatalf("Int(frames) = %d", got)
	}
	if got := params.Int64Ptr("seed"); got == nil || *got != 42 {
		t.Fatalf("Int64Ptr(seed) = %v", got)
	}
	if got := params.Float("guidance_scale"); got != 7.5 {
		t.Fatalf("Float(guidance_scale) = %f", got)
	}
	if !params.Bool("web_search") {
		t.Fatal("Bool(web_search) = false")
	}
	if got := params.BoolPtr("watermark"); got == nil || *got {
		t.Fatalf("BoolPtr(watermark) = %v", got)
	}
}

func TestGenerationParamsExposeCanonicalImageAliasesToProviderFields(t *testing.T) {
	params := parseGenerationParams(`{
		"image_size": "2K",
		"prompt_strength": 3.5,
		"image_count": 4
	}`)

	if got := params.String("size"); got != "2K" {
		t.Fatalf("String(size) = %q", got)
	}
	if got := params.Float("guidance_scale"); got != 3.5 {
		t.Fatalf("Float(guidance_scale) = %f", got)
	}
	if got := params.Int("max_images"); got != 4 {
		t.Fatalf("Int(max_images) = %d", got)
	}
}

func TestGenerationParamsExposeCanonicalVideoAudioAliasToProviderField(t *testing.T) {
	params := parseGenerationParams(`{"audio": false}`)

	if got := params.BoolPtr("generate_audio"); got == nil || *got {
		t.Fatalf("BoolPtr(generate_audio) = %v", got)
	}
}

func TestGenerationParamsInvalidJSONFallsBackToEmptyValues(t *testing.T) {
	params := parseGenerationParams(`{bad json`)

	if got := params.String("size"); got != "" {
		t.Fatalf("String(size) = %q", got)
	}
	if got := params.Int("duration"); got != 0 {
		t.Fatalf("Int(duration) = %d", got)
	}
	if got := params.BoolPtr("watermark"); got != nil {
		t.Fatalf("BoolPtr(watermark) = %v", got)
	}
}
