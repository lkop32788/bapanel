const router = require('express').Router();
const { requireFeature } = require('../middleware/featureGate');
const multer = require('multer');
// SEC-LOCK：全平台上传锁定，仅允许 txt（导入请把 CSV 内容存为 .txt 上传）
const { txtOnlyFilter } = require('../middleware/txtOnlyUpload');
const upload = multer({ storage: multer.memoryStorage(), fileFilter: txtOnlyFilter, limits: { fileSize: 5 * 1024 * 1024 } });
const { protect, workspaceAccess } = require('../middleware/auth');
const {
  getContacts, createContact, getContact, updateContact,
  deleteContact, importContacts, exportContacts, bulkDeleteContacts,
} = require('../controllers/contactController');

// Agents can view/edit contacts but must not delete them.
const denyAgentDelete = (req, res, next) => {
  if (req.user && req.user.role === 'agent') {
    return res.status(403).json({ success: false, message: 'Agents are not allowed to delete contacts' });
  }
  next();
};

// FEAT-01：全量删除仅限工作区 owner / 工作区管理员 / super_admin（与前端 canDeleteAll 一致）
const requireWorkspaceAdmin = (req, res, next) => {
  if (req.user.role === 'super_admin') return next();
  const uid = req.user._id.toString();
  const isOwner = req.workspace.owner.toString() === uid;
  const isAdmin = (req.workspace.members || []).some(m => m.user.toString() === uid && m.role === 'admin');
  if (!isOwner && !isAdmin) {
    return res.status(403).json({ success: false, message: '只有工作区所有者或管理员可以全量删除联系人' });
  }
  next();
};

// FEAT-01：联系人“全部删除”后台任务。按 workspace 一个任务，内存态（进程重启即失效，
// 前端会通过 status 接口发现任务不在而停止轮询）。
// workspaceId -> { running, total, deleted, startedAt, error }
const deleteAllJobs = new Map();

// 按前端传来的 filter 构建与 GET /contacts 相同语义的查询
const buildDeleteAllQuery = (workspaceId, filter = {}) => {
  const escapeRegex = require('../utils/escapeRegex');
  const query = { workspace: workspaceId, isGroup: { $ne: true } };
  if (filter.search) {
    query.$or = [
      { name: { $regex: escapeRegex(filter.search), $options: 'i' } },
      { phone: { $regex: escapeRegex(filter.search), $options: 'i' } },
      { email: { $regex: escapeRegex(filter.search), $options: 'i' } },
    ];
  }
  if (filter.tag) query.tags = filter.tag;
  if (filter.status) query.status = filter.status;
  if (filter.channel) query.channel = filter.channel;
  return query;
};

// 后台执行删除：每批 500 个，级联删除消息 / 会话 / 联系人笔记（对应删除弹窗里
// “以及他们的聊天、消息和笔记”），进度通过 socket + status 接口双通道上报。
async function runDeleteAllJob(workspace, query, job, user) {
  const Contact = require('../models/Contact');
  const Conversation = require('../models/Conversation');
  const Message = require('../models/Message');
  const ContactNote = require('../models/ContactNote');
  const wsId = String(workspace._id);
  const emit = (done) => {
    try {
      global.io?.to(`workspace:${wsId}`).emit('contacts_delete_progress', {
        total: job.total,
        deleted: job.deleted,
        done,
        ...(job.error ? { error: job.error } : {}),
      });
    } catch { /* socket 不可用时忽略，前端还有 status 轮询兜底 */ }
  };
  try {
    for (;;) {
      const batch = await Contact.find(query).sort({ _id: 1 }).limit(500).select('_id').lean();
      if (!batch.length) break;
      const ids = batch.map((c) => c._id);
      // 级联：先删该批联系人的消息 / 会话 / 笔记，再删联系人本身
      await Message.deleteMany({ workspace: workspace._id, contact: { $in: ids } });
      await Conversation.deleteMany({ workspace: workspace._id, contact: { $in: ids } });
      await ContactNote.deleteMany({ workspace: workspace._id, contact: { $in: ids } });
      const r = await Contact.deleteMany({ _id: { $in: ids }, workspace: workspace._id });
      job.deleted += r.deletedCount || 0;
      if (!r.deletedCount) break; // 防御：避免删不动时死循环
      emit(false);
    }
    // 全量重算标签的联系人计数（比逐个递减更稳妥）
    try {
      const Tag = require('../models/Tag');
      const tags = await Tag.find({ workspace: workspace._id }).select('_id');
      for (const t of tags) {
        const count = await Contact.countDocuments({ workspace: workspace._id, tags: t._id });
        await Tag.updateOne({ _id: t._id }, { contactCount: count });
      }
    } catch { /* 计数重算失败不影响删除结果 */ }
    if (job.deleted > 1) {
      require('../services/ownerNotify')
        .bulkDeleteAlert(workspace._id, user || {}, job.deleted, 'contacts')
        .catch(() => {});
    }
  } catch (e) {
    job.error = e.message || String(e);
  }
  job.running = false;
  emit(true);
}

router.use(protect, workspaceAccess);
router.use(requireFeature('contacts'));
router.get('/', getContacts);
router.post('/', createContact);
router.post('/import', upload.single('file'), importContacts);
router.post('/bulk-delete', denyAgentDelete, bulkDeleteContacts);
// 批量给联系人加/移除标签或分组：{ ids[], tags?[] | segments?[], mode: 'add'|'remove' }
router.post('/bulk-assign', async (req, res) => {
  try {
    const Contact = require('../models/Contact');
    const { ids, tags, segments, mode } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 2000) {
      return res.status(400).json({ success: false, message: '请选择联系人（单次最多 2000 个）' });
    }
    const update = {};
    const apply = (field, values) => {
      if (!Array.isArray(values) || values.length === 0) return;
      if (mode === 'remove') {
        update.$pull = { ...(update.$pull || {}), [field]: { $in: values } };
      } else {
        update.$addToSet = { ...(update.$addToSet || {}), [field]: { $each: values } };
      }
    };
    apply('tags', tags);
    apply('segments', segments);
    if (!Object.keys(update).length) {
      return res.status(400).json({ success: false, message: '请选择要分配的标签或分组' });
    }
    const r = await Contact.updateMany({ _id: { $in: ids }, workspace: req.workspace._id }, update);
    res.json({ success: true, message: `已更新 ${r.modifiedCount} 个联系人` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
router.get('/export', exportContacts);
// FEAT-01：启动“删除所有匹配的联系人”后台任务。
// body: { confirm: 'DELETE', filter: { search?, tag?, status?, channel? }, expectedCount? }
router.post('/delete-all', denyAgentDelete, requireWorkspaceAdmin, async (req, res) => {
  try {
    const Contact = require('../models/Contact');
    const wsId = String(req.workspace._id);
    const { confirm, filter = {}, expectedCount } = req.body || {};
    if (confirm !== 'DELETE') {
      return res.status(400).json({ success: false, message: '请输入 DELETE 确认删除' });
    }
    const existing = deleteAllJobs.get(wsId);
    if (existing?.running) {
      return res.status(409).json({ success: false, message: '已有删除任务在进行中，请等待其完成' });
    }

    const query = buildDeleteAllQuery(req.workspace._id, filter);
    const total = await Contact.countDocuments(query);
    if (!total) {
      return res.status(400).json({ success: false, message: '没有匹配的联系人' });
    }
    // 数量与前端确认时看到的不一致（期间有增删）→ 409 让前端刷新后重新确认
    if (expectedCount !== undefined && Number(expectedCount) !== total) {
      return res.status(409).json({ success: false, message: `匹配的联系人数量已变化（当前 ${total}），请刷新后重新确认` });
    }

    const job = { running: true, total, deleted: 0, startedAt: new Date(), error: '' };
    deleteAllJobs.set(wsId, job);
    // 后台异步执行，立即返回；进度走 socket（contacts_delete_progress）+ status 接口
    runDeleteAllJob(req.workspace, query, job, req.user).catch(() => {});

    res.json({ success: true, message: `正在删除 ${total} 个联系人...`, data: { total } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
// FEAT-01：查询删除任务进度（必须注册在 GET /:id 之前，否则会被参数路由截走）
router.get('/delete-all/status', (req, res) => {
  const job = deleteAllJobs.get(String(req.workspace._id)) || null;
  res.json({
    success: true,
    data: job ? { running: job.running, total: job.total, deleted: job.deleted, startedAt: job.startedAt, error: job.error || '' } : null,
  });
});
router.get('/:id', getContact);
router.put('/:id', updateContact);
router.delete('/:id', denyAgentDelete, deleteContact);

module.exports = router;
