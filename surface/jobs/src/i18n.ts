export const jobsSurfaceI18nResources = {
  'en-US': {
    translation: {
      common: {
        all: 'All',
        cancel: 'Cancel',
        close: 'Close',
        details: 'Details',
        loadingShort: 'Loading',
        requestFailed: 'Request failed',
        retry: 'Retry',
      },
      apiErrors: {
        cancelFinishedJob: 'Finished jobs cannot be cancelled',
        cancelVideoOnly: 'Only video generation jobs can be cancelled',
        runningJobRetry: 'Running jobs cannot be retried until they fail or time out',
        succeededJobRetry: 'Succeeded jobs cannot be retried',
      },
      canvas: {
        status: {
          done: 'Done',
          failed: 'Failed',
          notRun: 'Not run',
        },
      },
      header: {
        titles: {
          canvases: 'Canvas',
        },
      },
      pages: {
        jobs: {
          categories: {
            image: 'Image',
            video: 'Video',
            audio: 'Audio',
          },
          operations: {
            text_to_image: 'Text to Image',
            reference_to_image: 'Reference to Image',
            edit_image: 'Image Edit',
            prompt_to_video: 'Prompt to Video',
            image_to_video: 'Image to Video',
            first_frame_to_video: 'First Frame to Video',
            first_last_frame_to_video: 'First/Last Frame to Video',
            reference_to_video: 'Reference to Video',
            edit_video: 'Video Edit',
          },
          status: {
            pending: 'Queued',
            running: 'Generating',
            succeeded: 'Done',
            failed: 'Failed',
            cancelled: 'Cancelled',
          },
          time: {
            justNow: 'Just now',
            minutesAgo: '{{count}} minutes ago',
            hoursAgo: '{{count}} hours ago',
          },
          cancelTask: 'Cancel task',
          waitingWorker: 'Waiting for worker...',
          aiGenerating: 'AI generating...',
          generationFailed: 'Generation failed',
          taskCancelled: 'Task cancelled',
          cancelFailed: 'Cancel failed',
          retryFailed: 'Retry failed',
          generating: 'Generating...',
          allStatuses: 'All statuses',
          empty: 'No generation records yet',
          emptyHint: 'Submit a generation task from the tools page.',
        },
        resources: {
          gridTitle: 'Grid',
          listTitle: 'List',
          pageStatus: 'Page {{page}} / {{pageCount}}',
          previousPage: 'Previous',
          nextPage: 'Next',
        },
      },
      shared: {
        generation: {
          waitingStart: 'Waiting to start',
          promptPlaceholder: 'Describe what to generate...',
        },
        genResult: {
          reusePrompt: 'Reuse prompt',
          context: {
            model: 'Model',
            resources: 'Resources',
            params: 'Params',
          },
        },
      },
    },
  },
  'zh-CN': {
    translation: {
      common: {
        all: '全部',
        cancel: '取消',
        close: '关闭',
        details: '详情',
        loadingShort: '加载中',
        requestFailed: '请求失败',
        retry: '重试',
      },
      apiErrors: {
        cancelFinishedJob: '已结束的任务不能取消',
        cancelVideoOnly: '只有视频生成任务可以取消',
        runningJobRetry: '运行中的任务需要失败或超时后才能重试',
        succeededJobRetry: '成功任务不能重试',
      },
      canvas: {
        status: {
          done: '完成',
          failed: '失败',
          notRun: '未运行',
        },
      },
      header: {
        titles: {
          canvases: '画布',
        },
      },
      pages: {
        jobs: {
          categories: {
            image: '图片',
            video: '视频',
            audio: '音频',
          },
          operations: {
            text_to_image: '文生图',
            reference_to_image: '参考生图',
            edit_image: '图像编辑',
            prompt_to_video: '文生视频',
            image_to_video: '图生视频',
            first_frame_to_video: '首帧生视频',
            first_last_frame_to_video: '首尾帧生视频',
            reference_to_video: '全能参考生视频',
            edit_video: '视频编辑',
          },
          status: {
            pending: '排队中',
            running: '生成中',
            succeeded: '完成',
            failed: '失败',
            cancelled: '已取消',
          },
          time: {
            justNow: '刚刚',
            minutesAgo: '{{count}} 分钟前',
            hoursAgo: '{{count}} 小时前',
          },
          cancelTask: '取消任务',
          waitingWorker: '等待 worker 处理...',
          aiGenerating: 'AI 生成中...',
          generationFailed: '生成失败',
          taskCancelled: '任务已取消',
          cancelFailed: '取消失败',
          retryFailed: '重试失败',
          generating: '生成中...',
          allStatuses: '全部状态',
          empty: '还没有生成记录',
          emptyHint: '在工具页提交生成任务。',
        },
        resources: {
          gridTitle: '网格',
          listTitle: '列表',
          pageStatus: '第 {{page}} / {{pageCount}} 页',
          previousPage: '上一页',
          nextPage: '下一页',
        },
      },
      shared: {
        generation: {
          waitingStart: '等待开始',
          promptPlaceholder: '描述你想生成的内容...',
        },
        genResult: {
          reusePrompt: '复用提示词',
          context: {
            model: '模型',
            resources: '资源',
            params: '参数',
          },
        },
      },
    },
  },
} as const

export type JobsSurfaceLanguage = keyof typeof jobsSurfaceI18nResources
