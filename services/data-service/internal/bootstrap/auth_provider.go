package bootstrap

import (
	"fmt"
	"strconv"

	"github.com/movscript/auth-service/pkg/authidentity"
	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
	"github.com/movscript/auth-service/pkg/authprovider"
	"github.com/movscript/movscript/internal/infra/config"
)

func buildAuthProvider(cfg *config.Config) (authprovider.Provider, error) {
	if cfg == nil {
		return nil, nil
	}
	switch cfg.EffectiveAuthMode() {
	case "":
		return nil, nil
	case "opaque-key":
		provider, err := authprovider.NewOpaqueKeyProvider(cfg.AuthBaseURL, nil)
		if err != nil {
			return nil, err
		}
		return provider, nil
	case "local-owner":
		return authprovider.NewLocalOwnerProvider(authprovider.LocalOwnerOptions{
			Subject: "local-owner",
			HomeID:  cfg.DataDir,
			Claims: map[string]string{
				"user_id":     strconv.FormatUint(uint64(authidentity.LocalOwnerUserID), 10),
				"username":    "local-owner",
				"system_role": domainidentity.SystemRoleSuperAdmin,
				"status":      domainidentity.UserStatusActive,
			},
		}), nil
	case "no-auth":
		return authprovider.NewNoAuthProvider("anonymous"), nil
	case "test":
		return authprovider.NewNoAuthProvider("test"), nil
	default:
		return nil, fmt.Errorf("unsupported auth mode %q", cfg.AuthMode)
	}
}
