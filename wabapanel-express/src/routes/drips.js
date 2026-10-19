const router = require('express').Router();
const { requireFeature } = require('../middleware/featureGate');
const { protect, workspaceAccess, denyAgent } = require('../middleware/auth');
const {
  getDrips, getDrip, createDrip, updateDrip, deleteDrip, startDrip, pauseDrip,
} = require('../controllers/dripController');

router.use(protect, workspaceAccess, denyAgent); // SEC-AGENT：滴灌营销是管理功能
router.use(requireFeature('drips'));
router.get('/', getDrips);
router.post('/', createDrip);
router.get('/:id', getDrip);
router.put('/:id', updateDrip);
router.delete('/:id', deleteDrip);
router.post('/:id/start', startDrip);
router.post('/:id/pause', pauseDrip);

module.exports = router;
