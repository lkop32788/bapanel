const router = require('express').Router();
const { requireFeature } = require('../middleware/featureGate');
const { protect, workspaceAccess } = require('../middleware/auth');
const { getTemplates, createTemplate, updateTemplate, deleteTemplate, syncTemplates } = require('../controllers/templateController');

router.use(protect, workspaceAccess);
router.use(requireFeature('templates'));
router.get('/library', async (req, res) => {
  try {
    const library = require('../config/templateLibrary.json');
    const Template = require('../models/Template');
    const existing = await Template.find({ workspace: req.workspace._id })
      .select('name language').lean();
    const added = new Set(existing.map(t => `${t.name}:${t.language}`));
    const { industry, search } = req.query;
    const query = String(search || '').trim().toLowerCase();
    const templates = library.templates
      .filter(t => !industry || industry === 'all' || t.industry === industry)
      .filter(t => !query || `${t.name} ${t.title} ${t.body} ${t.industryLabel}`.toLowerCase().includes(query))
      .map(t => ({ ...t, alreadyAdded: added.has(`${t.name}:${t.language}`) }));
    res.json({ success: true, data: { industries: library.industries, templates } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
router.get('/', getTemplates);
router.post('/', createTemplate);
router.post('/sync', syncTemplates);
router.put('/:id', updateTemplate);
router.delete('/:id', deleteTemplate);

module.exports = router;
