const router = require('express').Router();
const { triggerFlowByWebhook } = require('../services/botFlowEngine');
const { LEAD_SOURCES, SOURCE_LABELS, mapLeadPayload, runAutomation, isDuplicateEvent } = require('../services/integrationAutomation');
const Integration = require('../models/Integration');

// If a webhook secret is set for the integration, the ?key= query must match
async function secretOk(workspaceId, type, req) {
  const integration = await Integration.findOne({ workspace: workspaceId, type }).select('webhookSecret').lean();
  if (!integration || !integration.webhookSecret) return true;
  return req.query.key === integration.webhookSecret;
}

// Generic lead-source webhook: IndiaMART, Justdial, TradeIndia, website forms, etc.
// POST/GET /api/ext/lead/:workspaceId/:source
const handleLead = async (req, res) => {
  try {
    const source = req.params.source;
    if (!LEAD_SOURCES.includes(source)) return res.status(404).json({ success: false, message: 'Unknown lead source' });
    if (!(await secretOk(req.params.workspaceId, source, req))) {
      return res.status(401).json({ success: false, message: 'Invalid webhook key' });
    }
    const payload = { ...(req.query || {}), ...(req.body || {}) };
    delete payload.key;
    const lead = mapLeadPayload(source, payload);
    if (!lead.phone) return res.status(200).json({ success: false, message: 'No phone number found in payload' });
    if (await isDuplicateEvent(req.params.workspaceId, [source, 'lead', lead.phone, lead.email, lead.detail])) {
      return res.status(200).json({ success: true, sent: false, message: 'Duplicate lead ignored' });
    }
    const result = await runAutomation({
      workspaceId: req.params.workspaceId,
      type: source,
      event: 'lead',
      phone: lead.phone,
      name: lead.name,
      email: lead.email,
      tags: [source, 'lead'],
      vars: [lead.name || 'there', SOURCE_LABELS[source] || source],
    });
    res.status(200).json({ success: result.ok, sent: result.sent || false, message: result.reason || result.error || 'Lead received' });
  } catch (error) {
    console.error('[LeadWebhook] error:', error.message);
    res.status(200).json({ success: false, message: error.message });
  }
};
router.post('/lead/:workspaceId/:source', handleLead);
router.get('/lead/:workspaceId/:source', handleLead);

// POST /api/ext/webhook/:workspaceId/:flowId — trigger a bot flow for a phone number
router.post('/webhook/:workspaceId/:flowId', async (req, res) => {
  try {
    const { phone, data } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'phone is required' });
    const result = await triggerFlowByWebhook({
      workspaceId: req.params.workspaceId,
      flowId: req.params.flowId,
      phone,
      data: data || {},
    });
    res.json({ success: result.ok, ...result });
  } catch (error) {
    console.error('[ExtWebhook] trigger error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
