// MBEditor · Direction A — Editor publish dialogs & menus (P7)
// Copy-first publish: CopyReadyDialog (二次点击写剪贴板) · CopySuccessPanel
// (可停留确认面板) · ValidationBlockDialog (阻断闸,默认不可强过) ·
// SmilWarningDialog (信息级) · MoreMenu (草稿箱次级位).
// Overlays sit inside the editor frame (absolute), so context stays visible.
// Tokens from ds/theme.css. NO emoji.

(function injectDlgCss() {
  if (document.getElementById("mbe-dlg-css")) return;
  const s = document.createElement("style");
  s.id = "mbe-dlg-css";
  s.textContent = `
  .ed-veil{position:absolute;inset:0;z-index:40;background:rgba(58,40,22,.34);backdrop-filter:blur(3px);
    display:flex;align-items:center;justify-content:center;padding:26px;animation:mb-fade var(--t-base) var(--ease);}
  .ed-dlg{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-2xl);box-shadow:var(--sh-xl);
    width:100%;max-width:452px;overflow:hidden;animation:mb-pop var(--t-enter) var(--ease-spring);}
  .ed-dlg.narrow{max-width:340px;}
  .ed-dbody{padding:26px 26px 8px;}
  .ed-dhead{display:flex;align-items:center;gap:13px;margin-bottom:14px;}
  .ed-dicon{width:48px;height:48px;border-radius:var(--r-lg);display:flex;align-items:center;justify-content:center;flex:none;}
  .ed-dtitle{font-family:var(--f-display);font-size:20px;font-weight:700;color:var(--ink-strong);line-height:1.3;}
  .ed-dsub{font-size:13.5px;color:var(--ink-soft);line-height:1.65;margin:0 0 16px;}
  .ed-dsub b{color:var(--orange-700);font-weight:700;}
  .ed-dfoot{display:flex;gap:10px;justify-content:flex-end;padding:14px 26px 22px;}
  .ed-dfoot.stack{flex-direction:column;}
  .ed-dfoot.stack > *{width:100%;}

  /* steps list (success panel) */
  .ed-steps{display:flex;flex-direction:column;gap:0;margin:4px 0 6px;border:1px solid var(--line);
    border-radius:var(--r-lg);overflow:hidden;background:var(--surface-2);}
  .ed-stepr{display:flex;align-items:center;gap:12px;padding:12px 15px;font-size:13.5px;color:var(--ink);}
  .ed-stepr+.ed-stepr{border-top:1px solid var(--line);}
  .ed-stepn{width:24px;height:24px;border-radius:50%;background:var(--orange-500);color:var(--cream);flex:none;
    display:flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:700;font-family:var(--f-mono);}
  .ed-stepr b{font-weight:700;color:var(--ink-strong);}
  .ed-kbd{font-family:var(--f-mono);font-size:12px;font-weight:600;background:var(--bg-sunk);border:1px solid var(--line-strong);
    border-bottom-width:2px;border-radius:5px;padding:1px 7px;color:var(--ink-strong);}

  /* issue rows (block dialog) */
  .ed-issue{display:flex;align-items:flex-start;gap:11px;padding:12px 14px;border-radius:var(--r-md);
    background:var(--danger-soft);border:1px solid color-mix(in srgb,var(--danger) 24%,transparent);}
  .ed-issue+.ed-issue{margin-top:9px;}
  .ed-issue .ii{flex:none;margin-top:1px;}
  .ed-issue .it{font-size:13.5px;font-weight:600;color:var(--danger-ink);line-height:1.5;}
  .ed-issue .ic{font-size:12px;color:var(--ink-soft);margin-top:3px;font-family:var(--f-mono);}
  .ed-blocknote{display:flex;align-items:flex-start;gap:8px;margin-top:14px;font-size:12px;color:var(--ink-soft);
    line-height:1.55;}

  /* big-content notice in copy-ready */
  .ed-callout{display:flex;align-items:flex-start;gap:9px;margin-top:4px;padding:11px 13px;border-radius:var(--r-md);
    background:var(--info-soft);color:var(--info-ink);font-size:12.5px;line-height:1.55;
    border:1px solid color-mix(in srgb,var(--info) 22%,transparent);}
  .ed-callout .ci{flex:none;margin-top:1px;}

  /* more-menu dropdown */
  .ed-menu{position:absolute;top:calc(100% + 7px);right:0;z-index:30;min-width:236px;background:var(--surface);
    border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:var(--sh-lg);padding:6px;
    animation:mb-pop var(--t-base) var(--ease-spring);}
  .ed-mcap{font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--ink-faint);
    padding:8px 10px 5px;}
  .ed-mitem{display:flex;align-items:center;gap:11px;width:100%;padding:10px 11px;border:none;background:transparent;
    border-radius:var(--r-sm);cursor:pointer;text-align:left;font-family:var(--f-sans);font-size:14px;color:var(--ink);
    transition:background var(--t-micro) var(--ease);}
  .ed-mitem:hover:not(:disabled){background:var(--surface-2);}
  .ed-mitem:disabled{cursor:not-allowed;color:var(--ink-faint);}
  .ed-mitem .mi{flex:none;color:var(--ink-soft);display:flex;}
  .ed-mitem:disabled .mi{color:var(--ink-faint);}
  .ed-mitem .mt{flex:1;}
  .ed-mitem .ms{font-size:11.5px;color:var(--ink-faint);font-weight:500;margin-top:2px;}
  .ed-mlock{flex:none;}
  .ed-msep{height:1px;background:var(--line);margin:5px 6px;}
  `;
  document.head.appendChild(s);
})();

function EdVeil({ children }) { return <div className="ed-veil">{children}</div>; }

// ── 1 · CopyReadyDialog — content processed, browser needs a fresh click ──
function CopyReadyDialog({ narrow = false, big = false }) {
  return (
    <EdVeil>
      <div className={cx("ed-dlg", narrow && "narrow")}>
        <div className="ed-dbody">
          <div className="ed-dhead">
            <span className="ed-dicon" style={{ background: "var(--orange-50)" }}><IconCopy size={24} stroke="var(--orange-600)" /></span>
            <div className="ed-dtitle">内容已就绪,<br />再点一下写入剪贴板</div>
          </div>
          <p className="ed-dsub">
            图片已传到<b>公众号素材库</b>,排版也处理好了。浏览器要求复制必须发生在你最新一次点击里——所以请再点一下下面的按钮。
          </p>
          {big && (
            <div className="ed-callout">
              <span className="ci"><IconInfo size={15} stroke="var(--info-ink)" /></span>
              <span>这篇正文较大(约 460KB),将<b style={{ color: "var(--info-ink)" }}>分 2 段</b>复制,粘贴时按提示逐段粘入即可。</span>
            </div>
          )}
        </div>
        <div className="ed-dfoot">
          <Button variant="ghost" size="md">取消</Button>
          <Button variant="primary" size="md" leading={<IconCopy size={18} />}>点此复制到剪贴板</Button>
        </div>
      </div>
    </EdVeil>
  );
}

// ── 2 · CopySuccessPanel — 可停留确认面板 (does NOT auto-dismiss) ──
function CopySuccessPanel({ narrow = false, canSendToDraft = true }) {
  return (
    <EdVeil>
      <div className={cx("ed-dlg", narrow && "narrow")}>
        <div className="ed-dbody">
          <div className="ed-dhead">
            <span className="ed-dicon" style={{ background: "var(--success-soft)" }}><IconCheck size={26} stroke="var(--success)" /></span>
            <div>
              <div className="ed-dtitle">已复制到剪贴板</div>
              <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 3 }}>共 {WX_WORDS} 字 · 排版已保留</div>
            </div>
          </div>
          <p className="ed-dsub" style={{ marginBottom: 12 }}>接下来去公众号后台,三步就能发出去——</p>
          <div className="ed-steps">
            <div className="ed-stepr"><span className="ed-stepn">1</span><span>打开<b>公众号后台</b>,新建一条图文消息</span></div>
            <div className="ed-stepr"><span className="ed-stepn">2</span><span>在正文里粘贴 <span className="ed-kbd">{navigator.platform.includes("Mac") ? "⌘V" : "Ctrl V"}</span>,排版会原样进来</span></div>
            <div className="ed-stepr"><span className="ed-stepn">3</span><span>检查无误,<b>发表</b>或存草稿</span></div>
          </div>
        </div>
        <div className={cx("ed-dfoot", canSendToDraft && "stack")}>
          <Button variant="primary" size="md" leading={<IconCheck size={18} />}>完成</Button>
          {canSendToDraft && (
            <Button variant="secondary" size="md" leading={<IconSend size={17} />}>改用「发到草稿箱」</Button>
          )}
        </div>
      </div>
    </EdVeil>
  );
}

// ── 3 · ValidationBlockDialog — hard gate, default not forceable ──
function ValidationBlockDialog({ narrow = false, action = "copy" }) {
  return (
    <EdVeil>
      <div className={cx("ed-dlg", narrow && "narrow")} style={{ maxWidth: narrow ? 340 : 468 }}>
        <div className="ed-dbody">
          <div className="ed-dhead">
            <span className="ed-dicon" style={{ background: "var(--danger-soft)" }}><IconClose size={24} stroke="var(--danger)" /></span>
            <div className="ed-dtitle">有 2 处写法,<br />公众号会直接丢弃</div>
          </div>
          <p className="ed-dsub">
            下面这些写法粘进公众号会被静默剥离,导致{action === "draft" ? "草稿" : "复制后的文章"}<b>排版走样</b>。先修正再发,才能保证「预览=发布」。
          </p>
          <div className="ed-issue">
            <span className="ii"><IconClose size={16} stroke="var(--danger)" /></span>
            <div><div className="it">使用了 flex 布局(整段会被丢弃)</div><div className="ic">section 第 9 行 · display:flex</div></div>
          </div>
          <div className="ed-issue">
            <span className="ii"><IconClose size={16} stroke="var(--danger)" /></span>
            <div><div className="it">使用了 position:absolute(会被隐藏)</div><div className="ic">div 第 14 行 · position:absolute</div></div>
          </div>
          <div className="ed-blocknote">
            <IconInfo size={14} stroke="var(--ink-faint)" style={{ flex: "none", marginTop: 1 }} />
            <span>布局请改用 <b style={{ color: "var(--ink)" }}>&lt;section&gt; + inline-block</b>。改好后校验会自动放行。</span>
          </div>
        </div>
        <div className="ed-dfoot">
          <Button variant="ghost" size="md">仍要复制</Button>
          <Button variant="primary" size="md" leading={<IconPen size={17} />}>去修正(2)</Button>
        </div>
      </div>
    </EdVeil>
  );
}

// ── 4 · SmilWarningDialog — info-level, both copy & draft pass through it ──
function SmilWarningDialog({ narrow = false }) {
  return (
    <EdVeil>
      <div className={cx("ed-dlg", narrow && "narrow")}>
        <div className="ed-dbody">
          <div className="ed-dhead">
            <span className="ed-dicon" style={{ background: "var(--info-soft)" }}><IconInfo size={24} stroke="var(--info-ink)" /></span>
            <div className="ed-dtitle">这篇含一处<br />SVG 动画(SMIL)</div>
          </div>
          <p className="ed-dsub">
            图形本身会<b style={{ color: "var(--info-ink)" }}>完整保留</b>。动画在部分手机客户端能播放,在不支持的地方会显示静态首帧——内容不会丢,放心继续。
          </p>
          <div className="ed-callout">
            <span className="ci"><IconInfo size={15} stroke="var(--info-ink)" /></span>
            <span>「公众号效果」预览里 SMIL 会失活只看静态;想看动起来,切到<b style={{ color: "var(--info-ink)" }}>「交互预览」</b>。</span>
          </div>
        </div>
        <div className="ed-dfoot">
          <Button variant="ghost" size="md">取消</Button>
          <Button variant="primary" size="md" trailing={<IconArrow size={17} />}>知道了,继续</Button>
        </div>
      </div>
    </EdVeil>
  );
}

// ── 5 · MoreMenu — draft is the secondary/advanced path, tucked here ──
function MoreMenu({ canPushDraft = false }) {
  return (
    <div className="ed-menu" onClick={(e) => e.stopPropagation()}>
      <div className="ed-mcap">更多方式</div>
      <button className="ed-mitem" disabled={!canPushDraft}>
        <span className="mi"><IconSend size={18} /></span>
        <span className="mt">发到草稿箱{!canPushDraft && <span className="ms">需先在设置中绑定公众号</span>}{canPushDraft && <span className="ms">发到「闲读笔记」草稿箱</span>}</span>
        {!canPushDraft && <span className="ed-mlock"><IconLock size={15} stroke="var(--ink-faint)" /></span>}
      </button>
      <div className="ed-msep"></div>
      <button className="ed-mitem">
        <span className="mi"><IconCopy size={18} /></span>
        <span className="mt">分段复制<span className="ms">大文逐段粘贴,防截断</span></span>
      </button>
      <button className="ed-mitem">
        <span className="mi"><IconBlank size={18} /></span>
        <span className="mt">导出 HTML 文件</span>
      </button>
      <button className="ed-mitem">
        <span className="mi"><Icon size={18}><path d="M9 7l-5 5 5 5M15 7l5 5-5 5" /></Icon></span>
        <span className="mt">复制源代码</span>
      </button>
    </div>
  );
}

Object.assign(window, {
  EdVeil, CopyReadyDialog, CopySuccessPanel, ValidationBlockDialog, SmilWarningDialog, MoreMenu,
});
