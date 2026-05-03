package handler

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/ai"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var errGatewayMonthlyBudgetExceeded = errors.New("gateway monthly budget exceeded")

func (h *ModelGatewayHandler) gatewayPrincipal(c *gin.Context) (*gatewayPrincipal, bool) {
	if user := currentUser(c); user != nil {
		return &gatewayPrincipal{User: user}, true
	}

	bearer := strings.TrimSpace(c.GetHeader("Authorization"))
	if !strings.HasPrefix(strings.ToLower(bearer), "bearer ") {
		return nil, false
	}
	token := strings.TrimSpace(bearer[len("Bearer "):])

	var key model.GatewayAPIKey
	hash := hashGatewayAPIKey(token)
	if err := h.db.Where("key_hash = ? AND is_enabled = true", hash).First(&key).Error; err != nil {
		return nil, false
	}
	var user model.User
	if err := h.db.First(&user, key.OwnerUserID).Error; err != nil {
		return nil, false
	}
	now := time.Now()
	h.db.Model(&key).Update("last_used_at", &now)
	key.LastUsedAt = &now
	return &gatewayPrincipal{User: &user, Key: &key}, true
}

func gatewayKeyAllowsScope(key *model.GatewayAPIKey, scope string) bool {
	scopes := parseStringArray(key.AllowedScopes)
	if len(scopes) == 0 {
		return scope == "model:chat"
	}
	for _, s := range scopes {
		if s == scope || s == "*" {
			return true
		}
	}
	return false
}

func gatewayKeyAllowsModel(key *model.GatewayAPIKey, modelConfigID uint) bool {
	ids := parseUintArray(key.AllowedModelIDs)
	if len(ids) == 0 {
		return true
	}
	for _, id := range ids {
		if id == modelConfigID {
			return true
		}
	}
	return false
}

func gatewayKeyAllowsProject(key *model.GatewayAPIKey, requestedProjectID *uint) bool {
	if key.ProjectID == nil {
		return true
	}
	if requestedProjectID == nil {
		return false
	}
	return *key.ProjectID == *requestedProjectID
}

func gatewayBillingContext(key *model.GatewayAPIKey, projectID *uint) ai.BillingContext {
	ctx := ai.BillingContext{ProjectID: projectID}
	if key != nil {
		ctx.GatewayAPIKeyID = &key.ID
	}
	return ctx
}

func (h *ModelGatewayHandler) enforceGatewayKeyLimits(ctx context.Context, key *model.GatewayAPIKey, estimatedCost float64) error {
	if key.RateLimitRPM > 0 {
		if err := h.consumeGatewayRateLimit(ctx, key.ID, key.RateLimitRPM); err != nil {
			return err
		}
	}
	if key.MonthlyBudget > 0 {
		spent, err := h.gatewayKeyMonthlySpend(ctx, key.ID)
		if err != nil {
			return err
		}
		if spent+estimatedCost > key.MonthlyBudget {
			return fmt.Errorf("%w: spent %.4f plus estimated %.4f exceeds %.4f credits", errGatewayMonthlyBudgetExceeded, spent, estimatedCost, key.MonthlyBudget)
		}
	}
	return nil
}

func (h *ModelGatewayHandler) consumeGatewayRateLimit(ctx context.Context, keyID uint, limit int) error {
	now := time.Now().UTC()
	window := now.Truncate(time.Minute)
	return h.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
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

func (h *ModelGatewayHandler) gatewayKeyMonthlySpend(ctx context.Context, keyID uint) (float64, error) {
	now := time.Now()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	var total float64
	err := h.db.WithContext(ctx).Model(&model.UsageLog{}).
		Where("gateway_api_key_id = ? AND created_at >= ?", keyID, monthStart).
		Select("COALESCE(SUM(cost), 0)").Scan(&total).Error
	return total, err
}
