package middleware

import (
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
	"github.com/movscript/auth-service/pkg/authprovider"
	domainorg "github.com/movscript/movscript/internal/domain/org"
)

type CurrentUser struct {
	ID         uint
	SystemRole string
}

type CurrentOrgMember struct {
	ID     uint
	OrgID  uint
	UserID uint
	Role   string
}

func CurrentUserFromContext(c *gin.Context) (CurrentUser, bool) {
	profile, ok := CurrentUserProfileFromContext(c)
	if !ok {
		return CurrentUser{}, false
	}
	return CurrentUser{ID: profile.ID, SystemRole: profile.SystemRole}, true
}

func CurrentUserProfileFromContext(c *gin.Context) (domainidentity.UserProfile, bool) {
	if c == nil {
		return domainidentity.UserProfile{}, false
	}
	return userProfileFromAuthContext(c)
}

func userProfileFromAuthContext(c *gin.Context) (domainidentity.UserProfile, bool) {
	context, ok := CurrentAuthContextFromContext(c)
	if !ok || !context.Authenticated {
		return domainidentity.UserProfile{}, false
	}
	userID, ok := authContextUserID(context)
	if !ok {
		return domainidentity.UserProfile{}, false
	}
	username := firstClaimValue(context.Claims, "username", "user_name")
	if username == "" {
		username = strings.TrimSpace(context.Principal.Subject)
	}
	return domainidentity.UserProfile{
		ID:         userID,
		Username:   username,
		SystemRole: firstClaimValue(context.Claims, "system_role", "systemRole"),
		Status:     firstClaimValue(context.Claims, "status"),
	}, true
}

func authContextUserID(context authprovider.AuthContext) (uint, bool) {
	raw := firstClaimValue(context.Claims, "user_id", "uid", "data_service_user_id")
	if raw == "" && context.Principal.Kind == authprovider.PrincipalCloudUser {
		raw = strings.TrimPrefix(strings.TrimSpace(context.Principal.Subject), "user_")
	}
	parsed, err := strconv.ParseUint(raw, 10, 64)
	if err != nil || parsed == 0 {
		return 0, false
	}
	return uint(parsed), true
}

func firstClaimValue(claims map[string]string, keys ...string) string {
	for _, key := range keys {
		if value := strings.TrimSpace(claims[key]); value != "" {
			return value
		}
	}
	return ""
}

func CurrentAuthContextFromContext(c *gin.Context) (authprovider.AuthContext, bool) {
	if c == nil {
		return authprovider.AuthContext{}, false
	}
	value, ok := c.Get(ContextAuthContextKey)
	if !ok {
		return authprovider.AuthContext{}, false
	}
	switch context := value.(type) {
	case authprovider.AuthContext:
		return context, true
	case *authprovider.AuthContext:
		if context == nil {
			return authprovider.AuthContext{}, false
		}
		return *context, true
	default:
		return authprovider.AuthContext{}, false
	}
}

func CurrentOrgMemberFromContext(c *gin.Context) (CurrentOrgMember, bool) {
	member, ok := CurrentDomainOrgMemberFromContext(c)
	if !ok {
		return CurrentOrgMember{}, false
	}
	return CurrentOrgMember{ID: member.ID, OrgID: member.OrgID, UserID: member.UserID, Role: member.Role}, true
}

func CurrentDomainOrgMemberFromContext(c *gin.Context) (domainorg.OrganizationMember, bool) {
	if c == nil {
		return domainorg.OrganizationMember{}, false
	}
	value, ok := c.Get(ContextOrgMemberKey)
	if !ok {
		return domainorg.OrganizationMember{}, false
	}
	switch member := value.(type) {
	case domainorg.OrganizationMember:
		return member, true
	case *domainorg.OrganizationMember:
		if member == nil {
			return domainorg.OrganizationMember{}, false
		}
		return *member, true
	default:
		return domainorg.OrganizationMember{}, false
	}
}
