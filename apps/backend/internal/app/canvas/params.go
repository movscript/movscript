package canvas

import "github.com/movscript/movscript/internal/domain/canvasruntime"

func stringParam(params map[string]any, key string, fallback string) string {
	return canvasruntime.StringParam(params, key, fallback)
}

func intParam(params map[string]any, key string, fallback int) int {
	return canvasruntime.IntParam(params, key, fallback)
}

func floatParam(params map[string]any, key string, fallback float64) float64 {
	return canvasruntime.FloatParam(params, key, fallback)
}

func boolParam(params map[string]any, key string, fallback bool) bool {
	return canvasruntime.BoolParam(params, key, fallback)
}

func boolPtrParam(params map[string]any, key string) *bool {
	return canvasruntime.BoolPtrParam(params, key)
}

func int64PtrParam(params map[string]any, key string) *int64 {
	return canvasruntime.Int64PtrParam(params, key)
}

func firstPositive(values ...int) int {
	return canvasruntime.FirstPositive(values...)
}
