package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/movscript/movscript/internal/infra/crypto"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

const ProviderInstanceConfigSettingKeyPrefix = "provider_instance_config:"

var ErrInvalidProviderInstanceConfig = errors.New("invalid provider instance config")

type ProviderInstanceConfigDraftInput struct {
	Config  map[string]string `json:"config"`
	Secrets map[string]string `json:"secrets"`
}

type ProviderInstanceConfigDraft struct {
	ProviderInstanceID string                  `json:"provider_instance_id"`
	Config             map[string]string       `json:"config"`
	ConfigFields       []ProviderInstanceField `json:"config_fields"`
	SecretFields       []ProviderInstanceField `json:"secret_fields"`
	RequiresRestart    bool                    `json:"requires_restart"`
	Applied            bool                    `json:"applied"`
}

type ProviderInstanceConfigApplyResult struct {
	ProviderInstanceID string                 `json:"provider_instance_id"`
	EnvPath            string                 `json:"env_path"`
	EnvKeys            []string               `json:"env_keys"`
	SecretKeys         []string               `json:"secret_keys"`
	RequiresRestart    bool                   `json:"requires_restart"`
	ActivationMode     string                 `json:"activation_mode"`
	ActivationPlan     ProviderActivationPlan `json:"activation_plan"`
	Applied            bool                   `json:"applied"`
}

type ProviderActivationPlan struct {
	Mode              string   `json:"mode"`
	Action            string   `json:"action"`
	Host              string   `json:"host"`
	EnvPath           string   `json:"env_path"`
	RequiresRestart   bool     `json:"requires_restart"`
	CanAutoApply      bool     `json:"can_auto_apply"`
	AutoApplyChannel  string   `json:"auto_apply_channel,omitempty"`
	AutoApplyURL      string   `json:"auto_apply_url,omitempty"`
	AutoApplyEndpoint string   `json:"auto_apply_endpoint,omitempty"`
	EnvKeys           []string `json:"env_keys"`
	SecretKeys        []string `json:"secret_keys"`
}

type ProviderActivationPlanOptions struct {
	ProviderInstanceID                 string
	DeploymentRolloutWebhookConfigured bool
}

type ProviderActivationApplyResult struct {
	ProviderInstanceID string                 `json:"provider_instance_id"`
	ActivationMode     string                 `json:"activation_mode"`
	ActivationPlan     ProviderActivationPlan `json:"activation_plan"`
	Success            bool                   `json:"success"`
	Message            string                 `json:"message"`
	LatencyMs          int64                  `json:"latency_ms"`
}

type providerInstanceConfigStored struct {
	Config  map[string]string `json:"config"`
	Secrets map[string]string `json:"secrets"`
}

func (s *Service) GetProviderInstanceConfigDraft(ctx context.Context, instance ProviderInstance) (ProviderInstanceConfigDraft, error) {
	stored, err := s.loadProviderInstanceConfigStored(ctx, instance.ID)
	if err != nil {
		return ProviderInstanceConfigDraft{}, err
	}
	return publicProviderInstanceConfigDraft(instance, stored), nil
}

func (s *Service) UpdateProviderInstanceConfigDraft(ctx context.Context, instance ProviderInstance, input ProviderInstanceConfigDraftInput) (ProviderInstanceConfigDraft, error) {
	current, err := s.loadProviderInstanceConfigStored(ctx, instance.ID)
	if err != nil {
		return ProviderInstanceConfigDraft{}, err
	}
	stored, err := s.normalizeProviderInstanceConfigInput(instance, input, current)
	if err != nil {
		return ProviderInstanceConfigDraft{}, err
	}
	raw, err := json.Marshal(stored)
	if err != nil {
		return ProviderInstanceConfigDraft{}, err
	}
	if err := s.saveProviderInstanceConfigStored(ctx, instance.ID, string(raw)); err != nil {
		return ProviderInstanceConfigDraft{}, err
	}
	return publicProviderInstanceConfigDraft(instance, stored), nil
}

func (s *Service) ApplyProviderInstanceConfigDraft(ctx context.Context, instance ProviderInstance, envPath string) (ProviderInstanceConfigApplyResult, error) {
	envPath = strings.TrimSpace(envPath)
	if envPath == "" {
		return ProviderInstanceConfigApplyResult{}, fmt.Errorf("%w: provider env path is empty", ErrInvalidProviderInstanceConfig)
	}
	stored, err := s.loadProviderInstanceConfigStored(ctx, instance.ID)
	if err != nil {
		return ProviderInstanceConfigApplyResult{}, err
	}
	patch, secretKeys, err := s.providerInstanceEnvPatch(instance, stored)
	if err != nil {
		return ProviderInstanceConfigApplyResult{}, err
	}
	if len(patch) == 0 {
		return ProviderInstanceConfigApplyResult{}, fmt.Errorf("%w: provider config draft is empty", ErrInvalidProviderInstanceConfig)
	}
	existing, err := readEnvFile(envPath)
	if err != nil {
		return ProviderInstanceConfigApplyResult{}, err
	}
	for key, value := range patch {
		existing[key] = value
	}
	if err := writeEnvFileAtomic(envPath, existing); err != nil {
		return ProviderInstanceConfigApplyResult{}, err
	}
	envKeys := make([]string, 0, len(patch))
	for key := range patch {
		envKeys = append(envKeys, key)
	}
	sort.Strings(envKeys)
	sort.Strings(secretKeys)
	return ProviderInstanceConfigApplyResult{
		ProviderInstanceID: instance.ID,
		EnvPath:            envPath,
		EnvKeys:            envKeys,
		SecretKeys:         secretKeys,
		RequiresRestart:    true,
		ActivationMode:     "manual_restart",
		ActivationPlan:     ProviderActivationPlanForMode("manual_restart", envPath, envKeys, secretKeys),
		Applied:            true,
	}, nil
}

func ProviderActivationMode(deploymentProfile string) string {
	switch strings.TrimSpace(deploymentProfile) {
	case "personal-local":
		return "local_backend_restart"
	case "team-cloud":
		return "deployment_rollout"
	default:
		return "manual_restart"
	}
}

func ProviderActivationPlanForMode(mode string, envPath string, envKeys []string, secretKeys []string) ProviderActivationPlan {
	return ProviderActivationPlanForModeWithOptions(mode, envPath, envKeys, secretKeys, ProviderActivationPlanOptions{})
}

func ProviderActivationPlanForModeWithOptions(mode string, envPath string, envKeys []string, secretKeys []string, opts ProviderActivationPlanOptions) ProviderActivationPlan {
	mode = strings.TrimSpace(mode)
	if mode == "" {
		mode = "manual_restart"
	}
	plan := ProviderActivationPlan{
		Mode:            mode,
		EnvPath:         strings.TrimSpace(envPath),
		RequiresRestart: true,
		EnvKeys:         append([]string(nil), envKeys...),
		SecretKeys:      append([]string(nil), secretKeys...),
	}
	switch mode {
	case "local_backend_restart":
		plan.Action = "restart_local_backend"
		plan.Host = "electron"
		plan.CanAutoApply = true
		plan.AutoApplyChannel = "movscript.provider_activation.restart_local_backend"
		plan.AutoApplyURL = "movscript://provider-activation/restart-local-backend"
	case "deployment_rollout":
		plan.Action = "rollout_backend_deployment"
		plan.Host = "deployment_platform"
		plan.CanAutoApply = opts.DeploymentRolloutWebhookConfigured && strings.TrimSpace(opts.ProviderInstanceID) != ""
		if plan.CanAutoApply {
			plan.AutoApplyChannel = "backend.deployment.rollout_webhook"
			plan.AutoApplyEndpoint = "/admin/provider-instances/" + strings.TrimSpace(opts.ProviderInstanceID) + "/config/activate"
		}
	default:
		plan.Action = "restart_backend_process"
		plan.Host = "operator"
		plan.CanAutoApply = false
	}
	return plan
}

func (s *Service) loadProviderInstanceConfigStored(ctx context.Context, instanceID string) (providerInstanceConfigStored, error) {
	var setting persistencemodel.AdminSetting
	err := s.db.WithContext(ctx).Where("key = ?", providerInstanceConfigSettingKey(instanceID)).First(&setting).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return providerInstanceConfigStored{Config: map[string]string{}, Secrets: map[string]string{}}, nil
		}
		return providerInstanceConfigStored{}, err
	}
	var stored providerInstanceConfigStored
	if err := json.Unmarshal([]byte(setting.ValueJSON), &stored); err != nil {
		return providerInstanceConfigStored{Config: map[string]string{}, Secrets: map[string]string{}}, nil
	}
	if stored.Config == nil {
		stored.Config = map[string]string{}
	}
	if stored.Secrets == nil {
		stored.Secrets = map[string]string{}
	}
	return stored, nil
}

func (s *Service) providerInstanceEnvPatch(instance ProviderInstance, stored providerInstanceConfigStored) (map[string]string, []string, error) {
	patch := providerInstanceAdapterEnvPatch(instance)
	secretKeys := []string{}
	for key, value := range stored.Config {
		envKey, ok := providerInstanceFieldEnvKey(key)
		if !ok || strings.TrimSpace(value) == "" {
			continue
		}
		patch[envKey] = value
	}
	for key, value := range stored.Secrets {
		envKey, ok := providerInstanceFieldEnvKey(key)
		if !ok || strings.TrimSpace(value) == "" {
			continue
		}
		if len(s.encryptionKey) > 0 {
			plain, err := crypto.Decrypt(value, s.encryptionKey)
			if err != nil {
				return nil, nil, err
			}
			value = plain
		}
		patch[envKey] = value
		secretKeys = append(secretKeys, envKey)
	}
	return patch, secretKeys, nil
}

func (s *Service) saveProviderInstanceConfigStored(ctx context.Context, instanceID string, valueJSON string) error {
	key := providerInstanceConfigSettingKey(instanceID)
	var setting persistencemodel.AdminSetting
	err := s.db.WithContext(ctx).Where("key = ?", key).First(&setting).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return s.db.WithContext(ctx).Create(&persistencemodel.AdminSetting{Key: key, ValueJSON: valueJSON}).Error
		}
		return err
	}
	setting.ValueJSON = valueJSON
	return s.db.WithContext(ctx).Save(&setting).Error
}

func (s *Service) normalizeProviderInstanceConfigInput(instance ProviderInstance, input ProviderInstanceConfigDraftInput, current providerInstanceConfigStored) (providerInstanceConfigStored, error) {
	configKeys := providerFieldKeySet(instance.ConfigFields)
	secretKeys := providerFieldKeySet(instance.SecretFields)
	stored := providerInstanceConfigStored{
		Config:  map[string]string{},
		Secrets: map[string]string{},
	}
	for key, value := range current.Config {
		if configKeys[key] {
			stored.Config[key] = value
		}
	}
	for key, value := range current.Secrets {
		if secretKeys[key] {
			stored.Secrets[key] = value
		}
	}
	for key, value := range input.Config {
		key = strings.TrimSpace(key)
		if key == "" || !configKeys[key] {
			return providerInstanceConfigStored{}, fmt.Errorf("%w: unsupported config field %q", ErrInvalidProviderInstanceConfig, key)
		}
		value = strings.TrimSpace(value)
		if value == "" {
			delete(stored.Config, key)
			continue
		}
		stored.Config[key] = value
	}
	for key, value := range input.Secrets {
		key = strings.TrimSpace(key)
		if key == "" || !secretKeys[key] {
			return providerInstanceConfigStored{}, fmt.Errorf("%w: unsupported secret field %q", ErrInvalidProviderInstanceConfig, key)
		}
		if value == "" {
			continue
		}
		if len(s.encryptionKey) > 0 {
			encrypted, err := crypto.Encrypt(value, s.encryptionKey)
			if err != nil {
				return providerInstanceConfigStored{}, err
			}
			value = encrypted
		}
		stored.Secrets[key] = value
	}
	return stored, nil
}

func publicProviderInstanceConfigDraft(instance ProviderInstance, stored providerInstanceConfigStored) ProviderInstanceConfigDraft {
	configFields := append([]ProviderInstanceField(nil), instance.ConfigFields...)
	secretFields := append([]ProviderInstanceField(nil), instance.SecretFields...)
	for i := range configFields {
		if strings.TrimSpace(stored.Config[configFields[i].Key]) != "" {
			configFields[i].Configured = true
		}
	}
	for i := range secretFields {
		if strings.TrimSpace(stored.Secrets[secretFields[i].Key]) != "" {
			secretFields[i].Configured = true
		}
	}
	config := make(map[string]string, len(stored.Config))
	for key, value := range stored.Config {
		if value != "" {
			config[key] = value
		}
	}
	return ProviderInstanceConfigDraft{
		ProviderInstanceID: instance.ID,
		Config:             config,
		ConfigFields:       configFields,
		SecretFields:       secretFields,
		RequiresRestart:    true,
		Applied:            false,
	}
}

func providerFieldKeySet(fields []ProviderInstanceField) map[string]bool {
	out := make(map[string]bool, len(fields))
	for _, field := range fields {
		key := strings.TrimSpace(field.Key)
		if key != "" {
			out[key] = true
		}
	}
	return out
}

func providerInstanceConfigSettingKey(instanceID string) string {
	return ProviderInstanceConfigSettingKeyPrefix + strings.TrimSpace(instanceID)
}

func providerInstanceAdapterEnvPatch(instance ProviderInstance) map[string]string {
	switch instance.Type + ":" + instance.Adapter {
	case "database:sqlite":
		return map[string]string{"DB_DRIVER": "sqlite"}
	case "database:postgres":
		return map[string]string{"DB_DRIVER": "postgres"}
	case "blob_storage:filesystem":
		return map[string]string{"STORAGE_BACKEND": "filesystem"}
	case "blob_storage:minio":
		return map[string]string{"STORAGE_BACKEND": "minio"}
	case "workspace_repository:http":
		return map[string]string{"MOVSCRIPT_WORKSPACE_STORAGE_BACKEND": "http", "MOVSCRIPT_WORKSPACE_BACKEND": "http"}
	case "workspace_repository:gitea":
		return map[string]string{"MOVSCRIPT_WORKSPACE_STORAGE_BACKEND": "gitea", "MOVSCRIPT_WORKSPACE_BACKEND": "gitea"}
	case "workspace_repository:github-enterprise":
		return map[string]string{"MOVSCRIPT_WORKSPACE_STORAGE_BACKEND": "github-enterprise", "MOVSCRIPT_WORKSPACE_BACKEND": "github-enterprise"}
	case "workspace_repository:gitlab":
		return map[string]string{"MOVSCRIPT_WORKSPACE_STORAGE_BACKEND": "gitlab", "MOVSCRIPT_WORKSPACE_BACKEND": "gitlab"}
	case "ai_gateway:local":
		return map[string]string{"MOVSCRIPT_AI_GATEWAY_PROVIDER": "local"}
	case "ai_gateway:builtin":
		return map[string]string{"MOVSCRIPT_AI_GATEWAY_PROVIDER": "builtin"}
	case "ai_gateway:new-api":
		return map[string]string{"MOVSCRIPT_AI_GATEWAY_PROVIDER": "new-api"}
	case "vector_index:local-index":
		return map[string]string{"MOVSCRIPT_VECTOR_INDEX_PROVIDER": "local-index"}
	case "vector_index:pgvector":
		return map[string]string{"MOVSCRIPT_VECTOR_INDEX_PROVIDER": "pgvector"}
	case "vector_index:qdrant":
		return map[string]string{"MOVSCRIPT_VECTOR_INDEX_PROVIDER": "qdrant"}
	case "cache:memory":
		return map[string]string{"CACHE_BACKEND": "memory"}
	case "cache:noop":
		return map[string]string{"CACHE_BACKEND": "noop"}
	case "cache:redis":
		return map[string]string{"CACHE_BACKEND": "redis"}
	case "media_processing:desktop-managed":
		return map[string]string{"MOVSCRIPT_MEDIA_PROCESSING_PROVIDER": "desktop-managed"}
	case "media_processing:external-worker":
		return map[string]string{"MOVSCRIPT_MEDIA_PROCESSING_PROVIDER": "external-worker"}
	case "agent_runtime:desktop-managed":
		return map[string]string{"MOVSCRIPT_AGENT_RUNTIME_PROVIDER": "desktop-managed"}
	case "agent_runtime:remote-runtime":
		return map[string]string{"MOVSCRIPT_AGENT_RUNTIME_PROVIDER": "remote-runtime"}
	case "agent_runtime:mova":
		return map[string]string{"MOVSCRIPT_AGENT_RUNTIME_PROVIDER": "mova"}
	case "agent_runtime:app-server":
		return map[string]string{"MOVSCRIPT_AGENT_RUNTIME_PROVIDER": "app-server"}
	default:
		return map[string]string{}
	}
}

func providerInstanceFieldEnvKey(key string) (string, bool) {
	switch strings.TrimSpace(key) {
	case "db_path":
		return "DB_PATH", true
	case "db_host":
		return "DB_HOST", true
	case "db_port":
		return "DB_PORT", true
	case "db_user":
		return "DB_USER", true
	case "db_name":
		return "DB_NAME", true
	case "db_password":
		return "DB_PASSWORD", true
	case "filesystem_storage_root":
		return "FILESYSTEM_STORAGE_ROOT", true
	case "minio_endpoint":
		return "MINIO_ENDPOINT", true
	case "minio_bucket":
		return "MINIO_BUCKET", true
	case "minio_use_ssl":
		return "MINIO_USE_SSL", true
	case "minio_access_key":
		return "MINIO_ACCESS_KEY", true
	case "minio_secret_key":
		return "MINIO_SECRET_KEY", true
	case "git_http_root":
		return "MOVSCRIPT_GIT_HTTP_ROOT", true
	case "git_binary":
		return "MOVSCRIPT_GIT_BINARY", true
	case "gitea_base_url":
		return "MOVSCRIPT_GITEA_BASE_URL", true
	case "gitea_repo_prefix":
		return "MOVSCRIPT_GITEA_REPO_PREFIX", true
	case "gitea_org_prefix":
		return "MOVSCRIPT_GITEA_ORG_PREFIX", true
	case "gitea_branch":
		return "MOVSCRIPT_GITEA_BRANCH", true
	case "gitea_token":
		return "MOVSCRIPT_GITEA_TOKEN", true
	case "gitea_admin_password":
		return "MOVSCRIPT_GITEA_ADMIN_PASSWORD", true
	case "github_enterprise_base_url":
		return "MOVSCRIPT_GITHUB_ENTERPRISE_BASE_URL", true
	case "github_enterprise_repo_prefix":
		return "MOVSCRIPT_GITHUB_ENTERPRISE_REPO_PREFIX", true
	case "github_enterprise_org_prefix":
		return "MOVSCRIPT_GITHUB_ENTERPRISE_ORG_PREFIX", true
	case "github_enterprise_branch":
		return "MOVSCRIPT_GITHUB_ENTERPRISE_BRANCH", true
	case "github_enterprise_token":
		return "MOVSCRIPT_GITHUB_ENTERPRISE_TOKEN", true
	case "gitlab_base_url":
		return "MOVSCRIPT_GITLAB_BASE_URL", true
	case "gitlab_repo_prefix":
		return "MOVSCRIPT_GITLAB_REPO_PREFIX", true
	case "gitlab_org_prefix":
		return "MOVSCRIPT_GITLAB_ORG_PREFIX", true
	case "gitlab_branch":
		return "MOVSCRIPT_GITLAB_BRANCH", true
	case "gitlab_token":
		return "MOVSCRIPT_GITLAB_TOKEN", true
	case "workspace_clone_url_strategy":
		return "MOVSCRIPT_WORKSPACE_CLONE_URL_STRATEGY", true
	case "vector_index_provider":
		return "MOVSCRIPT_VECTOR_INDEX_PROVIDER", true
	case "qdrant_base_url":
		return "MOVSCRIPT_QDRANT_BASE_URL", true
	case "qdrant_collection":
		return "MOVSCRIPT_QDRANT_COLLECTION", true
	case "qdrant_token":
		return "MOVSCRIPT_QDRANT_TOKEN", true
	case "redis_url":
		return "REDIS_URL", true
	case "redis_addr":
		return "REDIS_ADDR", true
	case "redis_db":
		return "REDIS_DB", true
	case "redis_password":
		return "REDIS_PASSWORD", true
	case "media_worker_base_url":
		return "MOVSCRIPT_MEDIA_WORKER_BASE_URL", true
	case "media_worker_token":
		return "MOVSCRIPT_MEDIA_WORKER_TOKEN", true
	case "agent_runtime_base_url":
		return "MOVSCRIPT_AGENT_RUNTIME_BASE_URL", true
	case "agent_runtime_token":
		return "MOVSCRIPT_AGENT_RUNTIME_TOKEN", true
	default:
		return "", false
	}
}

func readEnvFile(path string) (map[string]string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return map[string]string{}, nil
		}
		return nil, err
	}
	out := map[string]string{}
	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		if key == "" {
			continue
		}
		if unquoted, err := strconv.Unquote(value); err == nil {
			value = unquoted
		}
		out[key] = value
	}
	return out, nil
}

func writeEnvFileAtomic(path string, values map[string]string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	keys := make([]string, 0, len(values))
	for key := range values {
		if validEnvKey(key) {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	var builder strings.Builder
	builder.WriteString("# Generated by MovScript Admin. Restart backend to apply changes.\n")
	for _, key := range keys {
		builder.WriteString(key)
		builder.WriteString("=")
		builder.WriteString(strconv.Quote(values[key]))
		builder.WriteString("\n")
	}
	tmpPath := fmt.Sprintf("%s.%d.tmp", path, os.Getpid())
	if err := os.WriteFile(tmpPath, []byte(builder.String()), 0o600); err != nil {
		return err
	}
	return os.Rename(tmpPath, path)
}

func validEnvKey(key string) bool {
	if key == "" {
		return false
	}
	for i, r := range key {
		if r == '_' || (r >= 'A' && r <= 'Z') || (i > 0 && r >= '0' && r <= '9') {
			continue
		}
		return false
	}
	return true
}
