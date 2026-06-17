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
	if !enabled {
		return removeManagedLocalGatewayDefaults(ctx, db)
	}
	var cred persistencemodel.AICredential
	err := db.WithContext(ctx).
		Where("adapter_type = ? AND display_name = ? AND base_url = ?", AdapterLocal, ManagedLocalGatewayName, "movscript://local").
		First(&cred).Error
	if err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
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
	} else if !cred.IsEnabled {
		if err := db.WithContext(ctx).Model(&cred).Update("is_enabled", enabled).Error; err != nil {
			return err
		}
		cred.IsEnabled = enabled
	}

	var entry persistencemodel.AIModelCatalogEntry
	err = db.WithContext(ctx).
		Where("public_model_id = ? AND provider_model_id = ?", ManagedLocalGatewayModel, ManagedLocalGatewayModel).
		First(&entry).Error
	if err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		entry = persistencemodel.AIModelCatalogEntry{
			PublicModelID:      ManagedLocalGatewayModel,
			ProviderModelID:    ManagedLocalGatewayModel,
			DisplayName:        "MovScript Local",
			ShortName:          "Local",
			IsEnabled:          true,
			Capabilities:       CapabilityText + "," + CapabilityReasoning,
			PricingMode:        string(PricingPerToken),
			CreditsInputPer1M:  0,
			CreditsOutputPer1M: 0,
			SupportedParams:    "[]",
		}
		if err := db.WithContext(ctx).Create(&entry).Error; err != nil {
			return err
		}
	} else {
		updates := map[string]any{
			"is_enabled":            true,
			"display_name":          "MovScript Local",
			"short_name":            "Local",
			"capabilities":          CapabilityText + "," + CapabilityReasoning,
			"pricing_mode":          string(PricingPerToken),
			"supported_params":      "[]",
			"credits_input_per_1m":  0,
			"credits_output_per_1m": 0,
		}
		if err := db.WithContext(ctx).Model(&entry).Updates(updates).Error; err != nil {
			return err
		}
	}

	credentialID := cred.ID
	var binding persistencemodel.AIModelRouteBinding
	err = db.WithContext(ctx).
		Where("catalog_entry_id = ? AND source_type = ? AND credential_id = ?", entry.ID, persistencemodel.ModelRouteSourceLocalProvider, credentialID).
		First(&binding).Error
	if err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		binding = persistencemodel.AIModelRouteBinding{
			CatalogEntryID: entry.ID,
			SourceType:     persistencemodel.ModelRouteSourceLocalProvider,
			CredentialID:   &credentialID,
			IsEnabled:      true,
			Priority:       100,
			CapacityWeight: 1,
		}
		return db.WithContext(ctx).Create(&binding).Error
	}
	return db.WithContext(ctx).Model(&binding).Updates(map[string]any{
		"is_enabled":      true,
		"priority":        100,
		"capacity_weight": 1,
	}).Error
}

func removeManagedLocalGatewayDefaults(ctx context.Context, db *gorm.DB) error {
	return db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var entries []persistencemodel.AIModelCatalogEntry
		if err := tx.
			Where("public_model_id = ? AND provider_model_id = ? AND display_name = ?", ManagedLocalGatewayModel, ManagedLocalGatewayModel, "MovScript Local").
			Find(&entries).Error; err != nil {
			return err
		}
		for _, entry := range entries {
			if err := tx.Where("catalog_entry_id = ?", entry.ID).Delete(&persistencemodel.AIModelRouteBinding{}).Error; err != nil {
				return err
			}
			if err := tx.Delete(&entry).Error; err != nil {
				return err
			}
		}
		return tx.
			Where("adapter_type = ? AND display_name = ? AND base_url = ?", AdapterLocal, ManagedLocalGatewayName, "movscript://local").
			Delete(&persistencemodel.AICredential{}).Error
	})
}
