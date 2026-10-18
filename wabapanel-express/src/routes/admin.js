const router = require('express').Router();
const { protect, adminOnly, superAdminOnly } = require('../middleware/auth');
const admin = require('../controllers/adminController');

router.use(protect, adminOnly);

// Dashboard
const { getAdminDashboard } = require('../controllers/dashboardController');
router.get('/dashboard', getAdminDashboard);

// Users
router.get('/users', admin.getUsers);
router.get('/users/:id', admin.getUser);
router.post('/users', admin.createUser);
router.put('/users/:id', admin.updateUser);
router.delete('/users/:id', admin.deleteUser);

// Vendors
router.get('/feature-controls', admin.getFeatureControls);
router.put('/feature-controls/:vendorId', admin.updateFeatureControls);
router.get('/data-cleanup', admin.getDataCleanup);
router.put('/data-cleanup', admin.updateDataCleanup);
router.post('/data-cleanup/run', admin.runDataCleanup);
router.get('/vendors', admin.getVendors);
router.get('/vendors/:id', admin.getVendor);
router.post('/vendors', admin.createVendor);
router.put('/vendors/:id', admin.updateVendor);
router.delete('/vendors/:id', admin.deleteVendor);
router.post('/vendors/:id/login-as', admin.loginAsVendor);

// Meta Pricing
router.get('/meta-pricing', admin.getMetaPricing);
router.post('/meta-pricing', admin.updateMetaPricing);

// Permissions
router.get('/permissions', admin.getPermissions);
router.put('/permissions', admin.updatePermissions);

// System Settings
router.get('/settings', admin.getSettings);
router.put('/settings', superAdminOnly, admin.updateSettings);
router.post('/settings/test-email', superAdminOnly, admin.sendTestEmail);

// AI Settings
router.get('/ai-settings', admin.getAISettings);
router.put('/ai-settings', admin.updateAISettings);

// Per-vendor AI provider/key assignment
router.get('/vendor-ai', admin.getVendorAiAssignments);
router.put('/vendor-ai/:vendorId', admin.updateVendorAiAssignment);

// Push knowledge-base articles to vendor workspaces
router.post('/push-knowledge', admin.pushKnowledgeToVendors);

// Landing Page
router.get('/landing-page', admin.getLandingPage);
router.put('/landing-page', admin.updateLandingPage);

// Site Content (full website customization)
router.get('/site-content', admin.getSiteContent);
router.put('/site-content', superAdminOnly, admin.updateSiteContent);

// Global Templates
router.get('/templates', admin.getGlobalTemplates);
router.post('/templates', admin.createGlobalTemplate);
router.put('/templates/:id', admin.updateGlobalTemplate);
router.delete('/templates/:id', admin.deleteGlobalTemplate);

// Short Links
router.get('/short-links', admin.getAdminShortLinks);
router.delete('/short-links/:id', admin.deleteAdminShortLink);

// Quick Replies
router.get('/quick-replies', admin.getQuickReplies);
router.post('/quick-replies', admin.createQuickReply);
router.put('/quick-replies/:id', admin.updateQuickReply);
router.delete('/quick-replies/:id', admin.deleteQuickReply);

// Languages
router.get('/languages', admin.getLanguages);
router.post('/languages', admin.createLanguage);
router.post('/languages/seed', admin.seedLanguages);
router.put('/languages/:id', admin.updateLanguage);
router.delete('/languages/:id', admin.deleteLanguage);

// FAQs
router.get('/faqs', admin.getFAQs);
router.post('/faqs', admin.createFAQ);
router.put('/faqs/:id', admin.updateFAQ);
router.delete('/faqs/:id', admin.deleteFAQ);

// Testimonials
router.get('/testimonials', admin.getTestimonials);
router.post('/testimonials', admin.createTestimonial);
router.put('/testimonials/:id', admin.updateTestimonial);
router.delete('/testimonials/:id', admin.deleteTestimonial);

// Pages
router.get('/pages', admin.getPages);
router.post('/pages', admin.createPage);
router.put('/pages/:id', admin.updatePage);
router.delete('/pages/:id', admin.deletePage);

// Vendor Detail
router.get('/vendors/:id/detail', admin.getVendorDetail);

// Knowledge Base CRUD
router.get("/knowledge", admin.getKnowledgeArticles);
router.post("/knowledge", admin.createKnowledgeArticle);
router.put("/knowledge/:id", admin.updateKnowledgeArticle);
router.delete("/knowledge/:id", admin.deleteKnowledgeArticle);

module.exports = router;
