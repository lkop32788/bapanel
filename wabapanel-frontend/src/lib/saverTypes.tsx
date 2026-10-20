// 省钱专家：th333 全部检测类型目录（侧边栏菜单和检测页共用）
// 按平台分组：一个平台一个菜单页，组内类型用 tab 切换。
// input: 上传内容（phone 号码 / email 邮箱 / username 用户名）；country: 是否需要选国家
import type { IconType } from 'react-icons';
import {
  FaWhatsapp, FaTelegram, FaFacebook, FaInstagram, FaTwitter, FaSnapchatGhost,
  FaLinkedin, FaLine, FaViber, FaWeixin, FaAmazon, FaBitcoin, FaApple,
} from 'react-icons/fa';
import { Phone, MessageCircle, Music2, Wrench } from 'lucide-react';

export interface SaverTypeDef {
  value: string;      // th333 taskType
  tab: string;        // 页内 tab 名
  name: string;       // 完整名称（任务名默认值、标题）
  input: 'phone' | 'email' | 'username';
  country: boolean;
  hint?: string;
}

export interface SaverGroupDef {
  slug: string;       // 路由 /client/saver/<slug>
  name: string;       // 菜单名
  Icon: IconType | React.ComponentType<{ className?: string }>;
  color: string;
  types: SaverTypeDef[];
}

const T = (value: string, tab: string, name: string,
  opts: Partial<Pick<SaverTypeDef, 'input' | 'country' | 'hint'>> = {}): SaverTypeDef =>
  ({ value, tab, name, input: 'phone', country: true, ...opts });

export const SAVER_GROUPS: SaverGroupDef[] = [
  { slug: 'ws', name: 'WS客户状态', Icon: FaWhatsapp, color: 'text-green-600', types: [
    T('wsValid', '筛开通', 'WS筛开通', { hint: '检测号码是否注册了 WhatsApp' }),
    T('wsActive', '筛活跃', 'WS筛活跃', { hint: '检测 WhatsApp 号码近期是否活跃上线' }),
    T('wsGender', '性别年龄', 'WS性别年龄', { hint: '检测开通号码的性别和年龄' }),
  ] },
  { slug: 'tg', name: 'TG客户状态', Icon: FaTelegram, color: 'text-sky-500', types: [
    T('tgValid', '筛开通', 'TG筛开通', { hint: '检测号码是否注册了 Telegram' }),
    T('tgActive', '筛活跃', 'TG筛活跃', { hint: '检测 Telegram 号码近期是否活跃上线' }),
    T('tgGender', '性别年龄', 'TG性别年龄', { hint: '检测开通号码的性别和年龄' }),
    T('tgNameValid', '用户名筛活', 'TG用户名筛活', { input: 'username', hint: '按 Telegram 用户名检测是否存活' }),
  ] },
  { slug: 'facebook', name: 'Facebook检测', Icon: FaFacebook, color: 'text-blue-600', types: [
    T('fbValid', '筛开通', 'Facebook筛开通'),
    T('fbGender', '性别年龄', 'Facebook性别年龄'),
    T('fbUid', 'UID检测', 'Facebook UID检测', { hint: '每行一个 Facebook UID' }),
    T('fbEmail', '邮箱检测', 'Facebook邮箱检测', { input: 'email', country: false }),
  ] },
  { slug: 'instagram', name: 'Instagram检测', Icon: FaInstagram, color: 'text-pink-600', types: [
    T('insValid', '筛开通', 'Instagram筛开通'),
    T('insEmail', '邮箱检测', 'Instagram邮箱检测', { input: 'email', country: false }),
  ] },
  { slug: 'twitter', name: 'Twitter检测', Icon: FaTwitter, color: 'text-sky-400', types: [
    T('twitterValid', '筛开通', 'Twitter筛开通'),
    T('twitterEmail', '邮箱检测', 'Twitter邮箱检测', { input: 'email', country: false }),
  ] },
  { slug: 'snapchat', name: 'Snapchat检测', Icon: FaSnapchatGhost, color: 'text-yellow-500', types: [
    T('snapchatValid', '筛开通', 'Snapchat筛开通'),
  ] },
  { slug: 'linkedin', name: '领英检测', Icon: FaLinkedin, color: 'text-blue-700', types: [
    T('linkedinValid', '筛开通', '领英筛开通'),
    T('linkedinGender', '性别年龄', '领英性别年龄'),
  ] },
  { slug: 'tiktok', name: 'Tiktok检测', Icon: Music2, color: 'text-rose-500', types: [
    T('tiktokUser', '用户名检测', 'Tiktok用户名检测', { input: 'username', hint: '每行一个 Tiktok 用户名' }),
  ] },
  { slug: 'line', name: 'Line检测', Icon: FaLine, color: 'text-green-500', types: [
    T('lineValid', '筛开通', 'Line筛开通'),
    T('lineGender', '性别年龄', 'Line性别年龄'),
  ] },
  { slug: 'signal', name: 'Signal检测', Icon: MessageCircle, color: 'text-blue-500', types: [
    T('signalValid', '筛开通', 'Signal筛开通'),
  ] },
  { slug: 'viber', name: 'Viber检测', Icon: FaViber, color: 'text-purple-600', types: [
    T('viberValid', '筛开通', 'Viber筛开通'),
    T('viberGender', '性别年龄', 'Viber性别年龄'),
    T('viberActive', '筛活跃', 'Viber筛活跃'),
  ] },
  { slug: 'botim', name: 'Botim检测', Icon: MessageCircle, color: 'text-cyan-600', types: [
    T('botimValid', '筛开通', 'Botim筛开通'),
    T('botimGender', '性别年龄', 'Botim性别年龄'),
  ] },
  { slug: 'zalo', name: 'Zalo检测', Icon: MessageCircle, color: 'text-blue-600', types: [
    T('zaloValid', '筛开通', 'Zalo筛开通'),
    T('zaloGender', '性别年龄', 'Zalo性别年龄'),
    T('zaloGenderQuick', '性别年龄极速', 'Zalo性别年龄极速'),
    T('zaloActive', '筛活跃', 'Zalo筛活跃'),
  ] },
  { slug: 'wechat', name: '微信检测', Icon: FaWeixin, color: 'text-green-600', types: [
    T('wxValid', '筛开通', '微信筛开通'),
    T('wxAll', '全检测', '微信全检测'),
  ] },
  { slug: 'phone', name: '号码检测', Icon: Phone, color: 'text-gray-600', types: [
    T('phoneCheck', '空号检测', '空号检测'),
    T('phoneActive', '活跃检测', '号码活跃检测'),
    T('operatorStandard', '运营商', '运营商检测'),
    T('numberStatus', '手机型号', '手机型号检测'),
    T('phoneRoaming', '开关机状态', '开关机状态检测'),
    T('phoneUsCarrier', '美国运营商', '美国运营商精准检测', { hint: '仅支持美国号码' }),
    T('phoneDnd', '美国勿扰', '美国勿扰号码检测', { hint: '仅支持美国号码' }),
    T('rcsSystem', 'RCS系统', 'RCS系统检测'),
  ] },
  { slug: 'ios', name: 'iOS检测', Icon: FaApple, color: 'text-gray-700', types: [
    T('iosBlueValid', '筛蓝号', 'iOS筛蓝号', { hint: 'iMessage 蓝号检测' }),
    T('iosValid', '筛开通', 'iOS筛开通'),
    T('iosAll', '全检测', 'iOS全检测'),
  ] },
  { slug: 'amazon', name: '亚马逊检测', Icon: FaAmazon, color: 'text-amber-600', types: [
    T('amazonValid', '筛开通', '亚马逊筛开通'),
    T('amazonEmail', '邮箱检测', '亚马逊邮箱检测', { input: 'email', country: false }),
  ] },
  { slug: 'other', name: '其他服务', Icon: Wrench, color: 'text-gray-500', types: [
    T('teamsValid', 'Teams', 'Teams筛开通'),
    T('sidelineValid', 'Sideline', 'Sideline筛开通'),
    T('dhlValid', 'DHL', 'DHL筛开通'),
  ] },
  { slug: 'exchange', name: '交易所检测', Icon: FaBitcoin, color: 'text-yellow-500', types: [
    T('binanceValid', '币安', '币安筛开通'),
    T('okxValid', 'OKX', 'OKX筛开通'),
    T('htxValid', '火币', '火币筛开通'),
    T('kucoinValid', 'KuCoin', 'KuCoin筛开通'),
    T('coinwValid', 'CoinW', 'CoinW筛开通'),
    T('mexcValid', 'MEXC', 'MEXC筛开通'),
  ] },
];

export const SAVER_GROUP_MAP: Record<string, SaverGroupDef> =
  Object.fromEntries(SAVER_GROUPS.map(g => [g.slug, g]));

// 后端按渠道校验 taskType，这里保持同一映射规则
export const saverChannelOf = (value: string): 'whatsapp' | 'telegram' | 'more' =>
  value.startsWith('ws') ? 'whatsapp' : value.startsWith('tg') ? 'telegram' : 'more';
