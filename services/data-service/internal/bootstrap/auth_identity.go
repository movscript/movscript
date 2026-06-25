package bootstrap

import (
	"github.com/movscript/auth-service/pkg/authidentity"
	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
	"github.com/movscript/movscript/internal/infra/config"
)

func buildAuthIdentityManager(cfg *config.Config) (authidentity.Manager, error) {
	if cfg == nil {
		return nil, nil
	}
	switch cfg.EffectiveAuthMode() {
	case "opaque-key":
		return authidentity.NewClient(cfg.AuthBaseURL, cfg.AuthManagementToken, nil)
	case "local-owner":
		return authidentity.NewLocalOwnerManager(authidentity.LocalOwnerOptions{
			SystemRole: domainidentity.SystemRoleSuperAdmin,
		}), nil
	default:
		return nil, nil
	}
}
