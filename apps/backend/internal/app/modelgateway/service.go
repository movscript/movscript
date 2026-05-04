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

	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrAPIKeyNotFound        = errors.New("gateway api key not found")
	ErrMonthlyBudgetExceeded = errors.New("gateway monthly budget exceeded")
)

type Service struct {
	db *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

type CreateAPIKeyInput struct {
	OwnerUserID     uint
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

func (s *Service) ListAPIKeys(ctx context.Context, ownerUserID uint) ([]model.GatewayAPIKey, error) {
	keys := make([]model.GatewayAPIKey, 0)
	err := s.db.WithContext(ctx).Where("owner_user_id = ?", ownerUserID).Order("created_at desc").Find(&keys).Error
	return keys, err
}

func (s *Service) CreateAPIKey(ctx context.Context, input CreateAPIKeyInput) (CreateAPIKeyResult, error) {
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
	key, err := s.findOwnedAPIKey(ctx, input.ID, input.OwnerUserID)
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

func (s *Service) DeleteAPIKey(ctx context.Context, id uint, ownerUserID uint) error {
	key, err := s.findOwnedAPIKey(ctx, id, ownerUserID)
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
			return fmt.Errorf("gateway rate limit exceeded: %d requests per minute", limit)
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

func (s *Service) findOwnedAPIKey(ctx context.Context, id uint, ownerUserID uint) (model.GatewayAPIKey, error) {
	var key model.GatewayAPIKey
	if err := s.db.WithContext(ctx).Where("id = ? AND owner_user_id = ?", id, ownerUserID).First(&key).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return key, ErrAPIKeyNotFound
		}
		return key, err
	}
	return key, nil
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
