目标：先维护 project_proposal，再基于该上游基础维护 production_proposal。两个 artifact 都保持为本地审阅 drafts。

Project schema：{{schema:movscript.project_proposal.v1.id}}
{{schema:movscript.project_proposal.v1}}

Production schema：{{schema:movscript.production_proposal.v1.id}}
{{schema:movscript.production_proposal.v1}}

使用 draft 工具查找、创建、patch、validate 和 preview 每个 draft。在 production draft 中使用 project draft 的引用前，先 preview project draft。如果任一 preview 失败，先修复对应 draft，再总结完成情况。
