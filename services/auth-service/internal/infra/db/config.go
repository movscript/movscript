package db

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type Config struct {
	Driver          string
	Host            string
	Port            string
	User            string
	Password        string
	Name            string
	Path            string
	SlowThresholdMS int
}

func LoadConfigFromEnv() Config {
	dataDir := getEnv("MOVSCRIPT_AUTH_DATA_DIR", defaultDataDir())
	return Config{
		Driver:          strings.TrimSpace(getEnv("MOVSCRIPT_AUTH_DB_DRIVER", getEnv("DB_DRIVER", "sqlite"))),
		Host:            getEnv("MOVSCRIPT_AUTH_DB_HOST", getEnv("DB_HOST", "localhost")),
		Port:            getEnv("MOVSCRIPT_AUTH_DB_PORT", getEnv("DB_PORT", "5432")),
		User:            getEnv("MOVSCRIPT_AUTH_DB_USER", getEnv("DB_USER", "postgres")),
		Password:        getEnv("MOVSCRIPT_AUTH_DB_PASSWORD", getEnv("DB_PASSWORD", "")),
		Name:            getEnv("MOVSCRIPT_AUTH_DB_NAME", getEnv("DB_NAME", "movscript_auth")),
		Path:            getEnv("MOVSCRIPT_AUTH_DB_PATH", filepath.Join(dataDir, "auth.db")),
		SlowThresholdMS: getEnvInt("MOVSCRIPT_AUTH_DB_SLOW_THRESHOLD_MS", 200),
	}
}

func defaultDataDir() string {
	if home := strings.TrimSpace(os.Getenv("MOVSCRIPT_HOME")); home != "" {
		return filepath.Join(home, "auth-service")
	}
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		return filepath.Join(home, ".movscript", "auth-service")
	}
	return filepath.Join(os.TempDir(), "movscript", "auth-service")
}

func getEnv(key string, fallback string) string {
	if value := os.Getenv(key); strings.TrimSpace(value) != "" {
		return value
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}
