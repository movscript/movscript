package workflow

import (
	"context"

	"gorm.io/gorm"
)

type Service struct {
	entityIO *EntityIOService
}

func NewService(db *gorm.DB) *Service {
	return &Service{entityIO: NewEntityIOService(db)}
}

func (s *Service) ListEntitySchemas() []EntitySchema {
	return EntitySchemas()
}

func (s *Service) EntitySchemaForKind(kind string) (EntitySchema, bool) {
	return EntitySchemaForKind(kind)
}

func (s *Service) ListEntitySemanticSchemas() []EntitySemanticSchema {
	return EntitySemanticSchemas()
}

func (s *Service) EntitySemanticSchemaForKind(kind string) (EntitySemanticSchema, bool) {
	return EntitySemanticSchemaForKind(kind)
}

func (s *Service) EntitySchemaMigrationReportForKind(kind string) (EntitySchemaMigrationReport, error) {
	return EntitySchemaMigrationReportForKind(kind)
}

func (s *Service) ReadEntitySemanticValues(ctx context.Context, kind string, id uint, fieldIDs []string) (EntitySemanticValues, error) {
	if len(fieldIDs) > 0 {
		return s.entityIO.ReadDetailValuesByFields(ctx, kind, id, fieldIDs)
	}
	return s.entityIO.ReadDetailValues(ctx, kind, id)
}
