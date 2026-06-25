package handler

import (
	"strconv"

	"github.com/gin-gonic/gin"
	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
	"github.com/movscript/auth-service/pkg/authprovider"
	"github.com/movscript/movscript/internal/interfaces/http/middleware"
)

func setTestAuthContextUser(c *gin.Context, user domainidentity.UserProfile) {
	status := user.Status
	if status == "" {
		status = domainidentity.UserStatusActive
	}
	systemRole := user.SystemRole
	if systemRole == "" {
		systemRole = domainidentity.SystemRoleUser
	}
	c.Set(middleware.ContextAuthContextKey, authprovider.AuthContext{
		Authenticated: true,
		Mode:          authprovider.ModeOpaqueKey,
		Principal: authprovider.Principal{
			Kind:    authprovider.PrincipalCloudUser,
			Subject: "user_" + strconv.FormatUint(uint64(user.ID), 10),
		},
		Claims: map[string]string{
			"user_id":     strconv.FormatUint(uint64(user.ID), 10),
			"username":    user.Username,
			"system_role": systemRole,
			"status":      status,
		},
	})
}
