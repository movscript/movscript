package cache

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/movscript/movscript/internal/infra/config"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

var ErrInvalidBackend = errors.New("invalid cache backend")

type Cache = providercontract.Cache

func New(cfg *config.Config) (Cache, error) {
	if cfg == nil {
		return NewNoop(), nil
	}
	switch strings.TrimSpace(cfg.CacheBackend) {
	case "", "noop":
		return NewNoop(), nil
	case "memory":
		return NewMemory(), nil
	case "redis":
		return NewRedis(RedisConfig{
			URL:      cfg.RedisURL,
			Addr:     cfg.RedisAddr,
			Username: cfg.RedisUsername,
			Password: cfg.RedisPassword,
			DB:       cfg.RedisDB,
			Prefix:   cfg.CacheKeyPrefix,
		})
	default:
		return nil, fmt.Errorf("%w: %s", ErrInvalidBackend, cfg.CacheBackend)
	}
}

func encodeJSON(value any) ([]byte, error) {
	return json.Marshal(value)
}

func decodeJSON(data []byte, dst any) error {
	return json.Unmarshal(data, dst)
}
