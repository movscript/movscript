package cloudfileconfig

import (
	"encoding/json"
	"strings"
)

const (
	TypeS3  = "s3"
	TypeOSS = "oss"
	TypeTOS = "tos"
)

type NewConfigSpec struct {
	Name       string
	ConfigType string
	ConfigJSON string
	Priority   int
	IsEnabled  bool
}

type Config struct {
	ID           uint
	Name         string
	ConfigType   string
	ConfigJSON   string
	Priority     int
	IsEnabled    bool
	MaskedConfig string
}

func ValidConfigType(t string) bool {
	switch t {
	case TypeS3, TypeOSS, TypeTOS:
		return true
	}
	return false
}

func NewConfig(spec NewConfigSpec) Config {
	return Config{
		Name:       strings.TrimSpace(spec.Name),
		ConfigType: strings.TrimSpace(spec.ConfigType),
		ConfigJSON: spec.ConfigJSON,
		Priority:   spec.Priority,
		IsEnabled:  spec.IsEnabled,
	}
}

func IsSensitiveConfigKey(k string) bool {
	switch k {
	case "api_key", "secret_key", "access_key", "access_key_id", "access_key_secret":
		return true
	}
	return false
}

func IsMaskedSecret(s string) bool {
	return s == "****" || (len(s) >= 4 && s[len(s)-4:] == "****")
}

func MergeConfigUpdate(existing, incoming map[string]any) map[string]any {
	if incoming == nil {
		return map[string]any{}
	}
	merged := make(map[string]any, len(incoming))
	for k, v := range incoming {
		if IsSensitiveConfigKey(k) {
			if text, ok := v.(string); ok && (text == "" || IsMaskedSecret(text)) {
				if old, exists := existing[k]; exists {
					merged[k] = old
					continue
				}
			}
		}
		merged[k] = v
	}
	return merged
}

func MaskConfig(cfg map[string]any) string {
	if cfg == nil {
		return "{}"
	}
	masked := make(map[string]any, len(cfg))
	for k, v := range cfg {
		if IsSensitiveConfigKey(k) {
			if text, ok := v.(string); ok && len(text) > 4 {
				masked[k] = text[:4] + "****"
			} else {
				masked[k] = "****"
			}
			continue
		}
		masked[k] = v
	}
	b, err := json.Marshal(masked)
	if err != nil {
		return "{}"
	}
	return string(b)
}
