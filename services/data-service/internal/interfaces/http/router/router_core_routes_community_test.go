//go:build !runtime_overlay

package router

func expectedDistributionProfileCoreRoutesForTest() []string {
	return []string{
		"GET /api/v1/admin/debug/jobs",
	}
}
