const router = require('express').Router();
const { requireFeature } = require('../middleware/featureGate');
const { protect, workspaceAccess } = require('../middleware/auth');
const { getForms, createForm, getForm, getPublicForm, updateForm, deleteForm, submitForm, publishFlow, sendFlow } = require('../controllers/formController');

router.post('/:id/submit', submitForm); // Public route
router.get("/:id/public", getPublicForm);

// 公开表单文件上传：仅当表单存在且含文件字段时允许（终端客户填表附件用）
const formUploadMulter = require('multer')({
  storage: require('multer').memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});
router.post('/:id/upload', (req, res) => {
  formUploadMulter.single('file')(req, res, async (err) => {
    try {
      if (err) return res.status(400).json({ success: false, message: '文件过大（上限 8MB）' });
      if (!req.file) return res.status(400).json({ success: false, message: '缺少文件' });
      if (!/^(image\/|application\/pdf|application\/msword|application\/vnd\.openxmlformats|text\/plain)/.test(req.file.mimetype || '')) {
        return res.status(400).json({ success: false, message: '只支持图片、PDF、Word、文本文件' });
      }
      const Form = require('../models/Form');
      const form = await Form.findById(req.params.id).lean().catch(() => null);
      const acceptsFile = form && (form.fields || []).some(f => f && f.type === 'file');
      if (!acceptsFile) return res.status(404).json({ success: false, message: '表单不存在或不接受文件' });

      const s3Service = require('../services/s3Service');
      const SystemSettings = require('../models/SystemSettings');
      const settings = await SystemSettings.findOne();
      if (settings?.aws?.accessKeyId) s3Service.initFromSettings(settings);
      const result = await s3Service.upload(req.file, 'form-uploads');
      let url = result.url;
      if (result.bucket === 'local') {
        const baseUrl = process.env.BACKEND_URL || (`${req.protocol}://${req.get('host')}`);
        url = baseUrl + (result.url.startsWith('/uploads/') ? '/api' + result.url : result.url);
      }
      res.json({ success: true, data: { url } });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  });
});
router.use(protect, workspaceAccess);
router.use(requireFeature('forms'));
router.get('/', getForms);
router.post('/', createForm);
router.get('/:id', getForm);
router.put('/:id', updateForm);
router.post('/:id/publish-flow', publishFlow);
router.post('/:id/send-flow', sendFlow);
router.delete('/:id', deleteForm);

module.exports = router;
