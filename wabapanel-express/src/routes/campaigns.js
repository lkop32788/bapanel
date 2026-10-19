const router = require('express').Router();
const { requireFeature } = require('../middleware/featureGate');
const { protect, workspaceAccess, denyAgent } = require('../middleware/auth');
const {
  getCampaigns, createCampaign, getCampaign, updateCampaign,
  deleteCampaign, startCampaign, pauseCampaign,
} = require('../controllers/campaignController');

router.use(protect, workspaceAccess, denyAgent); // SEC-AGENT：群发是管理功能
router.use(requireFeature('broadcasts'));
router.get('/', getCampaigns);
router.post('/', createCampaign);
router.get('/:id', getCampaign);
router.put('/:id', updateCampaign);
router.delete('/:id', deleteCampaign);
router.post('/:id/start', startCampaign);
router.post('/:id/schedule', require('../controllers/campaignController').scheduleCampaign);
router.post('/:id/pause', pauseCampaign);
router.get('/:id/ab-results', require('../controllers/campaignController').getAbResults);
router.get('/:id/report', require('../controllers/campaignController').getCampaignReport);
router.post('/:id/resend-failed', require('../controllers/campaignController').resendFailed);

module.exports = router;
