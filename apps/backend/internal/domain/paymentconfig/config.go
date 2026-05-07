package paymentconfig

import (
	"encoding/json"
	"strings"
)

const (
	TypeAlipay  = "alipay"
	TypeWechat  = "wechat_pay"
	TypeStripe  = "stripe"
	ModeSandbox = "sandbox"
	ModeLive    = "live"

	DefaultCurrency = "CNY"
)

type NewConfigSpec struct {
	Name       string
	ConfigType string
	Mode       string
	Currency   string
	ConfigJSON string
	Priority   int
	IsEnabled  bool
}

type Config struct {
	ID           uint
	Name         string
	ConfigType   string
	Mode         string
	Currency     string
	ConfigJSON   string
	Priority     int
	IsEnabled    bool
	MaskedConfig string
}

func ValidConfigType(t string) bool {
	switch t {
	case TypeAlipay, TypeWechat, TypeStripe:
		return true
	}
	return false
}

func ValidMode(mode string) bool {
	switch mode {
	case "", ModeSandbox, ModeLive:
		return true
	}
	return false
}

func NormalizeMode(mode string) string {
	mode = strings.TrimSpace(mode)
	if mode == "" {
		return ModeSandbox
	}
	return mode
}

func NormalizeCurrency(currency string) string {
	currency = strings.ToUpper(strings.TrimSpace(currency))
	if currency == "" {
		return DefaultCurrency
	}
	return currency
}

func NewConfig(spec NewConfigSpec) Config {
	return Config{
		Name:       strings.TrimSpace(spec.Name),
		ConfigType: strings.TrimSpace(spec.ConfigType),
		Mode:       NormalizeMode(spec.Mode),
		Currency:   NormalizeCurrency(spec.Currency),
		ConfigJSON: spec.ConfigJSON,
		Priority:   spec.Priority,
		IsEnabled:  spec.IsEnabled,
	}
}

func IsSensitiveConfigKey(k string) bool {
	switch k {
	case "private_key", "app_private_key", "alipay_public_key", "api_v3_key", "cert_serial_no", "merchant_private_key", "apiclient_key", "webhook_secret", "secret_key", "restricted_key":
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
