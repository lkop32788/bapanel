// SEC-IDOR（2026-10-19）：校验 body 里携带的资源引用 id 归属本工作区，
// 防止把他人工作区的模板/自动化等挂到自己资源上经 populate 泄露内容。
// 用法：await assertWorkspaceRef(Template, body.template, req.workspace._id, '模板')
module.exports = async (Model, id, workspaceId, label = '资源') => {
  if (!id) return;
  const ok = await Model.exists({ _id: id, workspace: workspaceId }).catch(() => null);
  if (!ok) {
    const e = new Error(`${label}不存在或不属于本工作区`);
    e.status = 400;
    throw e;
  }
};
