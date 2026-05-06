package storage

import (
	"fmt"

	"github.com/movscript/movscript/internal/infra/config"
)

func New(cfg *config.Config) (Storage, error) {
	switch cfg.StorageBackend {
	case "minio":
		return NewMinIOStorage(
			cfg.MinIOEndpoint,
			cfg.MinIOAccessKey,
			cfg.MinIOSecretKey,
			cfg.MinIOBucket,
			cfg.MinIOUseSSL,
		)
	case "filesystem":
		return NewFileSystemStorage(cfg.FilesystemStorageRoot)
	default:
		return nil, fmt.Errorf("unsupported storage backend %q", cfg.StorageBackend)
	}
}
