//go:build !runtime_overlay

package db

func runtimeMigrationModels() []any {
	return nil
}

func distributionProfileCoreSchemaModels(entities []any) []any {
	return entities
}
