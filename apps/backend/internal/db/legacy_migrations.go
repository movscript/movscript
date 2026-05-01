package db

import (
	"errors"
	"fmt"

	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

func runLegacyCleanupAndBackfill(db *gorm.DB) error {
	statements := []string{
		"DROP TABLE IF EXISTS task_comments",
		"DROP TABLE IF EXISTS tasks",

		// Convert legacy 0 values to NULL now that FK columns are nullable.
		"UPDATE storyboards SET scene_id = NULL WHERE scene_id = 0",
		"UPDATE storyboards SET episode_id = NULL WHERE episode_id = 0",
		"UPDATE shots SET storyboard_id = NULL WHERE storyboard_id = 0",

		// Backfill episode.project_id from linked script.
		`
			UPDATE episodes SET project_id = s.project_id
			FROM scripts s
			WHERE episodes.script_id = s.id AND (episodes.project_id = 0 OR episodes.project_id IS NULL)
		`,

		// Canonical relation: episode scripts point to their Episode via scripts.episode_id.
		`
			UPDATE scripts s
			SET episode_id = e.id
			FROM episodes e
			WHERE e.script_id = s.id
				AND s.script_type = 'episode'
				AND (s.episode_id IS NULL OR s.episode_id = 0)
		`,
		`
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
		`,

		// Content entities no longer store RawResource IDs directly.
		"ALTER TABLE scripts DROP COLUMN IF EXISTS resource_ids",
		"ALTER TABLE episodes DROP COLUMN IF EXISTS resource_ids",
		"ALTER TABLE scenes DROP COLUMN IF EXISTS resource_ids",
		"ALTER TABLE storyboards DROP COLUMN IF EXISTS resource_ids",
		"ALTER TABLE shots DROP COLUMN IF EXISTS ref_resource_ids",
		"ALTER TABLE shots DROP COLUMN IF EXISTS generated_res_id",
		"ALTER TABLE final_videos DROP COLUMN IF EXISTS resource_id",
		"ALTER TABLE assets DROP COLUMN IF EXISTS reference_ids",
		"ALTER TABLE asset_views DROP COLUMN IF EXISTS resource_id",

		// Backfill storyboard.project_id from linked scene.
		`
			UPDATE storyboards sb
			SET project_id = sc.project_id
			FROM scenes sc
			WHERE sb.scene_id = sc.id AND (sb.project_id = 0 OR sb.project_id IS NULL)
		`,

		// Backfill shot.project_id from linked storyboard.
		`
			UPDATE shots sh
			SET project_id = sb.project_id
			FROM storyboards sb
			WHERE sh.storyboard_id = sb.id AND (sh.project_id = 0 OR sh.project_id IS NULL)
		`,
	}

	for _, statement := range statements {
		if err := execSQL(db, statement); err != nil {
			return err
		}
	}

	if err := relaxLegacyUserColumns(db); err != nil {
		return err
	}
	if err := migrateShotCameraParams(db); err != nil {
		return err
	}
	return nil
}

func relaxLegacyUserColumns(db *gorm.DB) error {
	migrator := db.Migrator()
	for _, col := range []string{"name", "email", "role"} {
		if migrator.HasColumn(&model.User{}, col) {
			if err := execSQL(db, "ALTER TABLE users ALTER COLUMN "+col+" DROP NOT NULL"); err != nil {
				return err
			}
		}
	}
	return nil
}

func migrateShotCameraParams(db *gorm.DB) error {
	migrator := db.Migrator()
	for _, col := range []string{"camera_angle", "camera_movement", "depth_of_field", "lighting", "duration"} {
		if migrator.HasColumn(&model.Shot{}, col) {
			if err := migrator.DropColumn(&model.Shot{}, col); err != nil {
				return fmt.Errorf("drop shots.%s: %w", col, err)
			}
		}
	}

	shotParamCols := []string{"shot_size", "angle", "movement", "focal_length", "pacing", "intent"}
	var legacyShotParamCount int64
	if err := db.Raw(`
		SELECT COUNT(*)
		FROM information_schema.columns
		WHERE table_name = 'shots' AND column_name IN ?
	`, shotParamCols).Scan(&legacyShotParamCount).Error; err != nil {
		return fmt.Errorf("inspect legacy shot params: %w", err)
	}
	if legacyShotParamCount != int64(len(shotParamCols)) {
		return nil
	}

	if err := execSQL(db, `
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
	`); err != nil {
		return err
	}

	for _, col := range shotParamCols {
		if err := execSQL(db, "ALTER TABLE shots DROP COLUMN IF EXISTS "+col); err != nil {
			return err
		}
	}
	return nil
}

func seedDefaultFeatureConfigs(db *gorm.DB) error {
	seedFeatures := []model.FeatureConfig{
		{FeatureKey: "script_analyze", DisplayName: "剧本 AI 分析", Description: "对剧本内容进行智能分析，提取人物、背景、场景等关键信息", Capability: "text", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "main_script_analyze", DisplayName: "主剧本 AI 分析", Description: "拆解主剧本，提取分集剧本、分场剧本和项目设定候选", Capability: "text", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "episode_script_analyze", DisplayName: "分集剧本 AI 分析", Description: "分析分集剧本，提取标题、描述、提纲、钩子和涉及分场", Capability: "text", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "scene_script_analyze", DisplayName: "分场剧本 AI 分析", Description: "分析分场剧本，提取时间、人物、场景、情节、氛围和提纲", Capability: "text", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "agent_chat", DisplayName: "AI 助手对话", Description: "侧边栏 AI 助手，用于项目创作辅助对话", Capability: "text", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "canvas_text", DisplayName: "画布·文本生成", Description: "画布工作流中的文本生成节点", Capability: "text", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "canvas_image", DisplayName: "画布·图像生成", Description: "画布工作流中的图像生成节点", Capability: "image", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "canvas_video", DisplayName: "画布·视频生成", Description: "画布工作流中的视频生成节点", Capability: "video", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "shot_ref_image", DisplayName: "分镜·参考图生成", Description: "根据分镜描述生成参考图", Capability: "image", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "shot_ref_video", DisplayName: "分镜·参考视频生成", Description: "根据参考图或描述生成参考视频", Capability: "video", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "ref_image_gen", DisplayName: "参考生图", Description: "以参考图为基础，生成新的图像；同时支持纯文本生图", Capability: "image", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "ref_video_gen", DisplayName: "参考生视频", Description: "以参考图或描述为基础，生成视频", Capability: "video", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "motion_imitation", DisplayName: "动作迁移", Description: "将参考视频的动作迁移到目标角色", Capability: "video", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "style_transfer", DisplayName: "画风迁移", Description: "将参考图的画风迁移到目标图像", Capability: "image", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "multi_angle", DisplayName: "多角度", Description: "从单张参考图生成多角度视图", Capability: "image", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "brainstorm", DisplayName: "头脑风暴", Description: "AI 多轮对话，辅助创意发散与剧本构思", Capability: "text", IsEnabled: true, AllowedModelIDs: "[]"},
	}

	for _, feature := range seedFeatures {
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

func execSQL(db *gorm.DB, statement string) error {
	if err := db.Exec(statement).Error; err != nil {
		return fmt.Errorf("execute migration SQL %q: %w", statement, err)
	}
	return nil
}
