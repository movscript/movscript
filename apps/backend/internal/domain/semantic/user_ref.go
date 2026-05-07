package semantic

type UserRef struct {
	ID           uint    `json:"ID"`
	Username     string  `json:"username"`
	SystemRole   string  `json:"system_role,omitempty"`
	PrimaryEmail *string `json:"primary_email,omitempty"`
	PrimaryPhone *string `json:"primary_phone,omitempty"`
	DisplayName  string  `json:"display_name,omitempty"`
	AvatarURL    string  `json:"avatar_url,omitempty"`
	Locale       string  `json:"locale,omitempty"`
	Status       string  `json:"status,omitempty"`
}
