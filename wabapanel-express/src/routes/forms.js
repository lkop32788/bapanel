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
      // SEC-XSS：mimetype 是客户端自报的，必须同时用扩展名白名单双重校验
      if (!/^(image\/|application\/pdf|application\/msword|application\/vnd\.openxmlformats|text\/plain)/.test(req.file.mimetype || '')
        || !/\.(jpe?g|png|gif|webp|pdf|docx?|xlsx?|txt)$/i.test(req.file.originalname || '')) {
        return res.status(400).json({ success: false, message: '只支持图片（jpg/png/gif/webp）、PDF、Word、Excel、txt 文件' });
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

// 表单模板库（本地定制）：必须注册在 '/:id' 之前，否则 'library' 会被当成表单 id
const formLibrary = require('../services/formLibrary');

// GET /api/forms/library — 返回内置模板目录与分类
router.get('/library', (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        templates: formLibrary.listTemplates(),
        categories: formLibrary.listCategories(),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/forms/library/:templateId/use — 按模板为当前 workspace 创建表单
router.post('/library/:templateId/use', async (req, res) => {
  try {
    const template = formLibrary.getTemplate(req.params.templateId);
    if (!template) return res.status(404).json({ success: false, message: '模板不存在' });

    const Form = require('../models/Form');
    const form = await Form.create({
      workspace: req.workspace._id,
      name: (req.body && req.body.name && String(req.body.name).trim()) || template.name,
      description: template.description,
      fields: template.fields,
      // isActive/状态等其余字段按模型默认值（status: 'active'、autoCreateContact: true）
    });
    res.status(201).json({ success: true, data: form });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:id', getForm);
router.put('/:id', updateForm);
router.post('/:id/publish-flow', publishFlow);
router.post('/:id/send-flow', sendFlow);
router.delete('/:id', deleteForm);

module.exports = router;
