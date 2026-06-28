package db

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestRegisteredMigrationsStartAtFormalBaseline(t *testing.T) {
	migrations := RegisteredMigrations()
	if len(migrations) == 0 {
		t.Fatal("expected registered migrations")
	}

	first := migrations[0]
	if first.Version != "000001" || first.Name != "baseline_schema" {
		t.Fatalf("first migration = %s_%s, want 000001_baseline_schema", first.Version, first.Name)
	}

	seen := map[string]bool{}
	previous := ""
	for _, migration := range migrations {
		if migration.Version == "" {
			t.Fatalf("migration has empty version: %#v", migration)
		}
		if migration.Name == "" {
			t.Fatalf("migration %s has empty name", migration.Version)
		}
		if migration.Up == nil {
			t.Fatalf("migration %s_%s has nil Up function", migration.Version, migration.Name)
		}
		if seen[migration.Version] {
			t.Fatalf("duplicate migration version %s", migration.Version)
		}
		if previous != "" && migration.Version <= previous {
			t.Fatalf("migrations must be strictly ordered: %s before %s", previous, migration.Version)
		}
		if strings.Contains(migration.Name, "legacy") || strings.Contains(migration.Name, "backfill") {
			t.Fatalf("formal baseline must not keep development migration name %q", migration.Name)
		}
		seen[migration.Version] = true
		previous = migration.Version
	}
}

func TestMigrationChecksumIsStable(t *testing.T) {
	migration := Migration{Version: "000123", Name: "example"}

	first := migrationChecksum(migration)
	second := migrationChecksum(migration)

	if first == "" {
		t.Fatal("expected checksum")
	}
	if first != second {
		t.Fatalf("expected stable checksum, got %q and %q", first, second)
	}
}

func TestRunMigrationsInitializesFormalBaselineSchema(t *testing.T) {
	db := testutil.OpenSQLite(t, "formal_baseline.db")

	pending, err := PendingMigrations(db)
	if err != nil {
		t.Fatalf("PendingMigrations() before run error = %v", err)
	}
	if len(pending) == 0 {
		t.Fatal("expected pending baseline migration before initialization")
	}

	if err := RunMigrations(db); err != nil {
		t.Fatalf("RunMigrations() error = %v", err)
	}

	var records []AppliedMigration
	if err := db.Order("version asc").Find(&records).Error; err != nil {
		t.Fatalf("load applied migrations: %v", err)
	}
	if len(records) != len(RegisteredMigrations()) {
		t.Fatalf("applied migration count = %d, want %d", len(records), len(RegisteredMigrations()))
	}
	if records[0].Version != "000001" || records[0].Name != "baseline_schema" {
		t.Fatalf("first applied migration = %s_%s, want 000001_baseline_schema", records[0].Version, records[0].Name)
	}

	for _, table := range []any{
		&model.Project{},
		&model.ProjectDataSpace{},
		&model.ProjectDataDecisionContext{},
		&model.AICredential{},
		&model.AIProvider{},
		&model.AIProviderCredential{},
		&model.AIModelCatalogEntry{},
		&model.AIModelRouteBinding{},
		&model.UsageLog{},
		&model.LLMCallLog{},
		&model.ResourceBlob{},
		&model.RawResource{},
		&model.MediaStreamArtifact{},
		&model.Job{},
		&model.GatewayAPIKey{},
		&model.Organization{},
	} {
		if !db.Migrator().HasTable(table) {
			t.Fatalf("expected table for %T", table)
		}
	}
	if db.Migrator().HasTable("users") {
		t.Fatal("data-service baseline must not create local users table; identity authority belongs to auth-service")
	}

	for _, index := range []string{
		"idx_jobs_runner_ready",
		"idx_jobs_runner_stale",
		rawResourcePersonalNameUniqueIndex,
		rawResourceTeamNameUniqueIndex,
		activeModelRouteBindingUniqueIndex,
		activeModelCatalogEntryUniqueIndex,
	} {
		if !hasSQLiteIndex(db, index) {
			t.Fatalf("expected baseline index %q to exist", index)
		}
	}
	routeIndexSQL := sqliteIndexSQL(t, db, activeModelRouteBindingUniqueIndex)
	if !strings.Contains(routeIndexSQL, "provider_model_id") || strings.Contains(routeIndexSQL, "source_type") {
		t.Fatalf("route unique index sql = %q, want provider_model_id and no source_type", routeIndexSQL)
	}

	for _, column := range []string{
		"pricing_mode",
		"credits_input_per_1m",
		"credits_output_per_1m",
		"pricing_json",
	} {
		if db.Migrator().HasColumn(&model.AIModelCatalogEntry{}, column) {
			t.Fatalf("unexpected baseline model catalog column %q", column)
		}
	}
	for _, column := range []string{
		"model_template_key",
		"template_version",
		"param_limits_json",
		"model_capabilities_json",
	} {
		if !db.Migrator().HasColumn(&model.AIModelCatalogEntry{}, column) {
			t.Fatalf("expected baseline model catalog column %q", column)
		}
	}
	for _, column := range []string{
		"combo_template_key",
		"template_version",
		"endpoint_base_url",
		"endpoint_path_prefix",
		"endpoint_mode",
		"operation_profile",
		"route_capabilities_json",
	} {
		if !db.Migrator().HasColumn(&model.AIModelRouteBinding{}, column) {
			t.Fatalf("expected baseline route binding column %q", column)
		}
	}

	pending, err = PendingMigrations(db)
	if err != nil {
		t.Fatalf("PendingMigrations() after run error = %v", err)
	}
	if len(pending) != 0 {
		t.Fatalf("pending migrations after baseline = %v", pending)
	}
}

func TestMigrateModelRouteTemplateMetadataAddsColumns(t *testing.T) {
	db := testutil.OpenSQLite(t, "model-route-template-metadata.db")
	if err := db.Exec(`
		CREATE TABLE ai_model_catalog_entries (
			id integer primary key autoincrement,
			created_at datetime,
			updated_at datetime,
			deleted_at datetime,
			public_model_id text,
			display_name text,
			short_name text,
			is_enabled numeric,
			capabilities text,
			accepts_image numeric,
			max_input_images integer,
			max_input_videos integer,
			image_edit_field text,
			supported_params text
		)
	`).Error; err != nil {
		t.Fatalf("create legacy catalog table: %v", err)
	}
	if err := db.Exec(`
		CREATE TABLE ai_model_route_bindings (
			id integer primary key autoincrement,
			created_at datetime,
			updated_at datetime,
			deleted_at datetime,
			catalog_entry_id integer,
			source_type text,
			route_group text,
			provider_id text,
			provider_model_id text,
			api_kinds text,
			credential_id integer,
			is_enabled numeric,
			priority integer,
			capacity_weight integer,
			max_concurrency integer
		)
	`).Error; err != nil {
		t.Fatalf("create legacy route table: %v", err)
	}
	if err := migrateModelRouteTemplateMetadata(db); err != nil {
		t.Fatalf("migrateModelRouteTemplateMetadata() error = %v", err)
	}
	for _, column := range []string{"model_template_key", "template_version", "param_limits_json", "model_capabilities_json"} {
		if !db.Migrator().HasColumn(&model.AIModelCatalogEntry{}, column) {
			t.Fatalf("expected migrated model catalog column %q", column)
		}
	}
	for _, column := range []string{"combo_template_key", "template_version", "endpoint_base_url", "endpoint_path_prefix", "endpoint_mode", "operation_profile", "route_capabilities_json"} {
		if !db.Migrator().HasColumn(&model.AIModelRouteBinding{}, column) {
			t.Fatalf("expected migrated route binding column %q", column)
		}
	}
}

func TestMigrateProviderSemanticsAndRouteAdapterTypeAddsColumns(t *testing.T) {
	db := testutil.OpenSQLite(t, "provider-semantics-route-adapter.db")
	if err := db.Exec(`
		CREATE TABLE ai_model_route_bindings (
			id integer primary key autoincrement,
			created_at datetime,
			updated_at datetime,
			deleted_at datetime,
			catalog_entry_id integer,
			source_type text,
			route_group text,
			provider_id text,
			provider_model_id text,
			api_kinds text,
			credential_id integer,
			is_enabled numeric,
			priority integer,
			capacity_weight integer,
			max_concurrency integer
		)
	`).Error; err != nil {
		t.Fatalf("create legacy route table: %v", err)
	}
	if err := db.Exec(`
		CREATE TABLE a_iproviders (
			id integer primary key autoincrement,
			created_at datetime,
			updated_at datetime,
			deleted_at datetime,
			provider_id text NOT NULL,
			provider_kind text NOT NULL,
			provider_category text NOT NULL,
			adapter_key text NOT NULL,
			template_version text,
			display_name text NOT NULL,
			org_id integer,
			base_url_prefix text,
			account_ref text,
			asset_library_state_json text,
			trusted_resource_state_json text,
			health_json text,
			is_enabled numeric
		)
	`).Error; err != nil {
		t.Fatalf("create legacy provider table: %v", err)
	}
	if err := db.Exec(`
		INSERT INTO a_iproviders (
			provider_id, provider_kind, provider_category, adapter_key, template_version, display_name,
			base_url_prefix, account_ref, asset_library_state_json, trusted_resource_state_json, health_json, is_enabled
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		"volcen:1",
		model.AIProviderKindVolcengineArk,
		model.AIProviderCategoryOfficialPlatform,
		"volcen",
		"builtin.v1",
		"Ark",
		"https://ark.cn-beijing.volces.com/api/v3",
		"",
		"{}",
		"{}",
		"{}",
		true,
	).Error; err != nil {
		t.Fatalf("insert legacy provider: %v", err)
	}

	if err := migrateProviderSemanticsAndRouteAdapterType(db); err != nil {
		t.Fatalf("migrateProviderSemanticsAndRouteAdapterType() error = %v", err)
	}

	for _, column := range []string{"adapter_type"} {
		if !db.Migrator().HasColumn(&model.AIModelRouteBinding{}, column) {
			t.Fatalf("expected migrated route binding column %q", column)
		}
	}
	for _, column := range []string{"provider_type", "profile", "default_adapter_type"} {
		if !db.Migrator().HasColumn(&model.AIProvider{}, column) {
			t.Fatalf("expected migrated provider column %q", column)
		}
	}
	var provider model.AIProvider
	if err := db.Where("provider_id = ?", "volcen:1").First(&provider).Error; err != nil {
		t.Fatalf("load migrated provider: %v", err)
	}
	if provider.ProviderType != model.AIProviderTypeVolcen ||
		provider.Profile != model.AIProviderProfileArk ||
		provider.DefaultAdapterType != "volcen" {
		t.Fatalf("unexpected migrated provider semantics: %+v", provider)
	}
}

func TestRunMigrationsRejectsDevelopmentBaselineChecksum(t *testing.T) {
	db := testutil.OpenSQLite(t, "development_checksum.db", &AppliedMigration{})
	developmentBaseline := Migration{Version: "000001", Name: "create_schema"}
	if err := db.Create(&AppliedMigration{
		Version:   developmentBaseline.Version,
		Name:      developmentBaseline.Name,
		Checksum:  migrationChecksum(developmentBaseline),
		AppliedAt: time.Now().UTC(),
	}).Error; err != nil {
		t.Fatalf("insert development migration record: %v", err)
	}

	err := RunMigrations(db)
	if err == nil {
		t.Fatal("RunMigrations() succeeded for development baseline checksum, want mismatch")
	}
	if !strings.Contains(err.Error(), "checksum mismatch") {
		t.Fatalf("RunMigrations() error = %v, want checksum mismatch", err)
	}
}

func TestMigrateRouteProviderModelIDBackfillsLegacySQLiteCatalogColumn(t *testing.T) {
	db := testutil.OpenSQLite(t, "legacy-provider-model-id.db")
	if err := db.AutoMigrate(&legacyModelCatalogEntryForMigration{}, &model.AIModelRouteBinding{}); err != nil {
		t.Fatalf("create legacy schema: %v", err)
	}
	entry := legacyModelCatalogEntryForMigration{
		PublicModelID:   "gpt-5.2",
		ProviderModelID: "gpt-5.2-upstream",
		DisplayName:     "GPT 5.2",
		IsEnabled:       true,
		Capabilities:    "text",
		SupportedParams: "",
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create legacy catalog entry: %v", err)
	}
	route := model.AIModelRouteBinding{
		CatalogEntryID: entry.ID,
		SourceType:     model.ModelRouteSourceLocalProvider,
		IsEnabled:      true,
	}
	if err := db.Create(&route).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}

	if err := migrateRouteProviderModelID(db); err != nil {
		t.Fatalf("migrateRouteProviderModelID() error = %v", err)
	}

	var updated model.AIModelRouteBinding
	if err := db.First(&updated, route.ID).Error; err != nil {
		t.Fatalf("load route binding: %v", err)
	}
	if updated.ProviderModelID != "gpt-5.2-upstream" {
		t.Fatalf("ProviderModelID = %q, want legacy provider model id backfilled", updated.ProviderModelID)
	}
	if !db.Migrator().HasColumn("ai_model_catalog_entries", "provider_model_id") {
		t.Fatal("expected SQLite migration to leave legacy catalog provider_model_id column in place")
	}
}

func TestMigrateRemoveCanvasProjectIDDropsLegacyColumn(t *testing.T) {
	db := testutil.OpenSQLite(t, "remove-canvas-project-id.db")
	if err := db.Exec(`
		CREATE TABLE canvases (
			id integer PRIMARY KEY AUTOINCREMENT,
			created_at datetime,
			updated_at datetime,
			deleted_at datetime,
			project_id integer,
			owner_id integer NOT NULL,
			name text NOT NULL,
			description text,
			canvas_type text,
			stage text,
			visibility text,
			workflow_key text,
			workflow_tags text,
			published_at datetime
		)
	`).Error; err != nil {
		t.Fatalf("create legacy canvases table: %v", err)
	}
	if !db.Migrator().HasColumn("canvases", "project_id") {
		t.Fatal("legacy schema should have project_id")
	}

	if err := migrateRemoveCanvasProjectID(db); err != nil {
		t.Fatalf("migrateRemoveCanvasProjectID() error = %v", err)
	}
	if db.Migrator().HasColumn("canvases", "project_id") {
		t.Fatal("expected project_id to be removed")
	}
	if !db.Migrator().HasColumn("canvases", "owner_id") {
		t.Fatal("expected existing canvas columns to remain")
	}
}

func TestRunMigrationsAddsRawResourceProviderAssetCertificationsToExistingSchema(t *testing.T) {
	db := testutil.OpenSQLite(t, "provider-asset-certifications-migration.db", &AppliedMigration{})
	if err := db.Exec(`
		CREATE TABLE raw_resources (
			id integer PRIMARY KEY AUTOINCREMENT,
			created_at datetime,
			updated_at datetime,
			deleted_at datetime,
			owner_id integer NOT NULL,
			type text NOT NULL,
			name text NOT NULL,
			file_path text NOT NULL,
			cloud_uploads text DEFAULT '{}'
		)
	`).Error; err != nil {
		t.Fatalf("create legacy raw_resources table: %v", err)
	}
	for _, migration := range RegisteredMigrations() {
		if migration.Version >= "000005" {
			continue
		}
		if err := db.Create(&AppliedMigration{
			Version:   migration.Version,
			Name:      migration.Name,
			Checksum:  migrationChecksum(migration),
			AppliedAt: time.Now().UTC(),
		}).Error; err != nil {
			t.Fatalf("insert applied migration %s: %v", migration.Version, err)
		}
	}
	if db.Migrator().HasColumn(&model.RawResource{}, "provider_asset_certifications") {
		t.Fatal("legacy schema unexpectedly has provider_asset_certifications")
	}

	if err := RunMigrations(db); err != nil {
		t.Fatalf("RunMigrations() error = %v", err)
	}
	if !db.Migrator().HasColumn(&model.RawResource{}, "provider_asset_certifications") {
		t.Fatal("expected provider_asset_certifications column after migration")
	}
}

func TestRunMigrationsAddsRawResourceProviderGeneratedArtifactToExistingSchema(t *testing.T) {
	db := testutil.OpenSQLite(t, "provider-generated-artifact-migration.db", &AppliedMigration{})
	if err := db.Exec(`
		CREATE TABLE raw_resources (
			id integer PRIMARY KEY AUTOINCREMENT,
			created_at datetime,
			updated_at datetime,
			deleted_at datetime,
			owner_id integer NOT NULL,
			type text NOT NULL,
			name text NOT NULL,
			file_path text NOT NULL,
			cloud_uploads text DEFAULT '{}',
			provider_asset_certifications text NOT NULL DEFAULT '{}'
		)
	`).Error; err != nil {
		t.Fatalf("create legacy raw_resources table: %v", err)
	}
	for _, migration := range RegisteredMigrations() {
		if migration.Version >= "000006" {
			continue
		}
		if err := db.Create(&AppliedMigration{
			Version:   migration.Version,
			Name:      migration.Name,
			Checksum:  migrationChecksum(migration),
			AppliedAt: time.Now().UTC(),
		}).Error; err != nil {
			t.Fatalf("insert applied migration %s: %v", migration.Version, err)
		}
	}
	if db.Migrator().HasColumn(&model.RawResource{}, "provider_generated_artifact") {
		t.Fatal("legacy schema unexpectedly has provider_generated_artifact")
	}

	if err := RunMigrations(db); err != nil {
		t.Fatalf("RunMigrations() error = %v", err)
	}
	if !db.Migrator().HasColumn(&model.RawResource{}, "provider_generated_artifact") {
		t.Fatal("expected provider_generated_artifact column after migration")
	}
}

func TestRunMigrationsAddsProviderAssetLibraryReadModel(t *testing.T) {
	db := testutil.OpenSQLite(t, "provider-asset-read-model-migration.db", &AppliedMigration{})
	for _, migration := range RegisteredMigrations() {
		if migration.Version >= "000014" {
			continue
		}
		if err := db.Create(&AppliedMigration{
			Version:   migration.Version,
			Name:      migration.Name,
			Checksum:  migrationChecksum(migration),
			AppliedAt: time.Now().UTC(),
		}).Error; err != nil {
			t.Fatalf("insert applied migration %s: %v", migration.Version, err)
		}
	}
	if db.Migrator().HasTable(&model.ProviderAssetGroup{}) ||
		db.Migrator().HasTable(&model.ProviderAsset{}) ||
		db.Migrator().HasTable(&model.ProviderAssetModelCertification{}) {
		t.Fatal("provider asset read model tables should not exist before migration")
	}

	if err := RunMigrations(db); err != nil {
		t.Fatalf("RunMigrations() error = %v", err)
	}
	for _, entity := range []any{
		&model.ProviderAssetGroup{},
		&model.ProviderAsset{},
		&model.ProviderAssetModelCertification{},
	} {
		if !db.Migrator().HasTable(entity) {
			t.Fatalf("expected table for %T", entity)
		}
	}
}

func TestMigrateAIProviderInstancesBackfillsLegacyCredentials(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-provider-instance-migration.db")
	if err := db.AutoMigrate(&model.AICredential{}); err != nil {
		t.Fatalf("create legacy credential schema: %v", err)
	}
	credential := model.AICredential{
		AdapterType:          "volcen",
		DisplayName:          "Ark Production",
		BaseURL:              "https://ark.cn-beijing.volces.com/api/v3",
		EncryptedKey:         "encrypted-aksk",
		IsEnabled:            true,
		FilesAPIEnabled:      true,
		FilesAPIBaseURL:      "https://ark.cn-beijing.volces.com/api/v3/files",
		FilesAPIEncryptedKey: "encrypted-files-key",
	}
	if err := db.Create(&credential).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}

	if err := migrateAIProviderInstances(db); err != nil {
		t.Fatalf("migrateAIProviderInstances() error = %v", err)
	}

	providerID := legacyMirrorProviderIDForCredential(credential)
	var provider model.AIProvider
	if err := db.Where("provider_id = ?", providerID).First(&provider).Error; err != nil {
		t.Fatalf("load provider: %v", err)
	}
	if provider.ProviderKind != model.AIProviderKindVolcengineArk ||
		provider.ProviderCategory != model.AIProviderCategoryOfficialPlatform ||
		provider.AdapterKey != "volcen" ||
		provider.BaseURLPrefix != credential.BaseURL ||
		!provider.IsEnabled {
		t.Fatalf("unexpected provider backfill: %#v", provider)
	}

	var providerCredential model.AIProviderCredential
	if err := db.Where("provider_id = ? AND credential_key = ?", providerID, "primary").First(&providerCredential).Error; err != nil {
		t.Fatalf("load provider credential: %v", err)
	}
	if providerCredential.Status != model.AIProviderCredentialStatusActive || !providerCredential.IsPrimary {
		t.Fatalf("unexpected provider credential state: %#v", providerCredential)
	}
	var plainConfig struct {
		LegacyCredentialID uint `json:"legacy_credential_id"`
		FilesAPIEnabled    bool `json:"files_api_enabled"`
	}
	if err := json.Unmarshal([]byte(providerCredential.PlainConfigJSON), &plainConfig); err != nil {
		t.Fatalf("unmarshal plain config: %v", err)
	}
	if plainConfig.LegacyCredentialID != credential.ID || !plainConfig.FilesAPIEnabled {
		t.Fatalf("plain config = %#v, want legacy credential id %d and files api enabled", plainConfig, credential.ID)
	}
}

func TestMigrateNormalizeLegacyAIProviderIDsRekeysLocalProviderMirror(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-provider-id-normalization.db")
	if err := db.AutoMigrate(&model.AICredential{}, &model.AIProvider{}, &model.AIProviderCredential{}, &model.AIModelCatalogEntry{}, &model.AIModelRouteBinding{}); err != nil {
		t.Fatalf("create schema: %v", err)
	}
	credential := model.AICredential{
		AdapterType:  "volcen",
		DisplayName:  "Ark Production",
		BaseURL:      "https://ark.cn-beijing.volces.com/api/v3",
		EncryptedKey: "encrypted-aksk",
		IsEnabled:    true,
	}
	if err := db.Create(&credential).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	legacyProviderID := legacyProviderIDForCredential(credential.ID)
	mirrorProviderID := legacyMirrorProviderIDForCredential(credential)
	if err := db.Create(&model.AIProvider{
		ProviderID:               legacyProviderID,
		ProviderKind:             model.AIProviderKindVolcengineArk,
		ProviderCategory:         model.AIProviderCategoryOfficialPlatform,
		AdapterKey:               "volcen",
		TemplateVersion:          "builtin.v1",
		DisplayName:              "Legacy local provider",
		BaseURLPrefix:            credential.BaseURL,
		AssetLibraryStateJSON:    "{}",
		TrustedResourceStateJSON: "{}",
		HealthJSON:               "{}",
		IsEnabled:                true,
	}).Error; err != nil {
		t.Fatalf("create legacy provider: %v", err)
	}
	if err := db.Create(&model.AIProviderCredential{
		ProviderID:           legacyProviderID,
		CredentialKey:        "primary",
		CredentialKind:       "ak_sk",
		SchemaVersion:        "legacy.ai_credentials.v1",
		EncryptedSecretsJSON: encryptedSecretsJSONForCredential(credential),
		MaskedSecretsJSON:    maskedSecretsJSONForCredential(credential),
		PlainConfigJSON:      plainConfigJSONForCredential(credential),
		Status:               model.AIProviderCredentialStatusActive,
		IsPrimary:            true,
		HealthJSON:           "{}",
	}).Error; err != nil {
		t.Fatalf("create legacy provider credential: %v", err)
	}
	entry := model.AIModelCatalogEntry{
		PublicModelID: "seedance-2-0",
		DisplayName:   "Seedance 2.0",
		IsEnabled:     true,
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	route := model.AIModelRouteBinding{
		CatalogEntryID:  entry.ID,
		SourceType:      model.ModelRouteSourceLocalProvider,
		RouteGroup:      "default",
		ProviderID:      legacyProviderID,
		ProviderModelID: "doubao-seedance-2-0-260128",
		IsEnabled:       true,
		CapacityWeight:  1,
	}
	if err := db.Create(&route).Error; err != nil {
		t.Fatalf("create route: %v", err)
	}

	if err := migrateNormalizeLegacyAIProviderIDs(db); err != nil {
		t.Fatalf("migrateNormalizeLegacyAIProviderIDs() error = %v", err)
	}

	var provider model.AIProvider
	if err := db.Where("provider_id = ?", mirrorProviderID).First(&provider).Error; err != nil {
		t.Fatalf("load normalized provider: %v", err)
	}
	if provider.ProviderKind != model.AIProviderKindVolcengineArk || provider.AdapterKey != "volcen" {
		t.Fatalf("normalized provider = %#v", provider)
	}
	var updatedRoute model.AIModelRouteBinding
	if err := db.First(&updatedRoute, route.ID).Error; err != nil {
		t.Fatalf("load normalized route: %v", err)
	}
	if updatedRoute.ProviderID != mirrorProviderID {
		t.Fatalf("route provider_id = %q, want %q", updatedRoute.ProviderID, mirrorProviderID)
	}
	var oldProvider model.AIProvider
	if err := db.Unscoped().Where("provider_id = ?", legacyProviderID).First(&oldProvider).Error; err != nil {
		t.Fatalf("load old provider: %v", err)
	}
	if !oldProvider.DeletedAt.Valid {
		t.Fatalf("old provider %q was not soft-deleted", legacyProviderID)
	}
}

type legacyModelCatalogEntryForMigration struct {
	gorm.Model
	PublicModelID   string
	DisplayName     string
	ShortName       string
	IsEnabled       bool
	Capabilities    string
	PricingMode     string
	ProviderModelID string `gorm:"column:provider_model_id"`
	SupportedParams string
}

func (legacyModelCatalogEntryForMigration) TableName() string {
	return "ai_model_catalog_entries"
}

func hasSQLiteIndex(db *gorm.DB, name string) bool {
	var count int64
	return db.Raw(`SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = ?`, name).Scan(&count).Error == nil && count > 0
}

func sqliteIndexSQL(t *testing.T, db *gorm.DB, name string) string {
	t.Helper()
	var sql string
	if err := db.Raw(`SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?`, name).Scan(&sql).Error; err != nil {
		t.Fatalf("read sqlite index %q: %v", name, err)
	}
	return sql
}
