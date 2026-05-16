package canvas

import canvasdomain "github.com/movscript/movscript/internal/domain/canvas"

func stringParam(params map[string]any, key string, fallback string) string {
	return canvasdomain.StringParam(params, key, fallback)
}

func intParam(params map[string]any, key string, fallback int) int {
	return canvasdomain.IntParam(params, key, fallback)
}

func floatParam(params map[string]any, key string, fallback float64) float64 {
	return canvasdomain.FloatParam(params, key, fallback)
}

func boolParam(params map[string]any, key string, fallback bool) bool {
	return canvasdomain.BoolParam(params, key, fallback)
}

func boolPtrParam(params map[string]any, key string) *bool {
	return canvasdomain.BoolPtrParam(params, key)
}

func int64PtrParam(params map[string]any, key string) *int64 {
	return canvasdomain.Int64PtrParam(params, key)
}

func firstPositive(values ...int) int {
	return canvasdomain.FirstPositive(values...)
}
