// SEC-LOCK（2026-10-19）：全平台上传锁定——人工上传入口只允许 txt 纯文本。
// 后续要放开某个端点时，在对应路由换回/新建自己的 fileFilter，不要改这里。
// 覆盖端点：/api/upload(+/multiple)、/api/media/upload、/api/contacts/import、
// /api/ai/knowledge-docs；公开表单 /api/forms/:id/upload 在路由内自行校验（同规则）。
// 豁免：AI 外呼录音（系统自动上传固定 .webm）、kkhs 补丁 zip（super_admin 专用）。
//
// SEC-LOCK2 变体加固（截至 2026-10 已知绕过手法全封）：
// - mimetype 剥离参数后精确比对（挡 "text/plain; boundary=..." 一类混淆，兼容 charset）
// - 扩展名取最终一段且必须恰为 .txt：双扩展名 a.txt.xht 被拒（最终段 .xht）、
//   a.xht.txt 放行但按 txt 存取（无害）；"a.txt."、"a.txt " 尾缀变体 extname 不等于 .txt 被拒
// - 文件名禁止空字节/控制字符/回车换行（挡 %00 截断与头注入），长度 ≤ 200
// - 全角/同形扩展名（．ｔｘｔ）不匹配 ASCII，自然被拒
// - 落盘名一律 uuid + 消毒扩展名（s3Service._safeExt），原始文件名不进路径
// - 内容闸 looksLikePlainText：拒绝 NUL 字节与控制字符占比异常的"伪装 txt"
//   （polyglot/二进制改名），在各入口拿到 buffer 后调用
const path = require('path');

const CTRL_RE = /[\0-\x08\x0b\x0c\x0e-\x1f\x7f]/; // 允许 \t(09) \n(0a) \r(0d)

const txtOnlyFilter = (req, file, cb) => {
  const name = String(file.originalname || '');
  const mime = String(file.mimetype || '').split(';')[0].trim().toLowerCase();
  const ext = path.extname(name).toLowerCase();
  const nameOk = name.length > 0 && name.length <= 200 && !CTRL_RE.test(name) && !name.includes('\n') && !name.includes('\r');
  if (mime === 'text/plain' && ext === '.txt' && nameOk) return cb(null, true);
  cb(new Error('当前平台仅允许上传 txt 文本文件'), false);
};

// 内容必须真的像文本：扫描前 64KB，出现 NUL 直接拒；
// 其他控制字符（除 \t\r\n）占比超过 2% 视为二进制伪装
const looksLikePlainText = (buf) => {
  if (!buf || !buf.length) return true;
  const n = Math.min(buf.length, 64 * 1024);
  let ctrl = 0;
  for (let i = 0; i < n; i++) {
    const b = buf[i];
    if (b === 0) return false;
    if (b < 32 && b !== 9 && b !== 10 && b !== 13) ctrl++;
  }
  return ctrl / n < 0.02;
};

module.exports = { txtOnlyFilter, looksLikePlainText };
