// SEC-LOCK（2026-10-19）：全平台上传锁定——人工上传入口目前只允许 txt 纯文本
// （mimetype text/plain + .txt 扩展名双重校验）。后续要放开某个端点时，
// 在对应路由换回/新建自己的 fileFilter 即可，不要改这里。
// 覆盖端点：/api/upload(+/multiple)、/api/media/upload、/api/contacts/import、
// /api/ai/knowledge-docs；公开表单 /api/forms/:id/upload 在路由内自行校验（同规则）。
// 豁免：AI 外呼录音（系统自动上传固定 .webm）、kkhs 补丁 zip（super_admin 专用）。
const path = require('path');

const txtOnlyFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (file.mimetype === 'text/plain' && ext === '.txt') return cb(null, true);
  cb(new Error('当前平台仅允许上传 txt 文本文件'), false);
};

module.exports = { txtOnlyFilter };
