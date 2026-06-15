import type { ShotWorkspaceDetails } from './sourceWorkspaceTypes'

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
