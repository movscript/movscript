package observability

import "strings"

const redacted = "[redacted]"

var sensitiveNameFragments = []string{
	"authorization",
	"cookie",
	"password",
	"passwd",
	"secret",
	"token",
	"api_key",
	"apikey",
	"access_key",
	"secret_key",
	"encryption_key",
	"credential",
}

// RedactValue hides values whose field/header names commonly contain secrets.
func RedactValue(name, value string) string {
	if value == "" {
		return value
	}
	if IsSensitiveName(name) {
		return redacted
	}
	return value
}

func IsSensitiveName(name string) bool {
	normalized := strings.ToLower(strings.ReplaceAll(name, "-", "_"))
	for _, fragment := range sensitiveNameFragments {
		if strings.Contains(normalized, fragment) {
			return true
		}
	}
	return false
}
