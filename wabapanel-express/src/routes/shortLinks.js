const router = require('express').Router();
const { requireFeature } = require('../middleware/featureGate');
const { protect, workspaceAccess } = require('../middleware/auth');
const { getShortLinks, createShortLink, updateShortLink, deleteShortLink, redirectShortLink, getShortLinkStats, getShortLinkQr } = require('../controllers/shortLinkController');

router.get('/r/:code', redirectShortLink); // Public route
router.get('/:id/qr', getShortLinkQr); // 公开：<img src> 无法携带认证头
router.use(protect, workspaceAccess);
router.use(requireFeature('shortLinks'));
router.get('/', getShortLinks);
router.get('/:id/stats', getShortLinkStats);
router.post('/', createShortLink);
router.put('/:id', updateShortLink);
router.delete('/:id', deleteShortLink);

module.exports = router;
