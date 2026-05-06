package entityrelation

import (
	infraentityrelation "github.com/movscript/movscript/internal/infra/entityrelation"
	"gorm.io/gorm"
)

func SyncCoreEntityRelations(db *gorm.DB, item any) error {
	return infraentityrelation.SyncCoreEntityRelations(db, item)
}

func DeleteCoreEntityRelations(db *gorm.DB, item any) error {
	return infraentityrelation.DeleteCoreEntityRelations(db, item)
}
