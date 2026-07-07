// MBEditor · Direction A — EditorSurface shell (P7)
// TopBar(编辑中) + DocBar(返回/标题/保存/双预览切换/复制优先发布) + 简单模式
// 全屏可编辑「公众号效果」/「交互预览」+ 专业模式 ProStage(三栏)。
// Hard约束: 简单/窄屏永不挂三栏或代码;复制优先、草稿收进「更多方式」。
// props: mode "simple"|"pro" · preview "wechat"|"raw" · narrow · dialog · menu ·
//        canPushDraft · backendDown · proView "preview"|"split"|"triptych"
// 依赖 ds/theme.css · ds/icons.jsx · ds/ui.jsx · editor/editorParts · ProStage · Dialogs.

(function injectEsCss() {
  if (document.getElementById("mbe-es-css")) return;
  const s = document.createElement("style");
  s.id = "mbe-es-css";
  s.textContent = `
  .es{position:relative;height:100%;display:flex;flex-direction:column;background:var(--bg);color:var(--ink);
    font-family:var(--f-sans);overflow:hidden;}

  /* top bar (编辑中 chrome) */
  .es-top{height:48px;flex:none;display:flex;align-items:center;gap:12px;padding:0 16px;
    border-bottom:1px solid var(--line);background:var(--surface);z-index:8;}
  .es-brand{display:inline-flex;align-items:center;gap:9px;background:none;border:none;cursor:pointer;padding:4px;border-radius:var(--r-sm);}
  .es-brand .bn{font-family:var(--f-display);font-weight:700;font-size:17px;color:var(--ink-strong);letter-spacing:.2px;}
  .es-editing{display:inline-flex;align-items:center;gap:7px;height:28px;padding:0 13px;border-radius:var(--r-pill);
    background:var(--orange-50);color:var(--orange-700);font-size:13px;font-weight:600;}
  .es-grow{flex:1;}

  /* doc bar */
  .es-doc{flex:none;display:flex;align-items:center;gap:14px;padding:11px 18px;border-bottom:1px solid var(--line);
    background:color-mix(in srgb,var(--surface) 70%,var(--bg));}
  .es-back{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 13px 0 10px;border-radius:var(--r-md);
    background:none;border:none;color:var(--ink-soft);font-size:14px;font-family:var(--f-sans);cursor:pointer;flex:none;
    transition:all var(--t-micro) var(--ease);}
  .es-back:hover{background:var(--surface-2);color:var(--ink);}
  .es-titlewrap{display:flex;flex-direction:column;gap:1px;min-width:0;}
  .es-title{font-family:var(--f-display);font-size:18px;font-weight:700;color:var(--ink-strong);line-height:1.25;
    outline:none;border-radius:5px;padding:1px 5px;margin:0 -5px;max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .es-title:focus{background:var(--surface);box-shadow:0 0 0 2px var(--orange-200);}
  .es-save{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--ink-faint);padding-left:5px;}
  .es-actions{display:flex;align-items:center;gap:10px;flex:none;position:relative;}
  .es-cta-host{display:flex;}
  .es-morewrap{position:relative;}

  /* format toolbar / hint row */
  .es-tbrow{height:48px;flex:none;display:flex;align-items:center;gap:12px;padding:0 18px;
    border-bottom:1px solid var(--line);background:var(--surface);}
  .es-rawhint{flex:1;display:flex;align-items:center;gap:9px;font-size:13px;color:var(--info-ink);}

  /* backend-down banner */
  .es-down{flex:none;display:flex;align-items:center;gap:9px;padding:9px 18px;background:var(--danger-soft);
    color:var(--danger-ink);font-size:13px;font-weight:500;border-bottom:1px solid color-mix(in srgb,var(--danger) 22%,transparent);}

  /* raw stage */
  .es-rawstage{flex:1;overflow-y:auto;background:var(--bg-sunk);padding:22px 24px 50px;display:flex;
    flex-direction:column;align-items:center;}
  .es-rawwrap{width:100%;max-width:496px;}

  /* ---- narrow (<600px) ---- */
  .es.narrow .es-top{height:46px;padding:0 12px;}
  .es.narrow .es-brand .bn{display:none;}
  .es.narrow .es-doc{flex-wrap:wrap;gap:9px 10px;padding:10px 12px;}
  .es.narrow .es-titlewrap{flex:1 1 auto;order:1;}
  .es.narrow .es-back{order:0;height:34px;}
  .es.narrow .es-title{font-size:16px;max-width:none;}
  .es.narrow .es-actions{order:2;flex:1 1 100%;justify-content:stretch;}
  .es.narrow .es-actions .es-seg-host{flex:none;}
  .es.narrow .es-cta-host{flex:1;}
  .es.narrow .es-tbrow{height:auto;padding:8px 12px;overflow-x:auto;}
  .es.narrow .es-tbrow .mbe-tb{flex:none;}
  .es.narrow .es-tbrow .mbe-badge{display:none;}
  .es.narrow .wx-stage{padding:18px 14px 50px;}
  .es.narrow .wx-inner{padding:20px 18px 24px;}
  .es.narrow .wx-title{font-size:19px;}
  `;
  document.head.appendChild(s);
})();

function EditorSurface({
  mode = "simple", preview = "wechat", narrow = false, dialog = null, menu = false,
  canPushDraft = false, backendDown = false, proView = "triptych",
}) {
  const pro = mode === "pro" && !narrow;
  const isWechat = preview === "wechat";

  const previewSeg = (
    <span className="es-seg-host">
      <Segmented value={preview} onChange={() => {}} options={[
        { value: "wechat", label: narrow ? "效果" : "公众号效果", icon: <IconEye size={15} /> },
        { value: "raw", label: narrow ? "交互" : "交互预览", icon: <Icon size={15}><path d="M8 5l11 7-11 7z" /></Icon> },
      ]} />
    </span>
  );

  return (
    <div className={cx("es", narrow && "narrow")}>
      {/* ---- TopBar:编辑中 chrome ---- */}
      <div className="es-top">
        <button className="es-brand"><BrandMark size={28} /><span className="bn">MBEditor</span></button>
        <span className="es-grow"></span>
        <span className="es-editing"><IconPen size={14} stroke="var(--orange-700)" />编辑中</span>
        <span className="es-grow"></span>
        <HealthDot down={backendDown} />
      </div>

      {/* ---- DocBar ---- */}
      <div className="es-doc">
        <button className="es-back"><IconArrowL size={18} />{narrow ? "" : "返回起稿台"}</button>
        <div className="es-titlewrap">
          <div className="es-title" contentEditable suppressContentEditableWarning>周末带娃逛了趟植物园</div>
          {!narrow && <span className="es-save"><IconCheck size={13} stroke="var(--success)" />已保存 · 刚刚</span>}
        </div>
        <span className="es-grow"></span>
        <div className="es-actions">
          {previewSeg}
          <span className="es-cta-host"><Button variant="primary" size="md" leading={<IconCopy size={18} />} style={{ width: "100%" }}>复制到公众号</Button></span>
          <div className="es-morewrap">
            <Button variant="secondary" size="md" iconOnly title="更多方式" leading={<IconChevDown size={18} />} />
            {menu && <MoreMenu canPushDraft={canPushDraft} />}
          </div>
        </div>
      </div>

      {/* ---- backend-down soft banner ---- */}
      {backendDown && (
        <div className="es-down"><IconWarn size={15} stroke="var(--danger-ink)" />写作服务暂时连不上,复制 / 草稿等连上后再点。编辑和预览不受影响。</div>
      )}

      {/* ---- pro: view switch + three columns ---- */}
      {pro ? (
        <>
          <div className="es-tbrow">
            <Segmented value={proView} onChange={() => {}} options={[
              { value: "preview", label: "预览", icon: <IconEye size={15} /> },
              { value: "split", label: "拆分", icon: <Icon size={15}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 4v16" /></Icon> },
              { value: "triptych", label: "三栏", icon: <Icon size={15}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v16" /></Icon> },
            ]} />
            <span style={{ flex: 1 }}></span>
            <CompatBadge state="warn" />
          </div>
          <ProStage />
        </>
      ) : (
        <>
          {/* simple: format toolbar (wechat) or raw hint */}
          <div className="es-tbrow">
            {isWechat ? (
              <>
                <EditorToolbar compact={narrow} />
                <span style={{ flex: 1 }}></span>
                <CompatBadge state="warn" />
              </>
            ) : (
              <div className="es-rawhint">
                <Icon size={16} stroke="var(--info)"><path d="M8 5l11 7-11 7z" /></Icon>
                交互预览 · 仅用来验 SVG 动效,不代表最终样式
              </div>
            )}
          </div>

          {/* body */}
          {isWechat ? (
            <div className="wx-stage">
              <div className="wx-paperwrap">
                <div className="wx-meta-mode"><IconEye size={14} stroke="var(--ink-soft)" />公众号效果 · 所见即所得,可直接在下方编辑</div>
                <WxArticle editing={true} narrow={narrow} />
              </div>
            </div>
          ) : (
            <div className="es-rawstage">
              <div className="es-rawwrap">
                <div className="mbe-hint">
                  <span className="hi"><IconInfo size={15} stroke="var(--info-ink)" /></span>
                  <span>检测到 <b>可交互 SVG 动画</b>。切回<b>「公众号效果」</b>时它会失活、只看静态首帧——发布时图形仍会保留。</span>
                </div>
                <RawPreview height={narrow ? 360 : 440} />
              </div>
            </div>
          )}
        </>
      )}

      {/* ---- dialogs ---- */}
      {dialog === "copyReady" && <CopyReadyDialog narrow={narrow} />}
      {dialog === "copyBig" && <CopyReadyDialog narrow={narrow} big={true} />}
      {dialog === "copySuccess" && <CopySuccessPanel narrow={narrow} canSendToDraft={canPushDraft} />}
      {dialog === "block" && <ValidationBlockDialog narrow={narrow} />}
      {dialog === "smil" && <SmilWarningDialog narrow={narrow} />}
    </div>
  );
}

Object.assign(window, { EditorSurface });
