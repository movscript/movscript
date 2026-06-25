package testutil

type ExternalUser struct {
	ID         uint
	Username   string
	Status     string
	SystemRole string
}

func NewExternalUser(id uint, username string) ExternalUser {
	return NewExternalUserWithStatus(id, username, "active")
}

func NewExternalUserWithStatus(id uint, username string, status string) ExternalUser {
	if status == "" {
		status = "active"
	}
	return ExternalUser{ID: id, Username: username, Status: status, SystemRole: "user"}
}
