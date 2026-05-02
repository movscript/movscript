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
	Version         string
	Name            string
	Up              func(*gorm.DB) error
	LegacyChecksums []string
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
			Name:    "semantic_entity_skeleton",
			Up:      migrateSemanticEntitySkeleton,
			LegacyChecksums: []string{
				"c8cf48991d28eab2da69743bca6348df3c4dddb81368d2a4ff0048281e67df82",
			},
		},
		{
			Version: "000019",
			Name:    "script_preview_draft_snapshots",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(&model.ProjectPreviewDraft{})
			},
		},
		{
			Version: "000020",
			Name:    "script_preview_draft_confirmed_state",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(&model.ProjectPreviewDraft{})
			},
		},
		{
			Version: "000021",
			Name:    "video_edit_tool_feature",
			Up:      migrateVideoEditToolFeature,
		},
		{
			Version: "000022",
			Name:    "semantic_reference_relation_review_fields",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(&model.CreativeReferenceUsage{}, &model.CreativeRelationship{})
			},
			LegacyChecksums: []string{
				"d3633f399fcb16a4b5318d23800797a6fda1813426c20d09f60269952911e63c",
			},
		},
		{
			Version: "000023",
			Name:    "semantic_storyboard_script_and_canvas_output",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(
					&model.StoryboardScript{},
					&model.StoryboardVersion{},
					&model.StoryboardLine{},
					&model.CanvasOutput{},
				)
			},
			LegacyChecksums: []string{
				"850375387445ecc43677ef9793df70fe5846c2531d169374fb03d17b3260f496",
			},
		},
		{
			Version: "000024",
			Name:    "semantic_candidate_decision_review_event",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(&model.CandidateDecision{}, &model.ReviewEvent{})
			},
			LegacyChecksums: []string{
				"04dc0c917ad899d93d8b043f3b004de5d63e1197f4c424627a7a890dda3d2256",
			},
		},
		{
			Version: "000025",
			Name:    "remove_v1_production_entities",
			Up:      migrateRemoveV1ProductionEntities,
		},
		{
			Version: "000026",
			Name:    "content_zone_semantic_tables",
			Up:      migrateContentZoneSemanticTables,
			LegacyChecksums: []string{
				"5d7f2fc3d9a572b8527617c0b4aaa8f58d0b7d3bce07674908dc327395ff7a46",
			},
		},
		{
			Version: "000027",
			Name:    "remove_legacy_asset_entities",
			Up:      migrateRemoveLegacyAssetEntities,
		},
		{
			Version: "000028",
			Name:    "optional_segment_script_reference",
			Up:      migrateOptionalSegmentScriptReference,
		},
	}
}

func migrateContentZoneSemanticTables(db *gorm.DB) error {
	if err := migrateRemoveV1ProductionEntities(db); err != nil {
		return err
	}
	return db.AutoMigrate(
		&model.ScriptVersion{},
		&model.Segment{},
		&model.SceneMoment{},
		&model.Production{},
		&model.StoryboardScript{},
		&model.StoryboardVersion{},
		&model.StoryboardLine{},
		&model.ContentUnit{},
		&model.Keyframe{},
		&model.PreviewTimeline{},
		&model.PreviewTimelineItem{},
		&model.CreativeReference{},
		&model.CreativeReferenceState{},
		&model.CreativeReferenceUsage{},
		&model.CreativeRelationship{},
		&model.AssetSlot{},
		&model.AssetSlotCandidate{},
		&model.WorkItem{},
		&model.DeliveryVersion{},
	)
}

func migrateOptionalSegmentScriptReference(db *gorm.DB) error {
	for _, stmt := range []string{
		`ALTER TABLE IF EXISTS segments ALTER COLUMN script_id DROP NOT NULL`,
		`ALTER TABLE IF EXISTS segments ALTER COLUMN script_version_id DROP NOT NULL`,
	} {
		if err := db.Exec(stmt).Error; err != nil {
			return err
		}
	}
	return db.AutoMigrate(&model.Segment{})
}

func migrateRemoveV1ProductionEntities(db *gorm.DB) error {
	for _, stmt := range []string{
		`DROP TABLE IF EXISTS final_videos CASCADE`,
		`DROP TABLE IF EXISTS shots CASCADE`,
		`DROP TABLE IF EXISTS storyboards CASCADE`,
		`DROP TABLE IF EXISTS episode_scenes CASCADE`,
		`DROP TABLE IF EXISTS scene_setting_refs CASCADE`,
		`DROP TABLE IF EXISTS scenes CASCADE`,
		`DROP TABLE IF EXISTS episode_setting_refs CASCADE`,
		`DROP TABLE IF EXISTS episodes CASCADE`,
	} {
		if err := db.Exec(stmt).Error; err != nil {
			return err
		}
	}
	return nil
}

func migrateRemoveLegacyAssetEntities(db *gorm.DB) error {
	for _, stmt := range []string{
		`ALTER TABLE asset_slots ADD COLUMN IF NOT EXISTS resource_id bigint`,
		`ALTER TABLE asset_slots ADD COLUMN IF NOT EXISTS locked_asset_slot_id bigint`,
		`ALTER TABLE asset_slots ADD COLUMN IF NOT EXISTS locked_asset_id bigint`,
		`ALTER TABLE asset_slot_candidates ADD COLUMN IF NOT EXISTS candidate_asset_slot_id bigint`,
		`ALTER TABLE asset_slot_candidates ADD COLUMN IF NOT EXISTS asset_id bigint`,
		`ALTER TABLE delivery_timeline_items ADD COLUMN IF NOT EXISTS asset_slot_id bigint`,
		`ALTER TABLE delivery_timeline_items ADD COLUMN IF NOT EXISTS asset_id bigint`,
	} {
		if err := db.Exec(stmt).Error; err != nil {
			return err
		}
	}

	if ok, err := tablesExist(db, "assets"); err != nil {
		return err
	} else if ok {
		if err := db.Exec(`
			INSERT INTO asset_slots (
				created_at, updated_at, deleted_at, project_id, kind, name, description,
				slot_key, prompt_hint, status, priority, resource_id, metadata_json
			)
			SELECT
				a.created_at,
				a.updated_at,
				a.deleted_at,
				a.project_id,
				COALESCE(NULLIF(a.type, ''), 'reference'),
				COALESCE(NULLIF(a.name, ''), 'Legacy asset #' || a.id::text),
				COALESCE(a.description, ''),
				'legacy_asset:' || a.id::text,
				COALESCE(a.prompt, ''),
				CASE WHEN a.review_status = 'approved' THEN 'locked' ELSE 'candidate' END,
				'normal',
				a.resource_id,
				jsonb_build_object(
					'legacy_asset_id', a.id,
					'variant_type', a.variant_type,
					'variant_name', a.variant_name,
					'setting_id', a.setting_id,
					'style_profile', a.style_profile
				)::text
			FROM assets a
			WHERE NOT EXISTS (
				SELECT 1 FROM asset_slots s
				WHERE s.project_id = a.project_id AND s.slot_key = 'legacy_asset:' || a.id::text
			)
		`).Error; err != nil {
			return err
		}
	}

	for _, stmt := range []string{
		`UPDATE asset_slots target
		 SET locked_asset_slot_id = source.id
		 FROM asset_slots source
		 WHERE target.locked_asset_id IS NOT NULL
		   AND source.project_id = target.project_id
		   AND source.slot_key = 'legacy_asset:' || target.locked_asset_id::text`,
		`UPDATE asset_slot_candidates candidate
		 SET candidate_asset_slot_id = source.id
		 FROM asset_slots source
		 WHERE candidate.asset_id IS NOT NULL
		   AND source.project_id = candidate.project_id
		   AND source.slot_key = 'legacy_asset:' || candidate.asset_id::text`,
		`UPDATE delivery_timeline_items item
		 SET asset_slot_id = source.id
		 FROM asset_slots source
		 WHERE item.asset_id IS NOT NULL
		   AND source.project_id = item.project_id
		   AND source.slot_key = 'legacy_asset:' || item.asset_id::text`,
		`ALTER TABLE asset_slots DROP COLUMN IF EXISTS locked_asset_id`,
		`ALTER TABLE asset_slot_candidates DROP COLUMN IF EXISTS asset_id`,
		`ALTER TABLE delivery_timeline_items DROP COLUMN IF EXISTS asset_id`,
		`DELETE FROM resource_bindings WHERE owner_type IN ('asset', 'asset_view')`,
		`DROP TABLE IF EXISTS asset_views CASCADE`,
		`DROP TABLE IF EXISTS assets CASCADE`,
	} {
		if err := db.Exec(stmt).Error; err != nil {
			return err
		}
	}
	return db.AutoMigrate(&model.AssetSlot{}, &model.AssetSlotCandidate{}, &model.DeliveryTimelineItem{})
}

func migrateSemanticEntitySkeleton(db *gorm.DB) error {
	return db.AutoMigrate(
		&model.ProjectPreviewDraft{},
		&model.ScriptVersion{},
		&model.Segment{},
		&model.SceneMoment{},
		&model.StoryboardScript{},
		&model.StoryboardVersion{},
		&model.StoryboardLine{},
		&model.ContentUnit{},
		&model.Keyframe{},
		&model.PreviewTimeline{},
		&model.PreviewTimelineItem{},
		&model.CreativeReference{},
		&model.CreativeReferenceState{},
		&model.CreativeReferenceUsage{},
		&model.CreativeRelationship{},
		&model.AssetSlot{},
		&model.AssetSlotCandidate{},
		&model.CandidateDecision{},
		&model.ReviewEvent{},
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
	if ok, err := tablesExist(db, "final_videos"); err != nil || !ok {
		return err
	}
	for _, column := range []string{"status", `"order"`} {
		if err := db.Exec("ALTER TABLE final_videos DROP COLUMN IF EXISTS " + column).Error; err != nil {
			return err
		}
	}
	return nil
}

func migrateStoryboardSettingAndRemoveStatus(db *gorm.DB) error {
	if ok, err := tablesExist(db, "storyboards"); err != nil || !ok {
		return err
	}
	for _, column := range []string{"status", "camera_angle", "camera_movement", "depth_of_field"} {
		if err := db.Exec("ALTER TABLE storyboards DROP COLUMN IF EXISTS " + column).Error; err != nil {
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
	return nil
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
	if ok, err := tablesExist(db, "assets", "asset_views", "resource_bindings"); err != nil || !ok {
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
				if !migrationAcceptsChecksum(migration, existing.Checksum) {
					return fmt.Errorf("migration %s checksum mismatch: applied %s, current %s", migration.Version, existing.Checksum, checksum)
				}
				if err := db.Model(&AppliedMigration{}).
					Where("version = ?", migration.Version).
					Updates(map[string]any{"name": migration.Name, "checksum": checksum}).Error; err != nil {
					return fmt.Errorf("update migration %s checksum: %w", migration.Version, err)
				}
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
				if !migrationAcceptsChecksum(migration, existing.Checksum) {
					return nil, fmt.Errorf("migration %s checksum mismatch: applied %s, current %s", migration.Version, existing.Checksum, checksum)
				}
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

func migrationAcceptsChecksum(migration Migration, checksum string) bool {
	for _, legacy := range migration.LegacyChecksums {
		if checksum == legacy {
			return true
		}
	}
	return false
}

func allModels() []any {
	return []any{
		&model.User{},
		&model.Project{},
		&model.ProjectMember{},
		&model.Script{},
		&model.ProjectPreviewDraft{},
		&model.ScriptVersion{},
		&model.Segment{},
		&model.SceneMoment{},
		&model.Production{},
		&model.ContentUnit{},
		&model.Keyframe{},
		&model.PreviewTimeline{},
		&model.PreviewTimelineItem{},
		&model.CreativeReference{},
		&model.CreativeReferenceState{},
		&model.CreativeReferenceUsage{},
		&model.CreativeRelationship{},
		&model.AssetSlot{},
		&model.AssetSlotCandidate{},
		&model.CandidateDecision{},
		&model.ReviewEvent{},
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
		&model.CanvasOutput{},
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
