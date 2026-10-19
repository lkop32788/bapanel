const Campaign = require('../models/Campaign');
const Contact = require('../models/Contact');
const WhatsAppService = require('../services/whatsappService');
const { sendPaginated } = require('../utils/apiResponse');

const getDrips = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const query = { workspace: req.workspace._id, type: 'drip' };
    if (status) query.status = status;

    const total = await Campaign.countDocuments(query);
    const drips = await Campaign.find(query)
      .populate('template', 'name category status')
      .populate('createdBy', 'name email')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    sendPaginated(res, drips, total, page, limit);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getDrip = async (req, res) => {
  try {
    const drip = await Campaign.findOne({
      _id: req.params.id,
      workspace: req.workspace._id,
      type: 'drip',
    })
      .populate('template')
      .populate('createdBy', 'name email');

    if (!drip) {
      return res.status(404).json({ success: false, message: 'Drip campaign not found' });
    }
    res.json({ success: true, data: drip });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// SEC-IDOR：template 等引用必须归属本工作区（populate 泄露防护）
const assertDripRefs = async (req, body) => {
  const assertRef = require('../utils/assertWorkspaceRef');
  await assertRef(require('../models/Template'), body.template, req.workspace._id, '模板');
  await assertRef(require('../models/PresetMessage'), body.presetMessage, req.workspace._id, '预设消息');
};

const createDrip = async (req, res) => {
  try {
    await assertDripRefs(req, req.body);
    const body = require('../utils/stripProtected')(req.body, ['stats', 'status', 'type']);
    const drip = await Campaign.create({
      ...body,
      type: 'drip',
      workspace: req.workspace._id,
      createdBy: req.user._id,
      status: 'draft',
      stats: undefined,
    });
    res.status(201).json({ success: true, data: drip });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

const updateDrip = async (req, res) => {
  try {
    await assertDripRefs(req, req.body); // SEC-IDOR
    const drip = await Campaign.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id, type: 'drip' },
      (({ workspace, stats, createdBy, _id, status, type, ...rest }) => rest)(req.body),
      { new: true, runValidators: true }
    );
    if (!drip) {
      return res.status(404).json({ success: false, message: 'Drip campaign not found' });
    }
    res.json({ success: true, data: drip });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteDrip = async (req, res) => {
  try {
    const drip = await Campaign.findOneAndDelete({
      _id: req.params.id,
      workspace: req.workspace._id,
      type: 'drip',
    });
    if (!drip) {
      return res.status(404).json({ success: false, message: 'Drip campaign not found' });
    }
    res.json({ success: true, message: 'Drip campaign deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const startDrip = async (req, res) => {
  try {
    const drip = await Campaign.findOne({
      _id: req.params.id,
      workspace: req.workspace._id,
      type: 'drip',
    }).populate('template');

    if (!drip) {
      return res.status(404).json({ success: false, message: 'Drip campaign not found' });
    }

    if (!req.workspace.whatsapp?.isConnected) {
      return res.status(400).json({ success: false, message: 'WhatsApp not connected' });
    }

    if (!drip.dripSteps || drip.dripSteps.length === 0) {
      return res.status(400).json({ success: false, message: 'No drip steps configured' });
    }

    // SEC-CONC：暂停且已初始化过的滴灌 = 恢复（原子 paused→running，从当前步继续，
    // 不重发第 0 步）；其余状态统一走调度器启动（原子转 scheduled，由 _startDrip
    // 初始化 contactIds/currentStep/stepSentAt 并执行第 0 步）。原先直接置 running
    // 但不初始化 variables——步骤处理器会因 stepSentAt 缺失跳过延迟检查且漏发第 0 步
    if (drip.status === 'paused' && drip.variables && drip.variables.contactIds) {
      const resumed = await Campaign.findOneAndUpdate(
        { _id: drip._id, workspace: req.workspace._id, status: 'paused' },
        { $set: { status: 'running' } }, { new: true });
      if (!resumed) return res.status(409).json({ success: false, message: '滴灌任务状态已变化，请刷新' });
      return res.json({ success: true, data: resumed, message: 'Drip campaign resumed' });
    }
    const q = await Campaign.findOneAndUpdate(
      { _id: drip._id, workspace: req.workspace._id, status: { $in: ['draft', 'paused', 'scheduled', 'failed'] } },
      { $set: { status: 'scheduled', scheduledAt: new Date(), startedAt: drip.startedAt || new Date() } },
      { new: true });
    if (!q) return res.status(409).json({ success: false, message: '滴灌任务已在运行中或已完成' });

    res.json({ success: true, data: q, message: 'Drip campaign started' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const pauseDrip = async (req, res) => {
  try {
    const drip = await Campaign.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id, type: 'drip' },
      { status: 'paused' },
      { new: true }
    );
    if (!drip) {
      return res.status(404).json({ success: false, message: 'Drip campaign not found' });
    }
    res.json({ success: true, data: drip, message: 'Drip campaign paused' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getDrips, getDrip, createDrip, updateDrip, deleteDrip, startDrip, pauseDrip };
