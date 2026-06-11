import type { ExpressionUnit, HierarchyNode, PreviewAssetReferenceUnit, PreviewMoment, ShotWorkspaceDetails } from './sourceWorkspaceTypes'

export const previewMoments: PreviewMoment[] = [
  {
    id: 'm1',
    title: '雨夜电话打断告白',
    path: 'productions/pilot/segments/opening/scene_moments/rain_call',
    selectionState: 'selected',
    priority: '高优先级',
    production: '短剧试播集',
    segment: '开场钩子',
    settings: ['setting/rain_rooftop', 'asset/phone_screen', 'asset/wet_hair', 'setting/city_backlight'],
    shots: [
      {
        id: 'shot_phone_press',
        title: '女主手指停在拨号键上',
        camera: '特写 · 俯拍 · 静止',
        duration: '3s',
        expression: '迟疑、恐惧和最后一秒的决心同时出现，手机屏幕成为主要光源。',
        stillPosition: '0% 0%',
        path: '.../scene_moments/rain_call/shots/shot_phone_press',
        keyframes: ['kf_phone_hover', 'kf_rain_on_screen', 'kf_phone_press'],
        assets: [
          { title: 'asset/phone_screen', status: 'locked' },
          { title: 'asset/wet_hand_ref', status: 'ready' },
        ],
        storyboard: 'storyboard/phone_press_board',
        contentUnit: {
          id: 'cu_storyboard_phone_press',
          type: 'storyboard_ref',
          outputKind: 'video',
          sceneMomentRef: 'scene_moment/rain_call',
          shotId: 'shot_phone_press',
          storyboardRef: 'storyboard/phone_press_board',
          keyframeRefs: ['kf_phone_hover', 'kf_rain_on_screen', 'kf_phone_press'],
          acceptedInputHash: 'sha256:8b7f2a',
          selectionState: 'selected',
          candidates: [
            { id: 'cand_phone_a', title: '雨滴压暗屏幕', model: 'video-i2v', inputHash: 'sha256:8b7f2a', selected: true, note: '表演克制，手机光源最稳定。' },
            { id: 'cand_phone_b', title: '更强反光版本', model: 'video-i2v', inputHash: 'sha256:8b7f2a', note: '节奏更锋利，但屏幕信息过亮。' },
            { id: 'cand_phone_c', title: '手部动作慢版', model: 'video-i2v', inputHash: 'sha256:8b7f2a', note: '适合作为备选长镜。' },
          ],
        },
      },
      {
        id: 'shot_headlights_back',
        title: '男主背影被车灯切开',
        camera: '中景 · 背面 · 横移',
        duration: '4s',
        expression: '车灯扫过背影，制造误会与危险靠近的感觉。',
        stillPosition: '100% 0%',
        path: '.../scene_moments/rain_call/shots/shot_headlights_back',
        keyframes: ['kf_back_silhouette', 'kf_headlight_sweep'],
        assets: [
          { title: 'asset/headlight_beam', status: 'missing' },
          { title: 'asset/black_coat', status: 'locked' },
        ],
        storyboard: 'storyboard/headlights_back_board',
        contentUnit: {
          id: 'cu_video_headlights_back',
          type: 'shot_video',
          outputKind: 'video',
          sceneMomentRef: 'scene_moment/rain_call',
          shotId: 'shot_headlights_back',
          storyboardRef: 'storyboard/headlights_back_board',
          keyframeRefs: ['kf_back_silhouette', 'kf_headlight_sweep'],
          selectionState: 'needs_candidate',
          candidates: [
            { id: 'cand_headlights_a', title: '远车灯压迫', model: 'video-t2v', inputHash: 'sha256:22a901', note: '构图成立，人物轮廓还需更清楚。' },
            { id: 'cand_headlights_b', title: '湿街反射加强', model: 'video-t2v', inputHash: 'sha256:22a901', note: '环境更有张力，可作为候选。' },
          ],
        },
      },
    ],
  },
  {
    id: 'm2',
    title: '电梯门合上前的对视',
    path: 'productions/pilot/segments/escalation/scene_moments/elevator_look',
    selectionState: 'stale',
    priority: '中优先级',
    production: '短剧试播集',
    segment: '关系升级',
    settings: ['setting/hotel_elevator', 'asset/evening_dress', 'setting/warm_corridor', 'asset/metal_reflection'],
    shots: [
      {
        id: 'shot_elevator_gap',
        title: '电梯缝隙里的双人对视',
        camera: '近景 · 正反打 · 缓慢推进',
        duration: '5s',
        expression: '电梯门像剪辑线一样压缩两人的关系，最后只剩眼神。',
        stillPosition: '0% 100%',
        path: '.../scene_moments/elevator_look/shots/shot_elevator_gap',
        keyframes: ['kf_gap_wide', 'kf_eye_contact', 'kf_gap_close'],
        assets: [
          { title: 'asset/elevator_metal', status: 'ready' },
          { title: 'asset/evening_dress', status: 'missing' },
        ],
        storyboard: 'storyboard/elevator_gap_board',
        contentUnit: {
          id: 'cu_storyboard_elevator_gap',
          type: 'storyboard_ref',
          outputKind: 'video',
          sceneMomentRef: 'scene_moment/elevator_look',
          shotId: 'shot_elevator_gap',
          storyboardRef: 'storyboard/elevator_gap_board',
          keyframeRefs: ['kf_gap_wide', 'kf_eye_contact', 'kf_gap_close'],
          acceptedInputHash: 'sha256:4cf002',
          selectionState: 'stale',
          candidates: [
            { id: 'cand_elevator_a', title: '门缝压缩版', model: 'video-i2v', inputHash: 'sha256:4cf002', selected: true, note: '曾经选中，但 keyframe/kf_eye_contact 已更新。' },
            { id: 'cand_elevator_b', title: '暖光更强版本', model: 'video-i2v', inputHash: 'sha256:9c11aa', note: '匹配最新输入，可重新选择。' },
          ],
        },
      },
    ],
  },
  {
    id: 'm3',
    title: '清晨厨房里的假装平静',
    path: 'productions/pilot/segments/aftermath/scene_moments/morning_kitchen',
    selectionState: 'ready',
    priority: '高优先级',
    production: '短剧试播集',
    segment: '余波',
    settings: ['setting/morning_kitchen', 'asset/coffee_cup', 'asset/notes_stack', 'setting/window_backlight'],
    shots: [
      {
        id: 'shot_coffee_tremble',
        title: '咖啡杯边缘轻微颤动',
        camera: '特写 · 低机位 · 静止',
        duration: '2s',
        expression: '平静表面下的失控，通过杯子震动表现。',
        stillPosition: '100% 100%',
        path: '.../scene_moments/morning_kitchen/shots/shot_coffee_tremble',
        keyframes: ['kf_cup_still'],
        assets: [
          { title: 'asset/coffee_cup', status: 'ready' },
          { title: 'setting/window_backlight', status: 'ready' },
        ],
        storyboard: 'storyboard/coffee_tremble_board',
        contentUnit: {
          id: 'cu_keyframe_coffee_tremble',
          type: 'keyframe_ref',
          outputKind: 'image',
          sceneMomentRef: 'scene_moment/morning_kitchen',
          shotId: 'shot_coffee_tremble',
          storyboardRef: 'storyboard/coffee_tremble_board',
          keyframeRefs: ['kf_cup_still'],
          selectionState: 'ready',
          candidates: [
            { id: 'cand_coffee_a', title: '晨光安静版', model: 'image-t2i', inputHash: 'sha256:79b12f', note: '可作为 keyframe 首选。' },
            { id: 'cand_coffee_b', title: '杯面颤动预演', model: 'image-t2i', inputHash: 'sha256:79b12f', note: '更强调动作线索。' },
          ],
        },
      },
    ],
  },
]

export const shotWorkspaceDetails: Record<string, ShotWorkspaceDetails> = {
  shot_phone_press: {
    settings: [
      {
        id: 'setting/rain_rooftop',
        title: '雨夜天台',
        owner: 'settings/rain_rooftop/setting.json',
        status: 'current',
        summary: '时间为深夜，雨量中等，城市远景只有冷色散射光。',
        downstream: ['shot_phone_press', 'shot_headlights_back'],
      },
      {
        id: 'setting/city_backlight',
        title: '城市远景冷光',
        owner: 'settings/city_backlight/setting.json',
        status: 'changed',
        changedField: 'lighting.temperature',
        summary: '冷光从 7400K 调整到 6800K，手机屏幕不再是唯一高亮。',
        downstream: ['kf_phone_hover', 'storyboard/phone_press_board', 'cu_storyboard_phone_press'],
      },
    ],
    assets: [
      {
        id: 'asset/phone_screen',
        title: '手机屏幕 UI',
        owner: 'assets/phone_screen/asset.json',
        status: 'locked',
        summary: '屏幕消息内容已锁定，生成时只允许调整亮度和雨滴遮挡。',
        downstream: ['kf_rain_on_screen', 'cand_phone_a'],
      },
      {
        id: 'asset/wet_hand_ref',
        title: '湿发手部参考',
        owner: 'assets/wet_hand_ref/asset.json',
        status: 'current',
        summary: '手指悬停动作参考，约束 keyframe 的指尖位置。',
        downstream: ['kf_phone_hover', 'kf_phone_press'],
      },
    ],
    keyframes: [
      { id: 'kf_phone_hover', title: '手指悬停', status: 'selected', inputHash: 'sha256:8b7f2a', summary: '第一帧保持屏幕消息可读，手指距离拨号键约 8px。' },
      { id: 'kf_rain_on_screen', title: '雨滴落在屏幕', status: 'candidate', inputHash: 'sha256:8b7f2a', summary: '雨滴遮挡消息中段，可作为动作峰值帧。' },
      { id: 'kf_phone_press', title: '按下拨号', status: 'draft', inputHash: 'sha256:8b7f2a', summary: '需要补充指尖压下的接触形变。' },
    ],
    storyboards: [
      { id: 'storyboard/phone_press_board', title: '三格分镜', status: 'selected', inputHash: 'sha256:8b7f2a', summary: '手指悬停、雨滴破坏倒影、按下拨号。' },
      { id: 'storyboard/phone_press_tighter', title: '更紧的特写版本', status: 'candidate', inputHash: 'sha256:8b7f2a', summary: '减少环境信息，让手机成为唯一叙事物。' },
    ],
    impacts: [
      {
        source: 'setting/city_backlight',
        kind: 'setting',
        change: 'lighting.temperature 7400K -> 6800K',
        affects: ['kf_phone_hover', 'storyboard/phone_press_board', 'cu_storyboard_phone_press'],
        state: 'stale',
      },
    ],
  },
  shot_headlights_back: {
    settings: [
      {
        id: 'setting/rain_rooftop',
        title: '雨夜天台',
        owner: 'settings/rain_rooftop/setting.json',
        status: 'current',
        summary: '湿地面反射必须保留，横移镜头依赖地面积水高光。',
        downstream: ['shot_headlights_back'],
      },
    ],
    assets: [
      {
        id: 'asset/headlight_beam',
        title: '车灯光束参考',
        owner: 'assets/headlight_beam/asset.json',
        status: 'missing',
        changedField: 'reference_image',
        summary: '缺少明确的车灯体积光参考，当前候选只能用文字约束。',
        downstream: ['kf_headlight_sweep', 'cu_video_headlights_back'],
      },
      {
        id: 'asset/black_coat',
        title: '黑色风衣',
        owner: 'assets/black_coat/asset.json',
        status: 'locked',
        summary: '服装轮廓锁定，用于保持男主背影可识别。',
        downstream: ['kf_back_silhouette'],
      },
    ],
    keyframes: [
      { id: 'kf_back_silhouette', title: '背影静止', status: 'selected', inputHash: 'sha256:22a901', summary: '人物保持画面中轴，车灯在远处形成轮廓边缘光。' },
      { id: 'kf_headlight_sweep', title: '车灯扫过', status: 'candidate', inputHash: 'sha256:22a901', summary: '需要确认灯束方向和横移速度。' },
    ],
    storyboards: [
      { id: 'storyboard/headlights_back_board', title: '两格危险靠近', status: 'draft', inputHash: 'sha256:22a901', summary: '背影站定、强光切入，缺少第二格的地面反光指示。' },
    ],
    impacts: [
      {
        source: 'asset/headlight_beam',
        kind: 'asset',
        change: 'reference_image missing',
        affects: ['kf_headlight_sweep', 'storyboard/headlights_back_board', 'cu_video_headlights_back'],
        state: 'needs_candidate',
      },
    ],
  },
  shot_elevator_gap: {
    settings: [
      {
        id: 'setting/hotel_elevator',
        title: '酒店电梯',
        owner: 'settings/hotel_elevator/setting.json',
        status: 'current',
        summary: '金属门缝形成垂直切线，镜面反射不可过强。',
        downstream: ['storyboard/elevator_gap_board'],
      },
      {
        id: 'setting/warm_corridor',
        title: '暖色走廊',
        owner: 'settings/warm_corridor/setting.json',
        status: 'changed',
        changedField: 'light_source.position',
        summary: '走廊主光从左侧移到右后方，影响眼神高光方向。',
        downstream: ['kf_eye_contact', 'cand_elevator_a', 'cu_storyboard_elevator_gap'],
      },
    ],
    assets: [
      {
        id: 'asset/evening_dress',
        title: '礼服材质',
        owner: 'assets/evening_dress/asset.json',
        status: 'missing',
        summary: '缺少近景材质参考，候选里衣料边缘不稳定。',
        downstream: ['kf_gap_wide', 'kf_eye_contact'],
      },
      {
        id: 'asset/elevator_metal',
        title: '电梯金属反射',
        owner: 'assets/elevator_metal/asset.json',
        status: 'current',
        summary: '低反射拉丝金属，门缝边缘要保持干净。',
        downstream: ['storyboard/elevator_gap_board'],
      },
    ],
    keyframes: [
      { id: 'kf_gap_wide', title: '门缝较宽', status: 'selected', inputHash: 'sha256:4cf002', summary: '人物分处门缝两侧，脸部保持可读。' },
      { id: 'kf_eye_contact', title: '眼神相遇', status: 'stale', inputHash: 'sha256:4cf002', summary: '走廊光位已改，需要重选眼神高光。' },
      { id: 'kf_gap_close', title: '门缝收窄', status: 'candidate', inputHash: 'sha256:9c11aa', summary: '匹配最新光位，可作为新 ending frame。' },
    ],
    storyboards: [
      { id: 'storyboard/elevator_gap_board', title: '门缝宽中窄三段', status: 'stale', inputHash: 'sha256:4cf002', summary: '旧版分镜仍可参考，但不匹配最新走廊光位。' },
      { id: 'storyboard/elevator_gap_relight', title: '右后方暖光版', status: 'candidate', inputHash: 'sha256:9c11aa', summary: '适合替换当前选择，人物眼神更清楚。' },
    ],
    impacts: [
      {
        source: 'setting/warm_corridor',
        kind: 'setting',
        change: 'light_source.position left -> rear-right',
        affects: ['kf_eye_contact', 'storyboard/elevator_gap_board', 'cand_elevator_a'],
        state: 'stale',
      },
      {
        source: 'asset/evening_dress',
        kind: 'asset',
        change: 'material reference missing',
        affects: ['kf_gap_wide', 'cu_storyboard_elevator_gap'],
        state: 'needs_candidate',
      },
    ],
  },
  shot_coffee_tremble: {
    settings: [
      {
        id: 'setting/morning_kitchen',
        title: '清晨厨房',
        owner: 'settings/morning_kitchen/setting.json',
        status: 'current',
        summary: '窗边低对比晨光，整体情绪保持压抑和平静。',
        downstream: ['kf_cup_still', 'cu_keyframe_coffee_tremble'],
      },
      {
        id: 'setting/window_backlight',
        title: '窗帘逆光',
        owner: 'settings/window_backlight/setting.json',
        status: 'current',
        summary: '逆光只勾杯沿和纸张边缘，不抢走杯面细节。',
        downstream: ['cand_coffee_a'],
      },
    ],
    assets: [
      {
        id: 'asset/coffee_cup',
        title: '咖啡杯道具',
        owner: 'assets/coffee_cup/asset.json',
        status: 'current',
        summary: '深色陶瓷杯，杯面需要可读出轻微震动。',
        downstream: ['kf_cup_still'],
      },
      {
        id: 'asset/notes_stack',
        title: '手写笔记',
        owner: 'assets/notes_stack/asset.json',
        status: 'current',
        summary: '纸张边缘作为稳定参照，不能出现可读文字。',
        downstream: ['cand_coffee_a', 'cand_coffee_b'],
      },
    ],
    keyframes: [
      { id: 'kf_cup_still', title: '杯沿静止', status: 'candidate', inputHash: 'sha256:79b12f', summary: '可作为起始关键帧，等待选择。' },
    ],
    storyboards: [
      { id: 'storyboard/coffee_tremble_board', title: '杯面动作分镜', status: 'draft', inputHash: 'sha256:79b12f', summary: '需要补第二格杯面震动方向。' },
    ],
    impacts: [],
  },
}

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
      { id: 'asset_phone_a', title: '雨滴屏幕确认版', model: 'image-t2i', inputHash: 'sha256:asset-91a4e2', resourceId: 'res_phone_103', confirmation: 'confirmed', selected: true, note: 'UI 可读、雨滴层次稳定，适合作为下游稳定依赖。' },
      { id: 'asset_phone_b', title: '反光更强版本', model: 'image-t2i', inputHash: 'sha256:asset-91a4e2', resourceId: 'res_phone_117', confirmation: 'review', note: '屏幕更戏剧化，但会影响 keyframe 的消息可读性。' },
      { id: 'asset_phone_c', title: '旧版低亮度屏幕', model: 'upload', inputHash: 'sha256:asset-665f10', resourceId: 'res_phone_088', confirmation: 'stale', note: '旧输入生成，和当前雨滴遮挡规则不完全匹配。' },
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
      { id: 'asset_headlight_a', title: '远车灯雾化版', model: 'image-t2i', inputHash: 'sha256:asset-22a901', resourceId: 'res_headlight_021', confirmation: 'review', note: '光束方向成立，人物边缘光还需要压暗。' },
      { id: 'asset_headlight_b', title: '湿街高反射版', model: 'image-t2i', inputHash: 'sha256:asset-22a901', resourceId: 'res_headlight_024', confirmation: 'review', note: '地面反射更强，适合横移镜头。' },
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
      { id: 'asset_dress_a', title: '深色缎面候选', model: 'image-t2i', inputHash: 'sha256:asset-9c11aa', resourceId: 'res_dress_044', confirmation: 'review', note: '材质克制，暖光边缘较清楚。' },
    ],
    downstream: [
      { id: 'dep_dress_kf_wide', title: '门缝较宽', kind: 'keyframe', ownerNodeId: 'kf_gap_wide', momentId: 'm2', shotId: 'shot_elevator_gap', dependencyHash: 'missing', state: 'needs_candidate', action: '确认参考图后重选关键帧', preview: '衣料边缘不稳定，人物轮廓容易变形。' },
      { id: 'dep_dress_content', title: '电梯缝隙里的双人对视', kind: 'content_unit', ownerNodeId: 'shot_elevator_gap', momentId: 'm2', shotId: 'shot_elevator_gap', dependencyHash: 'missing', state: 'stale', action: '跳转内容单元检查输入', preview: '旧候选无法证明使用了当前礼服材质标识。' },
    ],
  },
}

export const expressionUnitsByMoment: Record<string, ExpressionUnit[]> = {
  m1: [
    { id: 'expr_rain_call_hesitation', title: '迟疑', kind: 'micro_expression', summary: '手指悬停时的犹豫和恐惧，约束 shot_phone_press 的表演节奏。', sceneMomentId: 'm1' },
    { id: 'expr_rain_call_misread', title: '误会逼近', kind: 'dramatic_pressure', summary: '车灯和背影制造危险靠近，约束 shot_headlights_back 的情绪方向。', sceneMomentId: 'm1' },
  ],
  m2: [
    { id: 'expr_elevator_eye_lock', title: '眼神锁定', kind: 'relationship_beat', summary: '门缝收窄前两人的眼神互相确认，影响 keyframe 和 storyboard 选择。', sceneMomentId: 'm2' },
    { id: 'expr_elevator_withhold', title: '克制不说', kind: 'subtext', summary: '台词缺席时用呼吸和停顿表达未说出口的关系变化。', sceneMomentId: 'm2' },
  ],
  m3: [
    { id: 'expr_morning_contained_break', title: '假装平静', kind: 'internal_state', summary: '人物不动，杯面轻颤承担情绪外化。', sceneMomentId: 'm3' },
  ],
}

export const hierarchyTree: HierarchyNode[] = [
  {
    id: 'settings_root',
    type: 'group',
    title: 'Settings',
    path: 'settings/',
    children: [
          {
            id: 'setting/rain_rooftop',
            type: 'setting',
            title: '雨夜天台',
            path: 'settings/rain_rooftop/setting.json',
            children: [
              {
                id: 'state/rain_rooftop/night_rain',
                type: 'state',
                title: '夜雨状态',
                path: 'settings/rain_rooftop/states/night_rain.json',
                shotId: 'shot_phone_press',
                momentId: 'm1',
                children: [
                  { id: 'asset/phone_screen', type: 'asset', title: '手机屏幕 UI', path: 'assets/phone_screen/asset.json', state: 'locked', shotId: 'shot_phone_press', momentId: 'm1' },
                  { id: 'asset/wet_hand_ref', type: 'asset', title: '湿发手部参考', path: 'assets/wet_hand_ref/asset.json', shotId: 'shot_phone_press', momentId: 'm1' },
                ],
              },
              {
                id: 'state/rain_rooftop/city_backlight',
                type: 'state',
                title: '城市远景冷光',
                path: 'settings/rain_rooftop/states/city_backlight.json',
                state: 'changed',
                shotId: 'shot_phone_press',
                momentId: 'm1',
                children: [
                  { id: 'asset/headlight_beam', type: 'asset', title: '车灯光束参考', path: 'assets/headlight_beam/asset.json', state: 'missing', shotId: 'shot_headlights_back', momentId: 'm1' },
                ],
              },
            ],
          },
          {
            id: 'setting/hotel_elevator',
            type: 'setting',
            title: '酒店电梯',
            path: 'settings/hotel_elevator/setting.json',
            children: [
              {
                id: 'state/hotel_elevator/warm_corridor',
                type: 'state',
                title: '暖色走廊光位',
                path: 'settings/hotel_elevator/states/warm_corridor.json',
                state: 'changed',
                shotId: 'shot_elevator_gap',
                momentId: 'm2',
                children: [
                  { id: 'asset/elevator_metal', type: 'asset', title: '电梯金属反射', path: 'assets/elevator_metal/asset.json', shotId: 'shot_elevator_gap', momentId: 'm2' },
                  { id: 'asset/evening_dress', type: 'asset', title: '礼服材质', path: 'assets/evening_dress/asset.json', state: 'missing', shotId: 'shot_elevator_gap', momentId: 'm2' },
                ],
              },
            ],
          },
          {
            id: 'setting/morning_kitchen',
            type: 'setting',
            title: '清晨厨房',
            path: 'settings/morning_kitchen/setting.json',
            children: [
              {
                id: 'state/morning_kitchen/window_backlight',
                type: 'state',
                title: '窗帘逆光',
                path: 'settings/morning_kitchen/states/window_backlight.json',
                shotId: 'shot_coffee_tremble',
                momentId: 'm3',
                children: [
                  { id: 'asset/coffee_cup', type: 'asset', title: '咖啡杯道具', path: 'assets/coffee_cup/asset.json', shotId: 'shot_coffee_tremble', momentId: 'm3' },
                  { id: 'asset/notes_stack', type: 'asset', title: '手写笔记', path: 'assets/notes_stack/asset.json', shotId: 'shot_coffee_tremble', momentId: 'm3' },
                ],
              },
            ],
          },
    ],
  },
  {
    id: 'productions_group',
    type: 'group',
    title: 'Productions',
    path: 'productions',
    children: [
  {
    id: 'production_pilot',
    type: 'production',
    title: 'Production 1 · 短剧试播集',
    path: 'productions/pilot/production.json',
    state: 'selected',
    children: [
      {
        id: 'segment_opening',
        type: 'segment',
        title: '开场钩子',
        path: 'productions/pilot/segments/opening/segment.json',
        state: 'selected',
        children: [
          {
            id: 'm1',
            type: 'scene_moment',
            title: '雨夜电话打断告白',
            path: 'productions/pilot/segments/opening/scene_moments/rain_call/scene_moment.json',
            state: 'selected',
            momentId: 'm1',
            children: [
              {
                id: 'm1_shots_group',
                type: 'group',
                title: 'Shots',
                path: 'shots',
                children: [
                  {
                    id: 'shot_phone_press',
                    type: 'shot',
                    title: '女主手指停在拨号键上',
                    path: '.../shots/shot_phone_press/shot.json',
                    state: 'selected',
                    shotId: 'shot_phone_press',
                    momentId: 'm1',
                    children: [
                      {
                        id: 'shot_phone_press_storyboards_group',
                        type: 'group',
                        title: 'Storyboards',
                        path: 'storyboards',
                        shotId: 'shot_phone_press',
                        momentId: 'm1',
                        children: [
                          { id: 'storyboard/phone_press_board', type: 'storyboard', title: '三格分镜', path: '.../storyboards/phone_press_board/storyboard.json', state: 'selected', shotId: 'shot_phone_press', momentId: 'm1' },
                        ],
                      },
                      {
                        id: 'shot_phone_press_keyframes_group',
                        type: 'group',
                        title: 'Keyframes',
                        path: 'keyframes',
                        shotId: 'shot_phone_press',
                        momentId: 'm1',
                        children: [
                          { id: 'kf_phone_hover', type: 'keyframe', title: '手指悬停', path: '.../keyframes/kf_phone_hover/keyframe.json', state: 'selected', shotId: 'shot_phone_press', momentId: 'm1' },
                          { id: 'kf_rain_on_screen', type: 'keyframe', title: '雨滴落在屏幕', path: '.../keyframes/kf_rain_on_screen/keyframe.json', state: 'candidate', shotId: 'shot_phone_press', momentId: 'm1' },
                        ],
                      },
                    ],
                  },
                  {
                    id: 'shot_headlights_back',
                    type: 'shot',
                    title: '男主背影被车灯切开',
                    path: '.../shots/shot_headlights_back/shot.json',
                    state: 'needs_candidate',
                    shotId: 'shot_headlights_back',
                    momentId: 'm1',
                    children: [
                      {
                        id: 'shot_headlights_back_storyboards_group',
                        type: 'group',
                        title: 'Storyboards',
                        path: 'storyboards',
                        shotId: 'shot_headlights_back',
                        momentId: 'm1',
                        children: [
                          { id: 'storyboard/headlights_back_board', type: 'storyboard', title: '两格危险靠近', path: '.../storyboards/headlights_back_board/storyboard.json', state: 'draft', shotId: 'shot_headlights_back', momentId: 'm1' },
                        ],
                      },
                      {
                        id: 'shot_headlights_back_keyframes_group',
                        type: 'group',
                        title: 'Keyframes',
                        path: 'keyframes',
                        shotId: 'shot_headlights_back',
                        momentId: 'm1',
                        children: [
                          { id: 'kf_back_silhouette', type: 'keyframe', title: '背影静止', path: '.../keyframes/kf_back_silhouette/keyframe.json', state: 'selected', shotId: 'shot_headlights_back', momentId: 'm1' },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                id: 'm1_expression_group',
                type: 'group',
                title: 'Expression Units',
                path: 'expression_units',
                children: [
                  { id: 'expr_rain_call_hesitation', type: 'expression_unit', title: '迟疑', path: '.../expression_units/expr_rain_call_hesitation/expression_unit.json', state: 'selected', momentId: 'm1', shotId: 'shot_phone_press' },
                  { id: 'expr_rain_call_misread', type: 'expression_unit', title: '误会逼近', path: '.../expression_units/expr_rain_call_misread/expression_unit.json', state: 'candidate', momentId: 'm1', shotId: 'shot_headlights_back' },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'segment_escalation',
        type: 'segment',
        title: '关系升级',
        path: 'productions/pilot/segments/escalation/segment.json',
        state: 'stale',
        children: [
          {
            id: 'm2',
            type: 'scene_moment',
            title: '电梯门合上前的对视',
            path: 'productions/pilot/segments/escalation/scene_moments/elevator_look/scene_moment.json',
            state: 'stale',
            momentId: 'm2',
            children: [
              {
                id: 'm2_shots_group',
                type: 'group',
                title: 'Shots',
                path: 'shots',
                momentId: 'm2',
                children: [
                  {
                    id: 'shot_elevator_gap',
                    type: 'shot',
                    title: '电梯缝隙里的双人对视',
                    path: '.../shots/shot_elevator_gap/shot.json',
                    state: 'stale',
                    shotId: 'shot_elevator_gap',
                    momentId: 'm2',
                    children: [
                      {
                        id: 'shot_elevator_gap_storyboards_group',
                        type: 'group',
                        title: 'Storyboards',
                        path: 'storyboards',
                        shotId: 'shot_elevator_gap',
                        momentId: 'm2',
                        children: [
                          { id: 'storyboard/elevator_gap_board', type: 'storyboard', title: '门缝宽中窄三段', path: '.../storyboards/elevator_gap_board/storyboard.json', state: 'stale', shotId: 'shot_elevator_gap', momentId: 'm2' },
                        ],
                      },
                      {
                        id: 'shot_elevator_gap_keyframes_group',
                        type: 'group',
                        title: 'Keyframes',
                        path: 'keyframes',
                        shotId: 'shot_elevator_gap',
                        momentId: 'm2',
                        children: [
                          { id: 'kf_eye_contact', type: 'keyframe', title: '眼神相遇', path: '.../keyframes/kf_eye_contact/keyframe.json', state: 'stale', shotId: 'shot_elevator_gap', momentId: 'm2' },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                id: 'm2_expression_group',
                type: 'group',
                title: 'Expression Units',
                path: 'expression_units',
                momentId: 'm2',
                children: [
                  { id: 'expr_elevator_eye_lock', type: 'expression_unit', title: '眼神锁定', path: '.../expression_units/expr_elevator_eye_lock/expression_unit.json', state: 'stale', momentId: 'm2', shotId: 'shot_elevator_gap' },
                  { id: 'expr_elevator_withhold', type: 'expression_unit', title: '克制不说', path: '.../expression_units/expr_elevator_withhold/expression_unit.json', state: 'candidate', momentId: 'm2', shotId: 'shot_elevator_gap' },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'segment_aftermath',
        type: 'segment',
        title: '余波',
        path: 'productions/pilot/segments/aftermath/segment.json',
        state: 'ready',
        children: [
          {
            id: 'm3',
            type: 'scene_moment',
            title: '清晨厨房里的假装平静',
            path: 'productions/pilot/segments/aftermath/scene_moments/morning_kitchen/scene_moment.json',
            state: 'ready',
            momentId: 'm3',
            children: [
              {
                id: 'm3_shots_group',
                type: 'group',
                title: 'Shots',
                path: 'shots',
                momentId: 'm3',
                children: [
                  {
                    id: 'shot_coffee_tremble',
                    type: 'shot',
                    title: '咖啡杯边缘轻微颤动',
                    path: '.../shots/shot_coffee_tremble/shot.json',
                    state: 'ready',
                    shotId: 'shot_coffee_tremble',
                    momentId: 'm3',
                    children: [
                      {
                        id: 'shot_coffee_tremble_storyboards_group',
                        type: 'group',
                        title: 'Storyboards',
                        path: 'storyboards',
                        shotId: 'shot_coffee_tremble',
                        momentId: 'm3',
                        children: [
                          { id: 'storyboard/coffee_tremble_board', type: 'storyboard', title: '杯面动作分镜', path: '.../storyboards/coffee_tremble_board/storyboard.json', state: 'draft', shotId: 'shot_coffee_tremble', momentId: 'm3' },
                        ],
                      },
                      {
                        id: 'shot_coffee_tremble_keyframes_group',
                        type: 'group',
                        title: 'Keyframes',
                        path: 'keyframes',
                        shotId: 'shot_coffee_tremble',
                        momentId: 'm3',
                        children: [
                          { id: 'kf_cup_still', type: 'keyframe', title: '杯沿静止', path: '.../keyframes/kf_cup_still/keyframe.json', state: 'candidate', shotId: 'shot_coffee_tremble', momentId: 'm3' },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                id: 'm3_expression_group',
                type: 'group',
                title: 'Expression Units',
                path: 'expression_units',
                momentId: 'm3',
                children: [
                  { id: 'expr_morning_contained_break', type: 'expression_unit', title: '假装平静', path: '.../expression_units/expr_morning_contained_break/expression_unit.json', state: 'ready', momentId: 'm3', shotId: 'shot_coffee_tremble' },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'production_followup',
    type: 'production',
    title: 'Production 2 · 第二集草案',
    path: 'productions/followup/production.json',
    children: [
      {
        id: 'segment_followup_cold_open',
        type: 'segment',
        title: '冷开场',
        path: 'productions/followup/segments/cold_open/segment.json',
        children: [
          {
            id: 'm_followup_shadow',
            type: 'scene_moment',
            title: '门外影子停住',
            path: 'productions/followup/segments/cold_open/scene_moments/door_shadow/scene_moment.json',
            children: [
              {
                id: 'm_followup_shadow_shots_group',
                type: 'group',
                title: 'Shots',
                path: 'shots',
                children: [
                  {
                    id: 'shot_followup_shadow',
                    type: 'shot',
                    title: '门缝下的影子',
                    path: '.../shots/shot_followup_shadow/shot.json',
                    state: 'draft',
                    children: [
                      {
                        id: 'shot_followup_shadow_storyboards_group',
                        type: 'group',
                        title: 'Storyboards',
                        path: 'storyboards',
                        children: [],
                      },
                      {
                        id: 'shot_followup_shadow_keyframes_group',
                        type: 'group',
                        title: 'Keyframes',
                        path: 'keyframes',
                        children: [],
                      },
                    ],
                  },
                ],
              },
              {
                id: 'm_followup_shadow_expression_group',
                type: 'group',
                title: 'Expression Units',
                path: 'expression_units',
                children: [
                  { id: 'expr_followup_suspense', type: 'expression_unit', title: '悬念停顿', path: '.../expression_units/expr_followup_suspense/expression_unit.json', state: 'draft' },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
    ],
  },
]
