package storage

import (
	"context"
	"io"
	"time"

	"github.com/movscript/movscript/internal/infra/observability"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

type instrumentedStorage struct {
	inner Storage
}

func withMetrics(inner Storage) Storage {
	if inner == nil {
		return inner
	}
	return &instrumentedStorage{inner: inner}
}

func (s *instrumentedStorage) Put(ctx context.Context, key string, r io.Reader, size int64, mimeType string) error {
	startedAt := time.Now()
	err := s.inner.Put(ctx, key, r, size, mimeType)
	s.record("put", startedAt, err, size)
	return err
}

func (s *instrumentedStorage) Delete(ctx context.Context, key string) error {
	startedAt := time.Now()
	err := s.inner.Delete(ctx, key)
	s.record("delete", startedAt, err, -1)
	return err
}

func (s *instrumentedStorage) DirectURL(ctx context.Context, key string) (string, error) {
	startedAt := time.Now()
	url, err := s.inner.DirectURL(ctx, key)
	s.record("direct_url", startedAt, err, -1)
	return url, err
}

func (s *instrumentedStorage) GetObject(ctx context.Context, key string, start, end int64) (io.ReadCloser, int64, string, error) {
	startedAt := time.Now()
	body, totalSize, contentType, err := s.inner.GetObject(ctx, key, start, end)
	s.record("get_object", startedAt, err, totalSize)
	return body, totalSize, contentType, err
}

func (s *instrumentedStorage) Backend() string {
	return s.inner.Backend()
}

func (s *instrumentedStorage) Health(ctx context.Context) providercontract.ProviderHealth {
	return s.inner.Health(ctx)
}

func (s *instrumentedStorage) record(operation string, startedAt time.Time, err error, bytes int64) {
	status := "success"
	if err != nil {
		status = "error"
	}
	observability.DefaultObjectStorageMetrics().RecordOperation(observability.ObjectStorageOperationSample{
		Backend:   s.Backend(),
		Operation: operation,
		Status:    status,
		Duration:  time.Since(startedAt),
		Bytes:     bytes,
	})
}
