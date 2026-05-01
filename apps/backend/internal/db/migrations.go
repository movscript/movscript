package db

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/model"
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
	return []Migration{
		{
			Version: "000001",
			Name:    "current_gorm_schema",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(allModels()...)
			},
		},
		{
			Version: "000002",
			Name:    "legacy_cleanup_and_backfill",
			Up:      runLegacyCleanupAndBackfill,
		},
		{
			Version: "000003",
			Name:    "seed_default_feature_configs",
			Up:      seedDefaultFeatureConfigs,
		},
		{
			Version: "000004",
			Name:    "usage_reservations",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(&model.UsageReservation{}, &model.UsageLog{}, &model.Job{}, &model.GatewayRateLimitCounter{})
			},
		},
		{
			Version: "000005",
			Name:    "setting_relationship_category",
			Up:      migrateSettingRelationshipCategory,
		},
		{
			Version: "000006",
			Name:    "asset_direct_resource_and_setting_status",
			Up:      migrateAssetDirectResource,
		},
		{
			Version: "000007",
			Name:    "setting_state_tags",
			Up:      migrateSettingStateTags,
		},
		{
			Version: "000008",
			Name:    "remove_script_status_fields",
			Up:      migrateRemoveScriptStatusFields,
		},
		{
			Version: "000009",
			Name:    "rename_agent_chat_feature",
			Up:      migrateRenameAgentChatFeature,
		},
		{
			Version: "000010",
			Name:    "episode_scene_reference_tables",
			Up:      migrateEpisodeSceneReferenceTables,
		},
		{
			Version: "000011",
			Name:    "remove_episode_scene_definition_fields",
			Up:      migrateRemoveEpisodeSceneDefinitionFields,
		},
		{
			Version: "000012",
			Name:    "storyboard_setting_and_remove_status",
			Up:      migrateStoryboardSettingAndRemoveStatus,
		},
		{
			Version: "000013",
			Name:    "remove_final_video_status_and_order",
			Up:      migrateRemoveFinalVideoStatusAndOrder,
		},
		{
			Version: "000015",
			Name:    "structured_script_fields",
			Up:      migrateStructuredScriptFields,
		},
		{
			Version: "000016",
			Name:    "script_episode_planning_fields",
			Up:      migrateScriptEpisodePlanningFields,
		},
		{
			Version: "000017",
			Name:    "script_analysis_feature_channels",
			Up:      migrateScriptAnalysisFeatureChannels,
		},
		{
			Version: "000018",
			Name:    "v2_semantic_skeleton",
			Up:      migrateV2SemanticSkeleton,
		},
		{
			Version: "000019",
			Name:    "script_preview_draft_snapshots",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(&model.ScriptPreviewDraft{})
			},
		},
		{
			Version: "000020",
			Name:    "script_preview_draft_confirmed_state",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(&model.ScriptPreviewDraft{})
			},
		},
		{
			Version: "000021",
			Name:    "video_edit_tool_feature",
			Up:      migrateVideoEditToolFeature,
		},
		{
			Version: "000022",
			Name:    "v2_reference_relation_review_fields",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(&model.CreativeReferenceUsage{}, &model.CreativeRelationship{})
			},
		},
	}
}

func migrateV2SemanticSkeleton(db *gorm.DB) error {
	return db.AutoMigrate(
		&model.ScriptPreviewDraft{},
		&model.ScriptVersion{},
		&model.ScriptSection{},
		&model.Situation{},
		&model.ContentUnit{},
		&model.Keyframe{},
		&model.PreviewTimeline{},
		&model.PreviewTimelineItem{},
		&model.CreativeReference{},
		&model.CreativeReferenceState{},
		&model.CreativeReferenceUsage{},
		&model.CreativeRelationship{},
		&model.AssetRequirement{},
		&model.AssetRequirementCandidate{},
		&model.WorkItem{},
		&model.WorkReview{},
		&model.WorkDependency{},
		&model.DeliveryVersion{},
		&model.DeliveryTimelineItem{},
		&model.ExportRecord{},
	)
}

func migrateScriptAnalysisFeatureChannels(db *gorm.DB) error {
	features := []model.FeatureConfig{
		{FeatureKey: "main_script_analyze", DisplayName: "主剧本 AI 分析", Description: "拆解主剧本，提取分集剧本、分场剧本和项目设定候选", Capability: "text", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "episode_script_analyze", DisplayName: "分集剧本 AI 分析", Description: "分析分集剧本，提取标题、描述、提纲、钩子和涉及分场", Capability: "text", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "scene_script_analyze", DisplayName: "分场剧本 AI 分析", Description: "分析分场剧本，提取时间、人物、场景、情节、氛围和提纲", Capability: "text", IsEnabled: true, AllowedModelIDs: "[]"},
	}
	for _, feature := range features {
		var existing model.FeatureConfig
		err := db.Where("feature_key = ?", feature.FeatureKey).First(&existing).Error
		if err == nil {
			continue
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return fmt.Errorf("lookup feature %s: %w", feature.FeatureKey, err)
		}
		if err := db.Create(&feature).Error; err != nil {
			return fmt.Errorf("seed feature %s: %w", feature.FeatureKey, err)
		}
	}
	return nil
}

func migrateVideoEditToolFeature(db *gorm.DB) error {
	feature := model.FeatureConfig{
		FeatureKey:      "video_edit",
		DisplayName:     "剪辑工具",
		Description:     "基于源视频和剪辑指令生成处理后的视频",
		Capability:      "video_v2v",
		IsEnabled:       true,
		AllowedModelIDs: "[]",
	}
	var existing model.FeatureConfig
	err := db.Where("feature_key = ?", feature.FeatureKey).First(&existing).Error
	if err == nil {
		return nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return fmt.Errorf("lookup feature %s: %w", feature.FeatureKey, err)
	}
	if err := db.Create(&feature).Error; err != nil {
		return fmt.Errorf("seed feature %s: %w", feature.FeatureKey, err)
	}
	return nil
}

func migrateScriptEpisodePlanningFields(db *gorm.DB) error {
	return db.Exec(`
		ALTER TABLE scripts
			ADD COLUMN IF NOT EXISTS planned_scene_count bigint DEFAULT 0,
			ADD COLUMN IF NOT EXISTS planned_character_count bigint DEFAULT 0
	`).Error
}

func migrateStructuredScriptFields(db *gorm.DB) error {
	if err := db.AutoMigrate(&model.Script{}); err != nil {
		return err
	}
	return db.Exec(`
		UPDATE scripts
		SET raw_source = content
		WHERE (raw_source IS NULL OR raw_source = '')
			AND content IS NOT NULL
			AND content <> ''
	`).Error
}

func migrateRemoveFinalVideoStatusAndOrder(db *gorm.DB) error {
	for _, column := range []string{"status", "order"} {
		if !db.Migrator().HasColumn(&model.FinalVideo{}, column) {
			continue
		}
		if err := db.Migrator().DropColumn(&model.FinalVideo{}, column); err != nil {
			return err
		}
	}
	return nil
}

func migrateStoryboardSettingAndRemoveStatus(db *gorm.DB) error {
	if err := db.AutoMigrate(&model.Storyboard{}); err != nil {
		return err
	}
	for _, column := range []string{"status", "camera_angle", "camera_movement", "depth_of_field"} {
		if !db.Migrator().HasColumn(&model.Storyboard{}, column) {
			continue
		}
		if err := db.Migrator().DropColumn(&model.Storyboard{}, column); err != nil {
			return err
		}
	}
	return nil
}

func migrateRemoveEpisodeSceneDefinitionFields(db *gorm.DB) error {
	for _, stmt := range []string{
		`ALTER TABLE episodes DROP COLUMN IF EXISTS status`,
		`ALTER TABLE episodes DROP COLUMN IF EXISTS target_storyboards`,
		`ALTER TABLE episodes DROP COLUMN IF EXISTS target_scenes`,
		`ALTER TABLE scenes DROP COLUMN IF EXISTS location`,
		`ALTER TABLE scenes DROP COLUMN IF EXISTS time_of_day`,
	} {
		if err := db.Exec(stmt).Error; err != nil {
			return err
		}
	}
	return nil
}

func migrateEpisodeSceneReferenceTables(db *gorm.DB) error {
	return db.AutoMigrate(
		&model.Episode{},
		&model.Scene{},
		&model.EpisodeSettingRef{},
		&model.SceneSettingRef{},
		&model.Storyboard{},
	)
}

func migrateSettingRelationshipCategory(db *gorm.DB) error {
	if err := db.AutoMigrate(&model.SettingRelationship{}); err != nil {
		return err
	}
	return db.Model(&model.SettingRelationship{}).
		Where("category = ?", "character_relation").
		Update("category", "relationship").Error
}

func migrateSettingStateTags(db *gorm.DB) error {
	if err := db.AutoMigrate(&model.Setting{}); err != nil {
		return err
	}
	return db.Model(&model.Setting{}).
		Where("status = ?", "extracted").
		Update("status", "").Error
}

func migrateRemoveScriptStatusFields(db *gorm.DB) error {
	for _, column := range []string{"status", "review_status"} {
		if !db.Migrator().HasColumn(&model.Script{}, column) {
			continue
		}
		if err := db.Migrator().DropColumn(&model.Script{}, column); err != nil {
			return err
		}
	}
	return nil
}

func migrateRenameAgentChatFeature(db *gorm.DB) error {
	var legacy model.FeatureConfig
	legacyErr := db.Where("feature_key = ?", "agent_chat").First(&legacy).Error

	var current model.FeatureConfig
	currentErr := db.Where("feature_key = ?", "assistant_chat").First(&current).Error

	if legacyErr == nil && currentErr == nil {
		return db.Delete(&legacy).Error
	}
	if legacyErr == nil && errors.Is(currentErr, gorm.ErrRecordNotFound) {
		return db.Model(&legacy).Updates(map[string]any{
			"feature_key":  "assistant_chat",
			"display_name": "助手对话",
			"description":  "侧边栏助手，用于项目创作辅助对话",
		}).Error
	}
	if errors.Is(legacyErr, gorm.ErrRecordNotFound) && errors.Is(currentErr, gorm.ErrRecordNotFound) {
		return db.Create(&model.FeatureConfig{
			FeatureKey:      "assistant_chat",
			DisplayName:     "助手对话",
			Description:     "侧边栏助手，用于项目创作辅助对话",
			Capability:      "text",
			IsEnabled:       true,
			AllowedModelIDs: "[]",
			AllowedRoles:    "[]",
		}).Error
	}
	if legacyErr != nil && !errors.Is(legacyErr, gorm.ErrRecordNotFound) {
		return legacyErr
	}
	if currentErr != nil && !errors.Is(currentErr, gorm.ErrRecordNotFound) {
		return currentErr
	}
	return nil
}

func migrateAssetDirectResource(db *gorm.DB) error {
	if err := db.AutoMigrate(&model.Asset{}); err != nil {
		return err
	}
	return db.Exec(`
		UPDATE assets
		SET resource_id = picked.resource_id
		FROM (
			SELECT DISTINCT ON (av.asset_id)
				av.asset_id,
				rb.resource_id
			FROM asset_views av
			JOIN resource_bindings rb
				ON rb.owner_type = 'asset_view'
				AND rb.owner_id = av.id
				AND rb.deleted_at IS NULL
			WHERE av.deleted_at IS NULL
			ORDER BY av.asset_id, rb.is_primary DESC, rb.sort_order ASC, rb.created_at ASC
		) picked
		WHERE assets.id = picked.asset_id
			AND assets.deleted_at IS NULL
			AND assets.resource_id IS NULL
	`).Error
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
		checksum := migrationChecksum(migration)
		if existing, ok := applied[migration.Version]; ok {
			if existing.Checksum != checksum {
				return nil, fmt.Errorf("migration %s checksum mismatch: applied %s, current %s", migration.Version, existing.Checksum, checksum)
			}
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

func allModels() []any {
	return []any{
		&model.User{},
		&model.Project{},
		&model.ProjectMember{},
		&model.Script{},
		&model.ScriptPreviewDraft{},
		&model.ScriptVersion{},
		&model.ScriptSection{},
		&model.Situation{},
		&model.ContentUnit{},
		&model.Keyframe{},
		&model.PreviewTimeline{},
		&model.PreviewTimelineItem{},
		&model.CreativeReference{},
		&model.CreativeReferenceState{},
		&model.CreativeReferenceUsage{},
		&model.CreativeRelationship{},
		&model.AssetRequirement{},
		&model.AssetRequirementCandidate{},
		&model.WorkItem{},
		&model.WorkReview{},
		&model.WorkDependency{},
		&model.DeliveryVersion{},
		&model.DeliveryTimelineItem{},
		&model.ExportRecord{},
		&model.ScriptAnalysis{},
		&model.Setting{},
		&model.ScriptSettingRef{},
		&model.SettingRelationship{},
		&model.Asset{},
		&model.AssetView{},
		&model.Episode{},
		&model.EpisodeSettingRef{},
		&model.Scene{},
		&model.SceneSettingRef{},
		&model.EpisodeScene{},
		&model.Storyboard{},
		&model.Shot{},
		&model.FinalVideo{},
		&model.AICredential{},
		&model.AIModelConfig{},
		&model.UserQuota{},
		&model.UsageReservation{},
		&model.UsageLog{},
		&model.ResourceFolder{},
		&model.ResourceFolderPermission{},
		&model.RawResource{},
		&model.ResourceBinding{},
		&model.Canvas{},
		&model.CanvasNode{},
		&model.CanvasEdge{},
		&model.CanvasRun{},
		&model.CanvasTask{},
		&model.CanvasEntityWriteAudit{},
		&model.FeatureConfig{},
		&model.Job{},
		&model.Plugin{},
		&model.PluginTool{},
		&model.PluginSecret{},
		&model.GatewayAPIKey{},
		&model.GatewayRateLimitCounter{},
		&model.CloudFileConfig{},
		&model.AuditLog{},
	}
}
