package newapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	cryptohelper "github.com/movscript/movscript/internal/infra/crypto"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
)

func TestIdentityServiceCachesRelayTokensPerUserAndGroup(t *testing.T) {
	tokenKeys := map[string]string{
		"movscript-forward-42-standard":      "standard-key",
		"movscript-forward-42-premium-video": "premium-key",
	}
	tokenIDs := map[string]int{
		"movscript-forward-42-standard":      7,
		"movscript-forward-42-premium-video": 8,
	}
	tokenCreated := map[string]bool{}
	searches := map[string]int{}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/user/search":
			_, _ = w.Write([]byte(`{"success":true,"data":{"items":[{"id":9,"username":"movscript-42"}]}}`))
		case r.Method == http.MethodPost && r.URL.Path == "/api/user/login":
			_, _ = w.Write([]byte(`{"success":true,"data":{}}`))
		case r.Method == http.MethodGet && r.URL.Path == "/api/token/search":
			keyword := r.URL.Query().Get("keyword")
			searches[keyword]++
			id, ok := tokenIDs[keyword]
			if !ok {
				t.Fatalf("unexpected token search keyword %q", keyword)
			}
			if !tokenCreated[keyword] {
				_, _ = w.Write([]byte(`{"success":true,"data":{"items":[]}}`))
				return
			}
			_, _ = w.Write([]byte(`{"success":true,"data":{"items":[{"id":` + strconv.Itoa(id) + `,"name":"` + keyword + `"}]}}`))
		case r.Method == http.MethodPost && r.URL.Path == "/api/token/":
			var created struct {
				Name  string `json:"name"`
				Group string `json:"group"`
			}
			if err := json.NewDecoder(r.Body).Decode(&created); err != nil {
				t.Fatalf("decode token create payload: %v", err)
			}
			if created.Group == "" || created.Name == "" {
				t.Fatalf("token create payload missing group/name: %+v", created)
			}
			tokenCreated[created.Name] = true
			_, _ = w.Write([]byte(`{"success":true,"data":{}}`))
		case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/api/token/") && strings.HasSuffix(r.URL.Path, "/key"):
			id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/token/"), "/key")
			for name, tokenID := range tokenIDs {
				if id == strconv.Itoa(tokenID) {
					_, _ = w.Write([]byte(`{"success":true,"data":{"key":"` + tokenKeys[name] + `"}}`))
					return
				}
			}
			t.Fatalf("unexpected token key path %s", r.URL.Path)
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.String())
		}
	}))
	defer server.Close()

	key := []byte(strings.Repeat("1", 32))
	db := testutil.OpenSQLite(t, "newapi-identity-groups.db", &persistencemodel.NewAPIIdentity{})
	cfg := Config{
		BaseURL:        server.URL,
		AdminToken:     "admin-token",
		AdminUserID:    1,
		UserPrefix:     "movscript-",
		UserPassword:   "password",
		TokenQuota:     100,
		TokenGroup:     "auto",
		HTTPTimeoutSec: 3,
	}
	service := NewIdentityService(db, key, cfg, NewClient(cfg, server.Client()))

	standard, err := service.RelayTokenForUserGroup(context.Background(), 42, "standard")
	if err != nil {
		t.Fatalf("RelayTokenForUserGroup(standard) error = %v", err)
	}
	premium, err := service.RelayTokenForUserGroup(context.Background(), 42, "premium/video")
	if err != nil {
		t.Fatalf("RelayTokenForUserGroup(premium) error = %v", err)
	}
	standardAgain, err := service.RelayTokenForUserGroup(context.Background(), 42, "standard")
	if err != nil {
		t.Fatalf("RelayTokenForUserGroup(standard cached) error = %v", err)
	}
	if standard != "sk-standard-key" || standardAgain != standard || premium != "sk-premium-key" {
		t.Fatalf("relay tokens standard=%q standardAgain=%q premium=%q", standard, standardAgain, premium)
	}
	if searches["movscript-forward-42-standard"] != 2 || searches["movscript-forward-42-premium-video"] != 2 {
		t.Fatalf("token searches = %+v, want each group searched only during first provisioning", searches)
	}

	var rows []persistencemodel.NewAPIIdentity
	if err := db.Order("new_api_group").Find(&rows).Error; err != nil {
		t.Fatalf("list identities: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("identity rows = %d, want one row per group: %+v", len(rows), rows)
	}
	seen := map[string]string{}
	for _, row := range rows {
		plain, err := cryptohelper.Decrypt(row.EncryptedRelayKey, key)
		if err != nil {
			t.Fatalf("decrypt relay key for %q: %v", row.NewAPIGroup, err)
		}
		seen[row.NewAPIGroup] = plain
	}
	if seen["standard"] != "standard-key" || seen["premium/video"] != "premium-key" {
		t.Fatalf("identity relay keys by group = %+v", seen)
	}
}
