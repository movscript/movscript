package storage

import (
	"context"
	"io"
)

// Storage abstracts object storage backends.
type Storage interface {
	Put(ctx context.Context, key string, r io.Reader, size int64, mimeType string) error
	Delete(ctx context.Context, key string) error
	// DirectURL returns a presigned GET URL for the given key.
	DirectURL(ctx context.Context, key string) (string, error)
	// GetObject returns the object body, total size, and content type.
	// Pass start=-1 for the full object; otherwise streams bytes [start, end] (inclusive).
	GetObject(ctx context.Context, key string, start, end int64) (io.ReadCloser, int64, string, error)
	Backend() string
}
