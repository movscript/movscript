package cache

import (
	"context"
	"sync"
	"time"
)

type MemoryCache struct {
	mu       sync.RWMutex
	items    map[string]memoryItem
	versions map[string]int64
}

type memoryItem struct {
	value     []byte
	expiresAt time.Time
}

func NewMemory() Cache {
	return &MemoryCache{
		items:    map[string]memoryItem{},
		versions: map[string]int64{},
	}
}

func (c *MemoryCache) GetJSON(_ context.Context, key string, dst any) (bool, error) {
	c.mu.RLock()
	item, ok := c.items[key]
	c.mu.RUnlock()
	if !ok {
		return false, nil
	}
	if !item.expiresAt.IsZero() && time.Now().After(item.expiresAt) {
		c.mu.Lock()
		delete(c.items, key)
		c.mu.Unlock()
		return false, nil
	}
	if err := decodeJSON(item.value, dst); err != nil {
		return false, err
	}
	return true, nil
}

func (c *MemoryCache) SetJSON(_ context.Context, key string, value any, ttl time.Duration) error {
	data, err := encodeJSON(value)
	if err != nil {
		return err
	}
	var expiresAt time.Time
	if ttl > 0 {
		expiresAt = time.Now().Add(ttl)
	}
	c.mu.Lock()
	c.items[key] = memoryItem{value: data, expiresAt: expiresAt}
	c.mu.Unlock()
	return nil
}

func (c *MemoryCache) Delete(_ context.Context, keys ...string) error {
	c.mu.Lock()
	for _, key := range keys {
		delete(c.items, key)
	}
	c.mu.Unlock()
	return nil
}

func (c *MemoryCache) GetVersion(_ context.Context, namespace string) (int64, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.versions[namespace], nil
}

func (c *MemoryCache) BumpVersion(_ context.Context, namespace string) (int64, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.versions[namespace]++
	return c.versions[namespace], nil
}

func (c *MemoryCache) Close() error {
	return nil
}
