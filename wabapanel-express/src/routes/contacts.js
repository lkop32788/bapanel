const router = require('express').Router();
const { requireFeature } = require('../middleware/featureGate');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
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
router.get('/:id', getContact);
router.put('/:id', updateContact);
router.delete('/:id', denyAgentDelete, deleteContact);

module.exports = router;
