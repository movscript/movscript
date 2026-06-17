package ai

import (
	"context"
	"errors"
	"strings"
	"testing"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

func TestModelCatalogRejectsDuplicateEntryForSamePublicAndProviderID(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()

	if _, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID:   "video-fast",
		ProviderModelID: "provider-video-fast",
		DisplayName:     "Video Fast",
		Capabilities:    "video",
	}); err != nil {
		t.Fatalf("CreateModelCatalogEntry() first error = %v", err)
	}
	_, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID:   "video-fast",
		ProviderModelID: "provider-video-fast",
		DisplayName:     "Duplicate",
		Capabilities:    "video",
	})
	if !errors.Is(err, ErrInvalidModelCatalog) || !strings.Contains(err.Error(), "catalog entry already exists") {
		t.Fatalf("duplicate catalog entry error = %v, want ErrInvalidModelCatalog with already exists", err)
	}

	other, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID:   "image-fast",
		ProviderModelID: "provider-image-fast",
		DisplayName:     "Image Fast",
		Capabilities:    "image",
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry() other error = %v", err)
	}
	_, err = service.UpdateModelCatalogEntry(ctx, strconvID(other.ID), ModelCatalogEntryInput{
		PublicModelID:   "video-fast",
		ProviderModelID: "provider-video-fast",
		DisplayName:     "Image Fast",
		Capabilities:    "image",
	})
	if !errors.Is(err, ErrInvalidModelCatalog) || !strings.Contains(err.Error(), "catalog entry already exists") {
		t.Fatalf("duplicate catalog entry update error = %v, want ErrInvalidModelCatalog with already exists", err)
	}
}

func TestModelCatalogNormalizesCapabilitiesAndRejectsInvalidEntryContracts(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()

	entry, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID:   "gpt-public",
		ProviderModelID: "provider-gpt",
		Capabilities:    " text,reasoning,text ",
		PricingMode:     "per_token",
		SupportedParams: `{"allow":["temperature"]}`,
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry() valid error = %v", err)
	}
	if entry.Capabilities != "text,reasoning" {
		t.Fatalf("capabilities = %q, want normalized text,reasoning", entry.Capabilities)
	}

	tests := []struct {
		name  string
		input ModelCatalogEntryInput
		want  string
	}{
		{
			name: "unknown capability",
			input: ModelCatalogEntryInput{
				PublicModelID:   "bad-cap",
				ProviderModelID: "provider-bad-cap",
				Capabilities:    "text,unknown",
			},
			want: "capability",
		},
		{
			name: "renderer capability is not a generation model capability",
			input: ModelCatalogEntryInput{
				PublicModelID:   "bad-render",
				ProviderModelID: "provider-bad-render",
				Capabilities:    "render_video",
			},
			want: "capability",
		},
		{
			name: "invalid supported params json",
			input: ModelCatalogEntryInput{
				PublicModelID:   "bad-json",
				ProviderModelID: "provider-bad-json",
				Capabilities:    "video",
				SupportedParams: `{"allow":`,
			},
			want: "custom_supported_params",
		},
		{
			name: "unsupported pricing mode",
			input: ModelCatalogEntryInput{
				PublicModelID:   "bad-pricing",
				ProviderModelID: "provider-bad-pricing",
				Capabilities:    "image",
				PricingMode:     "per_provider_vibes",
			},
			want: "pricing_mode",
		},
		{
			name: "negative credit price",
			input: ModelCatalogEntryInput{
				PublicModelID:   "bad-credit",
				ProviderModelID: "provider-bad-credit",
				Capabilities:    "text",
				CreditsPerCall:  -1,
			},
			want: "credits_per_call",
		},
		{
			name: "invalid image input limit",
			input: ModelCatalogEntryInput{
				PublicModelID:   "bad-limit",
				ProviderModelID: "provider-bad-limit",
				Capabilities:    "image_edit",
				MaxInputImages:  -2,
			},
			want: "max_input_images",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := service.CreateModelCatalogEntry(ctx, tt.input)
			if !errors.Is(err, ErrInvalidModelCatalog) || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("CreateModelCatalogEntry() error = %v, want ErrInvalidModelCatalog containing %q", err, tt.want)
			}
		})
	}
}

func TestModelCatalogUpdatePreservesCapabilitiesWhenOmitted(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()

	entry, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID:   "video-public",
		ProviderModelID: "provider-video",
		Capabilities:    "video,video_i2v",
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry() error = %v", err)
	}
	updated, err := service.UpdateModelCatalogEntry(ctx, strconvID(entry.ID), ModelCatalogEntryInput{
		DisplayName: "Renamed Video",
	})
	if err != nil {
		t.Fatalf("UpdateModelCatalogEntry() error = %v", err)
	}
	if updated.Capabilities != "video,video_i2v" {
		t.Fatalf("capabilities after partial update = %q, want video,video_i2v", updated.Capabilities)
	}
}

func TestModelCatalogRejectsDuplicateRouteBindingForSameSourceAndGroup(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()

	entry, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID:   "video-fast",
		ProviderModelID: "provider-video-fast",
		DisplayName:     "Video Fast",
		Capabilities:    "video",
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry() error = %v", err)
	}
	if supportsNewAPIRouteBindings() {
		if _, err := service.CreateModelRouteBinding(ctx, strconvID(entry.ID), ModelRouteBindingInput{
			SourceType:     "new_api",
			RouteGroup:     "priority",
			Priority:       1,
			CapacityWeight: 1,
		}); err != nil {
			t.Fatalf("CreateModelRouteBinding() first error = %v", err)
		}

		_, err = service.CreateModelRouteBinding(ctx, strconvID(entry.ID), ModelRouteBindingInput{
			SourceType:     "new_api",
			RouteGroup:     "priority",
			Priority:       2,
			CapacityWeight: 1,
		})
		if !errors.Is(err, ErrInvalidModelCatalog) || !strings.Contains(err.Error(), "already exists") {
			t.Fatalf("duplicate binding error = %v, want ErrInvalidModelCatalog with already exists", err)
		}

		if _, err := service.CreateModelRouteBinding(ctx, strconvID(entry.ID), ModelRouteBindingInput{
			SourceType:     "new_api",
			RouteGroup:     "economy",
			Priority:       3,
			CapacityWeight: 1,
		}); err != nil {
			t.Fatalf("CreateModelRouteBinding() different group error = %v", err)
		}
	}

	if !supportsLocalProviderRouteBindings() {
		return
	}

	credentialA := uint(101)
	credentialB := uint(102)
	if _, err := service.CreateModelRouteBinding(ctx, strconvID(entry.ID), ModelRouteBindingInput{
		SourceType:     "local_provider",
		CredentialID:   &credentialA,
		CapacityWeight: 1,
	}); err != nil {
		t.Fatalf("CreateModelRouteBinding() local provider credential A error = %v", err)
	}
	if _, err := service.CreateModelRouteBinding(ctx, strconvID(entry.ID), ModelRouteBindingInput{
		SourceType:     "local_provider",
		CredentialID:   &credentialB,
		CapacityWeight: 1,
	}); err != nil {
		t.Fatalf("CreateModelRouteBinding() local provider credential B error = %v", err)
	}
	_, err = service.CreateModelRouteBinding(ctx, strconvID(entry.ID), ModelRouteBindingInput{
		SourceType:     "local_provider",
		CredentialID:   &credentialA,
		CapacityWeight: 1,
	})
	if !errors.Is(err, ErrInvalidModelCatalog) || !strings.Contains(err.Error(), "already exists") {
		t.Fatalf("duplicate credential binding error = %v, want ErrInvalidModelCatalog with already exists", err)
	}
}

func TestModelCatalogRejectsInvalidRouteBindingContracts(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()

	entry, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID:   "video-contract",
		ProviderModelID: "provider-video-contract",
		Capabilities:    "video",
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry() error = %v", err)
	}

	negativeCapacityInput := validTestModelRouteBindingInput(1, "invalid-capacity")
	negativeCapacityInput.CapacityWeight = -1
	negativeMaxConcurrencyInput := validTestModelRouteBindingInput(2, "invalid-concurrency")
	negativeMaxConcurrencyInput.MaxConcurrency = -1

	tests := []struct {
		name  string
		input ModelRouteBindingInput
		want  string
	}{
		{
			name:  "negative capacity weight",
			input: negativeCapacityInput,
			want:  "capacity_weight",
		},
		{
			name:  "negative max concurrency",
			input: negativeMaxConcurrencyInput,
			want:  "max_concurrency",
		},
	}
	if supportsNewAPIRouteBindings() {
		tests = append(tests, struct {
			name  string
			input ModelRouteBindingInput
			want  string
		}{
			name: "new api missing route group",
			input: ModelRouteBindingInput{
				SourceType:     "new_api",
				CapacityWeight: 1,
			},
			want: "route_group",
		})
	} else {
		tests = append(tests, struct {
			name  string
			input ModelRouteBindingInput
			want  string
		}{
			name: "community rejects new api route",
			input: ModelRouteBindingInput{
				SourceType:     "new_api",
				RouteGroup:     "priority",
				CapacityWeight: 1,
			},
			want: "commercial edition",
		})
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := service.CreateModelRouteBinding(ctx, strconvID(entry.ID), tt.input)
			if !errors.Is(err, ErrInvalidModelCatalog) || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("CreateModelRouteBinding() error = %v, want ErrInvalidModelCatalog containing %q", err, tt.want)
			}
		})
	}
}

func TestModelCatalogRejectsUpdatingRouteBindingIntoDuplicateGroup(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()

	entry, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID:   "image-fast",
		ProviderModelID: "provider-image-fast",
		DisplayName:     "Image Fast",
		Capabilities:    "image",
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry() error = %v", err)
	}
	var duplicateTarget persistencemodel.AIModelRouteBinding
	if supportsNewAPIRouteBindings() {
		if _, err := service.CreateModelRouteBinding(ctx, strconvID(entry.ID), ModelRouteBindingInput{
			SourceType:     "new_api",
			RouteGroup:     "priority",
			CapacityWeight: 1,
		}); err != nil {
			t.Fatalf("CreateModelRouteBinding() priority error = %v", err)
		}
		duplicateTarget, err = service.CreateModelRouteBinding(ctx, strconvID(entry.ID), ModelRouteBindingInput{
			SourceType:     "new_api",
			RouteGroup:     "economy",
			CapacityWeight: 1,
		})
		if err != nil {
			t.Fatalf("CreateModelRouteBinding() economy error = %v", err)
		}
		_, err = service.UpdateModelRouteBinding(ctx, strconvID(duplicateTarget.ID), ModelRouteBindingInput{
			SourceType:     "new_api",
			RouteGroup:     "priority",
			CapacityWeight: 1,
		})
	} else {
		credentialA := uint(201)
		credentialB := uint(202)
		if _, err := service.CreateModelRouteBinding(ctx, strconvID(entry.ID), ModelRouteBindingInput{
			SourceType:     "local_provider",
			CredentialID:   &credentialA,
			CapacityWeight: 1,
		}); err != nil {
			t.Fatalf("CreateModelRouteBinding() credential A error = %v", err)
		}
		duplicateTarget, err = service.CreateModelRouteBinding(ctx, strconvID(entry.ID), ModelRouteBindingInput{
			SourceType:     "local_provider",
			CredentialID:   &credentialB,
			CapacityWeight: 1,
		})
		if err != nil {
			t.Fatalf("CreateModelRouteBinding() credential B error = %v", err)
		}
		_, err = service.UpdateModelRouteBinding(ctx, strconvID(duplicateTarget.ID), ModelRouteBindingInput{
			SourceType:     "local_provider",
			CredentialID:   &credentialA,
			CapacityWeight: 1,
		})
	}
	if !errors.Is(err, ErrInvalidModelCatalog) || !strings.Contains(err.Error(), "already exists") {
		t.Fatalf("duplicate update error = %v, want ErrInvalidModelCatalog with already exists", err)
	}
}

func TestModelCatalogRejectsBindingForMissingCatalogEntry(t *testing.T) {
	service := newTestService(t)

	_, err := service.CreateModelRouteBinding(context.Background(), "9999", ModelRouteBindingInput{
		SourceType:     "local_provider",
		CapacityWeight: 1,
	})
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("CreateModelRouteBinding() error = %v, want ErrNotFound", err)
	}
}

func TestModelCatalogDeleteRemovesRouteBindings(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()

	entry, err := service.CreateModelCatalogEntry(ctx, ModelCatalogEntryInput{
		PublicModelID:   "audio-fast",
		ProviderModelID: "provider-audio-fast",
		DisplayName:     "Audio Fast",
		Capabilities:    "audio_tts",
	})
	if err != nil {
		t.Fatalf("CreateModelCatalogEntry() error = %v", err)
	}
	if _, err := service.CreateModelRouteBinding(ctx, strconvID(entry.ID), validTestModelRouteBindingInput(301, "delete-route")); err != nil {
		t.Fatalf("CreateModelRouteBinding() error = %v", err)
	}

	if err := service.DeleteModelCatalogEntry(ctx, strconvID(entry.ID)); err != nil {
		t.Fatalf("DeleteModelCatalogEntry() error = %v", err)
	}
	var bindingCount int64
	if err := service.db.Model(&persistencemodel.AIModelRouteBinding{}).Where("catalog_entry_id = ?", entry.ID).Count(&bindingCount).Error; err != nil {
		t.Fatalf("count route bindings: %v", err)
	}
	if bindingCount != 0 {
		t.Fatalf("active route binding count after catalog delete = %d, want 0", bindingCount)
	}
	if err := service.DeleteModelCatalogEntry(ctx, strconvID(entry.ID)); !errors.Is(err, ErrNotFound) {
		t.Fatalf("DeleteModelCatalogEntry() missing error = %v, want ErrNotFound", err)
	}
}

func validTestModelRouteBindingInput(credentialID uint, routeGroup string) ModelRouteBindingInput {
	if supportsNewAPIRouteBindings() {
		return ModelRouteBindingInput{
			SourceType:     "new_api",
			RouteGroup:     routeGroup,
			CapacityWeight: 1,
		}
	}
	return ModelRouteBindingInput{
		SourceType:     "local_provider",
		CredentialID:   &credentialID,
		CapacityWeight: 1,
	}
}
