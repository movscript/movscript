package cloudup

import (
	"context"
	"fmt"
	"sort"

	"github.com/movscript/movscript/internal/crypto"
	"github.com/movscript/movscript/internal/model"
)

type CloudFileConfig struct {
	ID         uint
	Name       string
	ConfigType string
	ConfigJSON string // plain JSON (already decrypted)
	Priority   int
	IsEnabled  bool
}

type ConfiguredUploader struct {
	ConfigID uint
	Uploader Uploader
	Priority int
}

type Service struct {
	uploaders []ConfiguredUploader
}

// NewFromDBConfigs builds a Service from model.CloudFileConfig rows, decrypting each config.
func NewFromDBConfigs(rows []model.CloudFileConfig, encryptionKey []byte) (*Service, error) {
	cfgs := make([]CloudFileConfig, 0, len(rows))
	for _, r := range rows {
		plain := r.ConfigJSON
		if len(encryptionKey) > 0 && r.ConfigJSON != "" {
			if dec, err := crypto.Decrypt(r.ConfigJSON, encryptionKey); err == nil {
				plain = dec
			}
		}
		cfgs = append(cfgs, CloudFileConfig{
			ID:         r.ID,
			Name:       r.Name,
			ConfigType: r.ConfigType,
			ConfigJSON: plain,
			Priority:   r.Priority,
			IsEnabled:  r.IsEnabled,
		})
	}
	return NewFromConfigs(cfgs)
}

func NewFromConfigs(configs []CloudFileConfig) (*Service, error) {
	var uploaders []ConfiguredUploader
	for _, cfg := range configs {
		if !cfg.IsEnabled {
			continue
		}
		u, err := newUploader(cfg.ConfigType, cfg.ConfigJSON)
		if err != nil {
			return nil, fmt.Errorf("cloudup: init uploader %q (id=%d): %w", cfg.Name, cfg.ID, err)
		}
		uploaders = append(uploaders, ConfiguredUploader{ConfigID: cfg.ID, Uploader: u, Priority: cfg.Priority})
	}
	sort.Slice(uploaders, func(i, j int) bool {
		return uploaders[i].Priority < uploaders[j].Priority
	})
	return &Service{uploaders: uploaders}, nil
}

func newUploader(configType, configJSON string) (Uploader, error) {
	switch configType {
	case "s3":
		return NewS3Uploader(configJSON)
	case "oss":
		return NewOSSUploader(configJSON)
	case "tos":
		return NewTOSUploader(configJSON)
	default:
		return nil, fmt.Errorf("unknown config type: %s", configType)
	}
}

// UploadWithFallback tries each uploader in priority order, returning the first success.
// Returns the ConfigID of the uploader that succeeded alongside the result.
func (s *Service) UploadWithFallback(ctx context.Context, data []byte, filename, mimeType string) (uint, UploadResult, error) {
	var lastErr error
	for _, cu := range s.uploaders {
		result, err := cu.Uploader.Upload(ctx, data, filename, mimeType)
		if err == nil {
			return cu.ConfigID, result, nil
		}
		lastErr = fmt.Errorf("uploader %q failed: %w", cu.Uploader.Type(), err)
	}
	if lastErr != nil {
		return 0, UploadResult{}, fmt.Errorf("cloudup: all uploaders failed, last error: %w", lastErr)
	}
	return 0, UploadResult{}, fmt.Errorf("cloudup: no uploaders configured")
}

// HasUploaders reports whether any uploaders are configured.
func (s *Service) HasUploaders() bool {
	return len(s.uploaders) > 0
}

