package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	domainauth "github.com/movscript/movscript/internal/domain/auth"
	domainorg "github.com/movscript/movscript/internal/domain/org"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/interfaces/http/middleware"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestProjectAdminForceSetOwnerWritesAuditWithPreviousOwner(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db := newTestProjectAdminRouter(t)

	owner := persistencemodel.User{Username: "old-owner", Status: "active"}
	newOwner := persistencemodel.User{Username: "new-owner", Status: "active"}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatalf("create owner: %v", err)
	}
	if err := db.Create(&newOwner).Error; err != nil {
		t.Fatalf("create new owner: %v", err)
	}
	org := persistencemodel.Organization{Name: "Owner Org", Slug: "owner-org", Plan: "team", Status: "active", CreatedBy: owner.ID}
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}
	project := persistencemodel.Project{Name: "Project", OwnerID: owner.ID, OrgID: &org.ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	if err := db.Create(&persistencemodel.ProjectMember{ProjectID: project.ID, UserID: owner.ID, Role: "owner"}).Error; err != nil {
		t.Fatalf("create owner member: %v", err)
	}

	req := httptest.NewRequest(
		http.MethodPut,
		"/admin/projects/"+strconv.FormatUint(uint64(project.ID), 10)+"/owner",
		strings.NewReader(`{"owner_id":`+strconv.FormatUint(uint64(newOwner.ID), 10)+`}`),
	)
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected owner update to succeed, got %d: %s", res.Code, res.Body.String())
	}
	if countAuditAction(t, db, "project.owner_changed") != 1 {
		t.Fatalf("expected owner change audit log")
	}
	var auditRow persistencemodel.AuditLog
	if err := db.Where("action = ?", "project.owner_changed").First(&auditRow).Error; err != nil {
		t.Fatalf("load audit log: %v", err)
	}
	if !strings.Contains(auditRow.Metadata, `"previous_owner_id":`+strconv.FormatUint(uint64(owner.ID), 10)) {
		t.Fatalf("expected previous owner in metadata, got %s", auditRow.Metadata)
	}
	if !strings.Contains(auditRow.Metadata, `"owner_id":`+strconv.FormatUint(uint64(newOwner.ID), 10)) {
		t.Fatalf("expected new owner in metadata, got %s", auditRow.Metadata)
	}
	if auditRow.OrgID == nil || *auditRow.OrgID != org.ID {
		t.Fatalf("expected owner change audit org_id %d, got %+v", org.ID, auditRow.OrgID)
	}
	var updated persistencemodel.Project
	if err := db.First(&updated, project.ID).Error; err != nil {
		t.Fatalf("load updated project: %v", err)
	}
	if updated.OwnerID != newOwner.ID {
		t.Fatalf("expected project owner %d, got %d", newOwner.ID, updated.OwnerID)
	}

	disabledOwner := persistencemodel.User{Username: "disabled-owner", Status: "disabled"}
	if err := db.Create(&disabledOwner).Error; err != nil {
		t.Fatalf("create disabled owner: %v", err)
	}
	disabledReq := httptest.NewRequest(
		http.MethodPut,
		"/admin/projects/"+strconv.FormatUint(uint64(project.ID), 10)+"/owner",
		strings.NewReader(`{"owner_id":`+strconv.FormatUint(uint64(disabledOwner.ID), 10)+`}`),
	)
	disabledReq.Header.Set("Content-Type", "application/json")
	disabledRes := httptest.NewRecorder()
	router.ServeHTTP(disabledRes, disabledReq)
	if disabledRes.Code != http.StatusBadRequest {
		t.Fatalf("expected disabled owner rejected, got %d: %s", disabledRes.Code, disabledRes.Body.String())
	}
	if countAuditAction(t, db, "project.owner_changed") != 1 {
		t.Fatalf("disabled owner update should not add audit log")
	}
}

func TestProjectAdminCreateWritesAudit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db := newTestProjectAdminRouter(t)

	owner := persistencemodel.User{Username: "admin-create-owner", Status: "active"}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatalf("create owner: %v", err)
	}
	org := persistencemodel.Organization{Name: "Admin Create Org", Slug: "admin-create-org", Plan: "team", Status: "active", CreatedBy: owner.ID}
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}

	req := httptest.NewRequest(
		http.MethodPost,
		"/admin/projects",
		strings.NewReader(`{"name":"Admin Project","owner_id":`+strconv.FormatUint(uint64(owner.ID), 10)+`,"org_id":`+strconv.FormatUint(uint64(org.ID), 10)+`,"status":"planning"}`),
	)
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusCreated {
		t.Fatalf("expected project create to succeed, got %d: %s", res.Code, res.Body.String())
	}
	if countAuditAction(t, db, "project.admin_created") != 1 {
		t.Fatalf("expected project create audit log")
	}
	var created persistencemodel.Project
	if err := db.Where("name = ?", "Admin Project").First(&created).Error; err != nil {
		t.Fatalf("load created project: %v", err)
	}
	if created.OwnerID != owner.ID || created.Status != "planning" {
		t.Fatalf("unexpected created project: %+v", created)
	}
	if created.OrgID == nil || *created.OrgID != org.ID {
		t.Fatalf("expected created project org_id %d, got %+v", org.ID, created.OrgID)
	}
	var auditRow persistencemodel.AuditLog
	if err := db.Where("action = ?", "project.admin_created").First(&auditRow).Error; err != nil {
		t.Fatalf("load project create audit: %v", err)
	}
	if auditRow.OrgID == nil || *auditRow.OrgID != org.ID {
		t.Fatalf("expected project create audit org_id %d, got %+v", org.ID, auditRow.OrgID)
	}
	var ownerMember persistencemodel.ProjectMember
	if err := db.Where("project_id = ? AND user_id = ?", created.ID, owner.ID).First(&ownerMember).Error; err != nil {
		t.Fatalf("expected owner member: %v", err)
	}
	if ownerMember.Role != "owner" {
		t.Fatalf("owner member role = %q, want owner", ownerMember.Role)
	}

	invalidReq := httptest.NewRequest(http.MethodPost, "/admin/projects", strings.NewReader(`{"name":"Bad","owner_id":999}`))
	invalidReq.Header.Set("Content-Type", "application/json")
	invalidRes := httptest.NewRecorder()
	router.ServeHTTP(invalidRes, invalidReq)
	if invalidRes.Code != http.StatusBadRequest {
		t.Fatalf("expected missing owner rejected, got %d: %s", invalidRes.Code, invalidRes.Body.String())
	}
	if countAuditAction(t, db, "project.admin_created") != 1 {
		t.Fatalf("invalid create should not add audit log")
	}

	disabledOwner := persistencemodel.User{Username: "admin-create-disabled-owner", Status: "disabled"}
	if err := db.Create(&disabledOwner).Error; err != nil {
		t.Fatalf("create disabled owner: %v", err)
	}
	disabledReq := httptest.NewRequest(
		http.MethodPost,
		"/admin/projects",
		strings.NewReader(`{"name":"Disabled Owner","owner_id":`+strconv.FormatUint(uint64(disabledOwner.ID), 10)+`}`),
	)
	disabledReq.Header.Set("Content-Type", "application/json")
	disabledRes := httptest.NewRecorder()
	router.ServeHTTP(disabledRes, disabledReq)
	if disabledRes.Code != http.StatusBadRequest {
		t.Fatalf("expected disabled owner create rejected, got %d: %s", disabledRes.Code, disabledRes.Body.String())
	}
	if countAuditAction(t, db, "project.admin_created") != 1 {
		t.Fatalf("disabled owner create should not add audit log")
	}

	suspendedOrg := persistencemodel.Organization{Name: "Suspended", Slug: "admin-create-suspended", Plan: "team", Status: "suspended", CreatedBy: owner.ID}
	if err := db.Create(&suspendedOrg).Error; err != nil {
		t.Fatalf("create suspended org: %v", err)
	}
	suspendedReq := httptest.NewRequest(
		http.MethodPost,
		"/admin/projects",
		strings.NewReader(`{"name":"Suspended Org","owner_id":`+strconv.FormatUint(uint64(owner.ID), 10)+`,"org_id":`+strconv.FormatUint(uint64(suspendedOrg.ID), 10)+`}`),
	)
	suspendedReq.Header.Set("Content-Type", "application/json")
	suspendedRes := httptest.NewRecorder()
	router.ServeHTTP(suspendedRes, suspendedReq)
	if suspendedRes.Code != http.StatusBadRequest {
		t.Fatalf("expected suspended org create rejected, got %d: %s", suspendedRes.Code, suspendedRes.Body.String())
	}
	if countAuditAction(t, db, "project.admin_created") != 1 {
		t.Fatalf("suspended org create should not add audit log")
	}
}

func TestProjectAdminListFiltersByProjectID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db := newTestProjectAdminRouter(t)

	owner := persistencemodel.User{Username: "admin-list-owner", Status: "active"}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatalf("create owner: %v", err)
	}
	target := persistencemodel.Project{Name: "Target Project", OwnerID: owner.ID, Status: "planning"}
	other := persistencemodel.Project{Name: "Other Project", OwnerID: owner.ID, Status: "planning"}
	if err := db.Create(&target).Error; err != nil {
		t.Fatalf("create target project: %v", err)
	}
	if err := db.Create(&other).Error; err != nil {
		t.Fatalf("create other project: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/admin/projects?project_id="+strconv.FormatUint(uint64(target.ID), 10), nil)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected project list to succeed, got %d: %s", res.Code, res.Body.String())
	}
	var body []persistencemodel.Project
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode project list: %v", err)
	}
	if len(body) != 1 || body[0].ID != target.ID {
		t.Fatalf("expected only project %d, got %+v", target.ID, body)
	}
	if res.Header().Get("X-Total-Count") != "1" {
		t.Fatalf("expected X-Total-Count 1, got %q", res.Header().Get("X-Total-Count"))
	}
}

func TestProjectAdminUpdateWritesAuditAndValidatesStatus(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db := newTestProjectAdminRouter(t)

	owner := persistencemodel.User{Username: "admin-update-owner", Status: "active"}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatalf("create owner: %v", err)
	}
	org := persistencemodel.Organization{Name: "Update Org", Slug: "update-org", Plan: "team", Status: "active", CreatedBy: owner.ID}
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}
	project := persistencemodel.Project{Name: "Draft", OwnerID: owner.ID, OrgID: &org.ID, Status: "planning"}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}

	req := httptest.NewRequest(
		http.MethodPatch,
		"/admin/projects/"+strconv.FormatUint(uint64(project.ID), 10),
		strings.NewReader(`{"name":"Final","status":"editing"}`),
	)
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected project update to succeed, got %d: %s", res.Code, res.Body.String())
	}
	if countAuditAction(t, db, "project.admin_updated") != 1 {
		t.Fatalf("expected project update audit log")
	}
	var updated persistencemodel.Project
	if err := db.First(&updated, project.ID).Error; err != nil {
		t.Fatalf("load updated project: %v", err)
	}
	if updated.Name != "Final" || updated.Status != "editing" {
		t.Fatalf("unexpected updated project: %+v", updated)
	}
	assertProjectAuditOrgID(t, db, "project.admin_updated", org.ID)

	invalidReq := httptest.NewRequest(
		http.MethodPatch,
		"/admin/projects/"+strconv.FormatUint(uint64(project.ID), 10),
		strings.NewReader(`{"status":"archived"}`),
	)
	invalidReq.Header.Set("Content-Type", "application/json")
	invalidRes := httptest.NewRecorder()
	router.ServeHTTP(invalidRes, invalidReq)

	if invalidRes.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid status rejected, got %d: %s", invalidRes.Code, invalidRes.Body.String())
	}
	if countAuditAction(t, db, "project.admin_updated") != 1 {
		t.Fatalf("invalid update should not add audit log")
	}
}

func TestProjectAdminDetailReturnsOperationalSummary(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db := newTestProjectAdminRouter(t)

	owner := persistencemodel.User{Username: "detail-owner", Status: "active"}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatalf("create owner: %v", err)
	}
	project := persistencemodel.Project{Name: "Detail Project", OwnerID: owner.ID, Status: "planning"}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	if err := db.Create(&persistencemodel.ProjectMember{ProjectID: project.ID, UserID: owner.ID, Role: "owner"}).Error; err != nil {
		t.Fatalf("create owner member: %v", err)
	}
	if err := db.Create(&persistencemodel.Script{ProjectID: project.ID, Title: "Script", AuthorID: owner.ID}).Error; err != nil {
		t.Fatalf("create script: %v", err)
	}
	if err := db.Create(&persistencemodel.ContentUnit{ProjectID: project.ID, Kind: "shot", Title: "Shot"}).Error; err != nil {
		t.Fatalf("create content unit: %v", err)
	}
	if err := db.Create(&persistencemodel.AssetSlot{ProjectID: project.ID, Kind: "image", Name: "Hero"}).Error; err != nil {
		t.Fatalf("create asset slot: %v", err)
	}
	resource := persistencemodel.RawResource{Name: "Asset", OwnerID: owner.ID, Type: "image", FilePath: "asset.png"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	if err := db.Create(&persistencemodel.ResourceBinding{ProjectID: project.ID, ResourceID: resource.ID, OwnerType: "asset_slot", OwnerID: 1, Role: "reference"}).Error; err != nil {
		t.Fatalf("create resource binding: %v", err)
	}
	if err := db.Create(&persistencemodel.UsageLog{UserID: owner.ID, ProjectID: &project.ID, AIModelConfigID: 1, OperationType: "image", InputTokens: 5, OutputTokens: 7, ImageCount: 2, Cost: 3.5}).Error; err != nil {
		t.Fatalf("create usage: %v", err)
	}
	if err := db.Create(&persistencemodel.AuditLog{ProjectID: &project.ID, Action: "project.admin_updated", TargetType: "project", TargetID: strconv.FormatUint(uint64(project.ID), 10)}).Error; err != nil {
		t.Fatalf("create audit: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/admin/projects/"+strconv.FormatUint(uint64(project.ID), 10)+"/detail", nil)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected project detail, got %d: %s", res.Code, res.Body.String())
	}
	var body struct {
		Project struct {
			ID uint `json:"ID"`
		} `json:"project"`
		MemberCount      int64 `json:"member_count"`
		ScriptCount      int64 `json:"script_count"`
		ContentUnitCount int64 `json:"content_unit_count"`
		AssetSlotCount   int64 `json:"asset_slot_count"`
		ResourceCount    int64 `json:"resource_count"`
		Usage            struct {
			Calls        int64   `json:"calls"`
			Cost         float64 `json:"cost"`
			InputTokens  int64   `json:"input_tokens"`
			OutputTokens int64   `json:"output_tokens"`
			Images       int64   `json:"images"`
		} `json:"usage"`
		Audit struct {
			Records    int64  `json:"records"`
			LastAction string `json:"last_action"`
		} `json:"audit"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode project detail: %v", err)
	}
	if body.Project.ID != project.ID || body.MemberCount != 1 || body.ScriptCount != 1 || body.ContentUnitCount != 1 || body.AssetSlotCount != 1 || body.ResourceCount != 1 {
		t.Fatalf("unexpected detail counts: %+v", body)
	}
	if body.Usage.Calls != 1 || body.Usage.Cost != 3.5 || body.Usage.InputTokens != 5 || body.Usage.OutputTokens != 7 || body.Usage.Images != 2 {
		t.Fatalf("unexpected usage summary: %+v", body.Usage)
	}
	if body.Audit.Records != 1 || body.Audit.LastAction != "project.admin_updated" {
		t.Fatalf("unexpected audit summary: %+v", body.Audit)
	}

	missingReq := httptest.NewRequest(http.MethodGet, "/admin/projects/999/detail", nil)
	missingRes := httptest.NewRecorder()
	router.ServeHTTP(missingRes, missingReq)
	if missingRes.Code != http.StatusNotFound {
		t.Fatalf("expected missing project rejected, got %d: %s", missingRes.Code, missingRes.Body.String())
	}
}

func TestProjectAdminDeleteWritesAuditAndRejectsMissing(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db := newTestProjectAdminRouter(t)

	owner := persistencemodel.User{Username: "delete-owner", Status: "active"}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatalf("create owner: %v", err)
	}
	project := persistencemodel.Project{Name: "Delete Me", OwnerID: owner.ID, Status: "planning"}
	org := persistencemodel.Organization{Name: "Delete Org", Slug: "delete-org", Plan: "team", Status: "active", CreatedBy: owner.ID}
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}
	project.OrgID = &org.ID
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}

	req := httptest.NewRequest(http.MethodDelete, "/admin/projects/"+strconv.FormatUint(uint64(project.ID), 10), nil)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusNoContent {
		t.Fatalf("expected project delete, got %d: %s", res.Code, res.Body.String())
	}
	if countAuditAction(t, db, "project.admin_deleted") != 1 {
		t.Fatalf("expected project delete audit log")
	}
	var auditRow persistencemodel.AuditLog
	if err := db.Where("action = ?", "project.admin_deleted").First(&auditRow).Error; err != nil {
		t.Fatalf("load project delete audit: %v", err)
	}
	if auditRow.OrgID == nil || *auditRow.OrgID != org.ID {
		t.Fatalf("expected project delete audit org_id %d, got %+v", org.ID, auditRow.OrgID)
	}

	missingReq := httptest.NewRequest(http.MethodDelete, "/admin/projects/"+strconv.FormatUint(uint64(project.ID), 10), nil)
	missingRes := httptest.NewRecorder()
	router.ServeHTTP(missingRes, missingReq)
	if missingRes.Code != http.StatusNotFound {
		t.Fatalf("expected missing project rejected, got %d: %s", missingRes.Code, missingRes.Body.String())
	}
	if countAuditAction(t, db, "project.admin_deleted") != 1 {
		t.Fatalf("missing project should not add delete audit log")
	}
}

func TestProjectAdminMemberActionsWriteAuditAndRejectFailures(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db := newTestProjectAdminRouter(t)

	owner := persistencemodel.User{Username: "member-owner", Status: "active"}
	memberUser := persistencemodel.User{Username: "project-member", Status: "active"}
	disabledUser := persistencemodel.User{Username: "disabled-project-member", Status: "disabled"}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatalf("create owner: %v", err)
	}
	if err := db.Create(&memberUser).Error; err != nil {
		t.Fatalf("create member user: %v", err)
	}
	if err := db.Create(&disabledUser).Error; err != nil {
		t.Fatalf("create disabled user: %v", err)
	}
	org := persistencemodel.Organization{Name: "Member Org", Slug: "member-org", Plan: "team", Status: "active", CreatedBy: owner.ID}
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}
	project := persistencemodel.Project{Name: "Member Project", OwnerID: owner.ID, OrgID: &org.ID, Status: "planning"}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	ownerMember := persistencemodel.ProjectMember{ProjectID: project.ID, UserID: owner.ID, Role: "owner"}
	if err := db.Create(&ownerMember).Error; err != nil {
		t.Fatalf("create owner member: %v", err)
	}

	addReq := httptest.NewRequest(
		http.MethodPost,
		"/admin/projects/"+strconv.FormatUint(uint64(project.ID), 10)+"/members",
		strings.NewReader(`{"user_id":`+strconv.FormatUint(uint64(memberUser.ID), 10)+`,"role":"writer"}`),
	)
	addReq.Header.Set("Content-Type", "application/json")
	addRes := httptest.NewRecorder()
	router.ServeHTTP(addRes, addReq)
	if addRes.Code != http.StatusCreated {
		t.Fatalf("expected member add, got %d: %s", addRes.Code, addRes.Body.String())
	}
	if countAuditAction(t, db, "project.member.admin_added") != 1 {
		t.Fatalf("expected add member audit log")
	}
	assertProjectAuditOrgID(t, db, "project.member.admin_added", org.ID)

	disabledReq := httptest.NewRequest(
		http.MethodPost,
		"/admin/projects/"+strconv.FormatUint(uint64(project.ID), 10)+"/members",
		strings.NewReader(`{"user_id":`+strconv.FormatUint(uint64(disabledUser.ID), 10)+`,"role":"viewer"}`),
	)
	disabledReq.Header.Set("Content-Type", "application/json")
	disabledRes := httptest.NewRecorder()
	router.ServeHTTP(disabledRes, disabledReq)
	if disabledRes.Code != http.StatusBadRequest {
		t.Fatalf("expected disabled member rejected, got %d: %s", disabledRes.Code, disabledRes.Body.String())
	}
	if countAuditAction(t, db, "project.member.admin_added") != 1 {
		t.Fatalf("disabled member should not add audit log")
	}

	var member persistencemodel.ProjectMember
	if err := db.Where("project_id = ? AND user_id = ?", project.ID, memberUser.ID).First(&member).Error; err != nil {
		t.Fatalf("load added member: %v", err)
	}
	updateReq := httptest.NewRequest(
		http.MethodPatch,
		"/admin/projects/"+strconv.FormatUint(uint64(project.ID), 10)+"/members/"+strconv.FormatUint(uint64(member.ID), 10),
		strings.NewReader(`{"role":"generator"}`),
	)
	updateReq.Header.Set("Content-Type", "application/json")
	updateRes := httptest.NewRecorder()
	router.ServeHTTP(updateRes, updateReq)
	if updateRes.Code != http.StatusOK {
		t.Fatalf("expected member update, got %d: %s", updateRes.Code, updateRes.Body.String())
	}
	if countAuditAction(t, db, "project.member.admin_updated") != 1 {
		t.Fatalf("expected update member audit log")
	}
	assertProjectAuditOrgID(t, db, "project.member.admin_updated", org.ID)

	invalidRoleReq := httptest.NewRequest(
		http.MethodPatch,
		"/admin/projects/"+strconv.FormatUint(uint64(project.ID), 10)+"/members/"+strconv.FormatUint(uint64(member.ID), 10),
		strings.NewReader(`{"role":"owner"}`),
	)
	invalidRoleReq.Header.Set("Content-Type", "application/json")
	invalidRoleRes := httptest.NewRecorder()
	router.ServeHTTP(invalidRoleRes, invalidRoleReq)
	if invalidRoleRes.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid role rejected, got %d: %s", invalidRoleRes.Code, invalidRoleRes.Body.String())
	}
	if countAuditAction(t, db, "project.member.admin_updated") != 1 {
		t.Fatalf("invalid member update should not add audit log")
	}

	ownerUpdateReq := httptest.NewRequest(
		http.MethodPatch,
		"/admin/projects/"+strconv.FormatUint(uint64(project.ID), 10)+"/members/"+strconv.FormatUint(uint64(ownerMember.ID), 10),
		strings.NewReader(`{"role":"viewer"}`),
	)
	ownerUpdateReq.Header.Set("Content-Type", "application/json")
	ownerUpdateRes := httptest.NewRecorder()
	router.ServeHTTP(ownerUpdateRes, ownerUpdateReq)
	if ownerUpdateRes.Code != http.StatusConflict {
		t.Fatalf("expected owner update rejected, got %d: %s", ownerUpdateRes.Code, ownerUpdateRes.Body.String())
	}
	if countAuditAction(t, db, "project.member.admin_updated") != 1 {
		t.Fatalf("owner member update should not add audit log")
	}

	removeReq := httptest.NewRequest(
		http.MethodDelete,
		"/admin/projects/"+strconv.FormatUint(uint64(project.ID), 10)+"/members/"+strconv.FormatUint(uint64(member.ID), 10),
		nil,
	)
	removeRes := httptest.NewRecorder()
	router.ServeHTTP(removeRes, removeReq)
	if removeRes.Code != http.StatusNoContent {
		t.Fatalf("expected member remove, got %d: %s", removeRes.Code, removeRes.Body.String())
	}
	if countAuditAction(t, db, "project.member.admin_removed") != 1 {
		t.Fatalf("expected remove member audit log")
	}
	assertProjectAuditOrgID(t, db, "project.member.admin_removed", org.ID)

	missingRemoveReq := httptest.NewRequest(
		http.MethodDelete,
		"/admin/projects/"+strconv.FormatUint(uint64(project.ID), 10)+"/members/"+strconv.FormatUint(uint64(member.ID), 10),
		nil,
	)
	missingRemoveRes := httptest.NewRecorder()
	router.ServeHTTP(missingRemoveRes, missingRemoveReq)
	if missingRemoveRes.Code != http.StatusNotFound {
		t.Fatalf("expected missing member rejected, got %d: %s", missingRemoveRes.Code, missingRemoveRes.Body.String())
	}
	if countAuditAction(t, db, "project.member.admin_removed") != 1 {
		t.Fatalf("missing member should not add remove audit log")
	}

	ownerRemoveReq := httptest.NewRequest(
		http.MethodDelete,
		"/admin/projects/"+strconv.FormatUint(uint64(project.ID), 10)+"/members/"+strconv.FormatUint(uint64(ownerMember.ID), 10),
		nil,
	)
	ownerRemoveRes := httptest.NewRecorder()
	router.ServeHTTP(ownerRemoveRes, ownerRemoveReq)
	if ownerRemoveRes.Code != http.StatusConflict {
		t.Fatalf("expected owner remove rejected, got %d: %s", ownerRemoveRes.Code, ownerRemoveRes.Body.String())
	}
	if countAuditAction(t, db, "project.member.admin_removed") != 1 {
		t.Fatalf("owner member remove should not add audit log")
	}
}

func TestProjectMemberActionsWriteOrgAudit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-project-member-actions.db",
		&persistencemodel.User{},
		&persistencemodel.Organization{},
		&persistencemodel.OrganizationMember{},
		&persistencemodel.Project{},
		&persistencemodel.ProjectMember{},
		&persistencemodel.AuditLog{},
	)

	owner := persistencemodel.User{Username: "workspace-owner", Status: "active"}
	memberUser := persistencemodel.User{Username: "workspace-member", Status: "active"}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatalf("create owner: %v", err)
	}
	if err := db.Create(&memberUser).Error; err != nil {
		t.Fatalf("create member user: %v", err)
	}
	org := persistencemodel.Organization{Name: "Workspace Org", Slug: "workspace-org", Plan: "team", Status: "active", CreatedBy: owner.ID}
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}
	orgMember := persistencemodel.OrganizationMember{OrgID: org.ID, UserID: owner.ID, Role: "owner"}
	if err := db.Create(&orgMember).Error; err != nil {
		t.Fatalf("create org member: %v", err)
	}
	project := persistencemodel.Project{Name: "Workspace Project", OwnerID: owner.ID, OrgID: &org.ID, Status: "planning"}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	if err := db.Create(&persistencemodel.ProjectMember{ProjectID: project.ID, UserID: owner.ID, Role: "owner"}).Error; err != nil {
		t.Fatalf("create project owner member: %v", err)
	}

	h := NewProjectHandler(db.Session(&gorm.Session{SkipHooks: true}))
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set(middleware.ContextUserKey, domainauth.UserProfile{
			ID:         owner.ID,
			Username:   owner.Username,
			SystemRole: domainauth.SystemRoleUser,
			Status:     domainauth.UserStatusActive,
		})
		c.Set(middleware.ContextOrgMemberKey, domainorg.OrganizationMember{
			ID:     orgMember.ID,
			OrgID:  org.ID,
			UserID: owner.ID,
			Role:   orgMember.Role,
		})
		c.Next()
	})
	router.POST("/projects/:id/members", h.AddMember)
	router.DELETE("/projects/:id/members/:memberId", h.RemoveMember)

	addReq := httptest.NewRequest(
		http.MethodPost,
		"/projects/"+strconv.FormatUint(uint64(project.ID), 10)+"/members",
		strings.NewReader(`{"user_id":`+strconv.FormatUint(uint64(memberUser.ID), 10)+`,"role":"writer"}`),
	)
	addReq.Header.Set("Content-Type", "application/json")
	addRes := httptest.NewRecorder()
	router.ServeHTTP(addRes, addReq)
	if addRes.Code != http.StatusCreated {
		t.Fatalf("expected member add, got %d: %s", addRes.Code, addRes.Body.String())
	}
	assertProjectAuditOrgID(t, db, "project.member_added", org.ID)

	var member persistencemodel.ProjectMember
	if err := db.Where("project_id = ? AND user_id = ?", project.ID, memberUser.ID).First(&member).Error; err != nil {
		t.Fatalf("load added member: %v", err)
	}
	removeReq := httptest.NewRequest(
		http.MethodDelete,
		"/projects/"+strconv.FormatUint(uint64(project.ID), 10)+"/members/"+strconv.FormatUint(uint64(member.ID), 10),
		nil,
	)
	removeRes := httptest.NewRecorder()
	router.ServeHTTP(removeRes, removeReq)
	if removeRes.Code != http.StatusNoContent {
		t.Fatalf("expected member remove, got %d: %s", removeRes.Code, removeRes.Body.String())
	}
	assertProjectAuditOrgID(t, db, "project.member_removed", org.ID)

	missingReq := httptest.NewRequest(
		http.MethodDelete,
		"/projects/"+strconv.FormatUint(uint64(project.ID), 10)+"/members/"+strconv.FormatUint(uint64(member.ID), 10),
		nil,
	)
	missingRes := httptest.NewRecorder()
	router.ServeHTTP(missingRes, missingReq)
	if missingRes.Code != http.StatusNotFound {
		t.Fatalf("expected missing member rejected, got %d: %s", missingRes.Code, missingRes.Body.String())
	}
	if countAuditAction(t, db, "project.member_removed") != 1 {
		t.Fatalf("missing member should not add remove audit log")
	}
}

func assertProjectAuditOrgID(t *testing.T, db *gorm.DB, action string, orgID uint) {
	t.Helper()
	var auditRow persistencemodel.AuditLog
	if err := db.Where("action = ?", action).First(&auditRow).Error; err != nil {
		t.Fatalf("load %s audit: %v", action, err)
	}
	if auditRow.OrgID == nil || *auditRow.OrgID != orgID {
		t.Fatalf("expected %s audit org_id %d, got %+v", action, orgID, auditRow.OrgID)
	}
}

func newTestProjectAdminRouter(t *testing.T) (*gin.Engine, *gorm.DB) {
	t.Helper()
	db := testutil.OpenSQLite(t, "handler-project-admin.db",
		&persistencemodel.User{},
		&persistencemodel.Organization{},
		&persistencemodel.Project{},
		&persistencemodel.ProjectMember{},
		&persistencemodel.Script{},
		&persistencemodel.ContentUnit{},
		&persistencemodel.AssetSlot{},
		&persistencemodel.RawResource{},
		&persistencemodel.ResourceBinding{},
		&persistencemodel.UsageLog{},
		&persistencemodel.AuditLog{},
	)
	h := NewProjectHandler(db.Session(&gorm.Session{SkipHooks: true}))

	router := gin.New()
	router.GET("/admin/projects", h.AdminList)
	router.POST("/admin/projects", h.AdminCreate)
	router.GET("/admin/projects/:id/detail", h.AdminDetail)
	router.PATCH("/admin/projects/:id", h.AdminUpdate)
	router.PUT("/admin/projects/:id/owner", h.AdminForceSetOwner)
	router.DELETE("/admin/projects/:id", h.AdminDelete)
	router.POST("/admin/projects/:id/members", h.AdminAddMember)
	router.PATCH("/admin/projects/:id/members/:memberId", h.AdminUpdateMember)
	router.DELETE("/admin/projects/:id/members/:memberId", h.AdminRemoveMember)
	return router, db
}
