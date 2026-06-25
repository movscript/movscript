package storage

import (
	"fmt"

	"github.com/movscript/movscript/internal/infra/config"
)

func New(cfg *config.Config) (Storage, error) {
	var store Storage
	var err error
	switch cfg.StorageBackend {
	case "minio":
		store, err = NewMinIOStorage(
			cfg.MinIOEndpoint,
			cfg.MinIOAccessKey,
			cfg.MinIOSecretKey,
			cfg.MinIOBucket,
			cfg.MinIOUseSSL,
		)
	case "filesystem":
		store, err = NewFileSystemStorage(cfg.FilesystemStorageRoot)
	default:
		return nil, fmt.Errorf("unsupported storage backend %q", cfg.StorageBackend)
	}
	if err != nil {
		return nil, err
	}
	return withMetrics(store), nil
}
