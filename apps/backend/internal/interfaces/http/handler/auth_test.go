package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	adminsettings "github.com/movscript/movscript/internal/app/admin/settings"
	"github.com/movscript/movscript/internal/infra/auth"
	"github.com/movscript/movscript/internal/infra/mail"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
)

type recordingMailSender struct {
	last mail.Message
	err  error
}

func (s *recordingMailSender) Send(_ context.Context, _ mail.SMTPConfig, msg mail.Message) error {
	s.last = msg
	return s.err
}

var mailCodePattern = regexp.MustCompile(`\b\d{6}\b`)

func TestAuthConfigReflectsAdminRegistrationSettings(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-auth-config.db", &persistencemodel.AdminSetting{}, &persistencemodel.User{})
	if _, err := adminsettings.NewService(db).UpdateAuthSettings(context.Background(), adminsettings.AuthSettings{
		RegistrationEnabled:      true,
		RequireEmailVerification: true,
		Email: adminsettings.SMTPMailSettings{
			Enabled:     true,
			Host:        "smtp.example.com",
			Port:        587,
			FromEmail:   "noreply@example.com",
			UseStartTLS: true,
		},
	}); err != nil {
		t.Fatalf("update auth settings: %v", err)
	}
	tokens, err := auth.NewManager("0123456789abcdef0123456789abcdef", 3600)
	if err != nil {
		t.Fatal(err)
	}
	handler := NewAuthHandler(db, tokens)
	router := gin.New()
	router.GET("/auth/config", handler.Config)

	res := httptest.NewRecorder()
	router.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/auth/config", nil))
	if res.Code != http.StatusOK {
		t.Fatalf("expected auth config, got %d: %s", res.Code, res.Body.String())
	}
	var body struct {
		RegistrationEnabled      bool `json:"registration_enabled"`
		RequireEmailVerification bool `json:"require_email_verification"`
		EmailVerificationEnabled bool `json:"email_verification_enabled"`
		BootstrapRequired        bool `json:"bootstrap_required"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode config: %v", err)
	}
	if !body.RegistrationEnabled || !body.RequireEmailVerification || !body.EmailVerificationEnabled {
		t.Fatalf("unexpected config body: %+v", body)
	}
	if !body.BootstrapRequired {
		t.Fatalf("expected bootstrap_required on empty user table: %+v", body)
	}
}

func TestAuthRegisterRequiresEnabledRegistrationAndEmailChallenge(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-auth-register-settings.db", &persistencemodel.User{}, &persistencemodel.Organization{}, &persistencemodel.OrganizationMember{}, &persistencemodel.AdminSetting{}, &persistencemodel.AuthChallenge{}, &persistencemodel.AuthSession{}, &persistencemodel.AuditLog{})
	if err := db.Create(&persistencemodel.User{Username: "existing", PasswordHash: "hash", SystemRole: "user", Status: "active"}).Error; err != nil {
		t.Fatalf("seed existing user: %v", err)
	}
	tokens, err := auth.NewManager("0123456789abcdef0123456789abcdef", 3600)
	if err != nil {
		t.Fatal(err)
	}
	handler := NewAuthHandler(db, tokens)
	mailer := &recordingMailSender{}
	handler.mailSender = mailer
	router := gin.New()
	router.POST("/auth/code/start", handler.StartCode)
	router.POST("/auth/register", handler.Register)

	closedRes := httptest.NewRecorder()
	router.ServeHTTP(closedRes, httptest.NewRequest(http.MethodPost, "/auth/register", strings.NewReader(`{"username":"alice","password":"secret123"}`)))
	if closedRes.Code != http.StatusForbidden {
		t.Fatalf("expected closed registration rejected, got %d: %s", closedRes.Code, closedRes.Body.String())
	}

	if _, err := adminsettings.NewService(db).UpdateAuthSettings(context.Background(), adminsettings.AuthSettings{
		RegistrationEnabled:      true,
		RequireEmailVerification: true,
		Email: adminsettings.SMTPMailSettings{
			Enabled:     true,
			Host:        "smtp.example.com",
			Port:        587,
			FromEmail:   "noreply@example.com",
			UseStartTLS: true,
		},
	}); err != nil {
		t.Fatalf("update auth settings: %v", err)
	}

	noCodeRes := httptest.NewRecorder()
	router.ServeHTTP(noCodeRes, httptest.NewRequest(http.MethodPost, "/auth/register", strings.NewReader(`{"username":"alice","password":"secret123"}`)))
	if noCodeRes.Code != http.StatusBadRequest {
		t.Fatalf("expected missing challenge rejected, got %d: %s", noCodeRes.Code, noCodeRes.Body.String())
	}

	startRes := httptest.NewRecorder()
	startReq := httptest.NewRequest(http.MethodPost, "/auth/code/start", strings.NewReader(`{"target":"alice@example.com","purpose":"register"}`))
	startReq.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(startRes, startReq)
	if startRes.Code != http.StatusOK {
		t.Fatalf("expected code start, got %d: %s", startRes.Code, startRes.Body.String())
	}
	if !strings.Contains(mailer.last.Text, "Movscript verification code") {
		t.Fatalf("mail body did not include verification copy: %q", mailer.last.Text)
	}
}

func TestAuthRegisterAllowsFirstUserWhenRegistrationClosed(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-auth-register-bootstrap.db", &persistencemodel.User{}, &persistencemodel.Organization{}, &persistencemodel.OrganizationMember{}, &persistencemodel.AdminSetting{}, &persistencemodel.AuthSession{}, &persistencemodel.AuditLog{})
	tokens, err := auth.NewManager("0123456789abcdef0123456789abcdef", 3600)
	if err != nil {
		t.Fatal(err)
	}
	handler := NewAuthHandler(db, tokens)
	router := gin.New()
	router.POST("/auth/register", handler.Register)

	firstRes := httptest.NewRecorder()
	firstReq := httptest.NewRequest(http.MethodPost, "/auth/register", strings.NewReader(`{"username":"admin","password":"secret123"}`))
	firstReq.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(firstRes, firstReq)
	if firstRes.Code != http.StatusCreated {
		t.Fatalf("expected first closed-registration user accepted, got %d: %s", firstRes.Code, firstRes.Body.String())
	}
	var firstBody authResponse
	if err := json.Unmarshal(firstRes.Body.Bytes(), &firstBody); err != nil {
		t.Fatalf("decode first response: %v", err)
	}
	if firstBody.User.SystemRole != "super_admin" {
		t.Fatalf("first user role = %q, want super_admin", firstBody.User.SystemRole)
	}

	secondRes := httptest.NewRecorder()
	secondReq := httptest.NewRequest(http.MethodPost, "/auth/register", strings.NewReader(`{"username":"member","password":"secret123"}`))
	secondReq.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(secondRes, secondReq)
	if secondRes.Code != http.StatusForbidden {
		t.Fatalf("expected second closed-registration user rejected, got %d: %s", secondRes.Code, secondRes.Body.String())
	}
}

func TestAuthRegisterWithEmailChallengeCreatesVerifiedUser(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-auth-register-email.db", &persistencemodel.User{}, &persistencemodel.Organization{}, &persistencemodel.OrganizationMember{}, &persistencemodel.AdminSetting{}, &persistencemodel.AuthChallenge{}, &persistencemodel.AuthSession{}, &persistencemodel.AuditLog{})
	if _, err := adminsettings.NewService(db).UpdateAuthSettings(context.Background(), adminsettings.AuthSettings{
		RegistrationEnabled:      true,
		RequireEmailVerification: true,
		Email: adminsettings.SMTPMailSettings{
			Enabled:     true,
			Host:        "smtp.example.com",
			Port:        587,
			FromEmail:   "noreply@example.com",
			UseStartTLS: true,
		},
	}); err != nil {
		t.Fatalf("update auth settings: %v", err)
	}
	tokens, err := auth.NewManager("0123456789abcdef0123456789abcdef", 3600)
	if err != nil {
		t.Fatal(err)
	}
	handler := NewAuthHandler(db, tokens)
	mailer := &recordingMailSender{}
	handler.mailSender = mailer
	router := gin.New()
	router.POST("/auth/code/start", handler.StartCode)
	router.POST("/auth/register", handler.Register)

	startRes := httptest.NewRecorder()
	startReq := httptest.NewRequest(http.MethodPost, "/auth/code/start", strings.NewReader(`{"target":"Alice@Example.com","purpose":"register"}`))
	startReq.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(startRes, startReq)
	if startRes.Code != http.StatusOK {
		t.Fatalf("expected code start, got %d: %s", startRes.Code, startRes.Body.String())
	}
	var startBody struct {
		ChallengeID string `json:"challengeId"`
	}
	if err := json.Unmarshal(startRes.Body.Bytes(), &startBody); err != nil {
		t.Fatalf("decode start response: %v", err)
	}
	code := mailCodePattern.FindString(mailer.last.Text)
	if code == "" {
		t.Fatalf("mail body did not include 6 digit code: %q", mailer.last.Text)
	}

	registerRes := httptest.NewRecorder()
	registerReq := httptest.NewRequest(http.MethodPost, "/auth/register", strings.NewReader(`{"username":"alice","password":"secret123","challengeId":"`+startBody.ChallengeID+`","code":"`+code+`"}`))
	registerReq.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(registerRes, registerReq)
	if registerRes.Code != http.StatusCreated {
		t.Fatalf("expected verified register, got %d: %s", registerRes.Code, registerRes.Body.String())
	}
	var body authResponse
	if err := json.Unmarshal(registerRes.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode register response: %v", err)
	}
	if body.User.PrimaryEmail != "alice@example.com" || body.User.EmailVerifiedAt == nil {
		t.Fatalf("registered user was not email verified: %+v", body.User)
	}
}

func TestAuthRegisterStartCodeBlockedWhenRegistrationClosed(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-auth-code-closed.db", &persistencemodel.AdminSetting{}, &persistencemodel.AuthChallenge{})
	tokens, err := auth.NewManager("0123456789abcdef0123456789abcdef", 3600)
	if err != nil {
		t.Fatal(err)
	}
	handler := NewAuthHandler(db, tokens)
	router := gin.New()
	router.POST("/auth/code/start", handler.StartCode)

	res := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/auth/code/start", strings.NewReader(`{"target":"alice@example.com","purpose":"register"}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("expected register code blocked, got %d: %s", res.Code, res.Body.String())
	}
}
