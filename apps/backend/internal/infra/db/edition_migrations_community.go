//go:build !runtime_overlay

package db

func editionMigrations() []Migration {
	return nil
}
