package middleware

import (
	"github.com/gin-gonic/gin"
	domainauth "github.com/movscript/movscript/internal/domain/auth"
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

func CurrentUserProfileFromContext(c *gin.Context) (domainauth.UserProfile, bool) {
	if c == nil {
		return domainauth.UserProfile{}, false
	}
	value, ok := c.Get(ContextUserKey)
	if !ok {
		return domainauth.UserProfile{}, false
	}
	switch user := value.(type) {
	case domainauth.UserProfile:
		return user, true
	case *domainauth.UserProfile:
		if user == nil {
			return domainauth.UserProfile{}, false
		}
		return *user, true
	default:
		return domainauth.UserProfile{}, false
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
