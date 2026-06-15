import type { PreviewAssetReferenceUnit } from './sourceWorkspaceTypes'

export const assetReferenceUnits: Record<string, PreviewAssetReferenceUnit> = {
  'asset/phone_screen': {
    assetId: 'asset/phone_screen',
    title: '手机屏幕 UI',
    path: 'content_units/cu_asset_phone_screen/content_unit.json',
    contentUnitId: 'cu_asset_phone_screen',
    contentUnitType: 'asset_ref',
    outputKind: 'image',
    editPrompt: '雨夜手机屏幕参考图，消息气泡保持可读，雨滴遮挡只能覆盖边缘，不改变 UI 布局。',
    usage: '作为 phone_screen 参考图标识，供手机特写、屏幕反光关键帧和拨号动作分镜依赖。',
    lockPolicy: '下游生成必须读取已确认的 selected_candidate_id；参考图重新确认后，下游旧 hash 标记为 stale。',
    acceptedInputHash: 'sha256:asset-91a4e2',
    selectionState: 'selected',
    upstream: [
      { id: 'up_phone_setting', title: '雨夜天台', kind: 'setting', ownerNodeId: 'setting/rain_rooftop', state: 'current', summary: '提供雨夜、天台边缘和城市反光的基础视觉规则。' },
      { id: 'up_phone_state', title: '夜雨状态', kind: 'state', ownerNodeId: 'state/rain_rooftop/night_rain', state: 'current', summary: '约束雨滴遮挡、湿手反光和屏幕亮度边界。' },
      { id: 'up_phone_shot', title: '女主手指停在拨号键上', kind: 'shot', ownerNodeId: 'shot_phone_press', state: 'selected', summary: '该镜头读取确认后的屏幕 UI 作为视频生成输入。' },
    ],
    candidates: [
      { id: 'asset_phone_a', title: '雨滴屏幕确认版', model: 'image-t2i', inputHash: 'sha256:asset-91a4e2', resourceId: 103, confirmation: 'confirmed', selected: true, note: 'UI 可读、雨滴层次稳定，适合作为下游稳定依赖。' },
      { id: 'asset_phone_b', title: '反光更强版本', model: 'image-t2i', inputHash: 'sha256:asset-91a4e2', resourceId: 117, confirmation: 'review', note: '屏幕更戏剧化，但会影响 keyframe 的消息可读性。' },
      { id: 'asset_phone_c', title: '旧版低亮度屏幕', model: 'upload', inputHash: 'sha256:asset-665f10', resourceId: 88, confirmation: 'stale', note: '旧输入生成，和当前雨滴遮挡规则不完全匹配。' },
    ],
    downstream: [
      { id: 'dep_phone_kf_rain', title: '雨滴落在屏幕', kind: 'keyframe', ownerNodeId: 'kf_rain_on_screen', momentId: 'm1', shotId: 'shot_phone_press', dependencyHash: 'sha256:asset-91a4e2', state: 'selected', action: '保持当前关键帧选择', preview: '依赖已确认屏幕 UI，雨滴遮挡位置可以继续沿用。' },
      { id: 'dep_phone_storyboard', title: '三格分镜', kind: 'storyboard', ownerNodeId: 'storyboard/phone_press_board', momentId: 'm1', shotId: 'shot_phone_press', dependencyHash: 'sha256:asset-665f10', state: 'stale', action: '跳转后重新生成分镜候选', preview: '分镜仍引用旧屏幕亮度，需根据确认版屏幕重算输入。' },
      { id: 'dep_phone_content', title: '女主手指停在拨号键上', kind: 'content_unit', ownerNodeId: 'shot_phone_press', momentId: 'm1', shotId: 'shot_phone_press', dependencyHash: 'sha256:asset-91a4e2', state: 'selected', action: '打开镜头内容单元', preview: '视频候选输入已使用当前参考图确认态。' },
    ],
  },
  'asset/headlight_beam': {
    assetId: 'asset/headlight_beam',
    title: '车灯光束参考',
    path: 'content_units/cu_asset_headlight_beam/content_unit.json',
    contentUnitId: 'cu_asset_headlight_beam',
    contentUnitType: 'asset_ref',
    outputKind: 'image',
    editPrompt: '湿夜环境里的远车灯体积光参考，光束方向从画面右后方扫入，地面积水需要有边缘反射。',
    usage: '作为 headlight_beam 参考图标识，供背影 keyframe、危险靠近分镜和 shot_video 输入依赖。',
    lockPolicy: '缺少确认参考图时，下游允许草稿预览，但不可进入最终候选选择。',
    selectionState: 'needs_candidate',
    upstream: [
      { id: 'up_headlight_setting', title: '雨夜天台', kind: 'setting', ownerNodeId: 'setting/rain_rooftop', state: 'current', summary: '提供湿夜环境和远景冷光的世界规则。' },
      { id: 'up_headlight_state', title: '城市远景冷光', kind: 'state', ownerNodeId: 'state/rain_rooftop/city_backlight', state: 'changed', summary: '冷光状态已变化，需要重新确认车灯方向和反射边缘。' },
      { id: 'up_headlight_shot', title: '车灯扫过背影', kind: 'shot', ownerNodeId: 'shot_headlights_back', state: 'needs_candidate', summary: '下游关键帧和分镜都等待这个参考图进入确认态。' },
    ],
    candidates: [
      { id: 'asset_headlight_a', title: '远车灯雾化版', model: 'image-t2i', inputHash: 'sha256:asset-22a901', resourceId: 21, confirmation: 'review', note: '光束方向成立，人物边缘光还需要压暗。' },
      { id: 'asset_headlight_b', title: '湿街高反射版', model: 'image-t2i', inputHash: 'sha256:asset-22a901', resourceId: 24, confirmation: 'review', note: '地面反射更强，适合横移镜头。' },
    ],
    downstream: [
      { id: 'dep_headlight_kf', title: '车灯扫过', kind: 'keyframe', ownerNodeId: 'kf_headlight_sweep', momentId: 'm1', shotId: 'shot_headlights_back', dependencyHash: 'missing', state: 'needs_candidate', action: '确认参考图后重生成', preview: '关键帧只能使用文字约束，灯束边界不稳定。' },
      { id: 'dep_headlight_storyboard', title: '两格危险靠近', kind: 'storyboard', ownerNodeId: 'storyboard/headlights_back_board', momentId: 'm1', shotId: 'shot_headlights_back', dependencyHash: 'missing', state: 'needs_candidate', action: '跳转补分镜参考', preview: '第二格缺少地面反光指示。' },
    ],
  },
  'asset/evening_dress': {
    assetId: 'asset/evening_dress',
    title: '礼服材质',
    path: 'content_units/cu_asset_evening_dress/content_unit.json',
    contentUnitId: 'cu_asset_evening_dress',
    contentUnitType: 'asset_ref',
    outputKind: 'image',
    editPrompt: '近景礼服材质参考，深色缎面，边缘受暖色走廊光勾勒，不能出现夸张亮片。',
    usage: '作为 evening_dress 参考图标识，供电梯门缝里的 keyframe 和 storyboard 依赖。',
    lockPolicy: '确认态变化会使人物近景材质相关 keyframe stale。',
    selectionState: 'needs_candidate',
    upstream: [
      { id: 'up_dress_setting', title: '酒店电梯', kind: 'setting', ownerNodeId: 'setting/hotel_elevator', state: 'current', summary: '提供电梯空间、门缝构图和室内反射约束。' },
      { id: 'up_dress_state', title: '暖色走廊光位', kind: 'state', ownerNodeId: 'state/hotel_elevator/warm_corridor', state: 'changed', summary: '走廊暖光变化会影响礼服边缘光和人物轮廓。' },
      { id: 'up_dress_shot', title: '电梯缝隙里的双人对视', kind: 'shot', ownerNodeId: 'shot_elevator_gap', state: 'stale', summary: '旧视频候选无法证明使用了当前礼服材质标识。' },
    ],
    candidates: [
      { id: 'asset_dress_a', title: '深色缎面候选', model: 'image-t2i', inputHash: 'sha256:asset-9c11aa', resourceId: 44, confirmation: 'review', note: '材质克制，暖光边缘较清楚。' },
    ],
    downstream: [
      { id: 'dep_dress_kf_wide', title: '门缝较宽', kind: 'keyframe', ownerNodeId: 'kf_gap_wide', momentId: 'm2', shotId: 'shot_elevator_gap', dependencyHash: 'missing', state: 'needs_candidate', action: '确认参考图后重选关键帧', preview: '衣料边缘不稳定，人物轮廓容易变形。' },
      { id: 'dep_dress_content', title: '电梯缝隙里的双人对视', kind: 'content_unit', ownerNodeId: 'shot_elevator_gap', momentId: 'm2', shotId: 'shot_elevator_gap', dependencyHash: 'missing', state: 'stale', action: '跳转内容单元检查输入', preview: '旧候选无法证明使用了当前礼服材质标识。' },
    ],
  },
}
