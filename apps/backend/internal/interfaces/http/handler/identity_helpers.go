package handler

import (
	"github.com/gin-gonic/gin"
	domainauth "github.com/movscript/movscript/internal/domain/auth"
	domainorg "github.com/movscript/movscript/internal/domain/org"
	"github.com/movscript/movscript/internal/interfaces/http/middleware"
)

func currentUser(c *gin.Context) *domainauth.UserProfile {
	profile, ok := middleware.CurrentUserProfileFromContext(c)
	if !ok {
		return nil
	}
	return &profile
}

func currentDomainUser(c *gin.Context) *domainorg.User {
	profile, ok := middleware.CurrentUserProfileFromContext(c)
	if !ok {
		return nil
	}
	domainUser := domainorg.User{
		ID:              profile.ID,
		Username:        profile.Username,
		SystemRole:      profile.SystemRole,
		PrimaryEmail:    profile.PrimaryEmail,
		PrimaryPhone:    profile.PrimaryPhone,
		DisplayName:     profile.DisplayName,
		AvatarURL:       profile.AvatarURL,
		Locale:          profile.Locale,
		Status:          profile.Status,
		EmailVerifiedAt: profile.EmailVerifiedAt,
		CreatedAt:       profile.CreatedAt,
		UpdatedAt:       profile.UpdatedAt,
	}
	return &domainUser
}

func currentOrgMember(c *gin.Context) *domainorg.OrganizationMember {
	member, ok := middleware.CurrentDomainOrgMemberFromContext(c)
	if !ok {
		return nil
	}
	return &member
}

func currentDomainOrgMember(c *gin.Context) domainorg.OrganizationMember {
	member := currentOrgMember(c)
	if member == nil {
		return domainorg.OrganizationMember{}
	}
	return *member
}
