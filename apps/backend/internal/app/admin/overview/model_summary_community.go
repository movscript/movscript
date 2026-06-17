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
	if summary.Configs, err = countRows(db, &persistencemodel.AIModelConfig{}, ""); err != nil {
		return ModelSummary{}, err
	}
	if summary.EnabledConfigs, err = countRows(db, &persistencemodel.AIModelConfig{}, "is_enabled = ?", true); err != nil {
		return ModelSummary{}, err
	}
	return summary, nil
}
