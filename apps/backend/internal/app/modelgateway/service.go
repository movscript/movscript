package modelgateway

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	domainmodelgateway "github.com/movscript/movscript/internal/domain/modelgateway"
	"github.com/movscript/movscript/internal/infra/ai"
	"gorm.io/gorm"
)

var (
	ErrAPIKeyNotFound            = errors.New("gateway api key not found")
	ErrProjectNotFound           = errors.New("gateway project not found")
	ErrProjectOutsideOrg         = errors.New("gateway project is outside current org")
	ErrGatewayUsageLimitExceeded = errors.New("gateway usage limit exceeded")
	ErrGatewayRateLimited        = errors.New("gateway rate limit exceeded")
	ErrInsufficientScope         = errors.New("gateway key is not allowed to use requested scope")
	ErrModelNotAllowed           = errors.New("gateway key is not allowed to use this model")
	ErrProjectNotAllowed         = errors.New("gateway key is not allowed to use this project scope")
	ErrModelNotFound             = errors.New("gateway model not found")
	ErrUnsupportedParameter      = errors.New("unsupported gateway request parameter")
	ErrModelUnavailable          = errors.New("gateway model unavailable")
)

type Service struct {
	repo   repository
	ai     *ai.AIService
	policy *PolicyService
}

func NewService(db *gorm.DB, aiService ...*ai.AIService) *Service {
	var svc *ai.AIService
	if len(aiService) > 0 {
		svc = aiService[0]
	}
	repo := &gormRepository{db: db}
	return &Service{repo: repo, ai: svc, policy: &PolicyService{repo: repo}}
}

type CreateAPIKeyInput struct {
	OwnerUserID     uint
	OrgID           *uint
	Name            string
	ProjectID       *uint
	AllowedModelIDs []uint
	AllowedScopes   []string
	Runtime         APIKeyCreateRuntimeInput
}

type UpdateAPIKeyInput struct {
	ID              uint
	OwnerUserID     uint
	OrgID           *uint
	Name            *string
	ProjectID       *uint
	ProjectIDSet    bool
	AllowedModelIDs []uint
	AllowedScopes   []string
	IsEnabled       *bool
	Runtime         APIKeyUpdateRuntimeInput
}

type CreateAPIKeyResult struct {
	Key    domainmodelgateway.APIKey
	RawKey string
}

type Principal struct {
	UserID uint
	Key    *domainmodelgateway.APIKey
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

func IsUsageLimitExceeded(err error) bool {
	return errors.Is(err, ai.ErrUsageLimitExceeded)
}

func (s *Service) ListAPIKeys(ctx context.Context, ownerUserID uint, orgID *uint) ([]domainmodelgateway.APIKey, error) {
	includeLegacy := orgID != nil && s.policy.IsPersonalOrg(ctx, *orgID)
	return s.repo.ListAPIKeys(ctx, ownerUserID, orgID, includeLegacy)
}

func (s *Service) CreateAPIKey(ctx context.Context, input CreateAPIKeyInput) (CreateAPIKeyResult, error) {
	if err := s.policy.EnsureProjectInOrg(ctx, input.ProjectID, input.OrgID); err != nil {
		return CreateAPIKeyResult{}, err
	}
	rawKey := GenerateAPIKey()
	domainKey := domainmodelgateway.NewAPIKey(domainmodelgateway.NewAPIKeySpec{
		Name:            input.Name,
		KeyPrefix:       KeyPrefix(rawKey),
		KeyHash:         HashAPIKey(rawKey),
		OwnerUserID:     input.OwnerUserID,
		OrgID:           input.OrgID,
		ProjectID:       input.ProjectID,
		AllowedModelIDs: input.AllowedModelIDs,
		AllowedScopes:   input.AllowedScopes,
	})
	applyAPIKeyRuntimeCreateFields(&domainKey, input.Runtime)
	if err := s.repo.CreateAPIKey(ctx, &domainKey); err != nil {
		return CreateAPIKeyResult{}, err
	}
	return CreateAPIKeyResult{Key: domainKey, RawKey: rawKey}, nil
}

func (s *Service) UpdateAPIKey(ctx context.Context, input UpdateAPIKeyInput) (domainmodelgateway.APIKey, error) {
	key, err := s.policy.FindOwnedAPIKey(ctx, input.ID, input.OwnerUserID, input.OrgID)
	if err != nil {
		return key, err
	}
	if input.ProjectIDSet {
		if err := s.policy.EnsureProjectInOrg(ctx, input.ProjectID, input.OrgID); err != nil {
			return key, err
		}
	}
	key.ApplyUpdate(domainmodelgateway.APIKeyUpdateSpec{
		Name:            input.Name,
		ProjectID:       input.ProjectID,
		ProjectIDSet:    input.ProjectIDSet,
		AllowedModelIDs: input.AllowedModelIDs,
		AllowedScopes:   input.AllowedScopes,
		IsEnabled:       input.IsEnabled,
	})
	applyAPIKeyRuntimeUpdateFields(&key, input.Runtime)
	if err := s.repo.UpdateAPIKey(ctx, &key); err != nil {
		return key, err
	}
	if err := s.repo.ReloadAPIKey(ctx, &key); err != nil {
		return key, err
	}
	return key, nil
}

func (s *Service) DeleteAPIKey(ctx context.Context, id uint, ownerUserID uint, orgID *uint) (domainmodelgateway.APIKey, error) {
	key, err := s.policy.FindOwnedAPIKey(ctx, id, ownerUserID, orgID)
	if err != nil {
		return domainmodelgateway.APIKey{}, err
	}
	if err := s.repo.DeleteAPIKey(ctx, &key); err != nil {
		return key, err
	}
	return key, nil
}

func (s *Service) PrincipalForAPIKey(ctx context.Context, rawKey string) (Principal, bool, error) {
	hash := HashAPIKey(rawKey)
	key, err := s.repo.FindAPIKeyByHash(ctx, hash)
	if err != nil {
		if errors.Is(err, ErrAPIKeyNotFound) {
			return Principal{}, false, nil
		}
		return Principal{}, false, err
	}
	userExists, err := s.repo.UserExists(ctx, key.OwnerUserID)
	if err != nil {
		return Principal{}, false, err
	}
	if !userExists {
		return Principal{}, false, nil
	}
	now := time.Now()
	if err := s.repo.TouchAPIKeyLastUsed(ctx, &key, now); err != nil {
		return Principal{}, false, err
	}
	key.LastUsedAt = &now
	return Principal{UserID: key.OwnerUserID, Key: &key}, true, nil
}

func (s *Service) ListChatModels(_ context.Context, principal Principal) ([]ai.PublicModel, error) {
	if err := s.policy.CanListChatModels(principal); err != nil {
		return nil, err
	}
	return s.ai.GetModelsByCapability(ai.CapabilityText)
}

func (s *Service) CallChat(ctx context.Context, input ChatInput) (ChatResult, error) {
	modelConfigID, responseModel, textReq, err := s.prepareChat(ctx, input)
	if err != nil {
		return ChatResult{}, err
	}
	resp, err := s.ai.CallTextWithUsage(ctx, input.Principal.UserID, modelConfigID, textReq, UsageContext(input.Principal.Key, input.ProjectID))
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
	events, err := s.ai.CallTextStreamWithUsage(ctx, input.Principal.UserID, modelConfigID, textReq, UsageContext(input.Principal.Key, input.ProjectID))
	if err != nil {
		return ChatStreamResult{}, err
	}
	return ChatStreamResult{ModelConfigID: modelConfigID, ResponseModel: responseModel, Events: events}, nil
}

func (s *Service) prepareChat(ctx context.Context, input ChatInput) (uint, string, ai.TextRequest, error) {
	modelConfigID, responseModel, err := s.ResolveTextModel(ctx, input.Model)
	if err != nil {
		return 0, responseModel, ai.TextRequest{}, err
	}
	runtimeModelConfigID, err := s.ai.ResolveRuntimeTextModel(modelConfigID)
	if err != nil {
		return 0, responseModel, ai.TextRequest{}, err
	}

	textReq := input.Text
	if _, err := s.ai.PreflightText(runtimeModelConfigID, &textReq); err != nil {
		return 0, responseModel, ai.TextRequest{}, wrapErr(ErrUnsupportedParameter, err)
	}
	if input.Principal.Key != nil {
		estimate, err := s.ai.EstimateTextCost(runtimeModelConfigID, textReq)
		if err != nil {
			return 0, responseModel, ai.TextRequest{}, err
		}
		if err := s.policy.CanCallChat(ctx, input.Principal, modelConfigID, input.ProjectID, estimate.Cost); err != nil {
			return 0, responseModel, ai.TextRequest{}, err
		}
	}
	return runtimeModelConfigID, responseModel, textReq, nil
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

func wrapErr(base error, err error) error {
	if err == nil {
		return base
	}
	return fmt.Errorf("%w: %w", base, err)
}
