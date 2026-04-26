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

	if err := db.AutoMigrate(
		&model.User{},
		&model.Project{},
		&model.ProjectMember{},
		&model.Script{},
		&model.Setting{},
		&model.Asset{},
		&model.AssetView{},
		&model.Episode{},
		&model.Scene{},
		&model.EpisodeScene{},
		&model.Storyboard{},
		&model.Shot{},
		&model.Task{},
		&model.TaskComment{},
		&model.AICredential{},
		&model.AIModelConfig{},
		&model.UserQuota{},
		&model.UsageLog{},
		&model.ResourceFolder{},
		&model.ResourceFolderPermission{},
		&model.RawResource{},
		&model.Canvas{},
		&model.CanvasNode{},
		&model.CanvasEdge{},
		&model.CanvasRun{},
		&model.CanvasTask{},
		&model.FeatureConfig{},
		&model.GenJob{},
		&model.PipelineNode{},
		&model.PipelineEdge{},
		&model.AgentTemplate{},
		&model.UserAgent{},
		&model.CloudFileConfig{},
	); err != nil {
		return nil, err
	}

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

	return db, nil
}
