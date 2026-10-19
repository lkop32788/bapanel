const router = require('express').Router();
const { requireFeature } = require('../middleware/featureGate');
const { protect, workspaceAccess, denyAgent } = require('../middleware/auth');
const {
  getSmartTemplates, createSmartTemplate, updateSmartTemplate, deleteSmartTemplate, sendSmartBroadcast, stopSmartCampaign, getSmartReports,
} = require('../controllers/smartBroadcastController');

router.use(protect, workspaceAccess, denyAgent); // SEC-AGENT：智能群发是管理功能
router.use(requireFeature('smartBroadcast'));

router.get('/templates', getSmartTemplates);
router.post('/templates', createSmartTemplate);
router.put('/templates/:id', updateSmartTemplate);
router.delete('/templates/:id', deleteSmartTemplate);
router.post('/send', sendSmartBroadcast);
router.post('/campaigns/:id/stop', stopSmartCampaign);
router.get('/reports', getSmartReports);

module.exports = router;
