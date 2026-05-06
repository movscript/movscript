//go:build enterprise

package db

import "github.com/movscript/movscript/internal/domain/model"

func commercialMigrationModels() []any {
	return []any{
		&model.UserQuota{},
		&model.OrgQuota{},
	}
}
