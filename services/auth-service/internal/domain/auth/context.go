package auth

type Principal struct {
	ID          string `json:"id"`
	Type        string `json:"type"`
	DisplayName string `json:"display_name,omitempty"`
}

type AuthContext struct {
	Principal Principal         `json:"principal"`
	Claims    map[string]string `json:"claims,omitempty"`
	TokenID   string            `json:"token_id,omitempty"`
}

type IntrospectRequest struct {
	Token string `json:"token"`
}

type IntrospectResponse struct {
	Active      bool              `json:"active"`
	TokenType   string            `json:"token_type,omitempty"`
	Principal   *Principal        `json:"principal,omitempty"`
	Claims      map[string]string `json:"claims,omitempty"`
	AuthContext *AuthContext      `json:"auth_context,omitempty"`
}

type IssueKeyRequest struct {
	PrincipalID string            `json:"principal_id"`
	Type        string            `json:"type,omitempty"`
	DisplayName string            `json:"display_name,omitempty"`
	Claims      map[string]string `json:"claims,omitempty"`
	Prefix      string            `json:"prefix,omitempty"`
	TokenID     string            `json:"token_id,omitempty"`
}

type IssueKeyResponse struct {
	Token     string            `json:"token"`
	TokenID   string            `json:"token_id"`
	TokenType string            `json:"token_type"`
	Principal Principal         `json:"principal"`
	Claims    map[string]string `json:"claims,omitempty"`
}

type RevokeKeyRequest struct {
	Token   string `json:"token,omitempty"`
	TokenID string `json:"token_id,omitempty"`
}

type RevokeKeyResponse struct {
	Revoked bool   `json:"revoked"`
	TokenID string `json:"token_id,omitempty"`
}
