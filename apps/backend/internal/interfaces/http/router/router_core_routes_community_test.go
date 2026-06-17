//go:build !runtime_overlay

package router

func expectedEditionCoreRoutesForTest() []string {
	return []string{
		"GET /api/v1/admin/debug/jobs",
	}
}
