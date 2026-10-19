const router = require('express').Router();
const { triggerFlowByWebhook } = require('../services/botFlowEngine');
const { LEAD_SOURCES, SOURCE_LABELS, mapLeadPayload, runAutomation, isDuplicateEvent } = require('../services/integrationAutomation');
const Integration = require('../models/Integration');

const crypto = require('crypto');
const tsEqual = (a, b) => {
  const ba = Buffer.from(String(a || '')); const bb = Buffer.from(String(b || ''));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};

// SEC-PUB：未配置 webhookSecret 的渠道一律拒绝（原先缺省放行=任何人可驱动商家号发消息）；
// 比较改常数时间
async function secretOk(workspaceId, type, req) {
  const integration = await Integration.findOne({ workspace: workspaceId, type }).select('webhookSecret').lean();
  if (!integration || !integration.webhookSecret) return false;
  return tsEqual(req.query.key, integration.webhookSecret);
}


// Generic lead-source webhook: IndiaMART, Justdial, TradeIndia, website forms, etc.
// POST/GET /api/ext/lead/:workspaceId/:source
const handleLead = async (req, res) => {
  try {
    const source = req.params.source;
    if (!LEAD_SOURCES.includes(source)) return res.status(404).json({ success: false, message: 'Unknown lead source' });
    if (!(await secretOk(req.params.workspaceId, source, req))) {
      return res.status(401).json({ success: false, message: '请先在集成设置里配置 webhook 密钥，并在回调 URL 加上 ?key=<密钥>' });
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
    // SEC-PUB：必须带 ?key= 且与流程存储的 webhookKey 一致（流程页「生成密钥」按钮
    // 生成/轮换；原先裸 workspaceId+flowId 即可驱动商家号对外发消息）
    const flow = await require('../models/BotFlow')
      .findOne({ _id: req.params.flowId, workspace: req.params.workspaceId })
      .select('webhookKey').lean().catch(() => null);
    if (!flow || !flow.webhookKey || !tsEqual(req.query.key, flow.webhookKey)) {
      return res.status(401).json({ success: false, message: '无效的触发密钥：请在机器人流程页点「生成密钥」并使用带 ?key= 的完整 URL' });
    }
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
