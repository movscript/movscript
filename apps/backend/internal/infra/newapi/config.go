package newapi

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Provider           string
	BaseURL            string
	AdminToken         string
	AdminUserID        int
	PlanMap            map[string]int
	UserPrefix         string
	UserPassword       string
	TokenQuota         int
	TokenGroup         string
	HTTPTimeoutSec     int
	RelayTokenFallback string
}

func LoadConfigFromEnv() Config {
	return Config{
		Provider:           strings.TrimSpace(os.Getenv("MOVSCRIPT_METERING_PROVIDER")),
		BaseURL:            strings.TrimRight(strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_BASE_URL")), "/"),
		AdminToken:         strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_ADMIN_TOKEN")),
		AdminUserID:        envInt("MOVSCRIPT_NEW_API_ADMIN_USER_ID", 0),
		PlanMap:            ParsePlanMap(os.Getenv("MOVSCRIPT_NEW_API_PLAN_MAP")),
		UserPrefix:         defaultString(strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_USER_PREFIX")), "movscript-"),
		UserPassword:       defaultString(strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_USER_PASSWORD")), "movscript12345"),
		TokenQuota:         envInt("MOVSCRIPT_NEW_API_TOKEN_REMAIN_QUOTA", 1000000000),
		TokenGroup:         defaultString(strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_TOKEN_GROUP")), "auto"),
		HTTPTimeoutSec:     envInt("MOVSCRIPT_NEW_API_HTTP_TIMEOUT_SEC", 10),
		RelayTokenFallback: strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_RELAY_TOKEN")),
	}
}

func (c Config) RelayBaseURL() string {
	base := strings.TrimRight(strings.TrimSpace(c.BaseURL), "/")
	if base == "" {
		return ""
	}
	if strings.HasSuffix(base, "/v1") {
		return base
	}
	return base + "/v1"
}

func (c Config) ValidateAdmin() error {
	if c.BaseURL == "" {
		return ErrMissingBaseURL
	}
	if c.AdminToken == "" {
		return ErrMissingAdminToken
	}
	if c.AdminUserID <= 0 {
		return ErrMissingAdminUserID
	}
	return nil
}

func ParsePlanMap(raw string) map[string]int {
	out := map[string]int{}
	for _, pair := range strings.Split(raw, ",") {
		pair = strings.TrimSpace(pair)
		if pair == "" {
			continue
		}
		parts := strings.SplitN(pair, ":", 2)
		if len(parts) != 2 {
			continue
		}
		id, err := strconv.Atoi(strings.TrimSpace(parts[1]))
		if err != nil || id <= 0 {
			continue
		}
		out[strings.TrimSpace(parts[0])] = id
	}
	return out
}

func envInt(key string, fallback int) int {
	value, err := strconv.Atoi(strings.TrimSpace(os.Getenv(key)))
	if err != nil {
		return fallback
	}
	return value
}

func defaultString(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
