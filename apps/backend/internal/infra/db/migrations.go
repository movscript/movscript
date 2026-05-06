package db

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	orgapp "github.com/movscript/movscript/internal/app/org"
	"github.com/movscript/movscript/internal/domain/model"
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
			Name:    "create_schema",
			Up: func(db *gorm.DB) error {
				if err := db.AutoMigrate(allModels()...); err != nil {
					return err
				}
				return seedFeatureConfigs(db)
			},
		},
		{
			Version: "000002",
			Name:    "add_organization_support",
			Up: func(db *gorm.DB) error {
				models := []any{
					&model.Organization{},
					&model.OrganizationMember{},
					&model.UserGroup{},
					&model.UserGroupMember{},
					&model.OrgInvitation{},
					&model.Project{},
					&model.AICredential{},
					&model.FeatureConfig{},
					&model.ResourceFolder{},
					&model.GatewayAPIKey{},
					&model.UsageLog{},
					&model.UsageReservation{},
					&model.AuditLog{},
				}
				models = append(models, editionMigrationModels()...)
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
				if err := db.AutoMigrate(&model.ProductionTextBlock{}, &model.Segment{}); err != nil {
					return err
				}
				migrator := db.Migrator()
				for _, column := range []string{"script_id", "script_version_id", "source_range"} {
					if migrator.HasColumn(&model.Segment{}, column) {
						if err := migrator.DropColumn(&model.Segment{}, column); err != nil {
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
				return db.AutoMigrate(&model.User{}, &model.AuthSession{}, &model.AuthChallenge{})
			},
		},
		{
			Version: "000006",
			Name:    "add_hub_packages",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(&model.HubPackage{})
			},
		},
		{
			Version: "000007",
			Name:    "add_org_join_codes",
			Up: func(db *gorm.DB) error {
				if err := db.AutoMigrate(&model.Organization{}); err != nil {
					return err
				}
				var orgs []model.Organization
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
	}
}

func seedDefaultOrg(db *gorm.DB) error {
	var count int64
	if err := db.Model(&model.Organization{}).Count(&count).Error; err != nil {
		return fmt.Errorf("check orgs: %w", err)
	}
	if count > 0 {
		return nil
	}

	var owner model.User
	if err := db.Where("system_role = ?", "super_admin").First(&owner).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return fmt.Errorf("find super_admin: %w", err)
	}

	org := model.Organization{
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

	var users []model.User
	if err := db.Find(&users).Error; err != nil {
		return fmt.Errorf("list users: %w", err)
	}
	for _, u := range users {
		role := "member"
		if u.SystemRole == "super_admin" {
			role = "owner"
		}
		member := model.OrganizationMember{OrgID: org.ID, UserID: u.ID, Role: role}
		if err := db.Create(&member).Error; err != nil {
			return fmt.Errorf("add user %d to default org: %w", u.ID, err)
		}
	}

	if err := db.Model(&model.Project{}).Where("org_id IS NULL").Update("org_id", org.ID).Error; err != nil {
		return fmt.Errorf("assign projects to default org: %w", err)
	}

	return nil
}

func seedFeatureConfigs(db *gorm.DB) error {
	features := []model.FeatureConfig{
		{FeatureKey: "script_analyze", DisplayName: "剧本 AI 分析", Description: "对剧本内容进行智能分析，提取人物、背景、场景等关键信息", Capability: "text", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "main_script_analyze", DisplayName: "主剧本 AI 分析", Description: "拆解主剧本，提取分集剧本、分场剧本和项目设定候选", Capability: "text", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "episode_script_analyze", DisplayName: "分集剧本 AI 分析", Description: "分析分集剧本，提取标题、描述、提纲、钩子和涉及分场", Capability: "text", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "scene_script_analyze", DisplayName: "分场剧本 AI 分析", Description: "分析分场剧本，提取时间、人物、场景、情节、氛围和提纲", Capability: "text", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "assistant_chat", DisplayName: "助手对话", Description: "侧边栏助手，用于项目创作辅助对话", Capability: "text", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "canvas_text", DisplayName: "画布·文本生成", Description: "画布工作流中的文本生成节点", Capability: "text", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "canvas_image", DisplayName: "画布·图像生成", Description: "画布工作流中的图像生成节点", Capability: "image", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "canvas_video", DisplayName: "画布·视频生成", Description: "画布工作流中的视频生成节点", Capability: "video", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "shot_ref_image", DisplayName: "分镜·参考图生成", Description: "根据分镜描述生成参考图", Capability: "image", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "shot_ref_video", DisplayName: "分镜·参考视频生成", Description: "根据参考图或描述生成参考视频", Capability: "video", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "ref_image_gen", DisplayName: "参考生图", Description: "以参考图为基础，生成新的图像；同时支持纯文本生图", Capability: "image", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "ref_video_gen", DisplayName: "参考生视频", Description: "以参考图或描述为基础，生成视频", Capability: "video", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "motion_imitation", DisplayName: "动作迁移", Description: "将参考视频的动作迁移到目标角色", Capability: "video_v2v", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "video_edit", DisplayName: "剪辑工具", Description: "基于源视频和剪辑指令生成处理后的视频", Capability: "video_v2v", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "style_transfer", DisplayName: "画风迁移", Description: "将参考图的画风迁移到目标图像", Capability: "image_edit", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "multi_angle", DisplayName: "多角度", Description: "从单张参考图生成多角度视图", Capability: "image_edit", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "brainstorm", DisplayName: "头脑风暴", Description: "AI 多轮对话，辅助创意发散与剧本构思", Capability: "text", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "production_orchestrate", DisplayName: "制作编排 AI 分析", Description: "从剧本文本中提取五类制作编排候选：片段、情节、创作资料、素材需求、内容单元", Capability: "text", IsEnabled: true, AllowedModelIDs: "[]"},
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

func allModels() []any {
	entities := []any{
		&model.User{},
		&model.AuthSession{},
		&model.AuthChallenge{},
		&model.Project{},
		&model.ProjectMember{},
		&model.Script{},
		&model.ScriptVersion{},
		&model.Production{},
		&model.ProductionTextBlock{},
		&model.Segment{},
		&model.SceneMoment{},
		&model.ContentUnit{},
		&model.Keyframe{},
		&model.PreviewTimeline{},
		&model.PreviewTimelineItem{},
		&model.CreativeReference{},
		&model.CreativeReferenceState{},
		&model.CreativeReferenceUsage{},
		&model.CreativeRelationship{},
		&model.EntityRelation{},
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
		&model.HubPackage{},
		&model.GatewayAPIKey{},
		&model.GatewayRateLimitCounter{},
		&model.CloudFileConfig{},
		&model.AuditLog{},
		&model.StoryboardScript{},
		&model.StoryboardVersion{},
		&model.StoryboardLine{},
		&model.Organization{},
		&model.OrganizationMember{},
		&model.UserGroup{},
		&model.UserGroupMember{},
		&model.OrgInvitation{},
	}
	return append(entities, editionMigrationModels()...)
}
