package cache

import (
	"context"
	"time"
)

type NoopCache struct{}

func NewNoop() Cache {
	return NoopCache{}
}

func (NoopCache) GetJSON(context.Context, string, any) (bool, error) {
	return false, nil
}

func (NoopCache) SetJSON(context.Context, string, any, time.Duration) error {
	return nil
}

func (NoopCache) Delete(context.Context, ...string) error {
	return nil
}

func (NoopCache) GetVersion(context.Context, string) (int64, error) {
	return 0, nil
}

func (NoopCache) BumpVersion(context.Context, string) (int64, error) {
	return 0, nil
}

func (NoopCache) Close() error {
	return nil
}
