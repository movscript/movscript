package db

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
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
		{
			Version: "000004",
			Name:    "add_project_uid",
			Up:      migrateProjectUID,
		},
		{
			Version: "000005",
			Name:    "add_raw_resource_provider_asset_certifications",
			Up:      migrateRawResourceProviderAssetCertifications,
		},
		{
			Version: "000006",
			Name:    "add_raw_resource_provider_generated_artifact",
			Up:      migrateRawResourceProviderGeneratedArtifact,
		},
		{
			Version: "000007",
			Name:    "add_ai_provider_instances",
			Up:      migrateAIProviderInstances,
		},
		{
			Version: "000008",
			Name:    "canonicalize_ai_provider_ids",
			Up:      migrateNormalizeLegacyAIProviderIDs,
		},
		{
			Version: "000009",
			Name:    "canonicalize_ai_model_route_identity",
			Up:      migrateCanonicalizeAIModelRouteIdentity,
		},
		{
			Version: "000010",
			Name:    "add_model_route_template_metadata",
			Up:      migrateModelRouteTemplateMetadata,
		},
		{
			Version: "000011",
			Name:    "remove_canvas_project_id",
			Up:      migrateRemoveCanvasProjectID,
		},
		{
			Version: "000012",
			Name:    "add_provider_semantics_and_route_adapter_type",
			Up:      migrateProviderSemanticsAndRouteAdapterType,
		},
		{
			Version: "000014",
			Name:    "add_provider_asset_library_read_model",
			Up:      migrateProviderAssetLibraryReadModel,
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
	return nil
}

func migrateModelRouteTemplateMetadata(db *gorm.DB) error {
	migrator := db.Migrator()
	if migrator.HasTable(&persistencemodel.AIModelCatalogEntry{}) {
		for _, columnName := range []string{"model_template_key", "template_version", "param_limits_json", "model_capabilities_json"} {
			if err := addTextColumnIfMissing(db, "ai_model_catalog_entries", columnName); err != nil {
				return err
			}
		}
	}
	if migrator.HasTable(&persistencemodel.AIModelRouteBinding{}) {
		for _, columnName := range []string{"combo_template_key", "template_version", "endpoint_base_url", "endpoint_path_prefix", "endpoint_mode", "operation_profile", "route_capabilities_json"} {
			if err := addTextColumnIfMissing(db, "ai_model_route_bindings", columnName); err != nil {
				return err
			}
		}
	}
	return db.AutoMigrate(&persistencemodel.AIModelCatalogEntry{}, &persistencemodel.AIModelRouteBinding{})
}

func migrateRemoveCanvasProjectID(db *gorm.DB) error {
	migrator := db.Migrator()
	if !migrator.HasTable("canvases") || !migrator.HasColumn("canvases", "project_id") {
		return nil
	}
	if err := db.Exec("DROP INDEX IF EXISTS idx_canvases_project_id").Error; err != nil {
		return err
	}
	return db.Exec("ALTER TABLE canvases DROP COLUMN project_id").Error
}

func migrateProviderSemanticsAndRouteAdapterType(db *gorm.DB) error {
	migrator := db.Migrator()
	if migrator.HasTable(&persistencemodel.AIModelRouteBinding{}) {
		if err := addTextColumnIfMissing(db, "ai_model_route_bindings", "adapter_type"); err != nil {
			return err
		}
	}
	if migrator.HasTable(&persistencemodel.AIProvider{}) {
		for _, columnName := range []string{"provider_type", "profile", "default_adapter_type"} {
			if err := addTextColumnIfMissing(db, "a_iproviders", columnName); err != nil {
				return err
			}
		}
	}
	if err := db.AutoMigrate(&persistencemodel.AIModelRouteBinding{}); err != nil {
		return err
	}
	if err := backfillAIProviderSemanticColumns(db); err != nil {
		return err
	}
	return enforceUniqueActiveModelRouteBindings(db)
}

func migrateProviderAssetLibraryReadModel(db *gorm.DB) error {
	return db.AutoMigrate(
		&persistencemodel.ProviderAssetGroup{},
		&persistencemodel.ProviderAsset{},
		&persistencemodel.ProviderAssetModelCertification{},
	)
}

func addTextColumnIfMissing(db *gorm.DB, tableName string, columnName string) error {
	if db.Migrator().HasColumn(tableName, columnName) {
		return nil
	}
	return db.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s text NOT NULL DEFAULT ''", tableName, columnName)).Error
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

func migrateProjectUID(db *gorm.DB) error {
	return db.AutoMigrate(&persistencemodel.Project{})
}

func migrateRawResourceProviderAssetCertifications(db *gorm.DB) error {
	if !db.Migrator().HasTable(&persistencemodel.RawResource{}) ||
		db.Migrator().HasColumn(&persistencemodel.RawResource{}, "provider_asset_certifications") {
		return nil
	}
	switch db.Dialector.Name() {
	case "sqlite":
		return db.Exec(`ALTER TABLE raw_resources ADD COLUMN provider_asset_certifications text NOT NULL DEFAULT '{}'`).Error
	case "postgres":
		return db.Exec(`ALTER TABLE raw_resources ADD COLUMN provider_asset_certifications text NOT NULL DEFAULT '{}'`).Error
	default:
		return db.Migrator().AddColumn(&persistencemodel.RawResource{}, "ProviderAssetCertifications")
	}
}

func migrateRawResourceProviderGeneratedArtifact(db *gorm.DB) error {
	if !db.Migrator().HasTable(&persistencemodel.RawResource{}) ||
		db.Migrator().HasColumn(&persistencemodel.RawResource{}, "provider_generated_artifact") {
		return nil
	}
	switch db.Dialector.Name() {
	case "sqlite":
		return db.Exec(`ALTER TABLE raw_resources ADD COLUMN provider_generated_artifact text NOT NULL DEFAULT '{}'`).Error
	case "postgres":
		return db.Exec(`ALTER TABLE raw_resources ADD COLUMN provider_generated_artifact text NOT NULL DEFAULT '{}'`).Error
	default:
		return db.Migrator().AddColumn(&persistencemodel.RawResource{}, "ProviderGeneratedArtifact")
	}
}

func migrateAIProviderInstances(db *gorm.DB) error {
	if err := db.AutoMigrate(&persistencemodel.AIProvider{}, &persistencemodel.AIProviderCredential{}); err != nil {
		return err
	}
	if !db.Migrator().HasTable(&persistencemodel.AICredential{}) {
		return nil
	}
	var credentials []persistencemodel.AICredential
	if err := db.Unscoped().Find(&credentials).Error; err != nil {
		return fmt.Errorf("list ai credentials for provider backfill: %w", err)
	}
	for _, credential := range credentials {
		if err := backfillAIProviderFromCredential(db, credential); err != nil {
			return err
		}
	}
	return nil
}

func backfillAIProviderFromCredential(db *gorm.DB, credential persistencemodel.AICredential) error {
	providerID := legacyMirrorProviderIDForCredential(credential)
	displayName := strings.TrimSpace(credential.DisplayName)
	if displayName == "" {
		displayName = providerID
	}
	provider := persistencemodel.AIProvider{
		ProviderID:               providerID,
		ProviderType:             providerTypeForCredential(credential),
		Profile:                  providerProfileForCredential(credential),
		ProviderKind:             providerKindForCredential(credential),
		ProviderCategory:         providerCategoryForCredential(credential),
		DefaultAdapterType:       strings.TrimSpace(credential.AdapterType),
		AdapterKey:               strings.TrimSpace(credential.AdapterType),
		TemplateVersion:          "builtin.v1",
		DisplayName:              displayName,
		OrgID:                    credential.OrgID,
		BaseURLPrefix:            strings.TrimSpace(credential.BaseURL),
		AssetLibraryStateJSON:    "{}",
		TrustedResourceStateJSON: "{}",
		HealthJSON:               "{}",
		IsEnabled:                credential.IsEnabled && !credential.DeletedAt.Valid,
	}
	var existingProvider persistencemodel.AIProvider
	if err := db.Where("provider_id = ?", provider.ProviderID).
		Assign(provider).
		FirstOrCreate(&existingProvider).Error; err != nil {
		return fmt.Errorf("backfill ai provider %q: %w", provider.ProviderID, err)
	}

	status := persistencemodel.AIProviderCredentialStatusActive
	if !credential.IsEnabled || credential.DeletedAt.Valid {
		status = persistencemodel.AIProviderCredentialStatusDisabled
	}
	providerCredential := persistencemodel.AIProviderCredential{
		ProviderID:           providerID,
		CredentialKey:        "primary",
		CredentialKind:       credentialKindForAdapter(credential.AdapterType),
		SchemaVersion:        "legacy.ai_credentials.v1",
		EncryptedSecretsJSON: encryptedSecretsJSONForCredential(credential),
		MaskedSecretsJSON:    maskedSecretsJSONForCredential(credential),
		PlainConfigJSON:      plainConfigJSONForCredential(credential),
		Status:               status,
		IsPrimary:            status == persistencemodel.AIProviderCredentialStatusActive,
		Priority:             0,
		HealthJSON:           "{}",
	}
	var existingCredential persistencemodel.AIProviderCredential
	if err := db.Where("provider_id = ? AND credential_key = ?", providerCredential.ProviderID, providerCredential.CredentialKey).
		Assign(providerCredential).
		FirstOrCreate(&existingCredential).Error; err != nil {
		return fmt.Errorf("backfill ai provider credential %q/%q: %w", providerCredential.ProviderID, providerCredential.CredentialKey, err)
	}
	return nil
}

func migrateNormalizeLegacyAIProviderIDs(db *gorm.DB) error {
	if !db.Migrator().HasTable(&persistencemodel.AICredential{}) ||
		!db.Migrator().HasTable(&persistencemodel.AIProvider{}) ||
		!db.Migrator().HasTable(&persistencemodel.AIProviderCredential{}) {
		return nil
	}
	var credentials []persistencemodel.AICredential
	if err := db.Unscoped().Find(&credentials).Error; err != nil {
		return fmt.Errorf("list ai credentials for provider id normalization: %w", err)
	}
	for _, credential := range credentials {
		legacyProviderID := legacyProviderIDForCredential(credential.ID)
		mirrorProviderID := legacyMirrorProviderIDForCredential(credential)
		if legacyProviderID == "" || mirrorProviderID == "" || legacyProviderID == mirrorProviderID {
			continue
		}
		if err := normalizeLegacyAIProviderID(db, credential, legacyProviderID, mirrorProviderID); err != nil {
			return err
		}
	}
	return nil
}

func normalizeLegacyAIProviderID(db *gorm.DB, credential persistencemodel.AICredential, legacyProviderID string, mirrorProviderID string) error {
	return db.Transaction(func(tx *gorm.DB) error {
		if err := backfillAIProviderFromCredential(tx, credential); err != nil {
			return err
		}
		if tx.Migrator().HasTable(&persistencemodel.AIModelRouteBinding{}) {
			if err := normalizeLegacyRouteProviderIDs(tx, legacyProviderID, mirrorProviderID); err != nil {
				return err
			}
		}
		if err := tx.Where("provider_id = ?", legacyProviderID).Delete(&persistencemodel.AIProviderCredential{}).Error; err != nil {
			return fmt.Errorf("soft-delete legacy provider credentials %q: %w", legacyProviderID, err)
		}
		if err := tx.Where("provider_id = ?", legacyProviderID).Delete(&persistencemodel.AIProvider{}).Error; err != nil {
			return fmt.Errorf("soft-delete legacy provider %q: %w", legacyProviderID, err)
		}
		return nil
	})
}

func normalizeLegacyRouteProviderIDs(tx *gorm.DB, legacyProviderID string, mirrorProviderID string) error {
	var bindings []persistencemodel.AIModelRouteBinding
	if err := tx.
		Where("provider_id = ? AND deleted_at IS NULL", legacyProviderID).
		Order("id ASC").
		Find(&bindings).Error; err != nil {
		return fmt.Errorf("list legacy route provider bindings %q: %w", legacyProviderID, err)
	}
	for _, binding := range bindings {
		var existing int64
		if err := tx.Model(&persistencemodel.AIModelRouteBinding{}).
			Where("catalog_entry_id = ? AND route_group = ? AND provider_id = ? AND provider_model_id = ? AND deleted_at IS NULL", binding.CatalogEntryID, binding.RouteGroup, mirrorProviderID, binding.ProviderModelID).
			Count(&existing).Error; err != nil {
			return fmt.Errorf("check route provider duplicate %q to %q: %w", legacyProviderID, mirrorProviderID, err)
		}
		if existing > 0 {
			if err := tx.Delete(&persistencemodel.AIModelRouteBinding{}, binding.ID).Error; err != nil {
				return fmt.Errorf("soft-delete duplicate legacy route provider binding %d: %w", binding.ID, err)
			}
			continue
		}
		if err := tx.Model(&persistencemodel.AIModelRouteBinding{}).
			Where("id = ?", binding.ID).
			Update("provider_id", mirrorProviderID).Error; err != nil {
			return fmt.Errorf("normalize route provider_id %q to %q: %w", legacyProviderID, mirrorProviderID, err)
		}
	}
	return nil
}

func migrateCanonicalizeAIModelRouteIdentity(db *gorm.DB) error {
	if !db.Migrator().HasTable(&persistencemodel.AIModelRouteBinding{}) {
		return nil
	}
	if db.Migrator().HasIndex(&persistencemodel.AIModelRouteBinding{}, activeModelRouteBindingUniqueIndex) {
		if err := db.Migrator().DropIndex(&persistencemodel.AIModelRouteBinding{}, activeModelRouteBindingUniqueIndex); err != nil {
			return err
		}
	}
	return enforceUniqueActiveModelRouteBindings(db)
}

func legacyProviderIDForCredential(id uint) string {
	return fmt.Sprintf("%s:%d", persistencemodel.ModelRouteSourceLocalProvider, id)
}

func legacyMirrorProviderIDForCredential(credential persistencemodel.AICredential) string {
	return providerIDForCredentialProviderKind(providerKindForCredential(credential), credential.ID)
}

func providerIDForCredentialProviderKind(providerKind string, credentialID uint) string {
	providerKind = strings.TrimSpace(providerKind)
	if providerKind == "" || credentialID == 0 {
		return ""
	}
	return fmt.Sprintf("%s:%d", providerKind, credentialID)
}

func providerKindForCredential(credential persistencemodel.AICredential) string {
	adapter := strings.TrimSpace(credential.AdapterType)
	baseURL := strings.ToLower(strings.TrimSpace(credential.BaseURL))
	switch adapter {
	case "volcen":
		return persistencemodel.AIProviderKindVolcengineArk
	case "openai_compat":
		if strings.Contains(baseURL, "127.0.0.1") || strings.Contains(baseURL, "localhost") || strings.HasPrefix(baseURL, "http://0.0.0.0") {
			return persistencemodel.AIProviderKindLocalOpenAICompat
		}
		return persistencemodel.AIProviderKindOpenAICompatGateway
	default:
		return adapter
	}
}

func backfillAIProviderSemanticColumns(db *gorm.DB) error {
	if !db.Migrator().HasTable(&persistencemodel.AIProvider{}) {
		return nil
	}
	var providers []persistencemodel.AIProvider
	if err := db.Find(&providers).Error; err != nil {
		return err
	}
	for _, provider := range providers {
		providerType, profile := providerTypeProfileForProviderKind(provider.ProviderKind)
		updates := map[string]any{}
		if strings.TrimSpace(provider.ProviderType) == "" && providerType != "" {
			updates["provider_type"] = providerType
		}
		if strings.TrimSpace(provider.Profile) == "" && profile != "" {
			updates["profile"] = profile
		}
		if strings.TrimSpace(provider.DefaultAdapterType) == "" {
			updates["default_adapter_type"] = strings.TrimSpace(provider.AdapterKey)
		}
		if len(updates) == 0 {
			continue
		}
		if err := db.Model(&persistencemodel.AIProvider{}).Where("id = ?", provider.ID).Updates(updates).Error; err != nil {
			return fmt.Errorf("backfill ai provider semantic columns for %q: %w", provider.ProviderID, err)
		}
	}
	return nil
}

func providerTypeProfileForProviderKind(providerKind string) (string, string) {
	switch strings.TrimSpace(providerKind) {
	case persistencemodel.AIProviderKindVolcengineArk:
		return persistencemodel.AIProviderTypeVolcen, persistencemodel.AIProviderProfileArk
	case persistencemodel.AIProviderKindVolcengineArkProxy, persistencemodel.AIProviderKindRelayGateway:
		return persistencemodel.AIProviderTypeRelayGateway, persistencemodel.AIProviderProfileGateway
	case persistencemodel.AIProviderKindLocalOpenAICompat:
		return persistencemodel.AIProviderTypeOpenAI, persistencemodel.AIProviderProfileLocal
	case persistencemodel.AIProviderKindOpenAICompatGateway:
		return persistencemodel.AIProviderTypeOpenAI, persistencemodel.AIProviderProfileOfficial
	default:
		return "", ""
	}
}

func providerTypeForCredential(credential persistencemodel.AICredential) string {
	switch providerKindForCredential(credential) {
	case persistencemodel.AIProviderKindVolcengineArk:
		return persistencemodel.AIProviderTypeVolcen
	case persistencemodel.AIProviderKindLocalOpenAICompat:
		return persistencemodel.AIProviderTypeOpenAI
	default:
		return persistencemodel.AIProviderTypeOpenAI
	}
}

func providerProfileForCredential(credential persistencemodel.AICredential) string {
	switch providerKindForCredential(credential) {
	case persistencemodel.AIProviderKindVolcengineArk:
		return persistencemodel.AIProviderProfileArk
	case persistencemodel.AIProviderKindLocalOpenAICompat:
		return persistencemodel.AIProviderProfileLocal
	default:
		return persistencemodel.AIProviderProfileOfficial
	}
}

func providerCategoryForCredential(credential persistencemodel.AICredential) string {
	switch providerKindForCredential(credential) {
	case persistencemodel.AIProviderKindVolcengineArk:
		return persistencemodel.AIProviderCategoryOfficialPlatform
	case persistencemodel.AIProviderKindLocalOpenAICompat:
		return persistencemodel.AIProviderCategoryLocalEndpoint
	default:
		return persistencemodel.AIProviderCategoryAggregatorGateway
	}
}

func credentialKindForAdapter(adapterType string) string {
	switch strings.TrimSpace(adapterType) {
	case "kling":
		return "ak_sk"
	default:
		return "api_key"
	}
}

func encryptedSecretsJSONForCredential(credential persistencemodel.AICredential) string {
	return compactJSON(map[string]string{
		"legacy_encrypted_key":           credential.EncryptedKey,
		"legacy_files_api_encrypted_key": credential.FilesAPIEncryptedKey,
	})
}

func maskedSecretsJSONForCredential(credential persistencemodel.AICredential) string {
	return compactJSON(map[string]string{
		"legacy_masked_key":           credential.MaskedKey,
		"legacy_files_api_masked_key": credential.FilesAPIMaskedKey,
	})
}

func plainConfigJSONForCredential(credential persistencemodel.AICredential) string {
	return compactJSON(map[string]any{
		"legacy_credential_id": credential.ID,
		"files_api_enabled":    credential.FilesAPIEnabled,
		"files_api_base_url":   strings.TrimSpace(credential.FilesAPIBaseURL),
	})
}

func compactJSON(value any) string {
	raw, err := json.Marshal(value)
	if err != nil {
		return "{}"
	}
	return string(raw)
}

func routeProviderIDBackfillSQL(db *gorm.DB) string {
	credentialExpr := "source_type || ':' || credential_id"
	if db.Dialector.Name() == "postgres" {
		credentialExpr = "source_type || ':' || credential_id::text"
	}
	return fmt.Sprintf(`
		UPDATE ai_model_route_bindings
		SET provider_id = CASE
			WHEN source_type = 'relay_gateway' THEN 'relay_gateway'
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
		return errors.New("database migrations are not initialized; run `go run ./cmd/migrate up` from services/data-service before starting the server")
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
		return fmt.Errorf("database has pending migrations: %s; run `go run ./cmd/migrate up` from services/data-service", strings.Join(names, ", "))
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
	return "catalog_entry_id, provider_id, provider_model_id, route_group"
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
      GROUP BY catalog_entry_id, provider_id, provider_model_id, route_group
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
					Where("catalog_entry_id = ? AND route_group = ? AND provider_id = ? AND provider_model_id = ? AND deleted_at IS NULL", keepID, binding.RouteGroup, binding.ProviderID, binding.ProviderModelID).
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

func allModels() []any {
	entities := []any{
		&persistencemodel.UserGitCredential{},
		&persistencemodel.Project{},
		&persistencemodel.ProjectRepository{},
		&persistencemodel.ProjectMember{},
		&persistencemodel.DecisionContext{},
		&persistencemodel.ProjectDataSpace{},
		&persistencemodel.ProjectDataDecisionContext{},
		&persistencemodel.AICredential{},
		&persistencemodel.AIProvider{},
		&persistencemodel.AIProviderCredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
		&persistencemodel.ProviderAssetGroup{},
		&persistencemodel.ProviderAsset{},
		&persistencemodel.ProviderAssetModelCertification{},
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
		&persistencemodel.UserGroup{},
		&persistencemodel.UserGroupMember{},
		&persistencemodel.OrgInvitation{},
	}
	entities = editionCoreSchemaModels(entities)
	return append(entities, runtimeMigrationModels()...)
}
