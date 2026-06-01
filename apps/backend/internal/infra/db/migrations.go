package db

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"path/filepath"
	"strconv"
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
					&persistencemodel.AICredential{},
					&persistencemodel.ResourceFolder{},
					&persistencemodel.GatewayAPIKey{},
					&persistencemodel.UsageLog{},
					&persistencemodel.UsageReservation{},
					&persistencemodel.AuditLog{},
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
				if err := db.AutoMigrate(&persistencemodel.ProductionTextBlock{}, &persistencemodel.Segment{}); err != nil {
					return err
				}
				migrator := db.Migrator()
				for _, column := range []string{"script_id", "script_version_id", "source_range"} {
					if migrator.HasColumn(&persistencemodel.Segment{}, column) {
						if err := migrator.DropColumn(&persistencemodel.Segment{}, column); err != nil {
							return fmt.Errorf("drop segments.%s: %w", column, err)
						}
					}
				}
				return nil
			},
		},
		{
			Version: "000004",
			Name:    "add_entity_relations",
			Up: func(db *gorm.DB) error {
				return backfillCoreEntityRelations(db)
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
			Name:    "add_script_blocks",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(&persistencemodel.ScriptBlock{})
			},
		},
		{
			Version: "000016",
			Name:    "link_story_and_content_to_script_blocks",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(&persistencemodel.Segment{}, &persistencemodel.ContentUnit{})
			},
		},
		{
			Version: "000017",
			Name:    "link_scene_moments_to_script_blocks",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(&persistencemodel.SceneMoment{})
			},
		},
		{
			Version: "000020",
			Name:    "enforce_unique_script_version_numbers",
			Up: func(db *gorm.DB) error {
				if err := resequenceScriptVersionNumbers(db); err != nil {
					return err
				}
				return createScriptVersionNumberUniqueIndex(db)
			},
		},
		{
			Version: "000021",
			Name:    "enforce_unique_storyboard_version_numbers",
			Up: func(db *gorm.DB) error {
				if err := resequenceStoryboardVersionNumbers(db); err != nil {
					return err
				}
				return createStoryboardVersionNumberUniqueIndex(db)
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
			Name:    "zipper_entity_relations",
			Up: func(db *gorm.DB) error {
				if err := dropLegacyEntityRelationUniqueIndex(db); err != nil {
					return err
				}
				return db.AutoMigrate(&persistencemodel.EntityRelation{})
			},
		},
		{
			Version: "000024",
			Name:    "add_ai_model_capacity_config",
			Up: func(db *gorm.DB) error {
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
			Name:    "add_creative_reference_proposal_client_id",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(&persistencemodel.CreativeReference{})
			},
		},
		{
			Version: "000027",
			Name:    "add_writing_expressions",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(&persistencemodel.WritingExpression{})
			},
		},
		{
			Version: "000028",
			Name:    "add_production_identifiers",
			Up: func(db *gorm.DB) error {
				if err := db.AutoMigrate(&persistencemodel.SceneMoment{}, &persistencemodel.ContentUnit{}); err != nil {
					return err
				}
				if err := backfillProductionIdentifiers(db); err != nil {
					return err
				}
				return createProductionIdentifierIndexes(db)
			},
		},
		{
			Version: "000029",
			Name:    "remove_production_orchestrate_feature",
			Up: func(db *gorm.DB) error {
				return removeProductionOrchestrateFeatureConfig(db)
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
	}
	return core
}

func renameAIModelConfigPricingModeColumn(db *gorm.DB) error {
	migrator := db.Migrator()
	if !migrator.HasTable(&persistencemodel.AIModelConfig{}) {
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

const scriptVersionNumberUniqueIndex = "uidx_script_versions_project_script_number"

type scriptVersionNumberRow struct {
	ID            uint
	ProjectID     uint
	ScriptID      uint
	VersionNumber int
}

func resequenceScriptVersionNumbers(db *gorm.DB) error {
	if !db.Migrator().HasTable(&persistencemodel.ScriptVersion{}) {
		return nil
	}
	var rows []scriptVersionNumberRow
	if err := db.
		Model(&persistencemodel.ScriptVersion{}).
		Select("id, project_id, script_id, version_number").
		Where("deleted_at IS NULL").
		Order("project_id, script_id, version_number, id").
		Find(&rows).Error; err != nil {
		return fmt.Errorf("list script versions for resequence: %w", err)
	}
	if len(rows) == 0 {
		return nil
	}

	for _, row := range rows {
		if err := db.
			Session(&gorm.Session{SkipHooks: true}).
			Model(&persistencemodel.ScriptVersion{}).
			Where("id = ?", row.ID).
			Update("version_number", -int(row.ID)).Error; err != nil {
			return fmt.Errorf("temporarily resequence script version %d: %w", row.ID, err)
		}
	}

	var currentProjectID uint
	var currentScriptID uint
	nextVersionNumber := 0
	for _, row := range rows {
		if row.ProjectID != currentProjectID || row.ScriptID != currentScriptID {
			currentProjectID = row.ProjectID
			currentScriptID = row.ScriptID
			nextVersionNumber = 1
		} else {
			nextVersionNumber++
		}
		if err := db.
			Session(&gorm.Session{SkipHooks: true}).
			Model(&persistencemodel.ScriptVersion{}).
			Where("id = ?", row.ID).
			Update("version_number", nextVersionNumber).Error; err != nil {
			return fmt.Errorf("resequence script version %d: %w", row.ID, err)
		}
	}
	return nil
}

func createScriptVersionNumberUniqueIndex(db *gorm.DB) error {
	if !db.Migrator().HasTable(&persistencemodel.ScriptVersion{}) {
		return nil
	}
	if db.Migrator().HasIndex(&persistencemodel.ScriptVersion{}, scriptVersionNumberUniqueIndex) {
		return nil
	}
	partial := ""
	if db.Dialector.Name() == "postgres" || db.Dialector.Name() == "sqlite" {
		partial = " WHERE deleted_at IS NULL"
	}
	stmt := fmt.Sprintf(
		"CREATE UNIQUE INDEX %s ON script_versions (project_id, script_id, version_number)%s",
		scriptVersionNumberUniqueIndex,
		partial,
	)
	if err := db.Exec(stmt).Error; err != nil {
		return fmt.Errorf("create script version number unique index: %w", err)
	}
	return nil
}

const storyboardVersionNumberUniqueIndex = "uidx_storyboard_versions_project_script_number"

type storyboardVersionNumberRow struct {
	ID                 uint
	ProjectID          uint
	StoryboardScriptID uint
	VersionNumber      int
}

func resequenceStoryboardVersionNumbers(db *gorm.DB) error {
	if !db.Migrator().HasTable(&persistencemodel.StoryboardVersion{}) {
		return nil
	}
	var rows []storyboardVersionNumberRow
	if err := db.
		Model(&persistencemodel.StoryboardVersion{}).
		Select("id, project_id, storyboard_script_id, version_number").
		Where("deleted_at IS NULL").
		Order("project_id, storyboard_script_id, version_number, id").
		Find(&rows).Error; err != nil {
		return fmt.Errorf("list storyboard versions for resequence: %w", err)
	}
	if len(rows) == 0 {
		return nil
	}

	for _, row := range rows {
		if err := db.
			Model(&persistencemodel.StoryboardVersion{}).
			Where("id = ?", row.ID).
			Update("version_number", -int(row.ID)).Error; err != nil {
			return fmt.Errorf("temporarily resequence storyboard version %d: %w", row.ID, err)
		}
	}

	var currentProjectID uint
	var currentStoryboardScriptID uint
	nextVersionNumber := 0
	for _, row := range rows {
		if row.ProjectID != currentProjectID || row.StoryboardScriptID != currentStoryboardScriptID {
			currentProjectID = row.ProjectID
			currentStoryboardScriptID = row.StoryboardScriptID
			nextVersionNumber = 1
		} else {
			nextVersionNumber++
		}
		if err := db.
			Model(&persistencemodel.StoryboardVersion{}).
			Where("id = ?", row.ID).
			Update("version_number", nextVersionNumber).Error; err != nil {
			return fmt.Errorf("resequence storyboard version %d: %w", row.ID, err)
		}
	}
	return nil
}

func createStoryboardVersionNumberUniqueIndex(db *gorm.DB) error {
	if !db.Migrator().HasTable(&persistencemodel.StoryboardVersion{}) {
		return nil
	}
	if db.Migrator().HasIndex(&persistencemodel.StoryboardVersion{}, storyboardVersionNumberUniqueIndex) {
		return nil
	}
	partial := ""
	if db.Dialector.Name() == "postgres" || db.Dialector.Name() == "sqlite" {
		partial = " WHERE deleted_at IS NULL"
	}
	stmt := fmt.Sprintf(
		"CREATE UNIQUE INDEX %s ON storyboard_versions (project_id, storyboard_script_id, version_number)%s",
		storyboardVersionNumberUniqueIndex,
		partial,
	)
	if err := db.Exec(stmt).Error; err != nil {
		return fmt.Errorf("create storyboard version number unique index: %w", err)
	}
	return nil
}

const sceneCodeUniqueIndex = "uidx_scene_moments_production_scene_code"
const unitCodeUniqueIndex = "uidx_content_units_scene_kind_unit_code"

type sceneProductionIdentifierRow struct {
	ID           uint
	ProjectID    uint
	ProductionID *uint
	SegmentID    *uint
	SceneCode    string
	Order        int
}

type contentUnitIdentifierRow struct {
	ID            uint
	ProjectID     uint
	SceneMomentID *uint
	Kind          string
	UnitCode      string
	Order         int
}

func backfillProductionIdentifiers(db *gorm.DB) error {
	if err := backfillSceneProductionIdentifiers(db); err != nil {
		return err
	}
	return backfillContentUnitIdentifiers(db)
}

func backfillSceneProductionIdentifiers(db *gorm.DB) error {
	if !db.Migrator().HasTable(&persistencemodel.SceneMoment{}) {
		return nil
	}
	segmentProductionIDs := map[uint]*uint{}
	var segments []persistencemodel.Segment
	if db.Migrator().HasTable(&persistencemodel.Segment{}) {
		if err := db.Select("id, production_id").Find(&segments).Error; err != nil {
			return fmt.Errorf("list segments for scene identifiers: %w", err)
		}
		for i := range segments {
			segmentProductionIDs[segments[i].ID] = segments[i].ProductionID
		}
	}

	var rows []sceneProductionIdentifierRow
	if err := db.
		Unscoped().
		Model(&persistencemodel.SceneMoment{}).
		Select("id, project_id, production_id, segment_id, scene_code, \"order\"").
		Order("project_id, production_id, \"order\", id").
		Find(&rows).Error; err != nil {
		return fmt.Errorf("list scene moments for identifiers: %w", err)
	}
	nextByProduction := map[uint]int{}
	for _, row := range rows {
		productionID := row.ProductionID
		if productionID == nil && row.SegmentID != nil {
			productionID = segmentProductionIDs[*row.SegmentID]
		}
		if productionID == nil {
			continue
		}
		if strings.TrimSpace(row.SceneCode) == "" {
			nextByProduction[*productionID]++
			if err := db.
				Session(&gorm.Session{SkipHooks: true}).
				Model(&persistencemodel.SceneMoment{}).
				Where("id = ?", row.ID).
				Updates(map[string]any{
					"production_id": productionID,
					"scene_code":    fmt.Sprint(nextByProduction[*productionID]),
				}).Error; err != nil {
				return fmt.Errorf("backfill scene identifier %d: %w", row.ID, err)
			}
			continue
		}
		if value := positiveIdentifierNumber(row.SceneCode); value > nextByProduction[*productionID] {
			nextByProduction[*productionID] = value
		}
		if row.ProductionID == nil {
			if err := db.
				Session(&gorm.Session{SkipHooks: true}).
				Model(&persistencemodel.SceneMoment{}).
				Where("id = ?", row.ID).
				Update("production_id", productionID).Error; err != nil {
				return fmt.Errorf("backfill scene production %d: %w", row.ID, err)
			}
		}
	}
	return nil
}

func backfillContentUnitIdentifiers(db *gorm.DB) error {
	if !db.Migrator().HasTable(&persistencemodel.ContentUnit{}) {
		return nil
	}
	var rows []contentUnitIdentifierRow
	if err := db.
		Unscoped().
		Model(&persistencemodel.ContentUnit{}).
		Select("id, project_id, scene_moment_id, kind, unit_code, \"order\"").
		Order("project_id, scene_moment_id, kind, \"order\", id").
		Find(&rows).Error; err != nil {
		return fmt.Errorf("list content units for identifiers: %w", err)
	}
	nextByScope := map[string]int{}
	for _, row := range rows {
		if row.SceneMomentID == nil {
			continue
		}
		scope := fmt.Sprintf("%d:%d:%s", row.ProjectID, *row.SceneMomentID, strings.TrimSpace(row.Kind))
		if strings.TrimSpace(row.UnitCode) != "" {
			if value := positiveIdentifierNumber(row.UnitCode); value > nextByScope[scope] {
				nextByScope[scope] = value
			}
			continue
		}
		nextByScope[scope]++
		if err := db.
			Session(&gorm.Session{SkipHooks: true}).
			Model(&persistencemodel.ContentUnit{}).
			Where("id = ?", row.ID).
			Update("unit_code", fmt.Sprint(nextByScope[scope])).Error; err != nil {
			return fmt.Errorf("backfill content unit identifier %d: %w", row.ID, err)
		}
	}
	return nil
}

func positiveIdentifierNumber(code string) int {
	value, err := strconv.Atoi(strings.TrimSpace(code))
	if err != nil || value < 1 {
		return 0
	}
	return value
}

func createProductionIdentifierIndexes(db *gorm.DB) error {
	if err := createPartialUniqueIndex(db, &persistencemodel.SceneMoment{}, sceneCodeUniqueIndex, "scene_moments", "production_id, scene_code", "deleted_at IS NULL AND production_id IS NOT NULL AND scene_code <> ''"); err != nil {
		return err
	}
	return createPartialUniqueIndex(db, &persistencemodel.ContentUnit{}, unitCodeUniqueIndex, "content_units", "scene_moment_id, kind, unit_code", "deleted_at IS NULL AND scene_moment_id IS NOT NULL AND unit_code <> ''")
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
				"analysis_source": "manual_draft",
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

func removeProductionOrchestrateFeatureConfig(db *gorm.DB) error {
	if !db.Migrator().HasTable("feature_configs") {
		return nil
	}
	if err := db.Exec("DELETE FROM feature_configs WHERE feature_key = ?", "production_orchestrate").Error; err != nil {
		return fmt.Errorf("delete production_orchestrate feature config: %w", err)
	}
	return nil
}

func RunMigrations(db *gorm.DB) error {
	if err := db.AutoMigrate(&AppliedMigration{}); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
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
		"000029": {
			"83ca864fb52dea985df41af68e5ffe03843c3beadeebb74a5dc04c23873f8972": {},
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
		&persistencemodel.AuthSession{},
		&persistencemodel.AuthChallenge{},
		&persistencemodel.Project{},
		&persistencemodel.ProjectMember{},
		&persistencemodel.Script{},
		&persistencemodel.ScriptVersion{},
		&persistencemodel.ScriptBlock{},
		&persistencemodel.Production{},
		&persistencemodel.ProductionTextBlock{},
		&persistencemodel.Segment{},
		&persistencemodel.SceneMoment{},
		&persistencemodel.WritingExpression{},
		&persistencemodel.ContentUnit{},
		&persistencemodel.Keyframe{},
		&persistencemodel.PreviewTimeline{},
		&persistencemodel.PreviewTimelineItem{},
		&persistencemodel.CreativeReference{},
		&persistencemodel.CreativeReferenceState{},
		&persistencemodel.CreativeReferenceUsage{},
		&persistencemodel.CreativeRelationship{},
		&persistencemodel.EntityRelation{},
		&persistencemodel.AssetSlot{},
		&persistencemodel.AssetSlotCandidate{},
		&persistencemodel.CandidateDecision{},
		&persistencemodel.ReviewEvent{},
		&persistencemodel.WorkItem{},
		&persistencemodel.WorkReview{},
		&persistencemodel.WorkDependency{},
		&persistencemodel.DeliveryVersion{},
		&persistencemodel.DeliveryTimelineItem{},
		&persistencemodel.ExportRecord{},
		&persistencemodel.ScriptAnalysis{},
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelConfig{},
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
		&persistencemodel.LLMCallLog{},
		&persistencemodel.ResourceFolder{},
		&persistencemodel.ResourceFolderPermission{},
		&persistencemodel.ResourceBlob{},
		&persistencemodel.RawResource{},
		&persistencemodel.ExternalResourceSource{},
		&persistencemodel.ShotReferenceGroup{},
		&persistencemodel.ShotReference{},
		&persistencemodel.ShotVectorDocument{},
		&persistencemodel.ResourceBinding{},
		&persistencemodel.Canvas{},
		&persistencemodel.CanvasNode{},
		&persistencemodel.CanvasEdge{},
		&persistencemodel.CanvasRun{},
		&persistencemodel.CanvasTask{},
		&persistencemodel.CanvasEntityWriteAudit{},
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
		&persistencemodel.StoryboardScript{},
		&persistencemodel.StoryboardVersion{},
		&persistencemodel.Organization{},
		&persistencemodel.OrganizationMember{},
		&persistencemodel.UserGroup{},
		&persistencemodel.UserGroupMember{},
		&persistencemodel.OrgInvitation{},
	}
	return append(entities, runtimeMigrationModels()...)
}

func currentSchemaBackfillModels() []any {
	entities := []any{
		&persistencemodel.User{},
		&persistencemodel.AuthSession{},
		&persistencemodel.AuthChallenge{},
		&persistencemodel.Project{},
		&persistencemodel.ProjectMember{},
		&persistencemodel.Script{},
		&persistencemodel.ScriptVersion{},
		&persistencemodel.ScriptBlock{},
		&persistencemodel.Production{},
		&persistencemodel.ProductionTextBlock{},
		&persistencemodel.Segment{},
		&persistencemodel.SceneMoment{},
		&persistencemodel.WritingExpression{},
		&persistencemodel.ContentUnit{},
		&persistencemodel.Keyframe{},
		&persistencemodel.PreviewTimeline{},
		&persistencemodel.PreviewTimelineItem{},
		&persistencemodel.CreativeReference{},
		&persistencemodel.CreativeReferenceState{},
		&persistencemodel.CreativeReferenceUsage{},
		&persistencemodel.CreativeRelationship{},
		&persistencemodel.EntityRelation{},
		&persistencemodel.AssetSlot{},
		&persistencemodel.AssetSlotCandidate{},
		&persistencemodel.CandidateDecision{},
		&persistencemodel.ReviewEvent{},
		&persistencemodel.WorkItem{},
		&persistencemodel.WorkReview{},
		&persistencemodel.WorkDependency{},
		&persistencemodel.DeliveryVersion{},
		&persistencemodel.DeliveryTimelineItem{},
		&persistencemodel.ExportRecord{},
		&persistencemodel.ScriptAnalysis{},
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelConfig{},
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
		&persistencemodel.LLMCallLog{},
		&persistencemodel.ResourceFolder{},
		&persistencemodel.ResourceFolderPermission{},
		&persistencemodel.ResourceBlob{},
		&persistencemodel.RawResource{},
		&persistencemodel.ExternalResourceSource{},
		&persistencemodel.ShotReferenceGroup{},
		&persistencemodel.ShotReference{},
		&persistencemodel.ShotVectorDocument{},
		&persistencemodel.ResourceBinding{},
		&persistencemodel.Canvas{},
		&persistencemodel.CanvasNode{},
		&persistencemodel.CanvasEdge{},
		&persistencemodel.CanvasRun{},
		&persistencemodel.CanvasTask{},
		&persistencemodel.CanvasEntityWriteAudit{},
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
		&persistencemodel.StoryboardScript{},
		&persistencemodel.StoryboardVersion{},
		&persistencemodel.Organization{},
		&persistencemodel.OrganizationMember{},
		&persistencemodel.UserGroup{},
		&persistencemodel.UserGroupMember{},
		&persistencemodel.OrgInvitation{},
	}
	return append(entities, runtimeMigrationModels()...)
}
