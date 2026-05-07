package auth

import persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"

func RegisteredUserFromModel(user persistencemodel.User) RegisteredUser {
	return RegisteredUser{
		ID:              user.ID,
		Username:        user.Username,
		PasswordHash:    user.PasswordHash,
		SystemRole:      user.SystemRole,
		PrimaryEmail:    user.PrimaryEmail,
		PrimaryPhone:    user.PrimaryPhone,
		DisplayName:     user.DisplayName,
		AvatarURL:       user.AvatarURL,
		Locale:          user.Locale,
		Status:          user.Status,
		EmailVerifiedAt: user.EmailVerifiedAt,
	}
}

func UserProfileFromRegisteredUser(user RegisteredUser) UserProfile {
	return UserProfile{
		ID:              user.ID,
		Username:        user.Username,
		SystemRole:      user.SystemRole,
		PrimaryEmail:    user.PrimaryEmail,
		PrimaryPhone:    user.PrimaryPhone,
		DisplayName:     user.DisplayName,
		AvatarURL:       user.AvatarURL,
		Locale:          user.Locale,
		Status:          user.Status,
		EmailVerifiedAt: user.EmailVerifiedAt,
	}
}

func UserProfileFromModel(user persistencemodel.User) UserProfile {
	return UserProfile{
		ID:              user.ID,
		Username:        user.Username,
		SystemRole:      user.SystemRole,
		PrimaryEmail:    user.PrimaryEmail,
		PrimaryPhone:    user.PrimaryPhone,
		DisplayName:     user.DisplayName,
		AvatarURL:       user.AvatarURL,
		Locale:          user.Locale,
		Status:          user.Status,
		EmailVerifiedAt: user.EmailVerifiedAt,
		CreatedAt:       user.CreatedAt,
		UpdatedAt:       user.UpdatedAt,
	}
}

func (user RegisteredUser) ToModel() persistencemodel.User {
	var target persistencemodel.User
	user.ApplyToModel(&target)
	return target
}

func (user RegisteredUser) ApplyToModel(target *persistencemodel.User) {
	target.Model.ID = user.ID
	target.Username = user.Username
	target.PasswordHash = user.PasswordHash
	target.SystemRole = user.SystemRole
	target.PrimaryEmail = user.PrimaryEmail
	target.PrimaryPhone = user.PrimaryPhone
	target.DisplayName = user.DisplayName
	target.AvatarURL = user.AvatarURL
	target.Locale = user.Locale
	target.Status = user.Status
	target.EmailVerifiedAt = user.EmailVerifiedAt
}

func AuthChallengeFromModel(challenge persistencemodel.AuthChallenge) AuthChallenge {
	return AuthChallenge{
		ID:         challenge.ID,
		Channel:    challenge.Channel,
		Target:     challenge.Target,
		CodeHash:   challenge.CodeHash,
		ExpiresAt:  challenge.ExpiresAt,
		ConsumedAt: challenge.ConsumedAt,
		Attempts:   challenge.Attempts,
		CreatedAt:  challenge.CreatedAt,
		UpdatedAt:  challenge.UpdatedAt,
	}
}

func (challenge AuthChallenge) ToModel() persistencemodel.AuthChallenge {
	var target persistencemodel.AuthChallenge
	challenge.ApplyToModel(&target)
	return target
}

func (challenge AuthChallenge) ApplyToModel(target *persistencemodel.AuthChallenge) {
	target.Model.ID = challenge.ID
	target.Channel = challenge.Channel
	target.Target = challenge.Target
	target.CodeHash = challenge.CodeHash
	target.ExpiresAt = challenge.ExpiresAt
	target.ConsumedAt = challenge.ConsumedAt
	target.Attempts = challenge.Attempts
	target.CreatedAt = challenge.CreatedAt
	target.UpdatedAt = challenge.UpdatedAt
}

func AuthSessionFromModel(session persistencemodel.AuthSession) AuthSession {
	return AuthSession{
		ID:         session.ID,
		UserID:     session.UserID,
		TokenHash:  session.TokenHash,
		ExpiresAt:  session.ExpiresAt,
		RevokedAt:  session.RevokedAt,
		LastSeenAt: session.LastSeenAt,
		UserAgent:  session.UserAgent,
		IPAddress:  session.IPAddress,
	}
}

func (session AuthSession) ToModel() persistencemodel.AuthSession {
	var target persistencemodel.AuthSession
	session.ApplyToModel(&target)
	return target
}

func (session AuthSession) ApplyToModel(target *persistencemodel.AuthSession) {
	target.Model.ID = session.ID
	target.UserID = session.UserID
	target.TokenHash = session.TokenHash
	target.ExpiresAt = session.ExpiresAt
	target.RevokedAt = session.RevokedAt
	target.LastSeenAt = session.LastSeenAt
	target.UserAgent = session.UserAgent
	target.IPAddress = session.IPAddress
}
