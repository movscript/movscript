package projectrepo

type GitProxyTarget struct {
	ProjectID     uint
	Provider      string
	Owner         string
	Repo          string
	DefaultBranch string
	BaseURL       string
	LocalRoot     string
	GitBinary     string
	AuthUsername  string
	AuthSecret    string
}
