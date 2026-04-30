package handler

import (
	"bytes"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/model"
	"github.com/movscript/movscript/internal/service"
	"github.com/movscript/movscript/internal/storage"
	"gorm.io/gorm"
)

type AssetHandler struct {
	db    *gorm.DB
	store storage.Storage
}

func parseOptionalUint(raw string) *uint {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	parsed, err := strconv.ParseUint(raw, 10, 64)
	if err != nil || parsed == 0 {
		return nil
	}
	value := uint(parsed)
	return &value
}

func NewAssetHandler(db *gorm.DB, store storage.Storage) *AssetHandler {
	return &AssetHandler{db: db, store: store}
}

func (h *AssetHandler) List(c *gin.Context) {
	assets := make([]model.Asset, 0)
	q := h.db.Model(&model.Asset{}).Where("project_id = ?", c.Param("id"))
	if t := c.Query("type"); t != "" {
		q = q.Where("type = ? OR variant_type = ?", t, t)
	}
	if settingID := c.Query("setting_id"); settingID != "" {
		q = q.Where("setting_id = ?", settingID)
	}
	if nid := c.Query("pipeline_node_id"); nid != "" {
		q = q.Where("pipeline_node_id = ?", nid)
	}
	if keyword := strings.TrimSpace(c.Query("q")); keyword != "" {
		q = q.Where("LOWER(name) LIKE ?", "%"+strings.ToLower(keyword)+"%")
	}
	if c.Query("page") != "" || c.Query("page_size") != "" {
		page := max(1, parseInt(c.DefaultQuery("page", "1")))
		pageSize := max(1, parseInt(c.DefaultQuery("page_size", "24")))
		if pageSize > 100 {
			pageSize = 100
		}
		var total int64
		if err := q.Count(&total).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if err := q.Preload("Setting").Preload("Resource").Preload("Views").Order("created_at desc").Limit(pageSize).Offset((page - 1) * pageSize).Find(&assets).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		h.populateAssetResources(c, assets)
		c.JSON(http.StatusOK, gin.H{"total": total, "items": assets, "page": page, "page_size": pageSize})
		return
	}
	if err := q.Preload("Setting").Preload("Resource").Preload("Views").Order("created_at desc").Find(&assets).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.populateAssetResources(c, assets)
	c.JSON(http.StatusOK, assets)
}

func (h *AssetHandler) Create(c *gin.Context) {
	var req service.AssetInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var a model.Asset
	service.ApplyAssetInput(&a, req)
	a.ProjectID = parseID(c.Param("id"))
	h.db.Create(&a)
	c.JSON(http.StatusCreated, a)
}

// Upload creates an asset with a view type from a multipart file.
func (h *AssetHandler) Upload(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file required"})
		return
	}
	defer file.Close()

	name := c.PostForm("name")
	if name == "" {
		name = header.Filename
	}
	viewType := c.PostForm("view_type")
	if viewType == "" {
		viewType = "front"
	}
	variantType := strings.TrimSpace(c.PostForm("variant_type"))
	if variantType == "" {
		variantType = viewType
	}
	assetType := strings.TrimSpace(c.PostForm("type"))
	if assetType == "" {
		assetType = variantType
	}
	variantName := strings.TrimSpace(c.PostForm("variant_name"))
	state := strings.TrimSpace(c.PostForm("state"))
	description := strings.TrimSpace(c.PostForm("description"))

	mimeType := header.Header.Get("Content-Type")
	r := model.RawResource{
		OwnerID:        user.ID,
		Type:           mimeToType(mimeType, header.Filename),
		Name:           header.Filename,
		MimeType:       mimeType,
		Size:           header.Size,
		FilePath:       "pending",
		StorageBackend: h.store.Backend(),
	}
	if err := h.db.Create(&r).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	key := generateStorageKey(r.ID, header.Filename)
	data, readErr := io.ReadAll(file)
	if readErr != nil {
		h.db.Delete(&r)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read file"})
		return
	}
	if err := h.store.Put(c.Request.Context(), key, bytes.NewReader(data), int64(len(data)), mimeType); err != nil {
		h.db.Delete(&r)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to store file"})
		return
	}
	h.db.Model(&r).Updates(map[string]any{
		"file_path":       key,
		"storage_key":     key,
		"storage_backend": h.store.Backend(),
	})

	a := model.Asset{
		ProjectID:   parseID(c.Param("id")),
		Name:        name,
		Type:        assetType,
		ResourceID:  &r.ID,
		Description: description,
		VariantType: variantType,
		VariantName: variantName,
		State:       state,
	}
	if settingID := parseOptionalUint(c.PostForm("setting_id")); settingID != nil {
		a.SettingID = settingID
	}
	if follow := c.PostForm("follow_setting_status"); follow == "false" || follow == "0" {
		a.FollowSettingStatus = false
	} else {
		a.FollowSettingStatus = true
	}
	h.db.Create(&a)

	view := model.AssetView{
		AssetID:  a.ID,
		ViewType: viewType,
		Label:    viewType,
		ImageURL: resourceURL(c, r.ID),
	}
	h.db.Create(&view)
	_ = NewResourceBindingHandler(h.db).createBinding(model.ResourceBinding{
		ProjectID:   a.ProjectID,
		ResourceID:  r.ID,
		OwnerType:   "asset",
		OwnerID:     a.ID,
		Role:        "final",
		Slot:        viewType,
		IsPrimary:   true,
		Status:      "selected",
		SourceType:  "upload",
		CreatedByID: &user.ID,
	})
	_ = NewResourceBindingHandler(h.db).createBinding(model.ResourceBinding{
		ProjectID:   a.ProjectID,
		ResourceID:  r.ID,
		OwnerType:   "asset_view",
		OwnerID:     view.ID,
		Role:        "final",
		Slot:        viewType,
		IsPrimary:   true,
		Status:      "selected",
		SourceType:  "upload",
		CreatedByID: &user.ID,
	})

	h.db.Preload("Setting").Preload("Resource").Preload("Views").First(&a, a.ID)
	items := []model.Asset{a}
	h.populateAssetResources(c, items)
	c.JSON(http.StatusCreated, items[0])
}

func (h *AssetHandler) Get(c *gin.Context) {
	var a model.Asset
	if err := h.db.Preload("Setting").Preload("Resource").Preload("Views").First(&a, c.Param("assetId")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	items := []model.Asset{a}
	h.populateAssetResources(c, items)
	c.JSON(http.StatusOK, items[0])
}

func (h *AssetHandler) Update(c *gin.Context) {
	var a model.Asset
	if err := h.db.First(&a, c.Param("assetId")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var req service.AssetInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	service.ApplyAssetInput(&a, req)
	h.db.Save(&a)
	h.db.Preload("Setting").Preload("Resource").Preload("Views").First(&a, a.ID)
	items := []model.Asset{a}
	h.populateAssetResources(c, items)
	c.JSON(http.StatusOK, items[0])
}

// Patch applies a partial update to an asset.
// Note: review_status is retained for legacy compatibility but is not enabled
// in the current frontend; pipeline node status owns review workflow.
func (h *AssetHandler) Patch(c *gin.Context) {
	var a model.Asset
	if err := h.db.First(&a, c.Param("assetId")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if updates := service.AssetPatchUpdates(body); len(updates) > 0 {
		h.db.Model(&a).Updates(updates)
	}
	h.db.Preload("Setting").Preload("Resource").Preload("Views").First(&a, a.ID)
	items := []model.Asset{a}
	h.populateAssetResources(c, items)
	c.JSON(http.StatusOK, items[0])
}

func (h *AssetHandler) Delete(c *gin.Context) {
	h.db.Delete(&model.Asset{}, c.Param("assetId"))
	c.Status(http.StatusNoContent)
}

// AddView adds a new view to an asset.
func (h *AssetHandler) AddView(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	assetID := parseID(c.Param("assetId"))

	var req struct {
		ViewType string `json:"view_type"`
		Label    string `json:"label"`
		CanvasID *uint  `json:"canvas_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.ViewType == "" {
		req.ViewType = "custom"
	}

	view := model.AssetView{
		AssetID:  assetID,
		ViewType: req.ViewType,
		Label:    req.Label,
		CanvasID: req.CanvasID,
	}
	h.db.Create(&view)
	c.JSON(http.StatusCreated, view)
}

// UploadView uploads a file and attaches it to an existing or new view.
func (h *AssetHandler) UploadView(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	assetID := parseID(c.Param("assetId"))

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file required"})
		return
	}
	defer file.Close()

	viewType := c.PostForm("view_type")
	if viewType == "" {
		viewType = "custom"
	}
	label := c.PostForm("label")
	if label == "" {
		label = viewType
	}

	mimeType := header.Header.Get("Content-Type")
	r := model.RawResource{
		OwnerID:        user.ID,
		Type:           mimeToType(mimeType, header.Filename),
		Name:           header.Filename,
		MimeType:       mimeType,
		Size:           header.Size,
		FilePath:       "pending",
		StorageBackend: h.store.Backend(),
	}
	if err := h.db.Create(&r).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	viewData, rdErr := io.ReadAll(file)
	if rdErr != nil {
		h.db.Delete(&r)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read file"})
		return
	}
	viewKey := generateStorageKey(r.ID, header.Filename)
	if storeErr := h.store.Put(c.Request.Context(), viewKey, bytes.NewReader(viewData), int64(len(viewData)), mimeType); storeErr != nil {
		h.db.Delete(&r)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to store file"})
		return
	}
	h.db.Model(&r).Updates(map[string]any{
		"file_path":       viewKey,
		"storage_key":     viewKey,
		"storage_backend": h.store.Backend(),
	})

	view := model.AssetView{
		AssetID:  assetID,
		ViewType: viewType,
		Label:    label,
		ImageURL: resourceURL(c, r.ID),
	}
	h.db.Create(&view)
	var asset model.Asset
	if err := h.db.Select("id, project_id").First(&asset, assetID).Error; err == nil {
		if asset.ResourceID == nil {
			h.db.Model(&asset).Update("resource_id", r.ID)
		}
		_ = NewResourceBindingHandler(h.db).createBinding(model.ResourceBinding{
			ProjectID:   asset.ProjectID,
			ResourceID:  r.ID,
			OwnerType:   "asset",
			OwnerID:     asset.ID,
			Role:        "final",
			Slot:        viewType,
			IsPrimary:   true,
			Status:      "selected",
			SourceType:  "upload",
			CreatedByID: &user.ID,
		})
		_ = NewResourceBindingHandler(h.db).createBinding(model.ResourceBinding{
			ProjectID:   asset.ProjectID,
			ResourceID:  r.ID,
			OwnerType:   "asset_view",
			OwnerID:     view.ID,
			Role:        "final",
			Slot:        viewType,
			IsPrimary:   true,
			Status:      "selected",
			SourceType:  "upload",
			CreatedByID: &user.ID,
		})
	}
	h.populateAssetResources(c, []model.Asset{{Views: []model.AssetView{view}}})
	c.JSON(http.StatusCreated, view)
}

// DeleteView removes a single view.
func (h *AssetHandler) DeleteView(c *gin.Context) {
	h.db.Delete(&model.AssetView{}, c.Param("viewId"))
	c.Status(http.StatusNoContent)
}

func (h *AssetHandler) populateAssetResources(c *gin.Context, assets []model.Asset) {
	for i := range assets {
		if assets[i].Resource == nil {
			assets[i].Resource = h.firstDirectAssetResource(c, assets[i].ProjectID, assets[i].ID)
		}
		if assets[i].Resource != nil {
			assets[i].Resource.URL = resourceURL(c, assets[i].Resource.ID)
		}
		assets[i].EffectiveStatus = assets[i].ReviewStatus
		if assets[i].FollowSettingStatus && assets[i].Setting != nil && assets[i].Setting.Status != "" {
			assets[i].EffectiveStatus = assets[i].Setting.Status
		}
	}
	h.populateAssetViewResources(c, assets)
}

func (h *AssetHandler) firstDirectAssetResource(c *gin.Context, projectID uint, assetID uint) *model.RawResource {
	var binding model.ResourceBinding
	err := h.db.Preload("Resource").
		Where("project_id = ? AND owner_type = ? AND owner_id = ? AND role IN ?", projectID, "asset", assetID, []string{"final", "thumbnail", "reference"}).
		Order("is_primary desc, sort_order, created_at").
		First(&binding).Error
	if err != nil || binding.Resource == nil {
		return nil
	}
	binding.Resource.URL = resourceURL(c, binding.Resource.ID)
	return binding.Resource
}

func (h *AssetHandler) populateAssetViewResources(c *gin.Context, assets []model.Asset) {
	viewIDs := make([]uint, 0)
	for _, asset := range assets {
		for _, view := range asset.Views {
			viewIDs = append(viewIDs, view.ID)
		}
	}
	if len(viewIDs) == 0 {
		return
	}
	var bindings []model.ResourceBinding
	h.db.Preload("Resource").
		Where("owner_type = ? AND owner_id IN ? AND role IN ?", "asset_view", viewIDs, []string{"final", "reference", "thumbnail"}).
		Order("is_primary desc, sort_order, created_at").
		Find(&bindings)
	byView := map[uint]*model.RawResource{}
	for i := range bindings {
		if bindings[i].Resource != nil {
			bindings[i].Resource.URL = resourceURL(c, bindings[i].Resource.ID)
			if _, exists := byView[bindings[i].OwnerID]; !exists {
				byView[bindings[i].OwnerID] = bindings[i].Resource
			}
		}
	}
	for i := range assets {
		for j := range assets[i].Views {
			if resource := byView[assets[i].Views[j].ID]; resource != nil {
				assets[i].Views[j].Resource = resource
			}
		}
	}
}
