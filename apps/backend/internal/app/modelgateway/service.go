package modelgateway

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/domain/model"
	"github.com/movscript/movscript/internal/infra/ai"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrAPIKeyNotFound        = errors.New("gateway api key not found")
	ErrProjectNotFound       = errors.New("gateway project not found")
	ErrProjectOutsideOrg     = errors.New("gateway project is outside current org")
	ErrMonthlyBudgetExceeded = errors.New("gateway monthly budget exceeded")
	ErrRateLimitExceeded     = errors.New("gateway rate limit exceeded")
	ErrInsufficientScope     = errors.New("gateway key is not allowed to use requested scope")
	ErrModelNotAllowed       = errors.New("gateway key is not allowed to use this model")
	ErrProjectNotAllowed     = errors.New("gateway key is not allowed to use this project scope")
	ErrModelNotFound         = errors.New("gateway model not found")
	ErrUnsupportedParameter  = errors.New("unsupported gateway request parameter")
	ErrModelUnavailable      = errors.New("gateway model unavailable")
)

type Service struct {
	db *gorm.DB
	ai *ai.AIService
}

func NewService(db *gorm.DB, aiService ...*ai.AIService) *Service {
	var svc *ai.AIService
	if len(aiService) > 0 {
		svc = aiService[0]
	}
	return &Service{db: db, ai: svc}
}

type CreateAPIKeyInput struct {
	OwnerUserID     uint
	OrgID           *uint
	Name            string
	ProjectID       *uint
	AllowedModelIDs []uint
	AllowedScopes   []string
	RateLimitRPM    int
	MonthlyBudget   float64
}

type UpdateAPIKeyInput struct {
	ID              uint
	OwnerUserID     uint
	OrgID           *uint
	Name            *string
	AllowedModelIDs []uint
	AllowedScopes   []string
	RateLimitRPM    *int
	MonthlyBudget   *float64
	IsEnabled       *bool
}

type CreateAPIKeyResult struct {
	Key    model.GatewayAPIKey
	RawKey string
}

type Principal struct {
	User *model.User
	Key  *model.GatewayAPIKey
}

type ChatInput struct {
	Principal   Principal
	Model       string
	Text        ai.TextRequest
	ProjectID   *uint
	RequireChat bool
}

type ChatResult struct {
	ModelConfigID uint
	ResponseModel string
	Response      ai.TextResponse
}

type ChatStreamResult struct {
	ModelConfigID uint
	ResponseModel string
	Events        <-chan ai.TextStreamEvent
}

type ModelNotFoundError struct {
	Message string
}

func (e ModelNotFoundError) Error() string {
	return e.Message
}

func (e ModelNotFoundError) Unwrap() error {
	return ErrModelNotFound
}

func IsInsufficientQuota(err error) bool {
	return errors.Is(err, ai.ErrInsufficientQuota)
}

func (s *Service) ListAPIKeys(ctx context.Context, ownerUserID uint, orgID *uint) ([]model.GatewayAPIKey, error) {
	keys := make([]model.GatewayAPIKey, 0)
	q := s.db.WithContext(ctx).Where("owner_user_id = ?", ownerUserID)
	q = s.applyAPIKeyOrgScope(ctx, q, orgID, ownerUserID)
	err := q.Order("created_at desc").Find(&keys).Error
	return keys, err
}

func (s *Service) CreateAPIKey(ctx context.Context, input CreateAPIKeyInput) (CreateAPIKeyResult, error) {
	if err := s.ensureProjectInOrg(ctx, input.ProjectID, input.OrgID); err != nil {
		return CreateAPIKeyResult{}, err
	}
	scopes := input.AllowedScopes
	if len(scopes) == 0 {
		scopes = []string{"model:chat"}
	}
	rawKey := GenerateAPIKey()
	key := model.GatewayAPIKey{
		Name:            strings.TrimSpace(input.Name),
		KeyPrefix:       KeyPrefix(rawKey),
		KeyHash:         HashAPIKey(rawKey),
		OwnerUserID:     input.OwnerUserID,
		OrgID:           input.OrgID,
		ProjectID:       input.ProjectID,
		AllowedModelIDs: mustJSONString(input.AllowedModelIDs),
		AllowedScopes:   mustJSONString(scopes),
		RateLimitRPM:    input.RateLimitRPM,
		MonthlyBudget:   input.MonthlyBudget,
		IsEnabled:       true,
	}
	if err := s.db.WithContext(ctx).Create(&key).Error; err != nil {
		return CreateAPIKeyResult{}, err
	}
	return CreateAPIKeyResult{Key: key, RawKey: rawKey}, nil
}

func (s *Service) UpdateAPIKey(ctx context.Context, input UpdateAPIKeyInput) (model.GatewayAPIKey, error) {
	key, err := s.findOwnedAPIKey(ctx, input.ID, input.OwnerUserID, input.OrgID)
	if err != nil {
		return key, err
	}
	updates := map[string]any{}
	if input.Name != nil {
		updates["name"] = strings.TrimSpace(*input.Name)
	}
	if input.AllowedModelIDs != nil {
		updates["allowed_model_ids"] = mustJSONString(input.AllowedModelIDs)
	}
	if input.AllowedScopes != nil {
		updates["allowed_scopes"] = mustJSONString(input.AllowedScopes)
	}
	if input.RateLimitRPM != nil {
		updates["rate_limit_rpm"] = *input.RateLimitRPM
	}
	if input.MonthlyBudget != nil {
		updates["monthly_budget"] = *input.MonthlyBudget
	}
	if input.IsEnabled != nil {
		updates["is_enabled"] = *input.IsEnabled
	}
	if len(updates) > 0 {
		if err := s.db.WithContext(ctx).Model(&key).Updates(updates).Error; err != nil {
			return key, err
		}
	}
	if err := s.db.WithContext(ctx).First(&key, key.ID).Error; err != nil {
		return key, err
	}
	return key, nil
}

func (s *Service) DeleteAPIKey(ctx context.Context, id uint, ownerUserID uint, orgID *uint) error {
	key, err := s.findOwnedAPIKey(ctx, id, ownerUserID, orgID)
	if err != nil {
		return err
	}
	return s.db.WithContext(ctx).Delete(&key).Error
}

func (s *Service) PrincipalForAPIKey(ctx context.Context, rawKey string) (Principal, bool, error) {
	var key model.GatewayAPIKey
	hash := HashAPIKey(rawKey)
	if err := s.db.WithContext(ctx).Where("key_hash = ? AND is_enabled = true", hash).First(&key).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return Principal{}, false, nil
		}
		return Principal{}, false, err
	}
	var user model.User
	if err := s.db.WithContext(ctx).First(&user, key.OwnerUserID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return Principal{}, false, nil
		}
		return Principal{}, false, err
	}
	now := time.Now()
	if err := s.db.WithContext(ctx).Model(&key).Update("last_used_at", &now).Error; err != nil {
		return Principal{}, false, err
	}
	key.LastUsedAt = &now
	return Principal{User: &user, Key: &key}, true, nil
}

func (s *Service) EnforceKeyLimits(ctx context.Context, key *model.GatewayAPIKey, estimatedCost float64) error {
	if key.RateLimitRPM > 0 {
		if err := s.consumeRateLimit(ctx, key.ID, key.RateLimitRPM); err != nil {
			return err
		}
	}
	if key.MonthlyBudget > 0 {
		spent, err := s.keyMonthlySpend(ctx, key.ID)
		if err != nil {
			return err
		}
		if spent+estimatedCost > key.MonthlyBudget {
			return fmt.Errorf("%w: spent %.4f plus estimated %.4f exceeds %.4f credits", ErrMonthlyBudgetExceeded, spent, estimatedCost, key.MonthlyBudget)
		}
	}
	return nil
}

func (s *Service) ListChatModels(_ context.Context, principal Principal) ([]ai.PublicModel, error) {
	if err := ensureChatScope(principal, "list"); err != nil {
		return nil, err
	}
	return s.ai.GetModelsByCapability(ai.CapabilityText)
}

func (s *Service) CallChat(ctx context.Context, input ChatInput) (ChatResult, error) {
	modelConfigID, responseModel, textReq, err := s.prepareChat(ctx, input)
	if err != nil {
		return ChatResult{}, err
	}
	resp, err := s.ai.CallTextWithBilling(ctx, input.Principal.User.ID, modelConfigID, textReq, BillingContext(input.Principal.Key, input.ProjectID))
	if err != nil {
		return ChatResult{}, err
	}
	return ChatResult{ModelConfigID: modelConfigID, ResponseModel: responseModel, Response: resp}, nil
}

func (s *Service) CallChatStream(ctx context.Context, input ChatInput) (ChatStreamResult, error) {
	modelConfigID, responseModel, textReq, err := s.prepareChat(ctx, input)
	if err != nil {
		return ChatStreamResult{}, err
	}
	events, err := s.ai.CallTextStreamWithBilling(ctx, input.Principal.User.ID, modelConfigID, textReq, BillingContext(input.Principal.Key, input.ProjectID))
	if err != nil {
		return ChatStreamResult{}, err
	}
	return ChatStreamResult{ModelConfigID: modelConfigID, ResponseModel: responseModel, Events: events}, nil
}

func (s *Service) prepareChat(ctx context.Context, input ChatInput) (uint, string, ai.TextRequest, error) {
	if err := ensureChatScope(input.Principal, "call"); err != nil {
		return 0, "", ai.TextRequest{}, err
	}
	modelConfigID, responseModel, err := s.ResolveTextModel(ctx, input.Model)
	if err != nil {
		return 0, responseModel, ai.TextRequest{}, err
	}
	if input.Principal.Key != nil && !KeyAllowsModel(input.Principal.Key, modelConfigID) {
		return 0, responseModel, ai.TextRequest{}, ErrModelNotAllowed
	}
	if input.Principal.Key != nil && !KeyAllowsProject(input.Principal.Key, input.ProjectID) {
		return 0, responseModel, ai.TextRequest{}, ErrProjectNotAllowed
	}

	textReq := input.Text
	if _, err := s.ai.PreflightText(modelConfigID, &textReq); err != nil {
		return 0, responseModel, ai.TextRequest{}, wrapErr(ErrUnsupportedParameter, err)
	}
	if input.Principal.Key != nil {
		estimate, err := s.ai.EstimateTextCost(modelConfigID, textReq)
		if err != nil {
			return 0, responseModel, ai.TextRequest{}, err
		}
		if err := s.EnforceKeyLimits(ctx, input.Principal.Key, estimate.Cost); err != nil {
			return 0, responseModel, ai.TextRequest{}, err
		}
	}
	return modelConfigID, responseModel, textReq, nil
}

func (s *Service) ResolveTextModel(_ context.Context, modelID string) (uint, string, error) {
	models, err := s.ai.GetModelsByCapability(ai.CapabilityText)
	if err != nil {
		return 0, strings.TrimSpace(modelID), err
	}
	defaultID, _, defaultErr := s.ai.GetAnyTextModel()
	id, responseModel, err := ResolveTextModel(models, modelID, defaultID, defaultErr)
	if err != nil {
		return id, responseModel, ModelNotFoundError{Message: err.Error()}
	}
	return id, responseModel, nil
}

func ensureChatScope(principal Principal, action string) error {
	if principal.Key == nil || KeyAllowsScope(principal.Key, "model:chat") {
		return nil
	}
	if action == "list" {
		return fmt.Errorf("%w: list chat models", ErrInsufficientScope)
	}
	return fmt.Errorf("%w: call chat models", ErrInsufficientScope)
}

func (s *Service) consumeRateLimit(ctx context.Context, keyID uint, limit int) error {
	now := time.Now().UTC()
	window := now.Truncate(time.Minute)
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var counter model.GatewayRateLimitCounter
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("gateway_api_key_id = ? AND window_start = ?", keyID, window).
			First(&counter).Error
		if err != nil {
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			counter = model.GatewayRateLimitCounter{
				GatewayAPIKeyID: keyID,
				WindowStart:     window,
				RequestCount:    1,
			}
			return tx.Create(&counter).Error
		}
		if counter.RequestCount >= limit {
			return fmt.Errorf("%w: %d requests per minute", ErrRateLimitExceeded, limit)
		}
		return tx.Model(&counter).UpdateColumn("request_count", gorm.Expr("request_count + 1")).Error
	})
}

func (s *Service) keyMonthlySpend(ctx context.Context, keyID uint) (float64, error) {
	now := time.Now()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	var total float64
	err := s.db.WithContext(ctx).Model(&model.UsageLog{}).
		Where("gateway_api_key_id = ? AND created_at >= ?", keyID, monthStart).
		Select("COALESCE(SUM(cost), 0)").Scan(&total).Error
	return total, err
}

func (s *Service) findOwnedAPIKey(ctx context.Context, id uint, ownerUserID uint, orgID *uint) (model.GatewayAPIKey, error) {
	var key model.GatewayAPIKey
	q := s.db.WithContext(ctx).Where("id = ? AND owner_user_id = ?", id, ownerUserID)
	q = s.applyAPIKeyOrgScope(ctx, q, orgID, ownerUserID)
	if err := q.First(&key).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return key, ErrAPIKeyNotFound
		}
		return key, err
	}
	return key, nil
}

func (s *Service) applyAPIKeyOrgScope(ctx context.Context, q *gorm.DB, orgID *uint, ownerUserID uint) *gorm.DB {
	if orgID == nil {
		return q.Where("org_id IS NULL")
	}
	if s.isPersonalOrg(ctx, *orgID) {
		return q.Where("org_id = ? OR (org_id IS NULL AND owner_user_id = ?)", *orgID, ownerUserID)
	}
	return q.Where("org_id = ?", *orgID)
}

func (s *Service) ensureProjectInOrg(ctx context.Context, projectID *uint, orgID *uint) error {
	if projectID == nil {
		return nil
	}
	var project model.Project
	if err := s.db.WithContext(ctx).Select("id, org_id").First(&project, *projectID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrProjectNotFound
		}
		return err
	}
	if !sameOrg(project.OrgID, orgID) {
		return ErrProjectOutsideOrg
	}
	return nil
}

func (s *Service) isPersonalOrg(ctx context.Context, orgID uint) bool {
	var org model.Organization
	if err := s.db.WithContext(ctx).Select("is_personal").First(&org, orgID).Error; err != nil {
		return false
	}
	return org.IsPersonal
}

func sameOrg(a, b *uint) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

func GenerateAPIKey() string {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "mgw_" + strconv.FormatInt(time.Now().UnixNano(), 36)
	}
	return "mgw_" + base64.RawURLEncoding.EncodeToString(buf)
}

func HashAPIKey(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func KeyPrefix(raw string) string {
	if len(raw) <= 12 {
		return raw
	}
	return raw[:12]
}

func mustJSONString(value any) string {
	data, err := json.Marshal(value)
	if err != nil {
		return "[]"
	}
	return string(data)
}

func wrapErr(base error, err error) error {
	if err == nil {
		return base
	}
	return fmt.Errorf("%w: %w", base, err)
}
