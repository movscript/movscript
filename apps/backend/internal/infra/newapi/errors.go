package newapi

import "errors"

var (
	ErrMissingBaseURL     = errors.New("MOVSCRIPT_NEW_API_BASE_URL is required")
	ErrMissingAdminToken  = errors.New("MOVSCRIPT_NEW_API_ADMIN_TOKEN is required")
	ErrMissingAdminUserID = errors.New("MOVSCRIPT_NEW_API_ADMIN_USER_ID is required")
)
