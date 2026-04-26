package storage

import (
	"context"
	"fmt"
	"io"
	"net/url"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type MinIOStorage struct {
	client *minio.Client
	bucket string
}

func NewMinIOStorage(endpoint, accessKey, secretKey, bucket string, useSSL bool) (*MinIOStorage, error) {
	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("minio client: %w", err)
	}
	return &MinIOStorage{client: client, bucket: bucket}, nil
}

func (s *MinIOStorage) Put(ctx context.Context, key string, r io.Reader, size int64, mimeType string) error {
	_, err := s.client.PutObject(ctx, s.bucket, key, r, size, minio.PutObjectOptions{ContentType: mimeType})
	if err != nil {
		return fmt.Errorf("minio put %q: %w", key, err)
	}
	return nil
}

func (s *MinIOStorage) Delete(ctx context.Context, key string) error {
	return s.client.RemoveObject(ctx, s.bucket, key, minio.RemoveObjectOptions{})
}

// DirectURL returns a presigned GET URL valid for 1 hour.
func (s *MinIOStorage) DirectURL(ctx context.Context, key string) (string, error) {
	u, err := s.client.PresignedGetObject(ctx, s.bucket, key, time.Hour, url.Values{})
	if err != nil {
		return "", fmt.Errorf("minio presign %q: %w", key, err)
	}
	return u.String(), nil
}

// GetObject streams the object. start=-1 means the full object.
func (s *MinIOStorage) GetObject(ctx context.Context, key string, start, end int64) (io.ReadCloser, int64, string, error) {
	// StatObject first to get authoritative total size and content type.
	info, err := s.client.StatObject(ctx, s.bucket, key, minio.StatObjectOptions{})
	if err != nil {
		return nil, 0, "", fmt.Errorf("minio stat %q: %w", key, err)
	}

	opts := minio.GetObjectOptions{}
	if start >= 0 {
		actualEnd := end
		if end < 0 || end >= info.Size {
			actualEnd = info.Size - 1
		}
		if err := opts.SetRange(start, actualEnd); err != nil {
			return nil, 0, "", fmt.Errorf("minio set range: %w", err)
		}
	}

	obj, err := s.client.GetObject(ctx, s.bucket, key, opts)
	if err != nil {
		return nil, 0, "", fmt.Errorf("minio get %q: %w", key, err)
	}
	return obj, info.Size, info.ContentType, nil
}

func (s *MinIOStorage) Backend() string { return "minio" }
