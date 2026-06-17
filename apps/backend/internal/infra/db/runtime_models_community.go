//go:build !runtime_overlay

package db

func runtimeMigrationModels() []any {
	return nil
}

func legacyAIProviderSchemaEnabled() bool {
	return true
}

func editionCoreSchemaModels(entities []any) []any {
	return entities
}
