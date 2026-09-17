import type { ReactNode } from 'react';
import { zhNavigation } from './zhNavigation';

// Translate display values only. Submitted enum values and API payloads remain unchanged.
const labels: Record<string, string> = {
  assigned: '已分配', unassigned: '未分配', unread: '未读',
  all: '全部', active: '启用', inactive: '停用', enabled: '已启用', disabled: '已停用',
  pending: '待处理', approved: '已批准', rejected: '已拒绝', suspended: '已暂停',
  completed: '已完成', confirmed: '已确认', scheduled: '已安排', cancelled: '已取消', canceled: '已取消',
  sent: '已发送', delivered: '已送达', read: '已读', failed: '失败', sending: '发送中',
  paid: '已支付', unpaid: '未支付', refunded: '已退款', expired: '已过期',
  open: '待处理', closed: '已关闭', resolved: '已解决', archived: '已归档',
  draft: '草稿', published: '已发布', connected: '已连接', disconnected: '未连接',
  online: '在线', offline: '离线', queued: '排队中', processing: '处理中',
  running: '运行中', paused: '已暂停', stopped: '已停止', success: '成功', error: '错误',
  trial: '试用', trialing: '试用中', free: '免费', monthly: '每月', yearly: '每年', annual: '每年',
  text: '文本', image: '图片', video: '视频', audio: '音频', document: '文件',
  email: '邮箱', phone: '电话', number: '数字', date: '日期', dropdown: '下拉选择',
  boolean: '是/否', checkbox: '复选框', select: '下拉选择', textarea: '多行文本',
  admin: '管理员', super_admin: '超级管理员', vendor: '商户', agent: '客服', user: '用户',
  low: '低', medium: '中', high: '高', urgent: '紧急', normal: '普通',
  general: '常规', other: '其他', none: '无', yes: '是', no: '否',
  marketing: '营销', utility: '事务通知', authentication: '身份验证',
  inbound: '呼入', outbound: '呼出', incoming: '收到', outgoing: '发出',
  manual: '手动', automatic: '自动', custom: '自定义', default: '默认',
  daily: '每天', weekly: '每周', once: '一次', recurring: '循环',
  lead: '潜在客户', customer: '客户', contact: '联系人',
};

export function translateDisplay(value: ReactNode): ReactNode {
  if (typeof value !== 'string') return value;
  return zhNavigation[value] || labels[value.toLowerCase()] || value;
}
