package db

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	orgapp "github.com/movscript/movscript/internal/app/org"
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
			Name:    "create_schema",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(allModels()...)
			},
		},
		{
			Version: "000002",
			Name:    "add_organization_support",
			Up: func(db *gorm.DB) error {
				models := []any{
					&persistencemodel.Organization{},
					&persistencemodel.OrganizationMember{},
					&persistencemodel.UserGroup{},
					&persistencemodel.UserGroupMember{},
					&persistencemodel.OrgInvitation{},
					&persistencemodel.Project{},
					&persistencemodel.ResourceFolder{},
					&persistencemodel.GatewayAPIKey{},
					&persistencemodel.UsageLog{},
					&persistencemodel.UsageReservation{},
					&persistencemodel.AuditLog{},
				}
				if legacyAIProviderSchemaEnabled() {
					models = append(models, &persistencemodel.AICredential{})
				}
				models = append(models, runtimeMigrationModels()...)
				if err := db.AutoMigrate(models...); err != nil {
					return err
				}
				return seedDefaultOrg(db)
			},
		},
		{
			Version: "000003",
			Name:    "decouple_segments_from_script_versions",
			Up: func(db *gorm.DB) error {
				return nil
			},
		},
		{
			Version: "000004",
			Name:    "legacy_noop_000004",
			Up: func(db *gorm.DB) error {
				return nil
			},
		},
		{
			Version: "000005",
			Name:    "add_self_hosted_auth",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(&persistencemodel.User{}, &persistencemodel.AuthSession{}, &persistencemodel.AuthChallenge{})
			},
		},
		{
			Version: "000006",
			Name:    "add_hub_packages",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(&persistencemodel.HubPackage{})
			},
		},
		{
			Version: "000007",
			Name:    "add_org_join_codes",
			Up: func(db *gorm.DB) error {
				if err := db.AutoMigrate(&persistencemodel.Organization{}); err != nil {
					return err
				}
				var orgs []persistencemodel.Organization
				if err := db.Where("is_personal = ? AND (join_code = ? OR join_code IS NULL)", false, "").Find(&orgs).Error; err != nil {
					return err
				}
				for i := range orgs {
					if err := orgapp.EnsureJoinCode(db, &orgs[i]); err != nil {
						return err
					}
				}
				return nil
			},
		},
		{
			Version: "000008",
			Name:    "add_jobrunner_leases",
			Up: func(db *gorm.DB) error {
				if err := db.AutoMigrate(&persistencemodel.Job{}); err != nil {
					return err
				}
				return createJobRunnerIndexes(db)
			},
		},
		{
			Version: "000009",
			Name:    "legacy_noop_000009",
			Up: func(db *gorm.DB) error {
				return nil
			},
		},
		{
			Version: "000010",
			Name:    "legacy_noop_000010",
			Up: func(db *gorm.DB) error {
				return nil
			},
		},
		{
			Version: "000011",
			Name:    "rename_ai_model_config_pricing_mode",
			Up: func(db *gorm.DB) error {
				return renameAIModelConfigPricingModeColumn(db)
			},
		},
		{
			Version: "000012",
			Name:    "add_raw_resource_image_verification",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(&persistencemodel.RawResource{})
			},
		},
		{
			Version: "000013",
			Name:    "add_job_title",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(&persistencemodel.Job{})
			},
		},
		{
			Version: "000014",
			Name:    "add_project_global_style",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(&persistencemodel.Project{})
			},
		},
		{
			Version: "000015",
			Name:    "legacy_noop_000015",
			Up: func(db *gorm.DB) error {
				return nil
			},
		},
		{
			Version: "000016",
			Name:    "legacy_noop_000016",
			Up: func(db *gorm.DB) error {
				return nil
			},
		},
		{
			Version: "000017",
			Name:    "legacy_noop_000017",
			Up: func(db *gorm.DB) error {
				return nil
			},
		},
		{
			Version: "000020",
			Name:    "legacy_noop_000020",
			Up: func(db *gorm.DB) error {
				return nil
			},
		},
		{
			Version: "000021",
			Name:    "legacy_noop_000021",
			Up: func(db *gorm.DB) error {
				return nil
			},
		},
		{
			Version: "000022",
			Name:    "backfill_current_schema_tables",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(currentSchemaBackfillModels()...)
			},
		},
		{
			Version: "000023",
			Name:    "legacy_noop_000023",
			Up: func(db *gorm.DB) error {
				return nil
			},
		},
		{
			Version: "000024",
			Name:    "add_ai_model_capacity_config",
			Up: func(db *gorm.DB) error {
				if !legacyAIProviderSchemaEnabled() && !db.Migrator().HasTable(&persistencemodel.AIModelConfig{}) {
					return nil
				}
				return db.AutoMigrate(&persistencemodel.AIModelConfig{})
			},
		},
		{
			Version: "000025",
			Name:    "add_llm_call_logs",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(&persistencemodel.LLMCallLog{})
			},
		},
		{
			Version: "000026",
			Name:    "legacy_noop_000026",
			Up: func(db *gorm.DB) error {
				return nil
			},
		},
		{
			Version: "000027",
			Name:    "legacy_noop_000027",
			Up: func(db *gorm.DB) error {
				return nil
			},
		},
		{
			Version: "000028",
			Name:    "legacy_noop_000028",
			Up: func(db *gorm.DB) error {
				return nil
			},
		},
		{
			Version: "000029",
			Name:    "legacy_noop_000029",
			Up: func(db *gorm.DB) error {
				return nil
			},
		},
		{
			Version: "000030",
			Name:    "backfill_cached_input_token_columns",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(&persistencemodel.UsageLog{}, &persistencemodel.LLMCallLog{})
			},
		},
		{
			Version: "000031",
			Name:    "add_shot_reference_library",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(&persistencemodel.ShotReferenceGroup{}, &persistencemodel.ShotReference{})
			},
		},
		{
			Version: "000032",
			Name:    "enforce_unique_resource_filenames",
			Up: func(db *gorm.DB) error {
				if err := backfillUniqueRawResourceNames(db); err != nil {
					return err
				}
				return createRawResourceNameUniqueIndexes(db)
			},
		},
		{
			Version: "000033",
			Name:    "add_shot_reference_groups",
			Up: func(db *gorm.DB) error {
				return migrateShotReferenceGroups(db)
			},
		},
		{
			Version: "000034",
			Name:    "add_resource_blobs",
			Up: func(db *gorm.DB) error {
				if err := db.AutoMigrate(&persistencemodel.ResourceBlob{}, &persistencemodel.RawResource{}); err != nil {
					return err
				}
				return backfillLegacyResourceBlobs(db)
			},
		},
		{
			Version: "000035",
			Name:    "add_external_resource_sources",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(&persistencemodel.ExternalResourceSource{})
			},
		},
		{
			Version: "000036",
			Name:    "add_professional_shot_reference_schema",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(&persistencemodel.ShotReference{})
			},
		},
		{
			Version: "000037",
			Name:    "add_shot_vector_documents",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(&persistencemodel.ShotVectorDocument{})
			},
		},
		{
			Version: "000038",
			Name:    "drop_feature_configs_after_convergence",
			Up: func(db *gorm.DB) error {
				return dropFeatureConfigsTable(db)
			},
		},
		{
			Version: "000039",
			Name:    "legacy_noop_000039",
			Up: func(db *gorm.DB) error {
				return nil
			},
		},
		{
			Version: "000040",
			Name:    "add_project_repository_bindings",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(&persistencemodel.ProjectRepository{})
			},
		},
		{
			Version: "000041",
			Name:    "add_user_git_credentials",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(&persistencemodel.UserGitCredential{})
			},
		},
		{
			Version: "000042",
			Name:    "add_decision_contexts",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(&persistencemodel.DecisionContext{})
			},
		},
		{
			Version: "000043",
			Name:    "add_resource_derivatives",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(&persistencemodel.ResourceDerivative{})
			},
		},
		{
			Version: "000044",
			Name:    "add_model_catalog_and_route_bindings",
			Up: func(db *gorm.DB) error {
				if err := db.AutoMigrate(&persistencemodel.AIModelCatalogEntry{}, &persistencemodel.AIModelRouteBinding{}); err != nil {
					return err
				}
				return backfillModelCatalogFromLocalProviderConfigs(db)
			},
		},
		{
			Version: "000045",
			Name:    "add_usage_model_catalog_entry_refs",
			Up: func(db *gorm.DB) error {
				if err := db.AutoMigrate(&persistencemodel.UsageLog{}, &persistencemodel.UsageReservation{}); err != nil {
					return err
				}
				return backfillUsageModelCatalogEntryRefs(db)
			},
		},
		{
			Version: "000046",
			Name:    "add_job_route_group",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(&persistencemodel.Job{})
			},
		},
		{
			Version: "000047",
			Name:    "enforce_unique_active_model_route_bindings",
			Up: func(db *gorm.DB) error {
				return enforceUniqueActiveModelRouteBindings(db)
			},
		},
		{
			Version: "000048",
			Name:    "rename_gateway_api_key_model_allowlist_to_catalog_entries",
			Up: func(db *gorm.DB) error {
				return renameGatewayAPIKeyAllowlistColumn(db)
			},
		},
		{
			Version: "000049",
			Name:    "add_media_stream_artifacts",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(&persistencemodel.MediaStreamArtifact{})
			},
		},
		{
			Version: "000050",
			Name:    "enforce_unique_active_model_catalog_entries",
			Up: func(db *gorm.DB) error {
				return enforceUniqueActiveModelCatalogEntries(db)
			},
		},
		{
			Version: "000051",
			Name:    "scope_model_route_binding_unique_index_by_credential",
			Up: func(db *gorm.DB) error {
				return replaceModelRouteBindingUniqueIndexWithCredentialScope(db)
			},
		},
		{
			Version: "000052",
			Name:    "add_job_model_catalog_entry_refs",
			Up: func(db *gorm.DB) error {
				if err := db.AutoMigrate(&persistencemodel.Job{}); err != nil {
					return err
				}
				return backfillJobModelCatalogEntryRefs(db)
			},
		},
		{
			Version: "000053",
			Name:    "add_usage_route_binding_refs",
			Up: func(db *gorm.DB) error {
				if err := addUsageRouteBindingRefColumns(db); err != nil {
					return err
				}
				return backfillUsageRouteBindingRefs(db)
			},
		},
	}
	return append(core, editionMigrations()...)
}

func renameAIModelConfigPricingModeColumn(db *gorm.DB) error {
	migrator := db.Migrator()
	if !migrator.HasTable(&persistencemodel.AIModelConfig{}) {
		if !legacyAIProviderSchemaEnabled() {
			return nil
		}
		return db.AutoMigrate(&persistencemodel.AIModelConfig{})
	}
	if !migrator.HasColumn(&persistencemodel.AIModelConfig{}, "custom_billing_mode") {
		return nil
	}
	if !migrator.HasColumn(&persistencemodel.AIModelConfig{}, "custom_pricing_mode") {
		if err := migrator.RenameColumn(&persistencemodel.AIModelConfig{}, "custom_billing_mode", "custom_pricing_mode"); err != nil {
			return fmt.Errorf("rename ai_model_configs.custom_billing_mode: %w", err)
		}
		return nil
	}
	if err := db.Exec(`UPDATE ai_model_configs SET custom_pricing_mode = custom_billing_mode WHERE COALESCE(custom_pricing_mode, '') = '' AND COALESCE(custom_billing_mode, '') <> ''`).Error; err != nil {
		return fmt.Errorf("copy ai_model_configs pricing mode: %w", err)
	}
	if err := migrator.DropColumn(&persistencemodel.AIModelConfig{}, "custom_billing_mode"); err != nil {
		return fmt.Errorf("drop ai_model_configs.custom_billing_mode: %w", err)
	}
	if migrator.HasColumn(&persistencemodel.AIModelConfig{}, "custom_billing_mode") && db.Dialector.Name() == "sqlite" {
		if err := db.Exec(`ALTER TABLE ai_model_configs DROP COLUMN custom_billing_mode`).Error; err != nil {
			return fmt.Errorf("drop ai_model_configs.custom_billing_mode with sqlite fallback: %w", err)
		}
	}
	if migrator.HasColumn(&persistencemodel.AIModelConfig{}, "custom_billing_mode") {
		return fmt.Errorf("drop ai_model_configs.custom_billing_mode: column still exists")
	}
	return nil
}

func renameGatewayAPIKeyAllowlistColumn(db *gorm.DB) error {
	migrator := db.Migrator()
	if !migrator.HasTable(&persistencemodel.GatewayAPIKey{}) {
		return db.AutoMigrate(&persistencemodel.GatewayAPIKey{})
	}
	hasLegacy := migrator.HasColumn(&persistencemodel.GatewayAPIKey{}, "allowed_model_ids")
	hasCatalog := migrator.HasColumn(&persistencemodel.GatewayAPIKey{}, "allowed_catalog_entry_ids")
	if !hasLegacy {
		if !hasCatalog {
			return db.AutoMigrate(&persistencemodel.GatewayAPIKey{})
		}
		return nil
	}
	if !hasCatalog {
		if err := migrator.RenameColumn(&persistencemodel.GatewayAPIKey{}, "allowed_model_ids", "allowed_catalog_entry_ids"); err != nil {
			return fmt.Errorf("rename gateway_api_keys.allowed_model_ids: %w", err)
		}
		return remapGatewayAPIKeyAllowlistToCatalogEntries(db)
	}
	if err := db.Exec(`UPDATE gateway_api_keys SET allowed_catalog_entry_ids = allowed_model_ids WHERE COALESCE(allowed_catalog_entry_ids, '') IN ('', '[]') AND COALESCE(allowed_model_ids, '') <> ''`).Error; err != nil {
		return fmt.Errorf("copy gateway api key catalog allowlist: %w", err)
	}
	if err := remapGatewayAPIKeyAllowlistToCatalogEntries(db); err != nil {
		return err
	}
	if err := migrator.DropColumn(&persistencemodel.GatewayAPIKey{}, "allowed_model_ids"); err != nil {
		return fmt.Errorf("drop gateway_api_keys.allowed_model_ids: %w", err)
	}
	if migrator.HasColumn(&persistencemodel.GatewayAPIKey{}, "allowed_model_ids") && db.Dialector.Name() == "sqlite" {
		if err := db.Exec(`ALTER TABLE gateway_api_keys DROP COLUMN allowed_model_ids`).Error; err != nil {
			return fmt.Errorf("drop gateway_api_keys.allowed_model_ids with sqlite fallback: %w", err)
		}
	}
	if migrator.HasColumn(&persistencemodel.GatewayAPIKey{}, "allowed_model_ids") {
		return fmt.Errorf("drop gateway_api_keys.allowed_model_ids: column still exists")
	}
	return nil
}

func remapGatewayAPIKeyAllowlistToCatalogEntries(db *gorm.DB) error {
	if !db.Migrator().HasTable(&persistencemodel.AIModelRouteBinding{}) {
		return nil
	}
	type apiKeyAllowlistRow struct {
		ID                     uint
		AllowedCatalogEntryIDs string
	}
	var rows []apiKeyAllowlistRow
	if err := db.Table("gateway_api_keys").
		Select("id, allowed_catalog_entry_ids").
		Where("COALESCE(allowed_catalog_entry_ids, '') NOT IN ('', '[]')").
		Find(&rows).Error; err != nil {
		return fmt.Errorf("list gateway api key catalog allowlists: %w", err)
	}
	for _, row := range rows {
		ids, changed, err := remapLocalModelConfigIDsToCatalogEntryIDs(db, row.AllowedCatalogEntryIDs)
		if err != nil {
			return fmt.Errorf("remap gateway api key %d allowlist: %w", row.ID, err)
		}
		if !changed {
			continue
		}
		body, err := json.Marshal(ids)
		if err != nil {
			return fmt.Errorf("marshal gateway api key %d catalog allowlist: %w", row.ID, err)
		}
		if err := db.Table("gateway_api_keys").Where("id = ?", row.ID).Update("allowed_catalog_entry_ids", string(body)).Error; err != nil {
			return fmt.Errorf("update gateway api key %d catalog allowlist: %w", row.ID, err)
		}
	}
	return nil
}

func remapLocalModelConfigIDsToCatalogEntryIDs(db *gorm.DB, raw string) ([]uint, bool, error) {
	var ids []uint
	if err := json.Unmarshal([]byte(strings.TrimSpace(raw)), &ids); err != nil {
		return nil, false, err
	}
	out := make([]uint, 0, len(ids))
	seen := map[uint]bool{}
	changed := false
	for _, id := range ids {
		mappedID := id
		var route struct {
			CatalogEntryID uint
		}
		err := db.Table("ai_model_route_bindings").
			Select("catalog_entry_id").
			Where("local_model_config_id = ? AND deleted_at IS NULL", id).
			Order("id ASC").
			Limit(1).
			Scan(&route).Error
		if err != nil {
			return nil, false, err
		}
		if route.CatalogEntryID != 0 {
			mappedID = route.CatalogEntryID
		}
		if mappedID != id {
			changed = true
		}
		if mappedID == 0 || seen[mappedID] {
			if mappedID != 0 {
				changed = true
			}
			continue
		}
		seen[mappedID] = true
		out = append(out, mappedID)
	}
	return out, changed, nil
}

func backfillModelCatalogFromLocalProviderConfigs(db *gorm.DB) error {
	if !db.Migrator().HasTable(&persistencemodel.AIModelConfig{}) {
		return nil
	}
	var rows []persistencemodel.AIModelConfig
	if err := db.Model(&persistencemodel.AIModelConfig{}).
		Where("ai_model_configs.deleted_at IS NULL").
		Order("ai_model_configs.id ASC").
		Scan(&rows).Error; err != nil {
		return err
	}
	for _, row := range rows {
		publicModelID := strings.TrimSpace(row.ModelDefID)
		providerModelID := firstNonEmptyString(row.ModelIDOverride, row.ModelDefID)
		if publicModelID == "" || providerModelID == "" {
			continue
		}
		entry := persistencemodel.AIModelCatalogEntry{
			PublicModelID:      publicModelID,
			ProviderModelID:    providerModelID,
			DisplayName:        firstNonEmptyString(row.CustomDisplayName, publicModelID),
			ShortName:          strings.TrimSpace(row.ShortName),
			IsEnabled:          row.IsEnabled,
			Capabilities:       defaultString(strings.TrimSpace(row.CustomCapabilities), "text"),
			PricingMode:        strings.TrimSpace(row.CustomPricingMode),
			AcceptsImage:       row.CustomAcceptsImage,
			MaxInputImages:     row.CustomMaxInputImages,
			MaxInputVideos:     row.CustomMaxInputVideos,
			ImageEditField:     strings.TrimSpace(row.CustomImageEditField),
			SupportedParams:    strings.TrimSpace(row.CustomSupportedParams),
			CreditsInputPer1M:  row.CreditsInputPer1M,
			CreditsOutputPer1M: row.CreditsOutputPer1M,
			CreditsPerImage:    row.CreditsPerImage,
			CreditsPerSecond:   row.CreditsPerSecond,
			CreditsPerCall:     row.CreditsPerCall,
		}
		if err := db.Where("public_model_id = ? AND provider_model_id = ?", entry.PublicModelID, entry.ProviderModelID).FirstOrCreate(&entry).Error; err != nil {
			return err
		}
		credentialID := row.CredentialID
		localConfigID := row.ID
		binding := persistencemodel.AIModelRouteBinding{
			CatalogEntryID:     entry.ID,
			SourceType:         persistencemodel.ModelRouteSourceLocalProvider,
			CredentialID:       &credentialID,
			IsEnabled:          row.IsEnabled,
			Priority:           row.Priority,
			CapacityWeight:     normalizePositiveInt(row.CapacityWeight, 1),
			MaxConcurrency:     row.MaxConcurrency,
			LocalModelConfigID: &localConfigID,
		}
		if err := db.Where("local_model_config_id = ?", localConfigID).FirstOrCreate(&binding).Error; err != nil {
			return err
		}
	}
	return nil
}

func backfillUsageModelCatalogEntryRefs(db *gorm.DB) error {
	if !db.Migrator().HasTable(&persistencemodel.AIModelCatalogEntry{}) {
		return nil
	}
	if err := backfillUsageModelCatalogEntryRef(db, "usage_logs"); err != nil {
		return err
	}
	return backfillUsageModelCatalogEntryRef(db, "usage_reservations")
}

func backfillJobModelCatalogEntryRefs(db *gorm.DB) error {
	if !db.Migrator().HasTable(&persistencemodel.AIModelCatalogEntry{}) {
		return nil
	}
	return backfillModelCatalogEntryRefColumn(db, "jobs", "model_config_id", "ai_model_catalog_entry_id")
}

func backfillUsageRouteBindingRefs(db *gorm.DB) error {
	if !db.Migrator().HasTable(&persistencemodel.AIModelRouteBinding{}) {
		return nil
	}
	for _, table := range []string{"usage_logs", "usage_reservations", "llm_call_logs"} {
		if err := backfillRouteBindingRefColumn(db, table, "ai_model_config_id", "route_binding_id"); err != nil {
			return err
		}
	}
	return nil
}

func addUsageRouteBindingRefColumns(db *gorm.DB) error {
	type columnTarget struct {
		table string
		model any
	}
	targets := []columnTarget{
		{table: "usage_logs", model: &persistencemodel.UsageLog{}},
		{table: "usage_reservations", model: &persistencemodel.UsageReservation{}},
		{table: "llm_call_logs", model: &persistencemodel.LLMCallLog{}},
	}
	migrator := db.Migrator()
	for _, target := range targets {
		if !migrator.HasTable(target.table) {
			continue
		}
		if migrator.HasColumn(target.table, "route_binding_id") {
			continue
		}
		if err := migrator.AddColumn(target.model, "RouteBindingID"); err != nil {
			return fmt.Errorf("add %s.route_binding_id: %w", target.table, err)
		}
	}
	return nil
}

func backfillUsageModelCatalogEntryRef(db *gorm.DB, table string) error {
	return backfillModelCatalogEntryRefColumn(db, table, "ai_model_config_id", "ai_model_catalog_entry_id")
}

func backfillRouteBindingRefColumn(db *gorm.DB, table string, legacyModelConfigColumn string, routeBindingColumn string) error {
	if !db.Migrator().HasTable(table) {
		return nil
	}
	if !db.Migrator().HasColumn(table, routeBindingColumn) {
		return nil
	}
	condition := fmt.Sprintf(`%s.%s IS NULL
		AND EXISTS (
			SELECT 1 FROM ai_model_route_bindings route_bindings
			WHERE route_bindings.local_model_config_id = %s.%s
				AND route_bindings.deleted_at IS NULL
		)`, table, routeBindingColumn, table, legacyModelConfigColumn)
	update := fmt.Sprintf(`UPDATE %s SET %s = (
		SELECT route_bindings.id
		FROM ai_model_route_bindings route_bindings
		WHERE route_bindings.local_model_config_id = %s.%s
			AND route_bindings.deleted_at IS NULL
		ORDER BY route_bindings.id ASC
		LIMIT 1
	) WHERE %s`, table, routeBindingColumn, table, legacyModelConfigColumn, condition)
	if err := db.Exec(update).Error; err != nil {
		return fmt.Errorf("backfill %s.%s from local provider route bindings: %w", table, routeBindingColumn, err)
	}
	return nil
}

func backfillModelCatalogEntryRefColumn(db *gorm.DB, table string, legacyModelConfigColumn string, catalogEntryColumn string) error {
	if !db.Migrator().HasTable(table) {
		return nil
	}
	if !db.Migrator().HasColumn(table, catalogEntryColumn) {
		return nil
	}
	if db.Migrator().HasTable(&persistencemodel.AIModelRouteBinding{}) {
		condition := fmt.Sprintf(`%s.%s IS NULL
		AND EXISTS (
			SELECT 1 FROM ai_model_route_bindings route_bindings
			WHERE route_bindings.local_model_config_id = %s.%s
				AND route_bindings.deleted_at IS NULL
		)`, table, catalogEntryColumn, table, legacyModelConfigColumn)
		update := fmt.Sprintf(`UPDATE %s SET %s = (
			SELECT route_bindings.catalog_entry_id
			FROM ai_model_route_bindings route_bindings
			WHERE route_bindings.local_model_config_id = %s.%s
				AND route_bindings.deleted_at IS NULL
			ORDER BY route_bindings.id ASC
			LIMIT 1
		) WHERE %s`, table, catalogEntryColumn, table, legacyModelConfigColumn, condition)
		if err := db.Exec(update).Error; err != nil {
			return fmt.Errorf("backfill %s.%s from local provider route bindings: %w", table, catalogEntryColumn, err)
		}
	}
	condition := fmt.Sprintf(`%s.%s IS NULL
		AND EXISTS (
			SELECT 1 FROM ai_model_catalog_entries catalog_entries
			WHERE catalog_entries.id = %s.%s
				AND catalog_entries.deleted_at IS NULL
		)`, table, catalogEntryColumn, table, legacyModelConfigColumn)
	if db.Migrator().HasTable(&persistencemodel.AIModelConfig{}) {
		condition += fmt.Sprintf(`
		AND NOT EXISTS (
			SELECT 1 FROM ai_model_configs legacy_configs
			WHERE legacy_configs.id = %s.%s
				AND legacy_configs.deleted_at IS NULL
		)`, table, legacyModelConfigColumn)
	}
	if err := db.Exec(fmt.Sprintf(`UPDATE %s SET %s = %s WHERE %s`, table, catalogEntryColumn, legacyModelConfigColumn, condition)).Error; err != nil {
		return fmt.Errorf("backfill %s.%s: %w", table, catalogEntryColumn, err)
	}
	return nil
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			return value
		}
	}
	return ""
}

func defaultString(value string, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return strings.TrimSpace(value)
}

func normalizePositiveInt(value int, fallback int) int {
	if value <= 0 {
		return fallback
	}
	return value
}

func createJobRunnerIndexes(db *gorm.DB) error {
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

type rawResourceNameRow struct {
	ID      uint
	OwnerID uint
	OrgID   *uint
	Name    string
}

func backfillUniqueRawResourceNames(db *gorm.DB) error {
	if !db.Migrator().HasTable(&persistencemodel.RawResource{}) {
		return nil
	}
	var rows []rawResourceNameRow
	if err := db.
		Model(&persistencemodel.RawResource{}).
		Select("id, owner_id, org_id, name").
		Where("deleted_at IS NULL").
		Order("org_id, owner_id, LOWER(name), id").
		Find(&rows).Error; err != nil {
		return fmt.Errorf("list raw resources for filename backfill: %w", err)
	}
	usedByScope := map[string]map[string]struct{}{}
	for _, row := range rows {
		scope := rawResourceNameScope(row)
		used := usedByScope[scope]
		if used == nil {
			used = map[string]struct{}{}
			usedByScope[scope] = used
		}
		unique := uniqueResourceName(row.Name, used)
		if unique == row.Name {
			continue
		}
		if err := db.
			Session(&gorm.Session{SkipHooks: true}).
			Model(&persistencemodel.RawResource{}).
			Where("id = ?", row.ID).
			Update("name", unique).Error; err != nil {
			return fmt.Errorf("rename duplicate raw resource %d: %w", row.ID, err)
		}
	}
	return nil
}

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

func replaceModelRouteBindingUniqueIndexWithCredentialScope(db *gorm.DB) error {
	if !db.Migrator().HasTable(&persistencemodel.AIModelRouteBinding{}) {
		return nil
	}
	if db.Migrator().HasIndex(&persistencemodel.AIModelRouteBinding{}, activeModelRouteBindingUniqueIndex) {
		if err := db.Migrator().DropIndex(&persistencemodel.AIModelRouteBinding{}, activeModelRouteBindingUniqueIndex); err != nil {
			return fmt.Errorf("drop %s: %w", activeModelRouteBindingUniqueIndex, err)
		}
	}
	return enforceUniqueActiveModelRouteBindings(db)
}

func modelRouteBindingUniqueIndexColumns() string {
	return "catalog_entry_id, source_type, route_group, COALESCE(credential_id, 0)"
}

func modelRouteBindingCredentialIDValue(id *uint) uint {
	if id == nil {
		return 0
	}
	return *id
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
      GROUP BY catalog_entry_id, source_type, route_group, COALESCE(credential_id, 0)
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
		"public_model_id, provider_model_id",
		"deleted_at IS NULL",
	)
}

func mergeDuplicateActiveModelCatalogEntries(db *gorm.DB) error {
	var entries []persistencemodel.AIModelCatalogEntry
	if err := db.
		Unscoped().
		Where("deleted_at IS NULL").
		Order("public_model_id ASC, provider_model_id ASC, id ASC").
		Find(&entries).Error; err != nil {
		return fmt.Errorf("list active model catalog entries: %w", err)
	}
	keepers := map[string]uint{}
	for _, entry := range entries {
		key := strings.TrimSpace(entry.PublicModelID) + "\x00" + strings.TrimSpace(entry.ProviderModelID)
		if key == "\x00" {
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
					Where("catalog_entry_id = ? AND source_type = ? AND route_group = ? AND COALESCE(credential_id, 0) = ? AND deleted_at IS NULL", keepID, binding.SourceType, binding.RouteGroup, modelRouteBindingCredentialIDValue(binding.CredentialID)).
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

func migrateShotReferenceGroups(db *gorm.DB) error {
	if err := db.AutoMigrate(&persistencemodel.ShotReferenceGroup{}, &persistencemodel.ShotReference{}); err != nil {
		return err
	}
	migrator := db.Migrator()
	if migrator.HasIndex(&persistencemodel.ShotReference{}, "uidx_shot_references_resource") {
		if err := migrator.DropIndex(&persistencemodel.ShotReference{}, "uidx_shot_references_resource"); err != nil {
			return fmt.Errorf("drop shot reference resource unique index: %w", err)
		}
	}
	var rows []persistencemodel.ShotReference
	if err := db.Where("group_id IS NULL").Find(&rows).Error; err != nil {
		return err
	}
	for i := range rows {
		row := rows[i]
		group := persistencemodel.ShotReferenceGroup{
			OwnerID:          row.OwnerID,
			OrgID:            row.OrgID,
			SourceResourceID: row.ResourceID,
			Title:            row.Title,
			Summary:          row.Summary,
			AnalysisStatus:   row.AnalysisStatus,
			CutStrategy:      "manual_single",
		}
		if strings.TrimSpace(group.Title) == "" {
			group.Title = fmt.Sprintf("Shot reference group #%d", row.ID)
		}
		if strings.TrimSpace(group.AnalysisStatus) == "" {
			group.AnalysisStatus = "ready"
		}
		if err := db.Create(&group).Error; err != nil {
			return err
		}
		if err := db.Model(&persistencemodel.ShotReference{}).
			Where("id = ?", row.ID).
			Updates(map[string]any{
				"group_id":        group.ID,
				"order":           1,
				"analysis_source": "manual_workspace",
			}).Error; err != nil {
			return err
		}
	}
	return nil
}

func rawResourceNameScope(row rawResourceNameRow) string {
	if row.OrgID != nil {
		return fmt.Sprintf("org:%d", *row.OrgID)
	}
	return fmt.Sprintf("personal:%d", row.OwnerID)
}

func uniqueResourceName(name string, used map[string]struct{}) string {
	name = strings.TrimSpace(name)
	if name == "" {
		name = "resource"
	}
	key := normalizedResourceNameKey(name)
	if _, ok := used[key]; !ok {
		used[key] = struct{}{}
		return name
	}
	ext := filepath.Ext(name)
	base := strings.TrimSpace(strings.TrimSuffix(name, ext))
	if base == "" {
		base = "resource"
	}
	for suffix := 2; ; suffix++ {
		candidate := fmt.Sprintf("%s (%d)%s", base, suffix, ext)
		key := normalizedResourceNameKey(candidate)
		if _, ok := used[key]; ok {
			continue
		}
		used[key] = struct{}{}
		return candidate
	}
}

func normalizedResourceNameKey(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}

type legacyRawResourceBlobRow struct {
	ID             uint
	StorageBackend string
	StorageKey     string
	Size           int64
	MimeType       string
	BlobID         *uint
}

func backfillLegacyResourceBlobs(db *gorm.DB) error {
	if !db.Migrator().HasTable(&persistencemodel.RawResource{}) || !db.Migrator().HasTable(&persistencemodel.ResourceBlob{}) {
		return nil
	}
	var rows []legacyRawResourceBlobRow
	if err := db.
		Model(&persistencemodel.RawResource{}).
		Select("id, storage_backend, storage_key, size, mime_type, blob_id").
		Where("deleted_at IS NULL AND blob_id IS NULL AND COALESCE(storage_key, '') <> ''").
		Order("storage_backend, storage_key, id").
		Find(&rows).Error; err != nil {
		return fmt.Errorf("list raw resources for blob backfill: %w", err)
	}
	blobIDsByStorageKey := map[string]uint{}
	refCounts := map[uint]int{}
	for _, row := range rows {
		scopeKey := row.StorageBackend + "\x00" + row.StorageKey
		blobID := blobIDsByStorageKey[scopeKey]
		if blobID == 0 {
			blob, err := findOrCreateLegacyResourceBlob(db, row)
			if err != nil {
				return err
			}
			blobID = blob.ID
			blobIDsByStorageKey[scopeKey] = blobID
		}
		if err := db.
			Session(&gorm.Session{SkipHooks: true}).
			Model(&persistencemodel.RawResource{}).
			Where("id = ?", row.ID).
			Update("blob_id", blobID).Error; err != nil {
			return fmt.Errorf("set raw resource %d blob: %w", row.ID, err)
		}
		refCounts[blobID]++
	}
	for blobID, count := range refCounts {
		if err := db.
			Model(&persistencemodel.ResourceBlob{}).
			Where("id = ?", blobID).
			UpdateColumn("ref_count", gorm.Expr("ref_count + ?", count)).Error; err != nil {
			return fmt.Errorf("increment legacy blob %d refs: %w", blobID, err)
		}
	}
	return nil
}

func findOrCreateLegacyResourceBlob(db *gorm.DB, row legacyRawResourceBlobRow) (persistencemodel.ResourceBlob, error) {
	var existing persistencemodel.ResourceBlob
	if err := db.Where("storage_backend = ? AND storage_key = ?", row.StorageBackend, row.StorageKey).First(&existing).Error; err == nil {
		return existing, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return persistencemodel.ResourceBlob{}, fmt.Errorf("find legacy blob %q: %w", row.StorageKey, err)
	}
	blob := persistencemodel.ResourceBlob{
		Hash:           legacyResourceBlobHash(row.StorageBackend, row.StorageKey),
		StorageBackend: row.StorageBackend,
		StorageKey:     row.StorageKey,
		Size:           row.Size,
		MimeType:       row.MimeType,
		RefCount:       0,
	}
	if err := db.Create(&blob).Error; err != nil {
		return persistencemodel.ResourceBlob{}, fmt.Errorf("create legacy blob %q: %w", row.StorageKey, err)
	}
	return blob, nil
}

func legacyResourceBlobHash(storageBackend string, storageKey string) string {
	sum := sha256.Sum256([]byte(storageBackend + "\x00" + storageKey))
	return "legacy:" + hex.EncodeToString(sum[:])
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

func dropFeatureConfigsTable(db *gorm.DB) error {
	if !db.Migrator().HasTable("feature_configs") {
		return nil
	}
	return db.Migrator().DropTable("feature_configs")
}

func RunMigrations(db *gorm.DB) error {
	if err := db.AutoMigrate(&AppliedMigration{}); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}
	if err := editionRepairLegacyMigrationRecords(db); err != nil {
		return err
	}

	applied, err := loadAppliedMigrations(db)
	if err != nil {
		return err
	}

	for _, migration := range RegisteredMigrations() {
		checksum := migrationChecksum(migration)
		if existing, ok := applied[migration.Version]; ok {
			if existing.Checksum != checksum && !acceptsLegacyMigrationChecksum(migration, existing.Checksum) {
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

func acceptsLegacyMigrationChecksum(migration Migration, checksum string) bool {
	legacyChecksums := map[string]map[string]struct{}{
		"000009": {
			"ceb24f4d054945bfdf180e7452c97df8f8db4632f4db9f8377e69032a4998d0a": {},
		},
		"000010": {
			"117f6dcc99612418640970bab33d24a3c08a183fc4b886e97e534ba061be11ad": {},
		},
		"000026": {
			"e4e05244263a33a3df407e96f831a0a49c93e634d0c958eada3b9a268fa00201": {},
			"9ef89e5d9815ae4eeb9e5c49c78db4628107ed2b28858351476bb1ab08bea628": {},
		},
		"000029": {
			"83ca864fb52dea985df41af68e5ffe03843c3beadeebb74a5dc04c23873f8972": {},
			"1d7580b5ac39d9da7960b0bf599dbc61e87a379b86e4ac83059ba3d2a28eeb9e": {},
		},
	}
	versionChecksums, ok := legacyChecksums[migration.Version]
	if !ok {
		return false
	}
	_, ok = versionChecksums[checksum]
	return ok
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
		&persistencemodel.AIModelConfig{},
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

func currentSchemaBackfillModels() []any {
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
		&persistencemodel.AIModelConfig{},
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
