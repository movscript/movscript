package cache

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/infra/config"
)

var ErrInvalidBackend = errors.New("invalid cache backend")

type Cache interface {
	GetJSON(ctx context.Context, key string, dst any) (bool, error)
	SetJSON(ctx context.Context, key string, value any, ttl time.Duration) error
	Delete(ctx context.Context, keys ...string) error
	GetVersion(ctx context.Context, namespace string) (int64, error)
	BumpVersion(ctx context.Context, namespace string) (int64, error)
	Close() error
}

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
