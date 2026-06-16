package handler

import (
	"bytes"
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	projectrepoapp "github.com/movscript/movscript/internal/app/projectrepo"
	"github.com/movscript/movscript/internal/interfaces/http/api"
)

func (h *ProjectHandler) gitProxyLocal(c *gin.Context, target projectrepoapp.GitProxyTarget, remoteUser string) {
	root := strings.TrimSpace(target.LocalRoot)
	if root == "" {
		root = strings.TrimSpace(h.gitHTTPRoot)
	}
	if root == "" {
		c.JSON(http.StatusServiceUnavailable, api.Internal("项目仓库代理未配置：缺少本地 Git 根目录"))
		return
	}
	gitBinary := strings.TrimSpace(target.GitBinary)
	if gitBinary == "" {
		gitBinary = strings.TrimSpace(h.gitBinary)
	}
	if gitBinary == "" {
		gitBinary = "git"
	}
	pathInfo, err := gitProxyLocalPathInfo(target, c.Param("gitPath"))
	if err != nil {
		log.Printf("[movscript:project-git-proxy] local git path invalid owner=%s repo=%s path=%s error=%s", target.Owner, target.Repo, c.Param("gitPath"), err)
		c.JSON(http.StatusBadRequest, api.InvalidInput("Git proxy path invalid"))
		return
	}

	projectRoot := filepath.Join(root, target.Owner)
	backendBinary, backendArgs := gitHTTPBackendCommand(c.Request.Context(), gitBinary)
	cmd := exec.CommandContext(c.Request.Context(), backendBinary, backendArgs...)
	cmd.Env = append(os.Environ(),
		"GIT_PROJECT_ROOT="+projectRoot,
		"GIT_HTTP_EXPORT_ALL=1",
		"PATH_INFO="+pathInfo,
		"REQUEST_METHOD="+c.Request.Method,
		"QUERY_STRING="+c.Request.URL.RawQuery,
		"REMOTE_USER="+remoteUser,
	)
	if contentType := c.GetHeader("Content-Type"); contentType != "" {
		cmd.Env = append(cmd.Env, "CONTENT_TYPE="+contentType)
	}
	if c.Request.ContentLength > 0 {
		cmd.Env = append(cmd.Env, "CONTENT_LENGTH="+strconv.FormatInt(c.Request.ContentLength, 10))
	}
	if protocol := c.GetHeader("Git-Protocol"); protocol != "" {
		cmd.Env = append(cmd.Env, "GIT_PROTOCOL="+protocol)
	}
	cmd.Stdin = c.Request.Body

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		log.Printf("[movscript:project-git-proxy] local git http-backend failed owner=%s repo=%s path=%s error=%s stderr=%s", target.Owner, target.Repo, c.Param("gitPath"), err, strings.TrimSpace(stderr.String()))
		c.JSON(http.StatusBadGateway, api.Internal("Git local backend request failed"))
		return
	}

	status, headers, body, err := parseGitCGIResponse(stdout.Bytes())
	if err != nil {
		log.Printf("[movscript:project-git-proxy] local git http-backend malformed response owner=%s repo=%s path=%s error=%s", target.Owner, target.Repo, c.Param("gitPath"), err)
		c.JSON(http.StatusBadGateway, api.Internal("Git local backend response invalid"))
		return
	}
	copyGitProxyResponseHeaders(c.Writer.Header(), headers)
	c.Status(status)
	_, _ = c.Writer.Write(body)
}

func gitHTTPBackendCommand(ctx context.Context, gitBinary string) (string, []string) {
	gitBinary = strings.TrimSpace(gitBinary)
	if gitBinary == "" {
		gitBinary = "git"
	}
	if filepath.Base(gitBinary) == "git-http-backend" {
		return gitBinary, nil
	}
	if output, err := exec.CommandContext(ctx, gitBinary, "--exec-path").Output(); err == nil {
		candidate := filepath.Join(strings.TrimSpace(string(output)), "git-http-backend")
		if isExecutableFile(candidate) {
			return candidate, nil
		}
	}
	if candidate, err := exec.LookPath("git-http-backend"); err == nil {
		return candidate, nil
	}
	return gitBinary, []string{"http-backend"}
}

func isExecutableFile(path string) bool {
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return false
	}
	return info.Mode().Perm()&0111 != 0
}

func gitProxyLocalPathInfo(target projectrepoapp.GitProxyTarget, gitPath string) (string, error) {
	path := strings.TrimSpace(gitPath)
	if path == "" || !strings.HasPrefix(path, "/") || strings.Contains(path, "..") || strings.Contains(path, "\\") {
		return "", errors.New("invalid git path")
	}
	repoRoot := "/" + target.Repo + ".git"
	if path != repoRoot && !strings.HasPrefix(path, repoRoot+"/") {
		return "", errors.New("git path does not match project repository")
	}
	return path, nil
}

func parseGitCGIResponse(data []byte) (int, http.Header, []byte, error) {
	headerBytes, body, ok := splitCGIResponse(data)
	if !ok {
		return 0, nil, nil, errors.New("missing CGI header separator")
	}
	status := http.StatusOK
	headers := http.Header{}
	for _, line := range strings.Split(strings.ReplaceAll(string(headerBytes), "\r\n", "\n"), "\n") {
		line = strings.TrimRight(line, "\r")
		if strings.TrimSpace(line) == "" {
			continue
		}
		key, value, ok := strings.Cut(line, ":")
		if !ok {
			return 0, nil, nil, errors.New("malformed CGI header")
		}
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		if strings.EqualFold(key, "Status") {
			codeText, _, _ := strings.Cut(value, " ")
			code, err := strconv.Atoi(codeText)
			if err != nil {
				return 0, nil, nil, err
			}
			status = code
			continue
		}
		headers.Add(key, value)
	}
	return status, headers, body, nil
}

func splitCGIResponse(data []byte) ([]byte, []byte, bool) {
	if index := bytes.Index(data, []byte("\r\n\r\n")); index >= 0 {
		return data[:index], data[index+4:], true
	}
	if index := bytes.Index(data, []byte("\n\n")); index >= 0 {
		return data[:index], data[index+2:], true
	}
	return nil, nil, false
}
