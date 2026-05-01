# MovScript V2 Session Guide

这是给后续会话使用的极简推进说明。更完整的路线图见 `docs/movscript-v2-roadmap.md`，进度见 `docs/movscript-v2-progress.md`。如果要开多个 Codex 窗口并行推进，先读 `docs/movscript-parallel-session-guide.md`。

## 一句话启动

```text
继续推进 MovScript V2 重构。请先读 docs/movscript-v2-progress.md 和 docs/movscript-v2-roadmap.md，按 progress 里的下一步任务推进，结束前更新 progress。
```

## 会话工作规则

1. 先读：

```text
docs/movscript-v2-progress.md
docs/movscript-v2-roadmap.md
docs/movscript-v2-product-design.md
docs/movscript-parallel-session-guide.md
```

2. 再看状态：

```text
git status --short
```

3. 只推进一个小切片。

4. 如果是多窗口并行，先声明本窗口职责、目标和文件边界。

5. 不回滚未明确属于自己的改动。

6. 如果遇到未提交冲突，优先绕开；绕不开再询问用户。

7. 结束前更新：

```text
docs/movscript-v2-progress.md
```

## 当前最优先切片

```text
Phase 1 / Next 1：落地 V2 主导航与入口
```

不要从任务系统、交付系统、复杂画布或 DDD 大迁移开始。

## 判断标准

所有改动都用一个问题判断：

```text
这是否缩短了用户从“我有一份剧本”到“我看见整部片雏形”的距离？
```

如果答案不是明确的“是”，当前阶段先不做。
