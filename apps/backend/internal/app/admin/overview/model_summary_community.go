//go:build !runtime_overlay

package overview

import (
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

func countModelSummary(db *gorm.DB) (ModelSummary, error) {
	var summary ModelSummary
	var err error
	if summary.Credentials, err = countRows(db, &persistencemodel.AICredential{}, ""); err != nil {
		return ModelSummary{}, err
	}
	if summary.EnabledCredentials, err = countRows(db, &persistencemodel.AICredential{}, "is_enabled = ?", true); err != nil {
		return ModelSummary{}, err
	}
	if summary.CatalogEntries, err = countRows(db, &persistencemodel.AIModelCatalogEntry{}, ""); err != nil {
		return ModelSummary{}, err
	}
	if summary.EnabledCatalogEntries, err = countRows(db, &persistencemodel.AIModelCatalogEntry{}, "is_enabled = ?", true); err != nil {
		return ModelSummary{}, err
	}
	if summary.RouteBindings, err = countRows(db, &persistencemodel.AIModelRouteBinding{}, ""); err != nil {
		return ModelSummary{}, err
	}
	if summary.EnabledRouteBindings, err = countRows(db, &persistencemodel.AIModelRouteBinding{}, "is_enabled = ?", true); err != nil {
		return ModelSummary{}, err
	}
	return summary, nil
}
