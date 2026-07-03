//go:build !runtime_overlay

package hub

import (
	"context"

	domainhub "github.com/movscript/movscript/internal/domain/hub"
)

func (r *gormRepository) distributionProfileApplyPackageMetadata(_ context.Context, _ []domainhub.HubPackage) error {
	return nil
}
