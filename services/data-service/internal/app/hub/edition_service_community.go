//go:build !runtime_overlay

package hub

import (
	"context"

	domainhub "github.com/movscript/movscript/internal/domain/hub"
)

func (s *Service) distributionProfilePackageForList(_ context.Context, row domainhub.HubPackage) (Package, error) {
	return domainhub.ToPackage(row), nil
}

func (s *Service) distributionProfilePackageForDownload(_ context.Context, row domainhub.HubPackage) (Package, error) {
	return domainhub.ToPackage(row), nil
}

func (s *Service) distributionProfileValidateDownload(_ context.Context, _ domainhub.HubPackage, _ ...string) error {
	return nil
}

func (s *Service) distributionProfileDownloadCountsInline() bool {
	return true
}
