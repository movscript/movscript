package cache

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

type RedisConfig struct {
	URL      string
	Addr     string
	Username string
	Password string
	DB       int
	Prefix   string
}

type RedisCache struct {
	client *redis.Client
	prefix string
}

func NewRedis(cfg RedisConfig) (Cache, error) {
	opts, err := redisOptions(cfg)
	if err != nil {
		return nil, err
	}
	client := redis.NewClient(opts)
	return &RedisCache{client: client, prefix: strings.TrimSpace(cfg.Prefix)}, nil
}

func redisOptions(cfg RedisConfig) (*redis.Options, error) {
	if strings.TrimSpace(cfg.URL) != "" {
		return redis.ParseURL(cfg.URL)
	}
	addr := strings.TrimSpace(cfg.Addr)
	if addr == "" {
		addr = "localhost:6379"
	}
	return &redis.Options{
		Addr:     addr,
		Username: cfg.Username,
		Password: cfg.Password,
		DB:       cfg.DB,
	}, nil
}

func (c *RedisCache) GetJSON(ctx context.Context, key string, dst any) (bool, error) {
	data, err := c.client.Get(ctx, c.key(key)).Bytes()
	if errors.Is(err, redis.Nil) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if err := decodeJSON(data, dst); err != nil {
		return false, err
	}
	return true, nil
}

func (c *RedisCache) SetJSON(ctx context.Context, key string, value any, ttl time.Duration) error {
	data, err := encodeJSON(value)
	if err != nil {
		return err
	}
	return c.client.Set(ctx, c.key(key), data, ttl).Err()
}

func (c *RedisCache) Delete(ctx context.Context, keys ...string) error {
	if len(keys) == 0 {
		return nil
	}
	namespaced := make([]string, 0, len(keys))
	for _, key := range keys {
		namespaced = append(namespaced, c.key(key))
	}
	return c.client.Del(ctx, namespaced...).Err()
}

func (c *RedisCache) GetVersion(ctx context.Context, namespace string) (int64, error) {
	version, err := c.client.Get(ctx, c.key("version:"+namespace)).Int64()
	if errors.Is(err, redis.Nil) {
		return 0, nil
	}
	return version, err
}

func (c *RedisCache) BumpVersion(ctx context.Context, namespace string) (int64, error) {
	return c.client.Incr(ctx, c.key("version:"+namespace)).Result()
}

func (c *RedisCache) Close() error {
	return c.client.Close()
}

func (c *RedisCache) key(key string) string {
	if c.prefix == "" {
		return key
	}
	return c.prefix + ":" + key
}
