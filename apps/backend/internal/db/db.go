package db

import (
	"fmt"

	"github.com/movscript/movscript/internal/config"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func Connect(cfg *config.Config) (*gorm.DB, error) {
	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		cfg.DBHost, cfg.DBPort, cfg.DBUser, cfg.DBPassword, cfg.DBName,
	)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		// Prevents GORM from trying to create FK constraints across tables during
		// AutoMigrate. Without this, migrating Script (which has a has-many to Episode)
		// causes GORM to ALTER episodes before that table exists, rolling back the
		// entire transaction and leaving scripts uncreated — which then breaks the
		// Episode migration that references it.
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		return nil, err
	}

	// PipelineNode is the only production task unit; remove the old standalone
	// task tables instead of keeping compatibility shims.
	db.Exec("DROP TABLE IF EXISTS task_comments")
	db.Exec("DROP TABLE IF EXISTS tasks")

	// Migrate: convert legacy 0 values to NULL now that FK columns are nullable.
	// These 0 values were written by earlier NULL→0 patches; replace with proper NULLs.
	db.Exec("UPDATE storyboards SET scene_id = NULL WHERE scene_id = 0")
	db.Exec("UPDATE storyboards SET episode_id = NULL WHERE episode_id = 0")
	db.Exec("UPDATE shots SET storyboard_id = NULL WHERE storyboard_id = 0")

	// Backfill episode.project_id from linked script (for episodes created before this migration)
	db.Exec(`
		UPDATE episodes SET project_id = s.project_id
		FROM scripts s
		WHERE episodes.script_id = s.id AND (episodes.project_id = 0 OR episodes.project_id IS NULL)
	`)

	// Canonical relation: episode scripts point to their Episode via scripts.episode_id.
	// Keep episodes.script_id as a legacy compatibility mirror for existing clients.
	db.Exec(`
		UPDATE scripts s
		SET episode_id = e.id
		FROM episodes e
		WHERE e.script_id = s.id
			AND s.script_type = 'episode'
			AND (s.episode_id IS NULL OR s.episode_id = 0)
	`)
	db.Exec(`
		UPDATE episodes e
		SET script_id = s.id
		FROM (
			SELECT DISTINCT ON (episode_id) id, episode_id
			FROM scripts
			WHERE script_type = 'episode' AND episode_id IS NOT NULL
			ORDER BY episode_id, updated_at DESC, id DESC
		) s
		WHERE e.id = s.episode_id
			AND (e.script_id IS NULL OR e.script_id = 0)
	`)

	if err := db.AutoMigrate(
		&model.User{},
		&model.Project{},
		&model.ProjectMember{},
		&model.Script{},
		&model.ScriptAnalysis{},
		&model.Setting{},
		&model.ScriptSettingRef{},
		&model.SettingRelationship{},
		&model.Asset{},
		&model.AssetView{},
		&model.Episode{},
		&model.Scene{},
		&model.EpisodeScene{},
		&model.Storyboard{},
		&model.Shot{},
		&model.FinalVideo{},
		&model.AICredential{},
		&model.AIModelConfig{},
		&model.UserQuota{},
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
		&model.FeatureConfig{},
		&model.GenJob{},
		&model.Plugin{},
		&model.PluginTool{},
		&model.PluginSecret{},
		&model.PipelineNode{},
		&model.PipelineEdge{},
		&model.AgentTemplate{},
		&model.UserAgent{},
		&model.GatewayAPIKey{},
		&model.CloudFileConfig{},
	); err != nil {
		return nil, err
	}

	// Development-stage canonical resource ownership: content entities no longer
	// store RawResource IDs directly. ResourceBinding is the only content-library
	// ownership/role table.
	db.Exec("ALTER TABLE scripts DROP COLUMN IF EXISTS resource_ids")
	db.Exec("ALTER TABLE episodes DROP COLUMN IF EXISTS resource_ids")
	db.Exec("ALTER TABLE scenes DROP COLUMN IF EXISTS resource_ids")
	db.Exec("ALTER TABLE storyboards DROP COLUMN IF EXISTS resource_ids")
	db.Exec("ALTER TABLE shots DROP COLUMN IF EXISTS ref_resource_ids")
	db.Exec("ALTER TABLE shots DROP COLUMN IF EXISTS generated_res_id")
	db.Exec("ALTER TABLE final_videos DROP COLUMN IF EXISTS resource_id")
	db.Exec("ALTER TABLE assets DROP COLUMN IF EXISTS reference_ids")
	db.Exec("ALTER TABLE asset_views DROP COLUMN IF EXISTS resource_id")

	db.Exec("UPDATE pipeline_edges SET relation_type = 'hierarchy' WHERE relation_type IS NULL OR relation_type = ''")

	// Seed default feature configs (idempotent — only creates rows that don't exist yet).
	seedFeatures := []model.FeatureConfig{
		// Internal features
		{FeatureKey: "script_analyze", DisplayName: "剧本 AI 分析", Description: "对剧本内容进行智能分析，提取人物、背景、场景等关键信息", Capability: "text", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "agent_chat", DisplayName: "AI 助手对话", Description: "侧边栏 AI 助手，用于项目创作辅助对话", Capability: "text", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "canvas_text", DisplayName: "画布·文本生成", Description: "画布工作流中的文本生成节点", Capability: "text", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "canvas_image", DisplayName: "画布·图像生成", Description: "画布工作流中的图像生成节点", Capability: "image", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "canvas_video", DisplayName: "画布·视频生成", Description: "画布工作流中的视频生成节点", Capability: "video", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "shot_ref_image", DisplayName: "分镜·参考图生成", Description: "根据分镜描述生成参考图", Capability: "image", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "shot_ref_video", DisplayName: "分镜·参考视频生成", Description: "根据参考图或描述生成参考视频", Capability: "video", IsEnabled: true, AllowedModelIDs: "[]"},
		// Tool features (user-facing)
		{FeatureKey: "ref_image_gen", DisplayName: "参考生图", Description: "以参考图为基础，生成新的图像；同时支持纯文本生图", Capability: "image", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "ref_video_gen", DisplayName: "参考生视频", Description: "以参考图或描述为基础，生成视频", Capability: "video", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "motion_imitation", DisplayName: "动作迁移", Description: "将参考视频的动作迁移到目标角色", Capability: "video", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "style_transfer", DisplayName: "画风迁移", Description: "将参考图的画风迁移到目标图像", Capability: "image", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "multi_angle", DisplayName: "多角度", Description: "从单张参考图生成多角度视图", Capability: "image", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "brainstorm", DisplayName: "头脑风暴", Description: "AI 多轮对话，辅助创意发散与剧本构思", Capability: "text", IsEnabled: true, AllowedModelIDs: "[]"},
	}
	for _, f := range seedFeatures {
		var existing model.FeatureConfig
		if db.Where("feature_key = ?", f.FeatureKey).First(&existing).Error != nil {
			db.Create(&f)
		}
	}

	// Backfill storyboard.project_id from linked scene.
	db.Exec(`
		UPDATE storyboards sb
		SET project_id = sc.project_id
		FROM scenes sc
		WHERE sb.scene_id = sc.id AND (sb.project_id = 0 OR sb.project_id IS NULL)
	`)

	// Backfill shot.project_id from linked storyboard.
	db.Exec(`
		UPDATE shots sh
		SET project_id = sb.project_id
		FROM storyboards sb
		WHERE sh.storyboard_id = sb.id AND (sh.project_id = 0 OR sh.project_id IS NULL)
	`)

	// Drop legacy columns that were removed from the User model.
	// AutoMigrate only adds columns, never removes them.
	migrator := db.Migrator()
	for _, col := range []string{"name", "email", "role"} {
		if migrator.HasColumn(&model.User{}, col) {
			db.Exec("ALTER TABLE users ALTER COLUMN " + col + " DROP NOT NULL")
		}
	}

	// Drop camera parameters moved from shots to storyboards.
	for _, col := range []string{"camera_angle", "camera_movement", "depth_of_field", "lighting", "duration"} {
		if migrator.HasColumn(&model.Shot{}, col) {
			migrator.DropColumn(&model.Shot{}, col)
		}
	}
	shotParamCols := []string{"shot_size", "angle", "movement", "focal_length", "pacing", "intent"}
	var legacyShotParamCount int64
	db.Raw(`
		SELECT COUNT(*)
		FROM information_schema.columns
		WHERE table_name = 'shots' AND column_name IN ?
	`, shotParamCols).Scan(&legacyShotParamCount)
	if legacyShotParamCount == int64(len(shotParamCols)) {
		db.Exec(`
			UPDATE storyboards sb
			SET
				shot_size = COALESCE(NULLIF(sb.shot_size, ''), sh.shot_size),
				angle = COALESCE(NULLIF(sb.angle, ''), sh.angle),
				movement = COALESCE(NULLIF(sb.movement, ''), sh.movement),
				focal_length = COALESCE(NULLIF(sb.focal_length, ''), sh.focal_length),
				pacing = COALESCE(NULLIF(sb.pacing, ''), sh.pacing),
				intent = COALESCE(NULLIF(sb.intent, ''), sh.intent)
			FROM (
				SELECT DISTINCT ON (storyboard_id)
					storyboard_id, shot_size, angle, movement, focal_length, pacing, intent
				FROM shots
				WHERE storyboard_id IS NOT NULL
				ORDER BY storyboard_id, "order", id
			) sh
			WHERE sb.id = sh.storyboard_id
		`)
		for _, col := range shotParamCols {
			db.Exec("ALTER TABLE shots DROP COLUMN IF EXISTS " + col)
		}
	}

	// Backfill pipeline_node.content_type from type field for existing data.
	db.Exec(`
		UPDATE pipeline_nodes SET content_type = CASE
			WHEN type IN ('script_writing','raw_script','main_script','episode_writing','episode_script','scene_writing','scene_script') THEN 'script'
			WHEN type IN ('storyboard_creation','storyboard_script','storyboard') THEN 'storyboard'
			WHEN type IN ('shot_production','shot') THEN 'shot'
			WHEN type IN ('asset_creation','asset') THEN 'asset'
			WHEN type IN ('episode') THEN 'episode'
			WHEN type IN ('episode_edit','final_video') THEN 'final_video'
			WHEN type IN ('scene') THEN 'scene'
			ELSE 'custom'
		END
	`)

	// Backfill content entity pipeline links from existing pipeline node entity links.
	db.Exec(`
		UPDATE scripts e SET pipeline_node_id = pn.id
		FROM pipeline_nodes pn
		WHERE pn.entity_type = 'script' AND pn.entity_id = e.id AND e.pipeline_node_id IS NULL
	`)
	db.Exec(`
		UPDATE storyboards e SET pipeline_node_id = pn.id
		FROM pipeline_nodes pn
		WHERE pn.entity_type = 'storyboard' AND pn.entity_id = e.id AND e.pipeline_node_id IS NULL
	`)
	db.Exec(`
		UPDATE shots e SET pipeline_node_id = pn.id
		FROM pipeline_nodes pn
		WHERE pn.entity_type = 'shot' AND pn.entity_id = e.id AND e.pipeline_node_id IS NULL
	`)
	db.Exec(`
		UPDATE assets e SET pipeline_node_id = pn.id
		FROM pipeline_nodes pn
		WHERE pn.entity_type = 'asset' AND pn.entity_id = e.id AND e.pipeline_node_id IS NULL
	`)
	db.Exec(`
		UPDATE episodes e SET pipeline_node_id = pn.id
		FROM pipeline_nodes pn
		WHERE pn.entity_type = 'episode' AND pn.entity_id = e.id AND e.pipeline_node_id IS NULL
	`)
	db.Exec(`
		UPDATE scenes e SET pipeline_node_id = pn.id
		FROM pipeline_nodes pn
		WHERE pn.entity_type = 'scene' AND pn.entity_id = e.id AND e.pipeline_node_id IS NULL
	`)
	db.Exec(`
		UPDATE final_videos e SET pipeline_node_id = pn.id
		FROM pipeline_nodes pn
		WHERE pn.entity_type = 'final_video' AND pn.entity_id = e.id AND e.pipeline_node_id IS NULL
	`)

	return db, nil
}
