//go:build !runtime_overlay

package hub

import persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"

func distributionProfileApplyHubPackageFromModel(_ persistencemodel.HubPackage, _ *HubPackage) {}

func (pkg HubPackage) distributionProfileApplyToModel(_ *persistencemodel.HubPackage) {}
