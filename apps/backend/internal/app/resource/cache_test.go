package resource

import "testing"

func TestResourceListCacheKeyIncludesVersionAndFilters(t *testing.T) {
	orgID := uint(7)
	input := ListInput{
		UserID:   42,
		OrgID:    &orgID,
		FolderID: "root",
		Scope:    "team",
		Type:     "image,video",
		Query:    " hero ",
		Page:     2,
		PageSize: 24,
	}

	key := resourceListCacheKey(input, 3)
	if key != "resources:user:42:org:7:v3:folder_id=root&page=2&page_size=24&q=hero&scope=team&type=image%2Cvideo" {
		t.Fatalf("cache key = %q", key)
	}
}
