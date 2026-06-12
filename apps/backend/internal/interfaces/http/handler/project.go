package handler

import (
	"errors"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	gitidentityapp "github.com/movscript/movscript/internal/app/gitidentity"
	projectapp "github.com/movscript/movscript/internal/app/project"
	projectrepoapp "github.com/movscript/movscript/internal/app/projectrepo"
	"github.com/movscript/movscript/internal/infra/cache"
	"github.com/movscript/movscript/internal/infra/config"
	"github.com/movscript/movscript/internal/interfaces/http/api"
	audit "github.com/movscript/movscript/internal/interfaces/http/audit"
	"github.com/movscript/movscript/internal/interfaces/http/middleware"
	"gorm.io/gorm"
)

type ProjectHandler struct {
	db                 *gorm.DB
	projects           *projectapp.Service
	repositories       *projectrepoapp.Service
	gitIdentities      *gitidentityapp.Service
	giteaBaseURL       string
	giteaToken         string
	giteaAdminUsername string
	giteaAdminPassword string
	gitHTTPRoot        string
	gitBinary          string
	httpClient         *http.Client
}

func NewProjectHandler(db *gorm.DB, cacheStore ...cache.Cache) *ProjectHandler {
	return NewProjectHandlerWithConfig(db, &config.Config{}, cacheStore...)
}

func NewProjectHandlerWithConfig(db *gorm.DB, cfg *config.Config, cacheStore ...cache.Cache) *ProjectHandler {
	return NewProjectHandlerWithConfigAndEncryption(db, cfg, nil, cacheStore...)
}

func NewProjectHandlerWithConfigAndEncryption(db *gorm.DB, cfg *config.Config, encryptionKey []byte, cacheStore ...cache.Cache) *ProjectHandler {
	if cfg == nil {
		cfg = &config.Config{}
	}
	workspaceStorageBackend := projectrepoapp.NormalizeProvider(cfg.WorkspaceStorageBackend)
	if workspaceStorageBackend == "" {
		workspaceStorageBackend = projectrepoapp.ProviderGitea
	}
	var repositoryAdapter projectrepoapp.GitRepositoryAdapter
	var giteaAdapter *projectrepoapp.GiteaAdapter
	if workspaceStorageBackend == projectrepoapp.ProviderGitea {
		giteaAdapter = projectrepoapp.NewGiteaAdapterWithAdminAuth(cfg.GiteaBaseURL, cfg.GiteaToken, cfg.GiteaAdminUsername, cfg.GiteaAdminPassword)
		repositoryAdapter = giteaAdapter
	} else if workspaceStorageBackend == projectrepoapp.ProviderGitHTTP {
		repositoryAdapter = projectrepoapp.NewLocalGitAdapter(cfg.GitHTTPRoot, cfg.GitBinary)
	}
	var gitIdentities *gitidentityapp.Service
	if giteaAdapter != nil && len(encryptionKey) > 0 {
		gitIdentities = gitidentityapp.NewService(db, giteaAdapter, gitidentityapp.Config{
			UserEmailDomain: cfg.GiteaUserEmailDomain,
			UserTokenName:   cfg.GiteaUserTokenName,
		}, encryptionKey)
	}
	repositoryConfig := projectrepoapp.Config{
		Provider:      workspaceStorageBackend,
		Repo:          cfg.GiteaRepo,
		RepoPrefix:    cfg.GiteaRepoPrefix,
		DefaultBranch: cfg.GiteaBranch,
		OrgPrefix:     cfg.GiteaOrgPrefix,
	}
	return &ProjectHandler{
		db:                 db,
		projects:           projectapp.NewService(db, cacheStore...),
		repositories:       projectrepoapp.NewService(db, repositoryConfig, repositoryAdapter),
		gitIdentities:      gitIdentities,
		giteaBaseURL:       configuredGiteaValue(giteaAdapter, cfg.GiteaBaseURL),
		giteaToken:         configuredGiteaValue(giteaAdapter, cfg.GiteaToken),
		giteaAdminUsername: configuredGiteaValue(giteaAdapter, cfg.GiteaAdminUsername),
		giteaAdminPassword: configuredGiteaValue(giteaAdapter, cfg.GiteaAdminPassword),
		gitHTTPRoot:        strings.TrimSpace(cfg.GitHTTPRoot),
		gitBinary:          strings.TrimSpace(cfg.GitBinary),
		httpClient: &http.Client{
			Timeout: 0,
		},
	}
}

func configuredGiteaValue(adapter *projectrepoapp.GiteaAdapter, value string) string {
	if adapter == nil {
		return ""
	}
	return strings.TrimSpace(value)
}

func currentOrgID(c *gin.Context) *uint {
	if _, ok := c.Get(middleware.ContextOrgMemberKey); ok {
		member := currentDomainOrgMember(c)
		if member.ID != 0 {
			return &member.OrgID
		}
	}
	if raw := c.GetHeader("X-Org-ID"); raw != "" {
		if id := parseID(raw); id != 0 {
			return &id
		}
	}
	return nil
}

func requireCurrentOrgID(c *gin.Context) (*uint, bool) {
	orgID := currentOrgID(c)
	if orgID == nil {
		c.JSON(http.StatusForbidden, api.Forbidden("无工作区信息"))
		return nil, false
	}
	return orgID, true
}

func (h *ProjectHandler) List(c *gin.Context) {
	orgID, ok := requireCurrentOrgID(c)
	if !ok {
		return
	}
	projects, err := h.projects.List(c.Request.Context(), orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("查询项目失败"))
		return
	}
	c.JSON(http.StatusOK, projects)
}

func (h *ProjectHandler) AdminList(c *gin.Context) {
	filter := projectapp.AdminListFilter{
		Query:    c.Query("q"),
		Page:     intQuery(c, "page", 1),
		PageSize: intQuery(c, "page_size", 50),
	}
	if projectID := parseID(c.Query("project_id")); projectID != 0 {
		filter.ProjectID = &projectID
	}
	if ownerID := parseID(c.Query("owner_id")); ownerID != 0 {
		filter.OwnerID = &ownerID
	}
	if orgID := parseID(c.Query("org_id")); orgID != 0 {
		filter.OrgID = &orgID
	}
	page, err := h.projects.AdminList(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("查询项目失败"))
		return
	}
	c.Header("X-Total-Count", strconv.FormatInt(page.Total, 10))
	c.JSON(http.StatusOK, page.Items)
}

func (h *ProjectHandler) AdminDetail(c *gin.Context) {
	detail, err := h.projects.AdminDetail(c.Request.Context(), parseID(c.Param("id")))
	if err != nil {
		if errors.Is(err, projectapp.ErrProjectNotFound) {
			c.JSON(http.StatusNotFound, api.NotFound("项目不存在"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("查询项目详情失败"))
		return
	}
	c.JSON(http.StatusOK, detail)
}

func (h *ProjectHandler) AdminForceSetOwner(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req struct {
		OwnerID uint `json:"owner_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	if projectID == 0 || req.OwnerID == 0 {
		c.JSON(http.StatusBadRequest, api.InvalidInput("项目 ID 和 owner_id 必须有效"))
		return
	}

	var previousOwnerID uint
	if existing, err := h.projects.Get(c.Request.Context(), projectID, nil); err == nil {
		previousOwnerID = existing.OwnerID
	}
	updated, err := h.projects.ForceSetOwner(c.Request.Context(), projectID, req.OwnerID)
	if err != nil {
		switch {
		case errors.Is(err, projectapp.ErrProjectNotFound):
			c.JSON(http.StatusNotFound, api.NotFound("项目不存在"))
		case errors.Is(err, projectapp.ErrOwnerNotFound):
			c.JSON(http.StatusBadRequest, api.InvalidInput("owner 用户不存在"))
		case errors.Is(err, projectapp.ErrOwnerInactive):
			c.JSON(http.StatusBadRequest, api.InvalidInput("owner 用户必须是 active 状态"))
		default:
			c.JSON(http.StatusInternalServerError, api.Internal("修改项目 owner 失败"))
		}
		return
	}

	audit.Record(c, h.db, audit.Event{
		Action:     "project.owner_changed",
		TargetType: "project",
		TargetID:   audit.TargetID(updated.ID),
		OrgID:      updated.OrgID,
		ProjectID:  &updated.ID,
		Metadata: map[string]any{
			"previous_owner_id": previousOwnerID,
			"owner_id":          req.OwnerID,
		},
	})
	c.JSON(http.StatusOK, updated)
}

func (h *ProjectHandler) AdminDelete(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	if projectID == 0 {
		c.JSON(http.StatusBadRequest, api.InvalidInput("项目 ID 必须有效"))
		return
	}
	var orgID *uint
	if existing, err := h.projects.Get(c.Request.Context(), projectID, nil); err == nil {
		orgID = existing.OrgID
	}
	if err := h.projects.Delete(c.Request.Context(), projectID, nil); err != nil {
		if errors.Is(err, projectapp.ErrProjectNotFound) {
			c.JSON(http.StatusNotFound, api.NotFound("项目不存在"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("删除项目失败"))
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "project.admin_deleted",
		TargetType: "project",
		TargetID:   audit.TargetID(projectID),
		OrgID:      orgID,
		ProjectID:  &projectID,
	})
	c.Status(http.StatusNoContent)
}

func (h *ProjectHandler) AdminCreate(c *gin.Context) {
	var req projectapp.AdminCreateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	created, err := h.projects.AdminCreate(c.Request.Context(), req)
	if err != nil {
		switch {
		case errors.Is(err, projectapp.ErrInvalidProjectName):
			c.JSON(http.StatusBadRequest, api.InvalidInput("项目名称不能为空"))
		case errors.Is(err, projectapp.ErrOwnerNotFound):
			c.JSON(http.StatusBadRequest, api.InvalidInput("owner 用户不存在"))
		case errors.Is(err, projectapp.ErrOwnerInactive):
			c.JSON(http.StatusBadRequest, api.InvalidInput("owner 用户必须是 active 状态"))
		case errors.Is(err, projectapp.ErrProjectOrgNotFound):
			c.JSON(http.StatusBadRequest, api.InvalidInput("组织不存在"))
		case errors.Is(err, projectapp.ErrProjectOrgInactive):
			c.JSON(http.StatusBadRequest, api.InvalidInput("组织已暂停，不能创建项目"))
		default:
			c.JSON(http.StatusInternalServerError, api.Internal("创建项目失败"))
		}
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "project.admin_created",
		TargetType: "project",
		TargetID:   audit.TargetID(created.ID),
		OrgID:      created.OrgID,
		ProjectID:  &created.ID,
		Metadata: map[string]any{
			"name":     created.Name,
			"owner_id": created.OwnerID,
			"org_id":   created.OrgID,
		},
	})
	c.JSON(http.StatusCreated, created)
}

func (h *ProjectHandler) AdminUpdate(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req projectapp.AdminUpdateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	var previousName string
	if existing, err := h.projects.Get(c.Request.Context(), projectID, nil); err == nil {
		previousName = existing.Name
	}
	updated, err := h.projects.AdminUpdate(c.Request.Context(), projectID, req)
	if err != nil {
		switch {
		case errors.Is(err, projectapp.ErrProjectNotFound):
			c.JSON(http.StatusNotFound, api.NotFound("项目不存在"))
		case errors.Is(err, projectapp.ErrInvalidProjectName):
			c.JSON(http.StatusBadRequest, api.InvalidInput("项目名称不能为空"))
		case errors.Is(err, projectapp.ErrNoProjectFieldsToUpdate):
			c.JSON(http.StatusBadRequest, api.InvalidInput("没有可更新字段"))
		default:
			c.JSON(http.StatusInternalServerError, api.Internal("更新项目失败"))
		}
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "project.admin_updated",
		TargetType: "project",
		TargetID:   audit.TargetID(updated.ID),
		OrgID:      updated.OrgID,
		ProjectID:  &updated.ID,
		Metadata: map[string]any{
			"previous_name": previousName,
			"name":          updated.Name,
		},
	})
	c.JSON(http.StatusOK, updated)
}

func (h *ProjectHandler) Create(c *gin.Context) {
	var req projectapp.CreateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	orgID, ok := requireCurrentOrgID(c)
	if !ok {
		return
	}
	var ownerID uint
	if user := currentUser(c); user != nil {
		ownerID = user.ID
	}
	project, err := h.projects.Create(c.Request.Context(), req, ownerID, orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("创建项目失败"))
		return
	}
	c.JSON(http.StatusCreated, project)
}

func (h *ProjectHandler) Get(c *gin.Context) {
	orgID, ok := requireCurrentOrgID(c)
	if !ok {
		return
	}
	project, err := h.projects.Get(c.Request.Context(), parseID(c.Param("id")), orgID)
	if err != nil {
		c.JSON(http.StatusNotFound, api.NotFound("项目不存在"))
		return
	}
	c.JSON(http.StatusOK, project)
}

func (h *ProjectHandler) Workspace(c *gin.Context) {
	orgID, ok := requireCurrentOrgID(c)
	if !ok {
		return
	}
	metadata, err := h.repositories.WorkspaceMetadata(c.Request.Context(), parseID(c.Param("id")), orgID)
	if err != nil {
		switch {
		case errors.Is(err, projectrepoapp.ErrProjectNotFound):
			c.JSON(http.StatusNotFound, api.NotFound("项目不存在"))
		case errors.Is(err, projectrepoapp.ErrInvalidRepositoryConfig):
			c.JSON(http.StatusInternalServerError, api.Internal("项目仓库配置无效"))
		default:
			c.JSON(http.StatusInternalServerError, api.Internal("获取项目工作区仓库失败"))
		}
		return
	}
	c.JSON(http.StatusOK, metadata)
}

func (h *ProjectHandler) GitProxy(c *gin.Context) {
	orgID, ok := requireCurrentOrgID(c)
	if !ok {
		return
	}
	target, err := h.repositories.GitProxyTarget(c.Request.Context(), parseID(c.Param("id")), orgID)
	if err != nil {
		switch {
		case errors.Is(err, projectrepoapp.ErrProjectNotFound):
			c.JSON(http.StatusNotFound, api.NotFound("项目不存在"))
		case errors.Is(err, projectrepoapp.ErrRepositoryNotReady):
			c.JSON(http.StatusConflict, api.Conflict("项目仓库尚未就绪"))
		case errors.Is(err, projectrepoapp.ErrInvalidRepositoryConfig):
			c.JSON(http.StatusInternalServerError, api.Internal("项目仓库配置无效"))
		default:
			c.JSON(http.StatusInternalServerError, api.Internal("定位项目仓库失败"))
		}
		return
	}
	upstreamURL, err := h.gitProxyUpstreamURL(target, c.Param("gitPath"), c.Request.URL.RawQuery)
	if err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput("Git proxy path invalid"))
		return
	}
	if !gitProxyAllowsSmartHTTP(c.Request.Method, c.Param("gitPath"), c.Query("service")) {
		c.JSON(http.StatusForbidden, api.Forbidden("Git proxy path is not allowed"))
		return
	}
	user, ok := middleware.CurrentUserProfileFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, api.AuthRequired())
		return
	}

	switch target.Provider {
	case projectrepoapp.ProviderGitHTTP:
		h.gitProxyLocal(c, target, user.Username)
		return
	case projectrepoapp.ProviderGitea:
	default:
		c.JSON(http.StatusServiceUnavailable, api.Internal("项目仓库 provider 不受支持"))
		return
	}

	hasToken := h.giteaToken != ""
	hasAdminBasic := h.giteaAdminUsername != "" && h.giteaAdminPassword != ""
	if h.giteaBaseURL == "" || (!hasToken && !hasAdminBasic) {
		log.Printf("[movscript:project-git-proxy] proxy not configured baseURLSet=%t tokenSet=%t adminBasicSet=%t", h.giteaBaseURL != "", hasToken, hasAdminBasic)
		c.JSON(http.StatusServiceUnavailable, api.Internal("项目仓库代理未配置：缺少 Gitea base URL 或管理凭据"))
		return
	}
	upstreamUsername := target.Owner
	upstreamSecret := h.giteaToken
	if upstreamSecret == "" && hasAdminBasic {
		upstreamUsername = h.giteaAdminUsername
		upstreamSecret = h.giteaAdminPassword
	}
	if h.gitIdentities != nil {
		credential, err := h.gitIdentities.EnsureForUser(c.Request.Context(), user)
		if err != nil {
			log.Printf("[movscript:project-git-proxy] user git credential failed userId=%d error=%s", user.ID, err)
			c.JSON(http.StatusServiceUnavailable, api.Internal("用户 Gitea 凭据不可用"))
			return
		}
		credential, err = h.gitIdentities.EnsureRepoAccess(c.Request.Context(), user.ID, target.Owner, target.Repo)
		if err != nil {
			log.Printf("[movscript:project-git-proxy] repo collaborator failed userId=%d owner=%s repo=%s error=%s", user.ID, target.Owner, target.Repo, err)
			c.JSON(http.StatusBadGateway, api.Internal("项目仓库授权失败"))
			return
		}
		upstreamUsername = credential.Username
		upstreamSecret = credential.Token
	}
	req, err := http.NewRequestWithContext(c.Request.Context(), c.Request.Method, upstreamURL, c.Request.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("创建 Git proxy 请求失败"))
		return
	}
	copyGitProxyRequestHeaders(req.Header, c.Request.Header)
	req.SetBasicAuth(upstreamUsername, upstreamSecret)
	req.Host = ""

	client := h.httpClient
	if client == nil {
		client = &http.Client{Timeout: 0}
	}
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, api.Internal("Git upstream request failed"))
		return
	}
	defer resp.Body.Close()

	copyGitProxyResponseHeaders(c.Writer.Header(), resp.Header)
	c.Status(resp.StatusCode)
	if resp.StatusCode >= http.StatusBadRequest {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 8192))
		log.Printf("[movscript:project-git-proxy] upstream failed status=%d owner=%s repo=%s path=%s body=%s", resp.StatusCode, target.Owner, target.Repo, c.Param("gitPath"), strings.TrimSpace(string(body)))
		_, _ = c.Writer.Write(body)
		return
	}
	_, _ = io.Copy(c.Writer, resp.Body)
}

func (h *ProjectHandler) gitProxyUpstreamURL(target projectrepoapp.GitProxyTarget, gitPath string, rawQuery string) (string, error) {
	parsedBase, err := url.Parse(h.giteaBaseURL)
	if err != nil || parsedBase.Scheme == "" || parsedBase.Host == "" {
		return "", err
	}
	path := strings.TrimSpace(gitPath)
	if path == "" || !strings.HasPrefix(path, "/") || strings.Contains(path, "..") || strings.Contains(path, "\\") {
		return "", errors.New("invalid git path")
	}
	repoRoot := "/" + target.Repo + ".git"
	if path != repoRoot && !strings.HasPrefix(path, repoRoot+"/") {
		return "", errors.New("git path does not match project repository")
	}
	suffix := strings.TrimPrefix(path, repoRoot)
	parsedBase.Path = strings.TrimRight(parsedBase.Path, "/") + "/" + url.PathEscape(target.Owner) + "/" + url.PathEscape(target.Repo) + ".git" + suffix
	parsedBase.RawQuery = rawQuery
	return parsedBase.String(), nil
}

func copyGitProxyRequestHeaders(dst http.Header, src http.Header) {
	for _, key := range []string{"Accept", "Accept-Encoding", "Content-Type", "Git-Protocol", "User-Agent"} {
		for _, value := range src.Values(key) {
			dst.Add(key, value)
		}
	}
}

func gitProxyAllowsSmartHTTP(method string, gitPath string, service string) bool {
	path := strings.TrimSpace(gitPath)
	switch {
	case method == http.MethodGet && strings.HasSuffix(path, "/info/refs"):
		return service == "git-receive-pack" || service == "git-upload-pack"
	case method == http.MethodPost:
		return strings.HasSuffix(path, "/git-receive-pack") || strings.HasSuffix(path, "/git-upload-pack")
	default:
		return false
	}
}

func copyGitProxyResponseHeaders(dst http.Header, src http.Header) {
	for _, key := range []string{"Cache-Control", "Content-Type", "Expires", "Pragma", "Git-Protocol"} {
		for _, value := range src.Values(key) {
			dst.Add(key, value)
		}
	}
}

func (h *ProjectHandler) Update(c *gin.Context) {
	var req projectapp.UpdateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	orgID, ok := requireCurrentOrgID(c)
	if !ok {
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		if existing, err := h.projects.Get(c.Request.Context(), parseID(c.Param("id")), orgID); err == nil {
			req.Name = existing.Name
			if req.Description == "" {
				req.Description = existing.Description
			}
			if req.TotalEpisodes == 0 {
				req.TotalEpisodes = existing.TotalEpisodes
			}
			if req.AspectRatio == "" {
				req.AspectRatio = existing.AspectRatio
			}
			if req.VisualStyle == "" {
				req.VisualStyle = existing.VisualStyle
			}
			if req.ProjectStyle == "" {
				req.ProjectStyle = existing.ProjectStyle
			}
		}
	}
	project, err := h.projects.Update(c.Request.Context(), parseID(c.Param("id")), req, orgID)
	if err != nil {
		if errors.Is(err, projectapp.ErrProjectNotFound) {
			c.JSON(http.StatusNotFound, api.NotFound("项目不存在"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("更新项目失败"))
		return
	}
	c.JSON(http.StatusOK, project)
}

func (h *ProjectHandler) Delete(c *gin.Context) {
	orgID, ok := requireCurrentOrgID(c)
	if !ok {
		return
	}
	if err := h.projects.Delete(c.Request.Context(), parseID(c.Param("id")), orgID); err != nil {
		if errors.Is(err, projectapp.ErrProjectNotFound) {
			c.JSON(http.StatusNotFound, api.NotFound("项目不存在"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("删除项目失败"))
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *ProjectHandler) AddMember(c *gin.Context) {
	var req projectapp.MemberInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	orgID, ok := requireCurrentOrgID(c)
	if !ok {
		return
	}
	member, err := h.projects.AddMember(c.Request.Context(), parseID(c.Param("id")), req, orgID)
	if err != nil {
		if errors.Is(err, projectapp.ErrProjectNotFound) {
			c.JSON(http.StatusNotFound, api.NotFound("项目不存在"))
			return
		}
		if errors.Is(err, projectapp.ErrMemberUserNotFound) {
			c.JSON(http.StatusNotFound, api.NotFound("用户不存在"))
			return
		}
		if errors.Is(err, projectapp.ErrMemberUserInactive) {
			c.JSON(http.StatusBadRequest, api.InvalidInput("项目成员用户必须是 active 状态"))
			return
		}
		if errors.Is(err, projectapp.ErrMemberUserNotInOrg) {
			c.JSON(http.StatusForbidden, api.Forbidden("项目成员必须属于当前工作区"))
			return
		}
		if errors.Is(err, projectapp.ErrInvalidProjectMemberRole) {
			c.JSON(http.StatusBadRequest, api.InvalidInput("role 必须是 director、writer、generator 或 viewer"))
			return
		}
		if errors.Is(err, projectapp.ErrProjectOwnerMemberLocked) {
			c.JSON(http.StatusConflict, api.Conflict("不能通过成员接口修改项目 Owner，请使用修改 Owner"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("添加项目成员失败"))
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "project.member_added",
		TargetType: "project_member",
		TargetID:   audit.TargetID(member.ID),
		OrgID:      orgID,
		ProjectID:  &member.ProjectID,
		Metadata: map[string]any{
			"project_id": member.ProjectID,
			"user_id":    member.UserID,
			"role":       member.Role,
		},
	})
	c.JSON(http.StatusCreated, member)
}

func (h *ProjectHandler) RemoveMember(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	memberID := parseID(c.Param("memberId"))
	orgID, ok := requireCurrentOrgID(c)
	if !ok {
		return
	}
	if err := h.projects.RemoveMember(c.Request.Context(), projectID, memberID, orgID); err != nil {
		if errors.Is(err, projectapp.ErrProjectMemberNotFound) || errors.Is(err, projectapp.ErrProjectNotFound) {
			c.JSON(http.StatusNotFound, api.NotFound("项目成员不存在"))
			return
		}
		if errors.Is(err, projectapp.ErrProjectOwnerMemberLocked) {
			c.JSON(http.StatusConflict, api.Conflict("不能直接移除项目 Owner，请先修改项目 Owner"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("移除项目成员失败"))
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "project.member_removed",
		TargetType: "project_member",
		TargetID:   audit.TargetID(memberID),
		OrgID:      orgID,
		ProjectID:  &projectID,
		Metadata: map[string]any{
			"project_id": projectID,
			"member_id":  memberID,
		},
	})
	c.Status(http.StatusNoContent)
}

func (h *ProjectHandler) AdminAddMember(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req projectapp.MemberInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	if req.UserID == 0 {
		c.JSON(http.StatusBadRequest, api.InvalidInput("user_id 必须有效"))
		return
	}
	member, err := h.projects.AddMember(c.Request.Context(), projectID, req, nil)
	if err != nil {
		switch {
		case errors.Is(err, projectapp.ErrProjectNotFound):
			c.JSON(http.StatusNotFound, api.NotFound("项目不存在"))
		case errors.Is(err, projectapp.ErrMemberUserNotFound):
			c.JSON(http.StatusNotFound, api.NotFound("用户不存在"))
		case errors.Is(err, projectapp.ErrMemberUserInactive):
			c.JSON(http.StatusBadRequest, api.InvalidInput("项目成员用户必须是 active 状态"))
		case errors.Is(err, projectapp.ErrInvalidProjectMemberRole):
			c.JSON(http.StatusBadRequest, api.InvalidInput("role 必须是 director、writer、generator 或 viewer"))
		case errors.Is(err, projectapp.ErrProjectOwnerMemberLocked):
			c.JSON(http.StatusConflict, api.Conflict("不能通过成员接口修改项目 Owner，请使用修改 Owner"))
		default:
			c.JSON(http.StatusInternalServerError, api.Internal("添加项目成员失败"))
		}
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "project.member.admin_added",
		TargetType: "project_member",
		TargetID:   audit.TargetID(member.ID),
		OrgID:      h.adminProjectOrgID(c, projectID),
		ProjectID:  &projectID,
		Metadata: map[string]any{
			"project_id": projectID,
			"user_id":    member.UserID,
			"role":       member.Role,
		},
	})
	c.JSON(http.StatusCreated, member)
}

func (h *ProjectHandler) AdminUpdateMember(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	memberID := parseID(c.Param("memberId"))
	var req struct {
		Role string `json:"role" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	member, err := h.projects.UpdateMemberRole(c.Request.Context(), projectID, memberID, req.Role, nil)
	if err != nil {
		switch {
		case errors.Is(err, projectapp.ErrProjectNotFound), errors.Is(err, projectapp.ErrProjectMemberNotFound):
			c.JSON(http.StatusNotFound, api.NotFound("项目成员不存在"))
		case errors.Is(err, projectapp.ErrInvalidProjectMemberRole):
			c.JSON(http.StatusBadRequest, api.InvalidInput("role 必须是 director、writer、generator 或 viewer"))
		case errors.Is(err, projectapp.ErrProjectOwnerMemberLocked):
			c.JSON(http.StatusConflict, api.Conflict("不能直接修改项目 Owner 成员角色，请使用修改 Owner"))
		default:
			c.JSON(http.StatusInternalServerError, api.Internal("更新项目成员失败"))
		}
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "project.member.admin_updated",
		TargetType: "project_member",
		TargetID:   audit.TargetID(member.ID),
		OrgID:      h.adminProjectOrgID(c, projectID),
		ProjectID:  &projectID,
		Metadata: map[string]any{
			"project_id": projectID,
			"user_id":    member.UserID,
			"role":       member.Role,
		},
	})
	c.JSON(http.StatusOK, member)
}

func (h *ProjectHandler) AdminRemoveMember(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	memberID := parseID(c.Param("memberId"))
	if err := h.projects.RemoveMember(c.Request.Context(), projectID, memberID, nil); err != nil {
		switch {
		case errors.Is(err, projectapp.ErrProjectNotFound), errors.Is(err, projectapp.ErrProjectMemberNotFound):
			c.JSON(http.StatusNotFound, api.NotFound("项目成员不存在"))
		case errors.Is(err, projectapp.ErrProjectOwnerMemberLocked):
			c.JSON(http.StatusConflict, api.Conflict("不能直接移除项目 Owner，请先修改项目 Owner"))
		default:
			c.JSON(http.StatusInternalServerError, api.Internal("移除项目成员失败"))
		}
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "project.member.admin_removed",
		TargetType: "project_member",
		TargetID:   audit.TargetID(memberID),
		OrgID:      h.adminProjectOrgID(c, projectID),
		ProjectID:  &projectID,
		Metadata: map[string]any{
			"project_id": projectID,
			"member_id":  memberID,
		},
	})
	c.Status(http.StatusNoContent)
}

func (h *ProjectHandler) adminProjectOrgID(c *gin.Context, projectID uint) *uint {
	if projectID == 0 {
		return nil
	}
	project, err := h.projects.Get(c.Request.Context(), projectID, nil)
	if err != nil {
		return nil
	}
	return project.OrgID
}

func (h *ProjectHandler) ListMembers(c *gin.Context) {
	orgID, ok := requireCurrentOrgID(c)
	if !ok {
		return
	}
	members, err := h.projects.ListMembers(c.Request.Context(), parseID(c.Param("id")), orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("查询项目成员失败"))
		return
	}
	c.JSON(http.StatusOK, members)
}

func (h *ProjectHandler) AdminListMembers(c *gin.Context) {
	members, err := h.projects.ListMembers(c.Request.Context(), parseID(c.Param("id")), nil)
	if err != nil {
		if errors.Is(err, projectapp.ErrProjectNotFound) {
			c.JSON(http.StatusNotFound, api.NotFound("项目不存在"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("查询项目成员失败"))
		return
	}
	c.JSON(http.StatusOK, members)
}

func (h *ProjectHandler) Progress(c *gin.Context) {
	orgID, ok := requireCurrentOrgID(c)
	if !ok {
		return
	}
	progress, err := h.projects.Progress(c.Request.Context(), parseID(c.Param("id")), orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("查询项目进度失败"))
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"members": progress.Members,
	})
}

func parseID(s string) uint {
	var id uint
	for _, c := range s {
		if c >= '0' && c <= '9' {
			id = id*10 + uint(c-'0')
		}
	}
	return id
}

func intQuery(c *gin.Context, key string, fallback int) int {
	value, err := strconv.Atoi(c.DefaultQuery(key, strconv.Itoa(fallback)))
	if err != nil {
		return fallback
	}
	return value
}
