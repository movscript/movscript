package runner

import (
	"encoding/json"
	"strconv"
	"strings"

	"github.com/movscript/movscript/internal/infra/ai"
)

type generationParams struct {
	values map[string]interface{}
}

func parseGenerationParams(raw string) generationParams {
	var values map[string]interface{}
	if raw != "" {
		_ = json.Unmarshal([]byte(raw), &values)
	}
	if values == nil {
		values = map[string]interface{}{}
	}
	return generationParams{values: ai.NormalizeGenerationParams(values)}
}

func (p generationParams) String(key string) string {
	if v, ok := p.values[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func (p generationParams) Int(key string) int {
	if v, ok := p.values[key]; ok {
		switch n := v.(type) {
		case float64:
			return int(n)
		case int:
			return n
		case string:
			i, err := strconv.Atoi(strings.TrimSpace(n))
			if err == nil {
				return i
			}
		}
	}
	return 0
}

func (p generationParams) Int64Ptr(key string) *int64 {
	if v, ok := p.values[key]; ok {
		switch n := v.(type) {
		case float64:
			i := int64(n)
			return &i
		case int:
			i := int64(n)
			return &i
		case int64:
			i := n
			return &i
		case string:
			i, err := strconv.ParseInt(strings.TrimSpace(n), 10, 64)
			if err == nil {
				return &i
			}
		}
	}
	return nil
}

func (p generationParams) Float(key string) float64 {
	if v, ok := p.values[key]; ok {
		switch n := v.(type) {
		case float64:
			return n
		case int:
			return float64(n)
		case string:
			f, err := strconv.ParseFloat(strings.TrimSpace(n), 64)
			if err == nil {
				return f
			}
		}
	}
	return 0
}

func (p generationParams) Bool(key string) bool {
	b := p.BoolPtr(key)
	return b != nil && *b
}

func (p generationParams) BoolPtr(key string) *bool {
	return getBoolPtr(p.values, key)
}
