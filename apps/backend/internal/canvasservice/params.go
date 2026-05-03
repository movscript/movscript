package canvasservice

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

func stringParam(params map[string]any, key string, fallback string) string {
	if params == nil {
		return fallback
	}
	if v, ok := params[key]; ok {
		switch value := v.(type) {
		case string:
			if strings.TrimSpace(value) != "" {
				return value
			}
		case fmt.Stringer:
			return value.String()
		}
	}
	return fallback
}

func intParam(params map[string]any, key string, fallback int) int {
	if params == nil {
		return fallback
	}
	if v, ok := params[key]; ok {
		switch value := v.(type) {
		case int:
			return value
		case int64:
			return int(value)
		case float64:
			return int(value)
		case json.Number:
			if n, err := value.Int64(); err == nil {
				return int(n)
			}
		case string:
			if n, err := strconv.Atoi(strings.TrimSpace(value)); err == nil {
				return n
			}
		}
	}
	return fallback
}

func floatParam(params map[string]any, key string, fallback float64) float64 {
	if params == nil {
		return fallback
	}
	if v, ok := params[key]; ok {
		switch value := v.(type) {
		case float64:
			return value
		case float32:
			return float64(value)
		case int:
			return float64(value)
		case json.Number:
			if n, err := value.Float64(); err == nil {
				return n
			}
		case string:
			if n, err := strconv.ParseFloat(strings.TrimSpace(value), 64); err == nil {
				return n
			}
		}
	}
	return fallback
}

func boolParam(params map[string]any, key string, fallback bool) bool {
	if params == nil {
		return fallback
	}
	if v, ok := params[key]; ok {
		switch value := v.(type) {
		case bool:
			return value
		case string:
			if b, err := strconv.ParseBool(strings.TrimSpace(value)); err == nil {
				return b
			}
		}
	}
	return fallback
}

func boolPtrParam(params map[string]any, key string) *bool {
	if params == nil {
		return nil
	}
	if _, ok := params[key]; !ok {
		return nil
	}
	value := boolParam(params, key, false)
	return &value
}

func int64PtrParam(params map[string]any, key string) *int64 {
	if params == nil {
		return nil
	}
	if _, ok := params[key]; !ok {
		return nil
	}
	value := int64(intParam(params, key, 0))
	return &value
}

func firstPositive(values ...int) int {
	for _, value := range values {
		if value > 0 {
			return value
		}
	}
	return 0
}
