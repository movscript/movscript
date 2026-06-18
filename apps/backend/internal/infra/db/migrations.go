package db

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type Migration struct {
	Version string
	Name    string
	Up      func(*gorm.DB) error
}

type AppliedMigration struct {
	Version   string    `gorm:"primaryKey;size:32"`
	Name      string    `gorm:"size:255;not null"`
	Checksum  string    `gorm:"size:64;not null"`
	AppliedAt time.Time `gorm:"not null"`
}

func (AppliedMigration) TableName() string {
	return "schema_migrations"
}

func RegisteredMigrations() []Migration {
	core := []Migration{
		{
			Version: "000001",
			Name:    "baseline_schema",
			Up:      migrateBaselineSchema,
		},
		{
			Version: "000002",
			Name:    "add_route_provider_model_id",
			Up:      migrateRouteProviderModelID,
		},
		{
			Version: "000003",
			Name:    "add_route_provider_id",
			Up:      migrateRouteProviderID,
		},
	}
	return append(core, editionMigrations()...)
}

func migrateBaselineSchema(db *gorm.DB) error {
	if err := db.AutoMigrate(allModels()...); err != nil {
		return err
	}
	if err := createCurrentSchemaIndexes(db); err != nil {
		return err
	}
	return seedDefaultOrg(db)
}

func migrateRouteProviderModelID(db *gorm.DB) error {
	if err := db.AutoMigrate(&persistencemodel.AIModelRouteBinding{}); err != nil {
		return err
	}
	migrator := db.Migrator()
	if migrator.HasColumn("ai_model_catalog_entries", "provider_model_id") {
		if err := db.Exec(`
			UPDATE ai_model_route_bindings
			SET provider_model_id = (
				SELECT provider_model_id
				FROM ai_model_catalog_entries
				WHERE ai_model_catalog_entries.id = ai_model_route_bindings.catalog_entry_id
			)
			WHERE (provider_model_id IS NULL OR provider_model_id = '')
		`).Error; err != nil {
			return err
		}
		if db.Dialector.Name() == "sqlite" {
			return nil
		}
		if err := migrator.DropColumn("ai_model_catalog_entries", "provider_model_id"); err != nil {
			return err
		}
	}
	return nil
}

func migrateRouteProviderID(db *gorm.DB) error {
	if err := db.AutoMigrate(&persistencemodel.AIModelRouteBinding{}); err != nil {
		return err
	}
	if err := db.Exec(routeProviderIDBackfillSQL(db)).Error; err != nil {
		return err
	}
	if db.Migrator().HasIndex(&persistencemodel.AIModelRouteBinding{}, activeModelRouteBindingUniqueIndex) {
		if err := db.Migrator().DropIndex(&persistencemodel.AIModelRouteBinding{}, activeModelRouteBindingUniqueIndex); err != nil {
			return err
		}
	}
	return enforceUniqueActiveModelRouteBindings(db)
}

func routeProviderIDBackfillSQL(db *gorm.DB) string {
	credentialExpr := "source_type || ':' || credential_id"
	if db.Dialector.Name() == "postgres" {
		credentialExpr = "source_type || ':' || credential_id::text"
	}
	return fmt.Sprintf(`
		UPDATE ai_model_route_bindings
		SET provider_id = CASE
			WHEN source_type = 'new_api' THEN 'new_api'
			WHEN credential_id IS NOT NULL AND credential_id <> 0 THEN %s
			ELSE source_type
		END
		WHERE provider_id IS NULL OR provider_id = ''
	`, credentialExpr)
}

func createCurrentSchemaIndexes(db *gorm.DB) error {
	if err := createJobRunnerIndexes(db); err != nil {
		return err
	}
	if err := createRawResourceNameUniqueIndexes(db); err != nil {
		return err
	}
	if err := enforceUniqueActiveModelRouteBindings(db); err != nil {
		return err
	}
	return enforceUniqueActiveModelCatalogEntries(db)
}

func RunMigrations(db *gorm.DB) error {
	if err := db.AutoMigrate(&AppliedMigration{}); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}
	if err := editionBeforeMigrations(db); err != nil {
		return err
	}

	applied, err := loadAppliedMigrations(db)
	if err != nil {
		return err
	}

	for _, migration := range RegisteredMigrations() {
		checksum := migrationChecksum(migration)
		if existing, ok := applied[migration.Version]; ok {
			if existing.Checksum != checksum {
				return fmt.Errorf("migration %s checksum mismatch: applied %s, current %s", migration.Version, existing.Checksum, checksum)
			}
			continue
		}

		if err := db.Transaction(func(tx *gorm.DB) error {
			if err := migration.Up(tx); err != nil {
				return fmt.Errorf("apply %s_%s: %w", migration.Version, migration.Name, err)
			}
			record := AppliedMigration{
				Version:   migration.Version,
				Name:      migration.Name,
				Checksum:  checksum,
				AppliedAt: time.Now().UTC(),
			}
			return tx.Create(&record).Error
		}); err != nil {
			return err
		}
	}

	return nil
}

func EnsureMigrationsCurrent(db *gorm.DB) error {
	exists, err := schemaMigrationsTableExists(db)
	if err != nil {
		return err
	}
	if !exists {
		return errors.New("database migrations are not initialized; run `go run ./cmd/migrate up` from apps/backend before starting the server")
	}

	pending, err := PendingMigrations(db)
	if err != nil {
		return err
	}
	if len(pending) > 0 {
		names := make([]string, 0, len(pending))
		for _, migration := range pending {
			names = append(names, migration.Version+"_"+migration.Name)
		}
		return fmt.Errorf("database has pending migrations: %s; run `go run ./cmd/migrate up` from apps/backend", strings.Join(names, ", "))
	}
	return nil
}

func PendingMigrations(db *gorm.DB) ([]Migration, error) {
	exists, err := schemaMigrationsTableExists(db)
	if err != nil {
		return nil, err
	}
	if !exists {
		return RegisteredMigrations(), nil
	}

	applied, err := loadAppliedMigrations(db)
	if err != nil {
		return nil, err
	}

	var pending []Migration
	for _, migration := range RegisteredMigrations() {
		if _, ok := applied[migration.Version]; ok {
			continue
		}
		pending = append(pending, migration)
	}
	return pending, nil
}

func loadAppliedMigrations(db *gorm.DB) (map[string]AppliedMigration, error) {
	var records []AppliedMigration
	if err := db.Order("version asc").Find(&records).Error; err != nil {
		return nil, fmt.Errorf("load schema_migrations: %w", err)
	}

	applied := make(map[string]AppliedMigration, len(records))
	for _, record := range records {
		applied[record.Version] = record
	}
	return applied, nil
}

func schemaMigrationsTableExists(db *gorm.DB) (bool, error) {
	if db.Dialector.Name() == "sqlite" {
		return db.Migrator().HasTable(&AppliedMigration{}), nil
	}
	var name sql.NullString
	if err := db.Raw("SELECT to_regclass('schema_migrations')::text").Scan(&name).Error; err != nil {
		return false, fmt.Errorf("check schema_migrations table: %w", err)
	}
	return name.Valid && name.String != "", nil
}

func migrationChecksum(migration Migration) string {
	sum := sha256.Sum256([]byte(migration.Version + "\n" + migration.Name))
	return hex.EncodeToString(sum[:])
}

func createJobRunnerIndexes(db *gorm.DB) error {
	if !db.Migrator().HasTable(&persistencemodel.Job{}) {
		return nil
	}
	if db.Dialector.Name() == "postgres" {
		statements := []string{
			`CREATE INDEX IF NOT EXISTS idx_jobs_runner_ready ON jobs (status, next_run_at, created_at) WHERE deleted_at IS NULL AND status = 'pending'`,
			`CREATE INDEX IF NOT EXISTS idx_jobs_runner_stale ON jobs (status, lease_until, last_heartbeat_at, updated_at) WHERE deleted_at IS NULL AND status = 'running'`,
		}
		for _, stmt := range statements {
			if err := db.Exec(stmt).Error; err != nil {
				return fmt.Errorf("create runner index: %w", err)
			}
		}
		return nil
	}

	indexes := []struct {
		name    string
		columns string
	}{
		{name: "idx_jobs_runner_ready", columns: "status, next_run_at, created_at"},
		{name: "idx_jobs_runner_stale", columns: "status, lease_until, last_heartbeat_at, updated_at"},
	}
	for _, idx := range indexes {
		stmt := fmt.Sprintf("CREATE INDEX IF NOT EXISTS %s ON jobs (%s)", idx.name, idx.columns)
		if err := db.Exec(stmt).Error; err != nil {
			return fmt.Errorf("create runner index %s: %w", idx.name, err)
		}
	}
	return nil
}

const rawResourcePersonalNameUniqueIndex = "uidx_raw_resources_personal_name"
const rawResourceTeamNameUniqueIndex = "uidx_raw_resources_team_name"

func createRawResourceNameUniqueIndexes(db *gorm.DB) error {
	if !db.Migrator().HasTable(&persistencemodel.RawResource{}) {
		return nil
	}
	if db.Dialector.Name() != "postgres" && db.Dialector.Name() != "sqlite" {
		return nil
	}
	indexes := []struct {
		name    string
		columns string
		where   string
	}{
		{
			name:    rawResourcePersonalNameUniqueIndex,
			columns: "owner_id, LOWER(name)",
			where:   "deleted_at IS NULL AND org_id IS NULL",
		},
		{
			name:    rawResourceTeamNameUniqueIndex,
			columns: "org_id, LOWER(name)",
			where:   "deleted_at IS NULL AND org_id IS NOT NULL",
		},
	}
	for _, index := range indexes {
		if db.Migrator().HasIndex(&persistencemodel.RawResource{}, index.name) {
			continue
		}
		stmt := fmt.Sprintf("CREATE UNIQUE INDEX %s ON raw_resources (%s) WHERE %s", index.name, index.columns, index.where)
		if err := db.Exec(stmt).Error; err != nil {
			return fmt.Errorf("create %s: %w", index.name, err)
		}
	}
	return nil
}

const activeModelRouteBindingUniqueIndex = "uidx_ai_model_route_bindings_active_route"
const activeModelCatalogEntryUniqueIndex = "uidx_ai_model_catalog_entries_active_model_ids"

func enforceUniqueActiveModelRouteBindings(db *gorm.DB) error {
	if !db.Migrator().HasTable(&persistencemodel.AIModelRouteBinding{}) {
		return nil
	}
	if err := db.AutoMigrate(&persistencemodel.AIModelRouteBinding{}); err != nil {
		return err
	}
	if err := softDeleteDuplicateActiveModelRouteBindings(db); err != nil {
		return err
	}
	if db.Dialector.Name() != "postgres" && db.Dialector.Name() != "sqlite" {
		return nil
	}
	return createPartialUniqueIndex(
		db,
		&persistencemodel.AIModelRouteBinding{},
		activeModelRouteBindingUniqueIndex,
		"ai_model_route_bindings",
		modelRouteBindingUniqueIndexColumns(),
		"deleted_at IS NULL",
	)
}

func modelRouteBindingUniqueIndexColumns() string {
	return "catalog_entry_id, source_type, route_group, provider_id"
}

func softDeleteDuplicateActiveModelRouteBindings(db *gorm.DB) error {
	stmt := `
UPDATE ai_model_route_bindings
SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NULL
  AND id NOT IN (
    SELECT keep_id FROM (
      SELECT MIN(id) AS keep_id
      FROM ai_model_route_bindings
      WHERE deleted_at IS NULL
      GROUP BY catalog_entry_id, source_type, route_group, provider_id
    ) active_routes
  )`
	if err := db.Exec(stmt).Error; err != nil {
		return fmt.Errorf("soft-delete duplicate active model route bindings: %w", err)
	}
	return nil
}

func enforceUniqueActiveModelCatalogEntries(db *gorm.DB) error {
	if !db.Migrator().HasTable(&persistencemodel.AIModelCatalogEntry{}) {
		return nil
	}
	if err := db.AutoMigrate(&persistencemodel.AIModelCatalogEntry{}); err != nil {
		return err
	}
	if err := mergeDuplicateActiveModelCatalogEntries(db); err != nil {
		return err
	}
	if db.Dialector.Name() != "postgres" && db.Dialector.Name() != "sqlite" {
		return nil
	}
	return createPartialUniqueIndex(
		db,
		&persistencemodel.AIModelCatalogEntry{},
		activeModelCatalogEntryUniqueIndex,
		"ai_model_catalog_entries",
		"public_model_id",
		"deleted_at IS NULL",
	)
}

func mergeDuplicateActiveModelCatalogEntries(db *gorm.DB) error {
	var entries []persistencemodel.AIModelCatalogEntry
	if err := db.
		Unscoped().
		Where("deleted_at IS NULL").
		Order("public_model_id ASC, id ASC").
		Find(&entries).Error; err != nil {
		return fmt.Errorf("list active model catalog entries: %w", err)
	}
	keepers := map[string]uint{}
	for _, entry := range entries {
		key := strings.TrimSpace(entry.PublicModelID)
		if key == "" {
			continue
		}
		keepID, ok := keepers[key]
		if !ok {
			keepers[key] = entry.ID
			continue
		}
		if err := mergeDuplicateModelCatalogEntry(db, entry.ID, keepID); err != nil {
			return err
		}
	}
	return nil
}

func mergeDuplicateModelCatalogEntry(db *gorm.DB, duplicateID uint, keepID uint) error {
	return db.Transaction(func(tx *gorm.DB) error {
		var bindings []persistencemodel.AIModelRouteBinding
		if tx.Migrator().HasTable(&persistencemodel.AIModelRouteBinding{}) {
			if err := tx.
				Where("catalog_entry_id = ? AND deleted_at IS NULL", duplicateID).
				Order("id ASC").
				Find(&bindings).Error; err != nil {
				return fmt.Errorf("list duplicate catalog entry bindings: %w", err)
			}
			for _, binding := range bindings {
				var existing int64
				if err := tx.Model(&persistencemodel.AIModelRouteBinding{}).
					Where("catalog_entry_id = ? AND source_type = ? AND route_group = ? AND provider_id = ? AND deleted_at IS NULL", keepID, binding.SourceType, binding.RouteGroup, binding.ProviderID).
					Count(&existing).Error; err != nil {
					return fmt.Errorf("check duplicate catalog entry binding: %w", err)
				}
				if existing > 0 {
					if err := tx.Delete(&persistencemodel.AIModelRouteBinding{}, binding.ID).Error; err != nil {
						return fmt.Errorf("soft-delete duplicate catalog entry binding %d: %w", binding.ID, err)
					}
					continue
				}
				if err := tx.Model(&persistencemodel.AIModelRouteBinding{}).
					Where("id = ?", binding.ID).
					Update("catalog_entry_id", keepID).Error; err != nil {
					return fmt.Errorf("move catalog entry binding %d: %w", binding.ID, err)
				}
			}
		}
		if err := tx.Delete(&persistencemodel.AIModelCatalogEntry{}, duplicateID).Error; err != nil {
			return fmt.Errorf("soft-delete duplicate catalog entry %d: %w", duplicateID, err)
		}
		return nil
	})
}

func createPartialUniqueIndex(db *gorm.DB, model any, name string, table string, columns string, predicate string) error {
	if !db.Migrator().HasTable(model) || db.Migrator().HasIndex(model, name) {
		return nil
	}
	partial := ""
	if db.Dialector.Name() == "postgres" || db.Dialector.Name() == "sqlite" {
		partial = " WHERE " + predicate
	}
	stmt := fmt.Sprintf("CREATE UNIQUE INDEX %s ON %s (%s)%s", name, table, columns, partial)
	if err := db.Exec(stmt).Error; err != nil {
		return fmt.Errorf("create %s: %w", name, err)
	}
	return nil
}

func seedDefaultOrg(db *gorm.DB) error {
	var count int64
	if err := db.Model(&persistencemodel.Organization{}).Count(&count).Error; err != nil {
		return fmt.Errorf("check orgs: %w", err)
	}
	if count > 0 {
		return nil
	}

	var owner persistencemodel.User
	if err := db.Where("system_role = ?", "super_admin").First(&owner).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return fmt.Errorf("find super_admin: %w", err)
	}

	org := persistencemodel.Organization{
		Name:       "Default",
		Slug:       "default",
		IsPersonal: false,
		Plan:       "team",
		Status:     "active",
		CreatedBy:  owner.ID,
	}
	if err := db.Create(&org).Error; err != nil {
		return fmt.Errorf("create default org: %w", err)
	}

	var users []persistencemodel.User
	if err := db.Find(&users).Error; err != nil {
		return fmt.Errorf("list users: %w", err)
	}
	for _, u := range users {
		role := "member"
		if u.SystemRole == "super_admin" {
			role = "owner"
		}
		member := persistencemodel.OrganizationMember{OrgID: org.ID, UserID: u.ID, Role: role}
		if err := db.Create(&member).Error; err != nil {
			return fmt.Errorf("add user %d to default org: %w", u.ID, err)
		}
	}

	if err := db.Model(&persistencemodel.Project{}).Where("org_id IS NULL").Update("org_id", org.ID).Error; err != nil {
		return fmt.Errorf("assign projects to default org: %w", err)
	}

	return nil
}

func allModels() []any {
	entities := []any{
		&persistencemodel.User{},
		&persistencemodel.UserGitCredential{},
		&persistencemodel.AuthSession{},
		&persistencemodel.AuthChallenge{},
		&persistencemodel.Project{},
		&persistencemodel.ProjectRepository{},
		&persistencemodel.ProjectMember{},
		&persistencemodel.DecisionContext{},
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
		&persistencemodel.LLMCallLog{},
		&persistencemodel.ResourceFolder{},
		&persistencemodel.ResourceFolderPermission{},
		&persistencemodel.ResourceBlob{},
		&persistencemodel.RawResource{},
		&persistencemodel.ResourceDerivative{},
		&persistencemodel.MediaStreamArtifact{},
		&persistencemodel.ExternalResourceSource{},
		&persistencemodel.ShotReferenceGroup{},
		&persistencemodel.ShotReference{},
		&persistencemodel.ShotVectorDocument{},
		&persistencemodel.Canvas{},
		&persistencemodel.CanvasNode{},
		&persistencemodel.CanvasEdge{},
		&persistencemodel.CanvasRun{},
		&persistencemodel.CanvasTask{},
		&persistencemodel.CanvasOutput{},
		&persistencemodel.Job{},
		&persistencemodel.Plugin{},
		&persistencemodel.PluginTool{},
		&persistencemodel.PluginSecret{},
		&persistencemodel.HubPackage{},
		&persistencemodel.GatewayAPIKey{},
		&persistencemodel.AdminSetting{},
		&persistencemodel.CloudFileConfig{},
		&persistencemodel.AuditLog{},
		&persistencemodel.Organization{},
		&persistencemodel.OrganizationMember{},
		&persistencemodel.UserGroup{},
		&persistencemodel.UserGroupMember{},
		&persistencemodel.OrgInvitation{},
	}
	entities = editionCoreSchemaModels(entities)
	return append(entities, runtimeMigrationModels()...)
}
