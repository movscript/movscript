package ai

import (
	"context"
	"errors"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

const (
	ManagedLocalGatewayName  = "MovScript Local AI Gateway"
	ManagedLocalGatewayModel = "movscript-local"
)

func ConfigureLocalGatewayDefaults(ctx context.Context, db *gorm.DB, enabled bool) error {
	if db == nil {
		return nil
	}
	var cred persistencemodel.AICredential
	err := db.WithContext(ctx).
		Where("adapter_type = ? AND display_name = ? AND base_url = ?", AdapterLocal, ManagedLocalGatewayName, "movscript://local").
		First(&cred).Error
	if err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if !enabled {
			return nil
		}
		cred = persistencemodel.AICredential{
			AdapterType: AdapterLocal,
			DisplayName: ManagedLocalGatewayName,
			BaseURL:     "movscript://local",
			IsEnabled:   true,
		}
		if err := db.WithContext(ctx).Create(&cred).Error; err != nil {
			return err
		}
	} else if cred.IsEnabled != enabled {
		if err := db.WithContext(ctx).Model(&cred).Update("is_enabled", enabled).Error; err != nil {
			return err
		}
		cred.IsEnabled = enabled
	}

	if !enabled {
		return nil
	}
	var model persistencemodel.AIModelConfig
	err = db.WithContext(ctx).
		Where("credential_id = ? AND model_def_id = ?", cred.ID, ManagedLocalGatewayModel).
		First(&model).Error
	if err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		model = persistencemodel.AIModelConfig{
			CredentialID:          cred.ID,
			ModelDefID:            ManagedLocalGatewayModel,
			ModelIDOverride:       ManagedLocalGatewayModel,
			IsEnabled:             true,
			Priority:              100,
			CapacityWeight:        1,
			CustomDisplayName:     "MovScript Local",
			ShortName:             "Local",
			CustomCapabilities:    CapabilityText + "," + CapabilityReasoning,
			CustomPricingMode:     string(PricingPerToken),
			CreditsInputPer1M:     0,
			CreditsOutputPer1M:    0,
			CustomSupportedParams: "[]",
		}
		return db.WithContext(ctx).Create(&model).Error
	}
	updates := map[string]any{
		"is_enabled":              true,
		"model_id_override":       ManagedLocalGatewayModel,
		"custom_display_name":     "MovScript Local",
		"short_name":              "Local",
		"custom_capabilities":     CapabilityText + "," + CapabilityReasoning,
		"custom_pricing_mode":     string(PricingPerToken),
		"custom_supported_params": "[]",
	}
	return db.WithContext(ctx).Model(&model).Updates(updates).Error
}
