const router = require('express').Router();
const { requireFeature } = require('../middleware/featureGate');
const { protect, workspaceAccess, denyAgent } = require('../middleware/auth');
const {
  getBotFlows, getBotFlow, createBotFlow, updateBotFlow, deleteBotFlow, generateBotFlow, createPresetFlow,
  exportBotFlow, importBotFlow, botFlowReport, marketplaceList, marketplaceItem, marketplaceInstall,
} = require('../controllers/botFlowController');

router.use(protect, workspaceAccess, denyAgent); // SEC-AGENT：机器人流程是管理配置
router.use(requireFeature('botFlows'));
router.get('/', getBotFlows);
router.post('/', createBotFlow);
router.post('/generate', generateBotFlow);
router.post('/preset', createPresetFlow);
router.get('/report', botFlowReport);
router.get('/marketplace', marketplaceList);
router.get('/marketplace/:id', marketplaceItem);
router.post('/marketplace/:id/install', marketplaceInstall);
router.post('/import', importBotFlow);
router.get('/:id/export', exportBotFlow);
router.get('/:id', getBotFlow);
router.put('/:id', updateBotFlow);
router.delete('/:id', deleteBotFlow);

module.exports = router;
