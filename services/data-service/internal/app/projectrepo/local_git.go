package projectrepo

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"

	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

type LocalGitAdapter struct {
	root      string
	gitBinary string
}

func NewLocalGitAdapter(root string, gitBinary string) *LocalGitAdapter {
	root = strings.TrimSpace(root)
	gitBinary = strings.TrimSpace(gitBinary)
	if gitBinary == "" {
		gitBinary = "git"
	}
	return &LocalGitAdapter{
		root:      root,
		gitBinary: gitBinary,
	}
}

func (a *LocalGitAdapter) EnsureRepository(ctx context.Context, input EnsureRepositoryInput) (EnsureRepositoryResult, error) {
	if a == nil {
		return EnsureRepositoryResult{}, nil
	}
	repoPath, err := a.RepoPath(input.Owner, input.Repo)
	if err != nil {
		return EnsureRepositoryResult{}, err
	}
	branch := strings.TrimSpace(input.DefaultBranch)
	if branch == "" {
		branch = "main"
	}
	if err := validateGitBranch(branch); err != nil {
		return EnsureRepositoryResult{}, err
	}
	if err := os.MkdirAll(filepath.Dir(repoPath), 0o755); err != nil {
		return EnsureRepositoryResult{}, err
	}
	if _, err := os.Stat(repoPath); errors.Is(err, os.ErrNotExist) {
		if err := a.runGit(ctx, "init", "--bare", repoPath); err != nil {
			return EnsureRepositoryResult{}, err
		}
	} else if err != nil {
		return EnsureRepositoryResult{}, err
	}
	if err := a.runGit(ctx, "--git-dir", repoPath, "symbolic-ref", "HEAD", "refs/heads/"+branch); err != nil {
		return EnsureRepositoryResult{}, err
	}
	if err := a.runGit(ctx, "--git-dir", repoPath, "config", "http.receivepack", "true"); err != nil {
		return EnsureRepositoryResult{}, err
	}
	head, _ := a.gitOutput(ctx, "--git-dir", repoPath, "rev-parse", "refs/heads/"+branch)
	return EnsureRepositoryResult{
		ProviderRepoID: filepath.ToSlash(filepath.Join(input.Owner, input.Repo+".git")),
		HeadCommit:     strings.TrimSpace(head),
	}, nil
}

func (a *LocalGitAdapter) GetCloneURL(_ context.Context, request providercontract.RepositoryCloneURLRequest) (providercontract.RepositoryCloneURLResult, error) {
	strategy := strings.TrimSpace(request.PreferredStrategy)
	if strategy == "" {
		strategy = providercontract.RepositoryCloneURLStrategyProxy
	}
	if strategy == providercontract.RepositoryCloneURLStrategyTemporary {
		return providercontract.RepositoryCloneURLResult{}, fmt.Errorf("local git temporary clone URL is not supported")
	}
	if strategy != providercontract.RepositoryCloneURLStrategyProxy && strategy != providercontract.RepositoryCloneURLStrategyDirect {
		return providercontract.RepositoryCloneURLResult{}, fmt.Errorf("local git clone URL strategy %q is not supported", request.PreferredStrategy)
	}
	if strategy == providercontract.RepositoryCloneURLStrategyProxy && strings.TrimSpace(request.PublicURL) != "" {
		return providercontract.RepositoryCloneURLResult{URL: strings.TrimSpace(request.PublicURL), Strategy: providercontract.RepositoryCloneURLStrategyProxy}, nil
	}
	repoPath, err := a.RepoPath(request.Ref.Owner, request.Ref.Repo)
	if err != nil {
		return providercontract.RepositoryCloneURLResult{}, err
	}
	return providercontract.RepositoryCloneURLResult{URL: "file://" + filepath.ToSlash(repoPath), Strategy: providercontract.RepositoryCloneURLStrategyDirect}, nil
}

func (a *LocalGitAdapter) GetGitHTTPProxyTarget(_ context.Context, request providercontract.GitHTTPProxyTargetRequest) (providercontract.GitHTTPProxyTarget, error) {
	if a == nil || strings.TrimSpace(a.root) == "" {
		return providercontract.GitHTTPProxyTarget{}, fmt.Errorf("%w: local git root is required", ErrInvalidRepositoryConfig)
	}
	if _, err := a.RepoPath(request.Ref.Owner, request.Ref.Repo); err != nil {
		return providercontract.GitHTTPProxyTarget{}, err
	}
	return providercontract.GitHTTPProxyTarget{
		Provider:      ProviderGitHTTP,
		Owner:         request.Ref.Owner,
		Repo:          request.Ref.Repo,
		DefaultBranch: request.Ref.DefaultBranch,
		LocalRoot:     a.root,
		GitBinary:     a.gitBinary,
	}, nil
}

func (a *LocalGitAdapter) RepoPath(owner string, repo string) (string, error) {
	if a == nil || strings.TrimSpace(a.root) == "" {
		return "", fmt.Errorf("%w: local git root is required", ErrInvalidRepositoryConfig)
	}
	if err := validateRepoSegment(owner); err != nil {
		return "", err
	}
	if err := validateRepoSegment(repo); err != nil {
		return "", err
	}
	return filepath.Join(a.root, owner, repo+".git"), nil
}

func (a *LocalGitAdapter) runGit(ctx context.Context, args ...string) error {
	_, err := a.gitOutput(ctx, args...)
	return err
}

func (a *LocalGitAdapter) gitOutput(ctx context.Context, args ...string) (string, error) {
	gitBinary := strings.TrimSpace(a.gitBinary)
	if gitBinary == "" {
		gitBinary = "git"
	}
	cmd := exec.CommandContext(ctx, gitBinary, args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("git %s failed: %w: %s", strings.Join(args, " "), err, strings.TrimSpace(string(output)))
	}
	return string(output), nil
}

var gitBranchPattern = regexp.MustCompile(`^[A-Za-z0-9._/-]{1,128}$`)

func validateGitBranch(branch string) error {
	branch = strings.TrimSpace(branch)
	if !gitBranchPattern.MatchString(branch) ||
		strings.HasPrefix(branch, "/") ||
		strings.HasSuffix(branch, "/") ||
		strings.Contains(branch, "..") ||
		strings.Contains(branch, "\\") ||
		strings.HasSuffix(branch, ".lock") {
		return fmt.Errorf("%w: invalid git branch %q", ErrInvalidRepositoryConfig, branch)
	}
	return nil
}
