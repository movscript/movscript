//go:build !runtime_overlay

package hub

import (
	"context"

	domainhub "github.com/movscript/movscript/internal/domain/hub"
)

func (s *Service) editionPackageForList(_ context.Context, row domainhub.HubPackage) (Package, error) {
	return domainhub.ToPackage(row), nil
}

func (s *Service) editionPackageForDownload(_ context.Context, row domainhub.HubPackage) (Package, error) {
	return domainhub.ToPackage(row), nil
}

func (s *Service) editionValidateDownload(_ context.Context, _ domainhub.HubPackage, _ ...string) error {
	return nil
}

func (s *Service) editionDownloadCountsInline() bool {
	return true
}
