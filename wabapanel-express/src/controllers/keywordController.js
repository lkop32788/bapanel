const Keyword = require('../models/Keyword');

const getKeywords = async (req, res) => {
  try {
    const keywords = await Keyword.find({ workspace: req.workspace._id })
      .populate('responseTemplate', 'name category')
      .populate('automation', 'name')
      .sort('-createdAt');
    res.json({ success: true, data: keywords });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getKeyword = async (req, res) => {
  try {
    const keyword = await Keyword.findOne({
      _id: req.params.id,
      workspace: req.workspace._id,
    })
      .populate('responseTemplate')
      .populate('automation');

    if (!keyword) {
      return res.status(404).json({ success: false, message: 'Keyword not found' });
    }
    res.json({ success: true, data: keyword });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// SEC-IDOR：responseTemplate/automation 引用必须归属本工作区
// （否则 populate 会把他人模板/自动化全文回显，机器人还会拿他人内容回复）
const assertKeywordRefs = async (req, body) => {
  if (body.responseTemplate) {
    const ok = await require('../models/Template').exists({ _id: body.responseTemplate, workspace: req.workspace._id });
    if (!ok) { const e = new Error('无效的回复模板'); e.status = 400; throw e; }
  }
  if (body.automation) {
    const ok = await require('../models/Automation').exists({ _id: body.automation, workspace: req.workspace._id });
    if (!ok) { const e = new Error('无效的自动化'); e.status = 400; throw e; }
  }
};

const createKeyword = async (req, res) => {
  try {
    const body = require('../utils/stripProtected')(req.body);
    await assertKeywordRefs(req, body);
    const keyword = await Keyword.create({
      ...body,
      workspace: req.workspace._id,
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, data: keyword });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

const updateKeyword = async (req, res) => {
  try {
    const body = require('../utils/stripProtected')(req.body);
    await assertKeywordRefs(req, body);
    const keyword = await Keyword.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      body,
      { new: true, runValidators: true }
    );
    if (!keyword) {
      return res.status(404).json({ success: false, message: 'Keyword not found' });
    }
    res.json({ success: true, data: keyword });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteKeyword = async (req, res) => {
  try {
    const keyword = await Keyword.findOneAndDelete({
      _id: req.params.id,
      workspace: req.workspace._id,
    });
    if (!keyword) {
      return res.status(404).json({ success: false, message: 'Keyword not found' });
    }
    res.json({ success: true, message: 'Keyword deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getKeywords, getKeyword, createKeyword, updateKeyword, deleteKeyword };
