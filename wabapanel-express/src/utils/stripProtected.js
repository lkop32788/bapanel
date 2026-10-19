// SEC-IDOR（2026-10-19）：更新/创建类接口通用——剥离客户端不允许改写的字段，
// 防止 mass assignment 把资源迁进别人工作区、伪造归属或统计字段。
// 用法：const body = stripProtected(req.body, ['isGlobal', 'clicks'])
module.exports = (body = {}, extra = []) => {
  const out = { ...(body || {}) };
  for (const k of ['workspace', '_id', '__v', 'createdBy', 'createdAt', 'updatedAt', ...extra]) {
    delete out[k];
  }
  return out;
};
