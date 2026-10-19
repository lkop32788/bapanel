const router = require('express').Router();
const { protect, workspaceParamMember, workspaceParamOwner } = require('../middleware/auth');
const {
  getWorkspaces, createWorkspace, getWorkspace, updateWorkspace,
  deleteWorkspace, addMember, removeMember, updateWhatsAppConfig, refreshWhatsAppDetails, getWhatsAppHealth, diagnoseWhatsApp,
} = require('../controllers/workspaceController');
const {
  handleEmbeddedSignup, getEmbeddedSignupConfig, disconnectWhatsApp,
} = require('../controllers/embeddedSignupController');

router.use(protect);
router.get('/', getWorkspaces);
router.post('/', createWorkspace);
router.get('/:id', workspaceParamMember, getWorkspace);
router.put('/:id', workspaceParamOwner, updateWorkspace);
router.delete('/:id', workspaceParamOwner, deleteWorkspace);
router.post('/:id/members', workspaceParamOwner, addMember);
router.delete('/:id/members/:userId', workspaceParamOwner, removeMember);
router.put('/:id/whatsapp', workspaceParamOwner, updateWhatsAppConfig);
router.post("/:id/whatsapp/refresh", workspaceParamMember, refreshWhatsAppDetails);
router.get('/:id/whatsapp/health', workspaceParamMember, getWhatsAppHealth);
router.get('/:id/whatsapp/diagnose', workspaceParamMember, diagnoseWhatsApp);
router.post('/:id/whatsapp/embedded-signup', workspaceParamOwner, handleEmbeddedSignup);
router.get('/:id/whatsapp/embedded-signup/config', workspaceParamMember, getEmbeddedSignupConfig);
router.post('/:id/whatsapp/disconnect', workspaceParamOwner, disconnectWhatsApp);

// 邮件渠道手动同步：立即触发一次 IMAP 拉取（平时由 emailInboxPoller 每 2 分钟自动轮询）
const emailSyncing = new Set(); // 防止同一工作区并发触发同步
router.post('/:id/email/sync', workspaceParamMember, async (req, res) => {
  const Workspace = require('../models/Workspace');
  const workspace = req.workspaceDoc;
  const wsId = String(workspace._id);
  try {
    const ec = workspace.emailChannel;
    if (!ec?.enabled || !ec.imapHost || !ec.user || !ec.pass) {
      return res.status(400).json({ success: false, message: '邮件渠道未启用或配置不完整（IMAP 主机 / 账号 / 密码）' });
    }
    if (emailSyncing.has(wsId)) {
      return res.status(409).json({ success: false, message: '同步正在进行中，请稍候' });
    }
    emailSyncing.add(wsId);
    try {
      const { pollWorkspace } = require('../services/emailInboxPoller');
      const imported = await pollWorkspace(workspace, global.io);
      res.json({
        success: true,
        message: imported ? `同步完成，新增 ${imported} 条消息` : '同步完成，没有新邮件',
        data: { lastPolledAt: new Date(), imported: imported || 0 },
      });
    } finally {
      emailSyncing.delete(wsId);
    }
  } catch (error) {
    const msg = error.message || '同步失败';
    // 记录失败原因，渠道页下次加载时可见
    try { await Workspace.updateOne({ _id: workspace._id }, { 'emailChannel.lastError': msg }); } catch { /* 忽略 */ }
    res.status(500).json({ success: false, message: `邮件同步失败：${msg}` });
  }
});

module.exports = router;
