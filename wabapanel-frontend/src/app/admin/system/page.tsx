"use client";
import { translateDisplay } from '@/lib/zhDisplay';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect } from "react";
import { Activity, Database, Download, Trash2, RefreshCw, AlertTriangle, HeartPulse, Lightbulb, Globe, Cloud } from "lucide-react";
import api, { platformApi } from "@/lib/api";
import toast from "react-hot-toast";

interface Health {
  server: { uptime: number; loadAvg: number[]; totalMem: number; freeMem: number; cpus: number; nodeVersion: string };
  db: { state: string };
  disk: { total: string; used: string; available: string; usedPercent: string } | null;
  pm2: { name: string; status: string; uptime: number; restarts: number; memory: number; cpu: number }[];
}
interface Backup { name: string; size: number; createdAt: string; }
// FEAT-04: off-site backup status (secrets are never returned: masked strings / booleans only)
interface BackupCfg {
  enabled: boolean; target: string; time: string; keepLocal: number; keepRemote: number;
  encryptBackups: boolean; encryptionPassphrase: string; alertEmail: string;
  google: { connected: boolean; clientId: string; clientSecret: string; usesLoginClient: boolean; folderId: string; connectedAt: string | null; redirectUri: string };
  running: boolean; lastRunStartedAt: string | null; lastSuccessAt: string | null;
  lastRun: { status: string; target: string; startedAt: string | null; finishedAt: string | null; sizeBytes: number; remoteFileId: string; error: string };
  stale: boolean;
}
const errMsg = (e: unknown, d: string) => (e as { response?: { data?: { message?: string } } })?.response?.data?.message || d;
interface HealthReport {
  generated: string;
  version: string;
  overall_score: number;
  scores: Record<string, number>;
  metrics: Record<string, string>;
  critical: string[];
  warnings: string[];
  recommendations: string[];
}

const fmtBytes = (n: number) => n > 1e9 ? (n / 1e9).toFixed(2) + " GB" : n > 1e6 ? (n / 1e6).toFixed(1) + " MB" : (n / 1e3).toFixed(0) + " KB";
const fmtUptime = (s: number) => { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`; };

const scoreColor = (n: number) => n >= 90 ? "text-emerald-600" : n >= 75 ? "text-amber-600" : "text-red-600";
const scoreBar = (n: number) => n >= 90 ? "bg-emerald-500" : n >= 75 ? "bg-amber-500" : "bg-red-500";
const CAT_LABELS: Record<string, string> = { cpu: "CPU", memory: "Memory", disk: "Disk", network: "Network", security: "Security", services: "Services", website: "Website", database: "Database" };
const METRIC_GROUPS: { title: string; keys: [string, string][] }[] = [
  { title: "系统", keys: [["sys.hostname", "主机名"], ["sys.os", "OS"], ["sys.distro", "分布"], ["sys.kernel", "内核"], ["sys.arch", "架构"], ["sys.timezone", "时区"], ["sys.time", "服务器时间"], ["sys.uptime", "正常运行时间"], ["sys.boot", "上次启动"], ["sys.users", "登录用户"], ["env.type", "环境"], ["env.virtualization", "虚拟化"], ["env.cloud", "云"], ["env.panel", "控制面板"], ["env.hosting", "托管"]] },
  { title: "CPU", keys: [["cpu.model", "型号"], ["cpu.vendor", "商户"], ["cpu.sockets", "插座"], ["cpu.cores", "核心"], ["cpu.threads", "话题"], ["cpu.usage", "用法"], ["cpu.load", "负载平均"], ["cpu.freq", "频率"], ["cpu.temp", "温度"], ["cpu.top", "顶级流程"]] },
  { title: "内存", keys: [["mem.total", "总计"], ["mem.used", "已使用"], ["mem.free", "免费"], ["mem.available", "可用"], ["mem.cached", "已缓存"], ["mem.buffers", "缓冲器"], ["mem.usage", "用法"], ["mem.swap_total", "掉期总计"], ["mem.swap_used", "已使用掉期"], ["mem.swap_free", "免掉期"]] },
  { title: "存储", keys: [["disk.total", "总计"], ["disk.used", "已使用"], ["disk.free", "免费"], ["disk.usage", "用法"], ["disk.worst_pct", "最差的安装"], ["disk.inodes", "索引节点"], ["disk.type", "类型"], ["disk.smart", "SMART"], ["disk.raid", "RAID"], ["disk.io", "I/O"], ["disk.mounts", "坐骑"]] },
  { title: "网络", keys: [["net.public_ip", "公共IP"], ["net.private_ip", "私有IP"], ["net.isp", "ISP"], ["net.gateway", "网关"], ["net.dns", "DNS"], ["net.connections", "主动连接"], ["net.listen", "监听端口"], ["net.ping", "平"], ["net.loss", "丢包"], ["net.speed", "速度"]] },
  { title: "安全", keys: [["sec.firewall", "防火墙"], ["sec.fail2ban", "失败2Ban"], ["sec.mac", "SELinux/AppArmor"], ["sec.ssh_port", "SSH 端口"], ["sec.root_login", "根登录"], ["sec.failed_logins", "SSH 失败（24 小时）"], ["sec.world_writable", "世界可写"]] },
  { title: "服务", keys: [["svc.report", "检测到"], ["svc.installed", "已安装"], ["svc.down", "向下"], ["svc.node", "Node.js"]] },
  { title: "软件", keys: [["sw.php", "PHP"], ["sw.python", "Python"], ["sw.node", "Node.js"], ["sw.java", "爪哇"], ["sw.docker", "码头工人"], ["sw.git", "git"], ["sw.composer", "作曲家"], ["sw.npm", "npm"]] },
  { title: "数据库", keys: [["db.report", "状态"]] },
  { title: "容器", keys: [["docker.running", "运行"], ["docker.stopped", "已停止"], ["docker.images", "图像"], ["docker.volumes", "卷"], ["docker.unhealthy", "不健康"], ["k8s.nodes", "K8s节点"], ["k8s.pods", "K8s Pod"]] },
  { title: "最近的日志错误", keys: [["log.system", "系统"], ["log.kernel", "内核"], ["log.disk", "磁盘"], ["log.nginx", "Nginx"], ["log.apache", "阿帕奇"]] },
];
const hasVal = (v?: string) => !!v && v !== "n/a" && !/^n\/a\b/.test(v) && v.trim() !== "";

// Plain-language meaning + fix for the scanner's findings, so an admin knows whether
// a warning needs action on the server or can be ignored.
const ISSUE_HELP: { match: RegExp; help: string }[] = [
  { match: /no active firewall/i, help: "服务器未启用防火墙。要求您的主机/服务器管理员启用 UFW 或防火墙并仅允许端口 22、80 和 443。" },
  { match: /PermitRootLogin/i, help: "SSH 允许直接 root 登录。创建一个 sudo 用户，然后在 /etc/ssh/sshd_config 中设置 PermitRootLogin no 并重新启动 sshd。" },
  { match: /failed SSH logins/i, help: "SSH 上的暴力尝试。安装fail2ban和/或将SSH移至非标准端口——面板本身不受影响。" },
  { match: /world-writable/i, help: "有些文件是每个人都可写的。在列出的路径上使用 chmod o-w 拧紧它们。" },
  { match: /swap usage high/i, help: "服务器正在交换，这使得一切变慢。添加 RAM 或增加交换文件。" },
  { match: /memory usage high/i, help: "RAM 几乎已满。重启繁重的PM2流程或升级计划；长时间运行的 Node 进程通常会导致它。" },
  { match: /cpu usage high|high load avg/i, help: "CPU 已饱和 — 通常是大型广播或备份正在运行。在升级计划之前，请检查以下主要流程。" },
  { match: /disk usage high/i, help: "磁盘已满。清除旧备份（如下）、轮换 PM2 日志（pm2 刷新）并删除未使用的上传。" },
  { match: /disk\/io errors/i, help: "内核报告磁盘错误 — 向您的托管提供商提出请求，可能会丢失数据。" },
  { match: /service .* is not running/i, help: "系统服务被停止。如果它是面板不使用的服务（例如apache、redis），则可以忽略；否则使用 systemctl start <name> 启动它。" },
  { match: /redis installed but not responding/i, help: "Redis 已安装但已关闭。面板无需它即可工作；启动 Redis 或卸载它即可清除此警告。" },
  { match: /ssl for .* expires/i, help: "HTTPS 证书即将过期。更新它（certbot renew）——否则浏览器和 WhatsApp webhooks 将开始失败。" },
  { match: /packet loss|no private ip/i, help: "网络检查无法完全完成。对大多数云虚拟机来说无害，除非面板也很慢。" },
  { match: /curl missing/i, help: "在服务器上安装curl，以便扫描仪可以监视站点的正常运行时间和SSL。" },
  { match: /unhealthy docker/i, help: "Docker 容器不健康。仅当您在此服务器上运行其他应用程序时才相关 - 该面板不使用 Docker。" },
];
const issueHelp = (text: string) => ISSUE_HELP.find(i => i.match.test(text))?.help || "";

export default function AdminSystemPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<HealthReport | null>(null);
  const [repLoading, setRepLoading] = useState(true);
  const [repErr, setRepErr] = useState("");
  const [bcfg, setBcfg] = useState<BackupCfg | null>(null);
  const [bform, setBform] = useState({ enabled: false, time: "02:30", keepLocal: "10", keepRemote: "14", encryptBackups: false, encryptionPassphrase: "", alertEmail: "", clientId: "", clientSecret: "" });
  const [savingB, setSavingB] = useState(false);

  const loadBackup = () => api.get("/platform/admin/backup/settings").then(r => {
    const d: BackupCfg = r.data.data;
    setBcfg(d);
    setBform({ enabled: d.enabled && d.target === "gdrive", time: d.time || "02:30", keepLocal: String(d.keepLocal ?? 10), keepRemote: String(d.keepRemote ?? 14), encryptBackups: !!d.encryptBackups, encryptionPassphrase: "", alertEmail: d.alertEmail || "", clientId: d.google.clientId || "", clientSecret: "" });
  }).catch(() => {});

  const load = () => {
    loadBackup();
    Promise.all([
      platformApi.adminHealth().then(r => setHealth(r.data.data)).catch(() => {}),
      platformApi.adminBackups().then(r => setBackups(r.data.data || [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  };

  const loadReport = (force = false) => {
    setRepLoading(true); setRepErr("");
    platformApi.adminHealthReport(force)
      .then(r => setReport(r.data.data))
      .catch((e: unknown) => setRepErr((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "运行状况扫描失败"))
      .finally(() => setRepLoading(false));
  };

  useEffect(() => { load(); loadReport(false); }, []);

  // Result of the Google OAuth round trip (the callback redirects back here).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const d = q.get("drive");
    if (d === "connected") toast.success(translateApiMessage("Google 云端硬盘已连接"));
    else if (d === "error") toast.error(translateApiMessage(q.get("message") || "Google 云端硬盘连接失败"));
    if (d) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const saveBackupCfg = async () => {
    setSavingB(true);
    try {
      await api.put("/platform/admin/backup/settings", {
        enabled: bform.enabled, target: bform.enabled ? "gdrive" : "local", time: bform.time,
        keepLocal: Number(bform.keepLocal), keepRemote: Number(bform.keepRemote), alertEmail: bform.alertEmail,
        encryptBackups: bform.encryptBackups, encryptionPassphrase: bform.encryptionPassphrase,
        clientId: bform.clientId, clientSecret: bform.clientSecret,
      });
      toast.success(translateApiMessage("已保存备份设置")); loadBackup();
    } catch (e: unknown) { toast.error(translateApiMessage(errMsg(e, "Save failed"))); }
    finally { setSavingB(false); }
  };

  const connectDrive = async () => {
    try { const r = await api.post("/platform/admin/backup/google/connect"); window.location.assign(r.data.data.url); }
    catch (e: unknown) { toast.error(translateApiMessage(errMsg(e, "Could not start Google sign-in"))); }
  };

  const disconnectDrive = async () => {
    if (!confirm("断开 Google 云端硬盘连接？云端硬盘中的现有文件将被保留。")) return;
    try { await api.post("/platform/admin/backup/google/disconnect"); toast.success(translateApiMessage("已断开连接")); loadBackup(); }
    catch (e: unknown) { toast.error(translateApiMessage(errMsg(e, "Failed"))); }
  };

  const runBackup = async () => {
    setRunning(true);
    try { const r = await platformApi.adminRunBackup(); toast.success(translateApiMessage(r.data.message || "备份已创建")); load(); }
    catch (e: unknown) { toast.error(translateApiMessage((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "备份失败")); }
    finally { setRunning(false); }
  };

  const download = async (name: string) => {
    try {
      const r = await platformApi.adminDownloadBackup(name);
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
    } catch { toast.error(translateApiMessage("下载失败")); }
  };

  const removeBackup = async (name: string) => {
    if (!confirm("删除此备份吗？")) return;
    try { await platformApi.adminDeleteBackup(name); toast.success(translateApiMessage("已删除")); load(); } catch { toast.error(translateApiMessage("操作失败")); }
  };

  const memUsedPct = health ? Math.round(((health.server.totalMem - health.server.freeMem) / health.server.totalMem) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">系统状态</h1><p className="text-sm text-gray-500 mt-1">服务器状态和数据库备份</p></div>
        <button onClick={load} className="inline-flex items-center gap-2 px-3 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"><RefreshCw className="w-4 h-4" /> 刷新</button>
      </div>

      {/* Comprehensive server health report */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-2"><HeartPulse className="w-4 h-4 text-emerald-600" /><h2 className="text-sm font-semibold text-gray-800">服务器健康报告</h2>{report && <span className="text-xs text-gray-400">生成 {report.generated}</span>}</div>
          <button onClick={() => loadReport(true)} disabled={repLoading} className="inline-flex items-center gap-2 px-3 py-1.5 border rounded-lg text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"><RefreshCw className={`w-3.5 h-3.5 ${repLoading ? "animate-spin" : ""}`} /> {repLoading ? "扫描中..." : "重新扫描"}</button>
        </div>

        {repLoading && !report ? (
          <div className="text-center py-10 text-gray-400 text-sm">运行运行状况扫描...（这可能需要大约 15 秒）</div>
        ) : repErr && !report ? (
          <div className="text-center py-10 text-red-500 text-sm">{repErr}</div>
        ) : report ? (
          <div className="p-4 space-y-5">
            {/* Overall score + category scores */}
            <div className="flex flex-col md:flex-row gap-5 items-center">
              <div className="flex flex-col items-center justify-center shrink-0 w-40 h-40 rounded-full border-8 border-gray-100">
                <span className={`text-4xl font-extrabold ${scoreColor(report.overall_score)}`}>{report.overall_score}</span>
                <span className="text-xs text-gray-400 mt-1">/ 100</span>
                <span className={`text-xs font-medium mt-1 ${scoreColor(report.overall_score)}`}>{report.overall_score >= 90 ? "HEALTHY" : report.overall_score >= 75 ? "WARNING" : "CRITICAL"}</span>
              </div>
              <div className="flex-1 w-full grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.keys(CAT_LABELS).map(k => (
                  <div key={k} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between"><span className="text-xs text-gray-500">{CAT_LABELS[k]}</span><span className={`text-sm font-bold ${scoreColor(report.scores[k] ?? 0)}`}>{report.scores[k] ?? "—"}</span></div>
                    <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${scoreBar(report.scores[k] ?? 0)}`} style={{ width: `${report.scores[k] ?? 0}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>

            {/* Critical + warnings */}
            {(report.critical.length > 0 || report.warnings.length > 0) && (
              <div className="grid md:grid-cols-2 gap-4">
                <div className="border border-red-200 rounded-lg p-3 bg-red-50/40">
                  <p className="text-xs font-semibold text-red-700 flex items-center gap-1.5 mb-2"><AlertTriangle className="w-3.5 h-3.5" /> 关键问题（{report.critical.length})</p>
                  {report.critical.length === 0 ? <p className="text-xs text-gray-400">无</p> : <ul className="space-y-1.5">{report.critical.map((c, i) => <li key={i} className="text-xs text-red-700">• {c}{issueHelp(c) && <span className="block text-[11px] text-gray-600 mt-0.5 ml-2">{issueHelp(c)}</span>}</li>)}</ul>}
                </div>
                <div className="border border-amber-200 rounded-lg p-3 bg-amber-50/40">
                  <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5 mb-2"><AlertTriangle className="w-3.5 h-3.5" /> 警告（{report.warnings.length})</p>
                  {report.warnings.length === 0 ? <p className="text-xs text-gray-400">无</p> : <ul className="space-y-1.5">{report.warnings.map((w, i) => <li key={i} className="text-xs text-amber-700">• {w}{issueHelp(w) && <span className="block text-[11px] text-gray-600 mt-0.5 ml-2">{issueHelp(w)}</span>}</li>)}</ul>}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {report.recommendations.length > 0 && (
              <div className="border rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5 mb-2"><Lightbulb className="w-3.5 h-3.5 text-emerald-600" /> 建议</p>
                <ul className="space-y-1.5">{report.recommendations.map((r, i) => <li key={i} className="text-xs text-gray-600 leading-relaxed">• {r}</li>)}</ul>
              </div>
            )}

            {/* Websites */}
            {(() => {
              const rows = Object.keys(report.metrics).filter(k => /^web\.row\.\d+$/.test(k)).sort().map(k => report.metrics[k].split("|"));
              if (rows.length === 0) return null;
              return (
                <div className="border rounded-lg overflow-x-auto">
                  <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5 px-3 py-2 border-b bg-gray-50"><Globe className="w-3.5 h-3.5 text-emerald-600" /> 网站</p>
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b text-gray-500"><tr><th className="text-left px-3 py-1.5">URL</th><th className="text-left px-3 py-1.5">HTTP</th><th className="text-left px-3 py-1.5">回应</th><th className="text-left px-3 py-1.5">SSL 到期</th><th className="text-left px-3 py-1.5">发行人</th><th className="text-left px-3 py-1.5">CDN</th></tr></thead>
                    <tbody className="divide-y">
                      {rows.map((c, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5 font-medium break-all">{c[0]}</td>
                          <td className="px-3 py-1.5"><span className={/^2|3/.test(c[1]) ? "text-emerald-600" : "text-red-600"}>{c[1]}</span></td>
                          <td className="px-3 py-1.5 text-gray-600">{c[2]}</td>
                          <td className="px-3 py-1.5 text-gray-600">{c[3] && c[3] !== "n/a" ? `${c[3]} 天` : "—"}</td>
                          <td className="px-3 py-1.5 text-gray-600">{c[4] || "—"}</td>
                          <td className="px-3 py-1.5 text-gray-600">{c[5] && c[5] !== "none" ? c[5] : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {/* Detailed metrics */}
            <div className="grid md:grid-cols-2 gap-4">
              {METRIC_GROUPS.map(g => {
                const rows = g.keys.filter(([k]) => hasVal(report.metrics[k]));
                if (rows.length === 0) return null;
                return (
                  <div key={g.title} className="border rounded-lg overflow-hidden">
                    <p className="text-xs font-semibold text-gray-700 px-3 py-2 border-b bg-gray-50">{g.title}</p>
                    <div className="divide-y">
                      {rows.map(([k, label]) => (
                        <div key={k} className="px-3 py-1.5 flex gap-3 text-xs">
                          <span className="text-gray-500 w-32 shrink-0">{label}</span>
                          <span className="text-gray-800 break-all whitespace-pre-wrap flex-1">{report.metrics[k]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {loading ? <div className="text-center py-10 text-gray-400 text-sm">加载中…</div> : (
        <>
          {/* Health cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border p-4"><p className="text-xs text-gray-500">服务器正常运行时间</p><p className="text-lg font-bold text-gray-900 mt-1">{health ? fmtUptime(health.server.uptime) : "—"}</p><p className="text-xs text-gray-400">节点 {health?.server.nodeVersion}</p></div>
            <div className="bg-white rounded-xl border p-4"><p className="text-xs text-gray-500">内存</p><p className="text-lg font-bold text-gray-900 mt-1">{memUsedPct}使用%</p><p className="text-xs text-gray-400">{health ? fmtBytes(health.server.totalMem - health.server.freeMem) + " / " + fmtBytes(health.server.totalMem) : ""}</p></div>
            <div className="bg-white rounded-xl border p-4"><p className="text-xs text-gray-500">磁盘</p><p className="text-lg font-bold text-gray-900 mt-1">{health?.disk?.usedPercent || "—"} 使用</p><p className="text-xs text-gray-400">{health?.disk ? `${health.disk.used} / ${health.disk.total} (${health.disk.available} 免费）` : ""}</p></div>
            <div className="bg-white rounded-xl border p-4"><p className="text-xs text-gray-500">数据库</p><p className={`text-lg font-bold mt-1 ${health?.db.state === "connected" ? "text-emerald-600" : "text-red-600"}`}>{health?.db.state || "—"}</p><p className="text-xs text-gray-400">MongoDB</p></div>
          </div>

          {/* PM2 processes */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-600" /><h2 className="text-sm font-semibold text-gray-800">流程</h2></div>
            {(health?.pm2 || []).length === 0 ? <p className="text-sm text-gray-400 p-4">进程信息不可用</p> : (
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead className="bg-gray-50 border-b"><tr><th className="text-left px-4 py-2 font-medium text-gray-600">名称</th><th className="text-left px-4 py-2 font-medium text-gray-600">状态</th><th className="text-left px-4 py-2 font-medium text-gray-600">正常运行时间</th><th className="text-left px-4 py-2 font-medium text-gray-600">重新启动</th><th className="text-left px-4 py-2 font-medium text-gray-600">内存</th><th className="text-left px-4 py-2 font-medium text-gray-600">CPU</th></tr></thead>
                <tbody className="divide-y">
                  {health!.pm2.map(p => (
                    <tr key={p.name}>
                      <td className="px-4 py-2 font-medium">{p.name}</td>
                      <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.status === "online" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{translateDisplay(p.status)}</span></td>
                      <td className="px-4 py-2 text-gray-600">{p.uptime ? fmtUptime((Date.now() - p.uptime) / 1000) : "—"}</td>
                      <td className="px-4 py-2 text-gray-600">{p.restarts}</td>
                      <td className="px-4 py-2 text-gray-600">{p.memory ? fmtBytes(p.memory) : "—"}</td>
                      <td className="px-4 py-2 text-gray-600">{p.cpu}%</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>

          {/* Backups */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-2"><Database className="w-4 h-4 text-emerald-600" /><h2 className="text-sm font-semibold text-gray-800">数据库备份</h2><span className="text-xs text-gray-400">（汽车日报{bcfg ? ` 在 ${bcfg.time}，最后 ${bcfg.keepLocal} 保留` : ""})</span></div>
              <button onClick={runBackup} disabled={running} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-50">{running ? "正在运行..." : "立即备份"}</button>
            </div>
            {backups.length === 0 ? <p className="text-sm text-gray-400 p-4">尚无备份 — 单击“立即备份”创建第一个备份</p> : (
              <div className="divide-y">
                {backups.map(b => (
                  <div key={b.name} className="px-4 py-2.5 flex items-center justify-between">
                    <div><p className="text-sm font-medium text-gray-800">{b.name}</p><p className="text-xs text-gray-400">{fmtBytes(b.size)} · {new Date(b.createdAt).toLocaleString()}</p></div>
                    <div className="flex items-center gap-3">
                      <button onClick={() => download(b.name)} className="text-gray-500 hover:text-emerald-600"><Download className="w-4 h-4" /></button>
                      <button onClick={() => removeBackup(b.name)} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Off-site backup to Google Drive (FEAT-04) */}
          {bcfg && (
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="px-4 py-3 border-b bg-gray-50 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2"><Cloud className="w-4 h-4 text-emerald-600" /><h2 className="text-sm font-semibold text-gray-800">异地备份（Google 云端硬盘）</h2></div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${bcfg.running ? "bg-blue-100 text-blue-700" : bcfg.stale ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                  {bcfg.running ? "备份正在运行..." : bcfg.stale ? "过去26小时内没有成功备份" : "健康"}
                </span>
              </div>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div><p className="text-xs text-gray-500">上次成功备份</p><p className="font-medium text-gray-800">{bcfg.lastSuccessAt ? new Date(bcfg.lastSuccessAt).toLocaleString() : "从来没有"}</p></div>
                  <div>
                    <p className="text-xs text-gray-500">上次运行</p>
                    <p className={`font-medium ${bcfg.lastRun.status === "failed" ? "text-red-600" : "text-gray-800"}`}>{bcfg.lastRun.status || "—"}{bcfg.lastRun.target ? ` · ${bcfg.lastRun.target === "gdrive" ? "Google Drive" : "local only"}` : ""}{bcfg.lastRun.sizeBytes ? ` · ${fmtBytes(bcfg.lastRun.sizeBytes)}` : ""}</p>
                    {bcfg.lastRun.error && <p className="text-xs text-red-600 break-words">{bcfg.lastRun.error}</p>}
                  </div>
                  <div><p className="text-xs text-gray-500">谷歌云端硬盘</p><p className={`font-medium ${bcfg.google.connected ? "text-emerald-600" : "text-gray-500"}`}>{bcfg.google.connected ? `已连接${bcfg.google.connectedAt ? " · " + new Date(bcfg.google.connectedAt).toLocaleDateString() : ""}` : "未连接"}</p></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <label className="flex items-center gap-2 text-sm md:col-span-3"><input type="checkbox" checked={bform.enabled} onChange={e => setBform({ ...bform, enabled: e.target.checked })} className="rounded text-emerald-600" /> 将每个备份上传到 Google 云端硬盘</label>
                  <div><label className="text-xs text-gray-500 block mb-1">每日备份时间（服务器时间）</label><input type="time" value={bform.time} onChange={e => setBform({ ...bform, time: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-gray-500 block mb-1">保留在此服务器上</label><input type="number" min={1} max={365} value={bform.keepLocal} onChange={e => setBform({ ...bform, keepLocal: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-gray-500 block mb-1">保留在 Google 云端硬盘中</label><input type="number" min={1} max={365} value={bform.keepRemote} onChange={e => setBform({ ...bform, keepRemote: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-gray-500 block mb-1">Google OAuth 客户端 ID</label><input value={bform.clientId} onChange={e => setBform({ ...bform, clientId: e.target.value })} placeholder={bcfg.google.usesLoginClient ? "使用 Google 登录客户端" : "xxxx.apps.googleusercontent.com"} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-gray-500 block mb-1">客户端秘密</label><input type="password" autoComplete="new-password" value={bform.clientSecret} onChange={e => setBform({ ...bform, clientSecret: e.target.value })} placeholder={bcfg.google.clientSecret || "客户端秘密"} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-gray-500 block mb-1">失败警报电子邮件（默认：超级管理员）</label><input type="email" value={bform.alertEmail} onChange={e => setBform({ ...bform, alertEmail: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={bform.encryptBackups} onChange={e => setBform({ ...bform, encryptBackups: e.target.checked })} className="rounded text-emerald-600" /> 加密云端硬盘副本 (AES-256)</label>
                  <div className="md:col-span-2"><label className="text-xs text-gray-500 block mb-1">加密密码（保证安全 - 需要恢复）</label><input type="password" autoComplete="new-password" value={bform.encryptionPassphrase} onChange={e => setBform({ ...bform, encryptionPassphrase: e.target.value })} placeholder={bcfg.encryptionPassphrase ? "••••（不变）" : "至少 8 个字符"} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                </div>
                <p className="text-xs text-gray-500">Google Cloud OAuth 客户端的授权重定向 URI： <code className="break-all bg-gray-100 px-1 rounded">{bcfg.google.redirectUri}</code>。发布同意屏幕（在“测试”中，Google 会在 7 天后使连接过期）。</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={saveBackupCfg} disabled={savingB} className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap">{savingB ? "保存中…" : "保存设置"}</button>
                  {bcfg.google.connected
                    ? <button onClick={disconnectDrive} className="px-3 py-2 border rounded-lg text-sm text-red-600 hover:bg-red-50 whitespace-nowrap">断开 Google 云端硬盘连接</button>
                    : <button onClick={connectDrive} className="px-3 py-2 border rounded-lg text-sm text-gray-700 hover:bg-gray-50 whitespace-nowrap">连接 Google 云端硬盘</button>}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
