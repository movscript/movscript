package projectrepo

type GitProxyTarget struct {
	ProjectID     uint
	Provider      string
	Owner         string
	Repo          string
	DefaultBranch string
}
