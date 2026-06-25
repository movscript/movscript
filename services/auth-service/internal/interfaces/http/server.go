package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	identityapp "github.com/movscript/auth-service/internal/app/identity"
	"github.com/movscript/auth-service/internal/app/introspection"
	domainauth "github.com/movscript/auth-service/internal/domain/auth"
)

type Handler struct {
	introspection   *introspection.Service
	identity        *identityapp.Service
	managementToken string
}

type HandlerOptions struct {
	ManagementToken string
	IdentityService *identityapp.Service
}

func NewHandler(introspectionService *introspection.Service) http.Handler {
	return NewHandlerWithOptions(introspectionService, HandlerOptions{})
}

func NewHandlerWithOptions(introspectionService *introspection.Service, options HandlerOptions) http.Handler {
	handler := &Handler{
		introspection:   introspectionService,
		identity:        options.IdentityService,
		managementToken: strings.TrimSpace(options.ManagementToken),
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", handler.health)
	mux.HandleFunc("/v1/auth/introspect", handler.introspect)
	mux.HandleFunc("/v1/auth/keys/issue", handler.issueKey)
	mux.HandleFunc("/v1/auth/keys/revoke", handler.revokeKey)
	mux.HandleFunc("/v1/auth/users", handler.usersCollection)
	mux.HandleFunc("/v1/auth/users/with-password", handler.createUserWithPassword)
	mux.HandleFunc("/v1/auth/users/", handler.users)
	mux.HandleFunc("/v1/auth/orgs", handler.orgsCollection)
	mux.HandleFunc("/v1/auth/orgs/", handler.orgs)
	return mux
}

func (h *Handler) health(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"service": "movscript.auth.service",
	})
}

func (h *Handler) introspect(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed")
		return
	}
	defer r.Body.Close()

	var request domainauth.IntrospectRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json")
		return
	}

	response, err := h.introspection.Introspect(r.Context(), request)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "introspection_failed")
		return
	}
	writeJSON(w, http.StatusOK, response)
}

func (h *Handler) issueKey(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed")
		return
	}
	if !h.authorizeManagementRequest(r) {
		writeError(w, http.StatusUnauthorized, "management_auth_required")
		return
	}
	defer r.Body.Close()

	var request domainauth.IssueKeyRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json")
		return
	}
	response, err := h.introspection.IssueKey(r.Context(), request)
	if err != nil {
		writeServiceError(w, err, "issue_key_failed")
		return
	}
	writeJSON(w, http.StatusCreated, response)
}

func (h *Handler) revokeKey(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed")
		return
	}
	if !h.authorizeManagementRequest(r) {
		writeError(w, http.StatusUnauthorized, "management_auth_required")
		return
	}
	defer r.Body.Close()

	var request domainauth.RevokeKeyRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json")
		return
	}
	response, err := h.introspection.RevokeKey(r.Context(), request)
	if err != nil {
		writeServiceError(w, err, "revoke_key_failed")
		return
	}
	writeJSON(w, http.StatusOK, response)
}

func (h *Handler) usersCollection(w http.ResponseWriter, r *http.Request) {
	if !h.authorizeManagementRequest(r) {
		writeError(w, http.StatusUnauthorized, "management_auth_required")
		return
	}
	if h.identity == nil {
		writeError(w, http.StatusServiceUnavailable, "identity_unavailable")
		return
	}
	switch r.Method {
	case http.MethodGet:
		filter, ok := parseListUsersFilter(r)
		if !ok {
			writeError(w, http.StatusBadRequest, "invalid_user_filter")
			return
		}
		page, err := h.identity.ListUsers(r.Context(), filter)
		if err != nil {
			writeServiceError(w, err, "list_users_failed")
			return
		}
		writeJSON(w, http.StatusOK, page)
	case http.MethodPost:
		defer r.Body.Close()
		var input identityapp.CreateUserInput
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_json")
			return
		}
		user, err := h.identity.CreateUser(r.Context(), input)
		if err != nil {
			writeServiceError(w, err, "create_user_failed")
			return
		}
		writeJSON(w, http.StatusCreated, user)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed")
	}
}

func (h *Handler) createUserWithPassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed")
		return
	}
	if !h.authorizeManagementRequest(r) {
		writeError(w, http.StatusUnauthorized, "management_auth_required")
		return
	}
	if h.identity == nil {
		writeError(w, http.StatusServiceUnavailable, "identity_unavailable")
		return
	}
	defer r.Body.Close()
	var input identityapp.CreateUserWithPasswordInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json")
		return
	}
	user, err := h.identity.CreateUserWithPassword(r.Context(), input)
	if err != nil {
		writeServiceError(w, err, "create_user_with_password_failed")
		return
	}
	writeJSON(w, http.StatusCreated, user)
}

func (h *Handler) users(w http.ResponseWriter, r *http.Request) {
	if !h.authorizeManagementRequest(r) {
		writeError(w, http.StatusUnauthorized, "management_auth_required")
		return
	}
	if h.identity == nil {
		writeError(w, http.StatusServiceUnavailable, "identity_unavailable")
		return
	}
	userID, tail, ok := parseUserIdentityPath(r.URL.Path)
	if !ok {
		writeError(w, http.StatusNotFound, "not_found")
		return
	}
	if tail == "" {
		if r.Method == http.MethodPatch {
			defer r.Body.Close()
			var input identityapp.UpdateUserInput
			if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
				writeError(w, http.StatusBadRequest, "invalid_json")
				return
			}
			profile, err := h.identity.UpdateUser(r.Context(), userID, input)
			if err != nil {
				writeServiceError(w, err, "update_user_failed")
				return
			}
			writeJSON(w, http.StatusOK, profile)
			return
		}
		if r.Method != http.MethodGet {
			writeError(w, http.StatusMethodNotAllowed, "method_not_allowed")
			return
		}
		profile, err := h.identity.UserProfile(r.Context(), userID)
		if err != nil {
			writeServiceError(w, err, "user_profile_failed")
			return
		}
		writeJSON(w, http.StatusOK, profile)
		return
	}
	if tail == "password" {
		if r.Method != http.MethodPut {
			writeError(w, http.StatusMethodNotAllowed, "method_not_allowed")
			return
		}
		defer r.Body.Close()
		var input struct {
			PasswordHash string `json:"password_hash"`
		}
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_json")
			return
		}
		profile, err := h.identity.SetUserPasswordHash(r.Context(), userID, input.PasswordHash)
		if err != nil {
			writeServiceError(w, err, "set_user_password_failed")
			return
		}
		writeJSON(w, http.StatusOK, profile)
		return
	}
	if tail == "org-memberships" {
		if r.Method != http.MethodGet {
			writeError(w, http.StatusMethodNotAllowed, "method_not_allowed")
			return
		}
		memberships, err := h.identity.OrgMemberships(r.Context(), userID)
		if err != nil {
			writeServiceError(w, err, "user_org_memberships_failed")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": memberships})
		return
	}
	writeError(w, http.StatusNotFound, "not_found")
}

func (h *Handler) orgsCollection(w http.ResponseWriter, r *http.Request) {
	if !h.authorizeManagementRequest(r) {
		writeError(w, http.StatusUnauthorized, "management_auth_required")
		return
	}
	if h.identity == nil {
		writeError(w, http.StatusServiceUnavailable, "identity_unavailable")
		return
	}
	switch r.Method {
	case http.MethodGet:
		filter, ok := parseListOrgsFilter(r)
		if !ok {
			writeError(w, http.StatusBadRequest, "invalid_org_filter")
			return
		}
		page, err := h.identity.ListOrgs(r.Context(), filter)
		if err != nil {
			writeServiceError(w, err, "list_orgs_failed")
			return
		}
		writeJSON(w, http.StatusOK, page)
	case http.MethodPost:
		defer r.Body.Close()
		var input identityapp.CreateOrgInput
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_json")
			return
		}
		org, err := h.identity.CreateOrg(r.Context(), input)
		if err != nil {
			writeServiceError(w, err, "create_org_failed")
			return
		}
		writeJSON(w, http.StatusCreated, org)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed")
	}
}

func (h *Handler) orgs(w http.ResponseWriter, r *http.Request) {
	if !h.authorizeManagementRequest(r) {
		writeError(w, http.StatusUnauthorized, "management_auth_required")
		return
	}
	if h.identity == nil {
		writeError(w, http.StatusServiceUnavailable, "identity_unavailable")
		return
	}
	orgID, tail, tailID, ok := parseOrgIdentityPath(r.URL.Path)
	if !ok {
		writeError(w, http.StatusNotFound, "not_found")
		return
	}
	if tail == "" {
		if r.Method != http.MethodPatch {
			writeError(w, http.StatusMethodNotAllowed, "method_not_allowed")
			return
		}
		defer r.Body.Close()
		var input identityapp.UpdateOrgInput
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_json")
			return
		}
		org, err := h.identity.UpdateOrg(r.Context(), orgID, input)
		if err != nil {
			writeServiceError(w, err, "update_org_failed")
			return
		}
		writeJSON(w, http.StatusOK, org)
		return
	}
	if tail == "members" && tailID == 0 {
		switch r.Method {
		case http.MethodGet:
			members, err := h.identity.ListOrgMembers(r.Context(), orgID)
			if err != nil {
				writeServiceError(w, err, "list_org_members_failed")
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"items": members})
		case http.MethodPost:
			defer r.Body.Close()
			var input identityapp.OrgMemberInput
			if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
				writeError(w, http.StatusBadRequest, "invalid_json")
				return
			}
			member, err := h.identity.AddOrgMember(r.Context(), orgID, input)
			if err != nil {
				writeServiceError(w, err, "add_org_member_failed")
				return
			}
			writeJSON(w, http.StatusCreated, member)
		default:
			writeError(w, http.StatusMethodNotAllowed, "method_not_allowed")
		}
		return
	}
	if tail == "members" && tailID != 0 {
		switch r.Method {
		case http.MethodPatch:
			defer r.Body.Close()
			var input identityapp.OrgMemberInput
			if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
				writeError(w, http.StatusBadRequest, "invalid_json")
				return
			}
			member, err := h.identity.UpdateOrgMember(r.Context(), orgID, tailID, input)
			if err != nil {
				writeServiceError(w, err, "update_org_member_failed")
				return
			}
			writeJSON(w, http.StatusOK, member)
		case http.MethodDelete:
			if err := h.identity.RemoveOrgMember(r.Context(), orgID, tailID); err != nil {
				writeServiceError(w, err, "remove_org_member_failed")
				return
			}
			writeJSON(w, http.StatusOK, map[string]bool{"removed": true})
		default:
			writeError(w, http.StatusMethodNotAllowed, "method_not_allowed")
		}
		return
	}
	writeError(w, http.StatusNotFound, "not_found")
}

func (h *Handler) authorizeManagementRequest(r *http.Request) bool {
	if h.managementToken == "" {
		return false
	}
	raw := strings.TrimSpace(r.Header.Get("Authorization"))
	token, ok := strings.CutPrefix(raw, "Bearer ")
	return ok && strings.TrimSpace(token) == h.managementToken
}

func parseUserIdentityPath(path string) (uint, string, bool) {
	rest, ok := strings.CutPrefix(path, "/v1/auth/users/")
	if !ok {
		return 0, "", false
	}
	rest = strings.Trim(rest, "/")
	if rest == "" {
		return 0, "", false
	}
	parts := strings.Split(rest, "/")
	if len(parts) > 2 {
		return 0, "", false
	}
	rawID, err := strconv.ParseUint(parts[0], 10, 64)
	if err != nil || rawID == 0 {
		return 0, "", false
	}
	tail := ""
	if len(parts) == 2 {
		tail = parts[1]
	}
	return uint(rawID), tail, true
}

func parseOrgIdentityPath(path string) (uint, string, uint, bool) {
	rest, ok := strings.CutPrefix(path, "/v1/auth/orgs/")
	if !ok {
		return 0, "", 0, false
	}
	rest = strings.Trim(rest, "/")
	if rest == "" {
		return 0, "", 0, false
	}
	parts := strings.Split(rest, "/")
	if len(parts) != 1 && len(parts) != 2 && len(parts) != 3 {
		return 0, "", 0, false
	}
	rawID, err := strconv.ParseUint(parts[0], 10, 64)
	if err != nil || rawID == 0 {
		return 0, "", 0, false
	}
	tail := ""
	var tailID uint
	if len(parts) >= 2 {
		tail = parts[1]
	}
	if len(parts) == 3 {
		rawTailID, err := strconv.ParseUint(parts[2], 10, 64)
		if err != nil || rawTailID == 0 {
			return 0, "", 0, false
		}
		tailID = uint(rawTailID)
	}
	return uint(rawID), tail, tailID, true
}

func parseListUsersFilter(r *http.Request) (identityapp.ListUsersFilter, bool) {
	query := r.URL.Query()
	filter := identityapp.ListUsersFilter{
		Query:      query.Get("query"),
		SystemRole: query.Get("system_role"),
		Status:     query.Get("status"),
		Page:       1,
		PageSize:   50,
	}
	if raw := strings.TrimSpace(query.Get("user_id")); raw != "" {
		id, err := strconv.ParseUint(raw, 10, 64)
		if err != nil || id == 0 {
			return identityapp.ListUsersFilter{}, false
		}
		value := uint(id)
		filter.UserID = &value
	}
	if raw := strings.TrimSpace(query.Get("page")); raw != "" {
		page, err := strconv.Atoi(raw)
		if err != nil || page <= 0 {
			return identityapp.ListUsersFilter{}, false
		}
		filter.Page = page
	}
	if raw := strings.TrimSpace(query.Get("page_size")); raw != "" {
		pageSize, err := strconv.Atoi(raw)
		if err != nil || pageSize <= 0 {
			return identityapp.ListUsersFilter{}, false
		}
		filter.PageSize = pageSize
	}
	return filter, true
}

func parseListOrgsFilter(r *http.Request) (identityapp.ListOrgsFilter, bool) {
	query := r.URL.Query()
	filter := identityapp.ListOrgsFilter{
		Query:    query.Get("query"),
		Status:   query.Get("status"),
		Plan:     query.Get("plan"),
		Page:     1,
		PageSize: 50,
	}
	if raw := strings.TrimSpace(query.Get("org_id")); raw != "" {
		id, err := strconv.ParseUint(raw, 10, 64)
		if err != nil || id == 0 {
			return identityapp.ListOrgsFilter{}, false
		}
		value := uint(id)
		filter.OrgID = &value
	}
	if raw := strings.TrimSpace(query.Get("user_id")); raw != "" {
		id, err := strconv.ParseUint(raw, 10, 64)
		if err != nil || id == 0 {
			return identityapp.ListOrgsFilter{}, false
		}
		value := uint(id)
		filter.UserID = &value
	}
	if raw := strings.TrimSpace(query.Get("is_personal")); raw != "" {
		switch raw {
		case "true", "1":
			value := true
			filter.IsPersonal = &value
		case "false", "0":
			value := false
			filter.IsPersonal = &value
		default:
			return identityapp.ListOrgsFilter{}, false
		}
	}
	if raw := strings.TrimSpace(query.Get("page")); raw != "" {
		page, err := strconv.Atoi(raw)
		if err != nil || page <= 0 {
			return identityapp.ListOrgsFilter{}, false
		}
		filter.Page = page
	}
	if raw := strings.TrimSpace(query.Get("page_size")); raw != "" {
		pageSize, err := strconv.Atoi(raw)
		if err != nil || pageSize <= 0 {
			return identityapp.ListOrgsFilter{}, false
		}
		filter.PageSize = pageSize
	}
	return filter, true
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, code string) {
	writeJSON(w, status, map[string]string{"error": code})
}

func writeServiceError(w http.ResponseWriter, err error, fallback string) {
	switch {
	case errors.Is(err, identityapp.ErrUserNotFound):
		writeError(w, http.StatusNotFound, "user_not_found")
	case errors.Is(err, identityapp.ErrUserConflict):
		writeError(w, http.StatusConflict, "user_conflict")
	case errors.Is(err, identityapp.ErrInvalidUsername):
		writeError(w, http.StatusBadRequest, "invalid_username")
	case errors.Is(err, identityapp.ErrInvalidEmail):
		writeError(w, http.StatusBadRequest, "invalid_email")
	case errors.Is(err, identityapp.ErrInvalidSystemRole):
		writeError(w, http.StatusBadRequest, "invalid_system_role")
	case errors.Is(err, identityapp.ErrInvalidStatus):
		writeError(w, http.StatusBadRequest, "invalid_user_status")
	case errors.Is(err, identityapp.ErrNoFieldsToUpdate):
		writeError(w, http.StatusBadRequest, "no_fields_to_update")
	case errors.Is(err, identityapp.ErrInvalidPasswordHash):
		writeError(w, http.StatusBadRequest, "invalid_password_hash")
	case errors.Is(err, identityapp.ErrLastSuperAdmin):
		writeError(w, http.StatusConflict, "last_super_admin")
	case errors.Is(err, identityapp.ErrIdentityMutationUnavailable):
		writeError(w, http.StatusServiceUnavailable, "identity_mutation_unavailable")
	case errors.Is(err, identityapp.ErrOrgNotFound):
		writeError(w, http.StatusNotFound, "org_not_found")
	case errors.Is(err, identityapp.ErrOrgConflict):
		writeError(w, http.StatusConflict, "org_conflict")
	case errors.Is(err, identityapp.ErrInvalidOrgName):
		writeError(w, http.StatusBadRequest, "invalid_org_name")
	case errors.Is(err, identityapp.ErrInvalidOrgSlug):
		writeError(w, http.StatusBadRequest, "invalid_org_slug")
	case errors.Is(err, identityapp.ErrInvalidOrgPlan):
		writeError(w, http.StatusBadRequest, "invalid_org_plan")
	case errors.Is(err, identityapp.ErrInvalidOrgStatus):
		writeError(w, http.StatusBadRequest, "invalid_org_status")
	case errors.Is(err, identityapp.ErrInvalidOrgRole):
		writeError(w, http.StatusBadRequest, "invalid_org_role")
	case errors.Is(err, identityapp.ErrOrgMemberNotFound):
		writeError(w, http.StatusNotFound, "org_member_not_found")
	case errors.Is(err, identityapp.ErrOrgMemberConflict):
		writeError(w, http.StatusConflict, "org_member_conflict")
	case errors.Is(err, identityapp.ErrLastOrgOwner):
		writeError(w, http.StatusConflict, "last_org_owner")
	case errors.Is(err, introspection.ErrInvalidKeyRequest):
		writeError(w, http.StatusBadRequest, "invalid_key_request")
	case errors.Is(err, introspection.ErrKeyManagementUnavailable):
		writeError(w, http.StatusServiceUnavailable, "key_management_unavailable")
	default:
		writeError(w, http.StatusInternalServerError, fallback)
	}
}
