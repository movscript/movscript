//go:build !runtime_overlay

package hub

import persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"

func editionApplyHubPackageFromModel(_ persistencemodel.HubPackage, _ *HubPackage) {}

func (pkg HubPackage) editionApplyToModel(_ *persistencemodel.HubPackage) {}
