package storage

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

type MinIOStorage struct {
	client *minio.Client
	bucket string
}

var minioTransportOverride http.RoundTripper

func SetMinIOTransportForTest(transport http.RoundTripper) func() {
	previous := minioTransportOverride
	minioTransportOverride = transport
	return func() {
		minioTransportOverride = previous
	}
}

func NewMinIOStorage(endpoint, accessKey, secretKey, bucket string, useSSL bool) (*MinIOStorage, error) {
	options := &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	}
	if minioTransportOverride != nil {
		options.Transport = minioTransportOverride
	}
	client, err := minio.New(endpoint, options)
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

func (s *MinIOStorage) Health(ctx context.Context) providercontract.ProviderHealth {
	health := providercontract.ProviderHealth{
		Type:     providercontract.TypeBlobStorage,
		Adapter:  providercontract.AdapterMinIO,
		Assembly: providercontract.AssemblyStartup,
		Status:   providercontract.HealthStatusOK,
		Message:  "MinIO bucket health probe succeeded",
	}
	if s == nil || s.client == nil || s.bucket == "" {
		health.Status = providercontract.HealthStatusMissingConfig
		health.Message = "MinIO endpoint, credentials, and bucket are required"
		return health
	}
	ok, err := s.client.BucketExists(ctx, s.bucket)
	if err != nil {
		health.Status = providercontract.HealthStatusError
		health.Message = fmt.Sprintf("MinIO bucket health probe failed: %v", err)
		return health
	}
	if !ok {
		health.Status = providercontract.HealthStatusError
		health.Message = fmt.Sprintf("MinIO bucket %q does not exist or is not accessible", s.bucket)
		return health
	}
	return health
}
