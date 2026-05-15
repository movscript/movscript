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
					&persistencemodel.Organization{},
					&persistencemodel.OrganizationMember{},
					&persistencemodel.UserGroup{},
					&persistencemodel.UserGroupMember{},
					&persistencemodel.OrgInvitation{},
					&persistencemodel.Project{},
					&persistencemodel.AICredential{},
					&persistencemodel.FeatureConfig{},
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
			Version: "000018",
			Name:    "link_storyboard_lines_to_script_blocks",
			Up: func(db *gorm.DB) error {
				return db.AutoMigrate(&persistencemodel.StoryboardLine{})
			},
		},
		{
			Version: "000019",
			Name:    "link_content_units_to_storyboard_lines",
			Up: func(db *gorm.DB) error {
				if err := db.AutoMigrate(&persistencemodel.ContentUnit{}); err != nil {
					return err
				}
				return backfillEntityRelationsByRows[persistencemodel.ContentUnit](db)
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
				return fmt.Errorf("create jobrunner index: %w", err)
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
			return fmt.Errorf("create jobrunner index %s: %w", idx.name, err)
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

func seedFeatureConfigs(db *gorm.DB) error {
	features := []persistencemodel.FeatureConfig{
		{FeatureKey: "script_analyze", DisplayName: "剧本 AI 分析", Description: "对剧本内容进行智能分析，提取人物、背景、场景等关键信息", Capability: "text", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "main_script_analyze", DisplayName: "主剧本 AI 分析", Description: "拆解主剧本，提取制作剧本、分场剧本和项目设定候选", Capability: "text", IsEnabled: true, AllowedModelIDs: "[]"},
		{FeatureKey: "episode_script_analyze", DisplayName: "制作剧本 AI 分析", Description: "分析制作剧本，提取标题、描述、提纲、钩子和涉及分场", Capability: "text", IsEnabled: true, AllowedModelIDs: "[]"},
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
		{FeatureKey: "production_orchestrate", DisplayName: "制作编排 AI 分析", Description: "从剧本文本中提取五类制作编排候选：片段、情节、设定资料、素材需求、内容单元", Capability: "text", IsEnabled: true, AllowedModelIDs: "[]"},
	}
	for _, feature := range features {
		var existing persistencemodel.FeatureConfig
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
		&persistencemodel.ResourceFolder{},
		&persistencemodel.ResourceFolderPermission{},
		&persistencemodel.RawResource{},
		&persistencemodel.ResourceBinding{},
		&persistencemodel.Canvas{},
		&persistencemodel.CanvasNode{},
		&persistencemodel.CanvasEdge{},
		&persistencemodel.CanvasRun{},
		&persistencemodel.CanvasTask{},
		&persistencemodel.CanvasEntityWriteAudit{},
		&persistencemodel.CanvasOutput{},
		&persistencemodel.FeatureConfig{},
		&persistencemodel.Job{},
		&persistencemodel.Plugin{},
		&persistencemodel.PluginTool{},
		&persistencemodel.PluginSecret{},
		&persistencemodel.HubPackage{},
		&persistencemodel.GatewayAPIKey{},
		&persistencemodel.CloudFileConfig{},
		&persistencemodel.AuditLog{},
		&persistencemodel.StoryboardScript{},
		&persistencemodel.StoryboardVersion{},
		&persistencemodel.StoryboardLine{},
		&persistencemodel.Organization{},
		&persistencemodel.OrganizationMember{},
		&persistencemodel.UserGroup{},
		&persistencemodel.UserGroupMember{},
		&persistencemodel.OrgInvitation{},
	}
	return append(entities, runtimeMigrationModels()...)
}
