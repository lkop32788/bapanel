const router = require('express').Router();
const { protect, workspaceParamMember, workspaceParamOwner } = require('../middleware/auth');
const {
  getWorkspaces, createWorkspace, getWorkspace, updateWorkspace,
  deleteWorkspace, addMember, removeMember, updateWhatsAppConfig, refreshWhatsAppDetails, getWhatsAppHealth,
} = require('../controllers/workspaceController');
const {
  handleEmbeddedSignup, getEmbeddedSignupConfig, disconnectWhatsApp,
} = require('../controllers/embeddedSignupController');

router.use(protect);
router.get('/', getWorkspaces);
router.post('/', createWorkspace);
router.get('/:id', workspaceParamMember, getWorkspace);
router.put('/:id', workspaceParamOwner, updateWorkspace);
router.delete('/:id', workspaceParamOwner, deleteWorkspace);
router.post('/:id/members', workspaceParamOwner, addMember);
router.delete('/:id/members/:userId', workspaceParamOwner, removeMember);
router.put('/:id/whatsapp', workspaceParamOwner, updateWhatsAppConfig);
router.post("/:id/whatsapp/refresh", workspaceParamMember, refreshWhatsAppDetails);
router.get('/:id/whatsapp/health', workspaceParamMember, getWhatsAppHealth);
router.post('/:id/whatsapp/embedded-signup', workspaceParamOwner, handleEmbeddedSignup);
router.get('/:id/whatsapp/embedded-signup/config', workspaceParamMember, getEmbeddedSignupConfig);
router.post('/:id/whatsapp/disconnect', workspaceParamOwner, disconnectWhatsApp);

module.exports = router;
