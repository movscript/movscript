package handler

import (
	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
	"github.com/movscript/movscript/internal/testutil"
)

var nextHandlerExternalUserID uint = 100

func newHandlerExternalUser(username string) testutil.ExternalUser {
	return newHandlerExternalUserWithStatus(username, domainidentity.UserStatusActive)
}

func newHandlerExternalUserWithStatus(username string, status string) testutil.ExternalUser {
	nextHandlerExternalUserID++
	return testutil.NewExternalUserWithStatus(nextHandlerExternalUserID, username, status)
}

func handlerUserProfile(user testutil.ExternalUser) domainidentity.UserProfile {
	return domainidentity.UserProfile{
		ID:         user.ID,
		Username:   user.Username,
		SystemRole: user.SystemRole,
		Status:     user.Status,
	}
}
