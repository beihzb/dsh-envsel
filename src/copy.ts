/**
 * Host-side product copy for `/env` and catalog warnings.
 * English is the default; Chinese is used when DSH settings store
 * `locale.preference = zh`.
 *
 * @module @beihaizb/dsh-envsel/copy
 */

import type { Context } from '@deepseek-ai/cordis'
import { ENV_SLOTS } from './types.ts'
import type { EnvSlot } from './types.ts'

/** Locales this plugin ships for host-visible copy. */
export type HostLocale = 'en' | 'zh'

/** Optional settings service used only to read the durable locale preference. */
interface SettingsReader {
  get(ns: string): unknown
}

/**
 * Resolve the host copy locale. Missing settings, a missing preference, or
 * any value other than `zh` falls back to English.
 * @param ctx - host context; `settings` is optional.
 * @returns `zh` when the user explicitly chose Chinese, otherwise `en`.
 */
export function resolveHostLocale(ctx: Context): HostLocale {
  const settings = ctx.get('settings') as SettingsReader | undefined
  if (settings === undefined) return 'en'
  try {
    const section = settings.get('locale')
    if (section !== null && typeof section === 'object' && 'preference' in section) {
      return (section as { preference?: unknown }).preference === 'zh' ? 'zh' : 'en'
    }
  } catch {
    // Settings namespace not registered yet — stay on English.
  }
  return 'en'
}

/** Slot labels in the active locale (`CLI tools` vs `CLI 工具`). */
export function slotLabel(slot: EnvSlot, locale: HostLocale): string {
  if (slot === 'cli') return locale === 'zh' ? 'CLI 工具' : 'CLI tools'
  if (slot === 'r') return 'R'
  return 'Python'
}

interface HostCopy {
  usageAdd: string
  usageUnpin: string
  unknownArg: (token: string) => string
  unknownSlot: (slot: string) => string
  help: string
  commandDescription: string
  commandHint: string
  cleared: string
  wslSkipped: string
  wslDone: (count: number) => string
  wslNone: string
  addFailed: (path: string, reason: string) => string
  pinReasonInvalid: string
  pinReasonNotFound: string
  pinReasonNoInterpreter: string
  pinned: (hint: string) => string
  unpinMissing: (address: string) => string
  unpinned: (address: string) => string
  listHeader: (count: number, filter: string) => string
  slotUnset: string
  slotAmbiguous: (entries: string) => string
  slotMissing: (value: string) => string
  slotSetFailed: (slot: string, hint: string) => string
  slotIncompatible: (slot: string, entry: string) => string
  updated: string
  noneSelected: string
  noneSelectedHint: string
  currentEnv: string
  unsetParen: string
  usageHelp: string
  condaListFailed: (cmd: string, error: string) => string
  condaExit: (code: string, detail: string) => string
  condaParse: (error: string) => string
  condaShape: string
  wslUnavailable: (error: string) => string
  wslListExit: (code: string, detail: string) => string
  wslProbeFailed: (distro: string, error: string) => string
  wslProbeExit: (distro: string, code: string, stderr: string) => string
  wslParse: (distro: string, error: string) => string
  wslShape: (distro: string) => string
  pinUnavailable: (code: string, path: string) => string
}

const en: HostCopy = {
  usageAdd: 'usage: /env add <absolute interpreter or install path>',
  usageUnpin: 'usage: /env unpin custom:<name> or /env unpin <path>',
  unknownArg: (token) => `unrecognized argument "${token}" (expected slot=value, e.g. python=scRNAv2)`,
  unknownSlot: (slot) => `unknown slot "${slot}" (available: ${ENV_SLOTS.join(' / ')})`,
  help: [
    '/env session environment selector (conda / standalone R / WSL / pinned paths)',
    '  /env                     show the current selection',
    '  /env help                show this help',
    '  /env python=scRNAv2      set the Python slot (conda name / R name / wsl:distro:name / custom:name)',
    '  /env r=R-4.4.1           set the R slot',
    '  /env cli=base            set the CLI slot (PATH prefix)',
    '  /env python= /env r= /env cli=   clear the corresponding slot',
    '  /env list [keyword]      list every available environment',
    '  /env add <path>          remember an interpreter or install directory',
    '  /env unpin custom:<name> remove a pinned path from the local cache',
    '  /env clear               clear every selection',
    '  /env wsl                 rescan WSL (Windows only; may be slow, includes distro cold-start)',
  ].join('\n'),
  commandDescription: 'Select this session\'s conda / standalone R / WSL / pinned-path environments (e.g. /env python=scRNAv2 r=R-4.4.1)',
  commandHint: 'python=scRNAv2 r=R-4.4.1 | list [filter] | add <path> | unpin custom:<name> | clear | wsl | help',
  cleared: 'Cleared every environment selection.',
  wslSkipped: 'This host is not Windows; skipped the WSL scan. Use /env add <path> to pin an environment manually.',
  wslDone: (count) => `WSL scan finished (${String(count)} entries):`,
  wslNone: '  (no WSL environments found)',
  addFailed: (path, reason) => `could not add "${path}": ${reason}`,
  pinReasonInvalid: 'path is empty',
  pinReasonNotFound: 'path does not exist',
  pinReasonNoInterpreter: 'no python / Rscript found',
  pinned: (hint) => `remembered in the local cache (${hint}):`,
  unpinMissing: (address) => `pinned path not found: "${address}"`,
  unpinned: (address) => `removed ${address} from the local cache`,
  listHeader: (count, filter) => `available environments (${String(count)}${filter.length > 0 ? `, filter "${filter}"` : ''}):`,
  slotUnset: 'not set',
  slotAmbiguous: (entries) => `name is ambiguous, use a full address: ${entries}`,
  slotMissing: (value) => `not found: "${value}" (try /env list)`,
  slotSetFailed: (slot, hint) => `${slot} slot could not be set: ${hint}`,
  slotIncompatible: (slot, entry) => `${slot} slot cannot use ${entry} (missing that language's interpreter)`,
  updated: 'updated:',
  noneSelected: 'No environment is selected.',
  noneSelectedHint: 'usage: /env python=scRNAv2 r=R-4.4.1 cli=base; /env list to see every available environment.',
  currentEnv: 'current session environments:',
  unsetParen: '(not set)',
  usageHelp: 'usage: /env help',
  condaListFailed: (cmd, error) => `conda env list failed (need ${cmd} on PATH): ${error}`,
  condaExit: (code, detail) => `conda env list exited ${code}${detail.length > 0 ? ` - ${detail}` : ''}`,
  condaParse: (error) => `conda env list output could not be parsed: ${error}`,
  condaShape: 'conda env list output is malformed (missing envs array)',
  wslUnavailable: (error) => `WSL is unavailable: ${error}`,
  wslListExit: (code, detail) => `wsl --list exited ${code}${detail.length > 0 ? ` - ${detail}` : ''}`,
  wslProbeFailed: (distro, error) => `${distro}: WSL probe failed: ${error}`,
  wslProbeExit: (distro, code, stderr) => `${distro}: probe exited ${code}: ${stderr}`,
  wslParse: (distro, error) => `${distro}: conda env list output could not be parsed: ${error}`,
  wslShape: (distro) => `${distro}: output is malformed`,
  pinUnavailable: (code, path) => `pinned path unavailable (${code}): ${path}`,
}

const zh: HostCopy = {
  usageAdd: '用法: /env add <解释器或安装目录的绝对路径>',
  usageUnpin: '用法: /env unpin custom:<名> 或 /env unpin <路径>',
  unknownArg: (token) => `无法识别的参数 "${token}"（应为 slot=值，如 python=scRNAv2）`,
  unknownSlot: (slot) => `未知槽位 "${slot}"（可用: ${ENV_SLOTS.join(' / ')}）`,
  help: [
    '/env 会话环境选择器（conda / 独立 R / WSL / 手动路径）',
    '  /env                     查看当前选择',
    '  /env help                显示本帮助',
    '  /env python=scRNAv2      设置 Python 槽位（conda 名 / 独立R名 / wsl:发行版:名 / custom:名）',
    '  /env r=R-4.4.1           设置 R 槽位',
    '  /env cli=base            设置 CLI 槽位（PATH 前缀）',
    '  /env python= /env r= /env cli=   清空对应槽位',
    '  /env list [关键词]        列出全部可用环境',
    '  /env add <路径>           把解释器或安装目录记入本机缓存',
    '  /env unpin custom:<名>    从本机缓存移除一条手动路径',
    '  /env clear               清空全部选择',
    '  /env wsl                 重新扫描 WSL（仅 Windows；可能较慢，含发行版冷启动）',
  ].join('\n'),
  commandDescription: '选择本会话的 conda / 独立 R / WSL / 手动路径环境（如 /env python=scRNAv2 r=R-4.4.1）',
  commandHint: 'python=scRNAv2 r=R-4.4.1 | list [过滤] | add <路径> | unpin custom:<名> | clear | wsl | help',
  cleared: '已清空全部环境选择。',
  wslSkipped: '当前宿主不是 Windows，已跳过 WSL 扫描。可用 /env add <路径> 手动添加环境。',
  wslDone: (count) => `WSL 扫描完成（${String(count)} 个条目）:`,
  wslNone: '  （未发现 WSL 环境）',
  addFailed: (path, reason) => `无法添加 "${path}"：${reason}`,
  pinReasonInvalid: '路径为空',
  pinReasonNotFound: '路径不存在',
  pinReasonNoInterpreter: '未找到 python / Rscript',
  pinned: (hint) => `已记入本机缓存（${hint}）:`,
  unpinMissing: (address) => `未找到手动路径 "${address}"`,
  unpinned: (address) => `已从本机缓存移除 ${address}`,
  listHeader: (count, filter) => `可用环境（${String(count)} 个${filter.length > 0 ? `，过滤 "${filter}"` : ''}）:`,
  slotUnset: '未设置',
  slotAmbiguous: (entries) => `名称有歧义，请用完整地址: ${entries}`,
  slotMissing: (value) => `未找到 "${value}"，可用 /env list 查看`,
  slotSetFailed: (slot, hint) => `${slot} 槽位设置失败: ${hint}`,
  slotIncompatible: (slot, entry) => `${slot} 槽位不能使用 ${entry}（缺少该语言解释器）`,
  updated: '已更新:',
  noneSelected: '当前未选择任何环境。',
  noneSelectedHint: '用法: /env python=scRNAv2 r=R-4.4.1 cli=base，/env list 查看全部可用环境。',
  currentEnv: '当前会话环境:',
  unsetParen: '（未设置）',
  usageHelp: '用法: /env help',
  condaListFailed: (cmd, error) => `conda 环境列举失败（需要 ${cmd} 在 PATH 上）: ${error}`,
  condaExit: (code, detail) => `conda env list 退出码 ${code}${detail.length > 0 ? ` - ${detail}` : ''}`,
  condaParse: (error) => `conda env list 输出无法解析: ${error}`,
  condaShape: 'conda env list 输出结构异常（缺少 envs 数组）',
  wslUnavailable: (error) => `WSL 不可用: ${error}`,
  wslListExit: (code, detail) => `wsl --list 退出码 ${code}${detail.length > 0 ? ` - ${detail}` : ''}`,
  wslProbeFailed: (distro, error) => `${distro}: WSL 探测失败: ${error}`,
  wslProbeExit: (distro, code, stderr) => `${distro}: 探测退出码 ${code}: ${stderr}`,
  wslParse: (distro, error) => `${distro}: conda env list 输出无法解析: ${error}`,
  wslShape: (distro) => `${distro}: 输出结构异常`,
  pinUnavailable: (code, path) => `手动路径不可用（${code}）: ${path}`,
}

/**
 * Host copy for one locale. English is the default.
 * @param locale - active host locale.
 */
export function hostCopy(locale: HostLocale = 'en'): HostCopy {
  return locale === 'zh' ? zh : en
}
