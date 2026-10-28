/**
 * dsh-activity-bar — client half.
 *
 * Two VS Code style rails live in the `shell.overlay` slot of the AppFrame:
 *
 *   left  rail — only on Windows desktop once the sidebar is collapsed. There the
 *                 host hides the whole sidebar column (collapsedWidth === 0) and
 *                 leaves two 28px controls in the title bar; this rail brings the
 *                 navigation back without paying 264–420px for it.
 *   right rail — while the right bar is collapsed. Its entries are read from the
 *                 `sidebarRightTabs` guide ledger, so third party tools show up
 *                 without us hard-coding a single tab kind.
 *
 * Space is reclaimed the same way other shell tweaks do it: the conversation grid
 * item gets a 44px margin on the rail side, so the stretched grid item simply
 * shrinks and the inline `grid-template-columns` of the frame stays untouched
 * (dragging the sidebar keeps working).
 *
 * The two switches live in a `settings.section` page and are stored in
 * localStorage. No Host route, no Config round trip — nothing to fail.
 */

window.__ModuleLoader__.load({
  id: 'dsh-activity-bar',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useRef, useState, useSyncExternalStore } = React

    /** Locale namespace of the plugin. */
    const NS = 'activityBar'
    /** Storage key of the two switches. */
    const STORAGE_KEY = 'dsh-activity-bar.prefs'
    /** Rail width in CSS pixels; mirrored by `--dsh-ab-width` in the stylesheet. */
    const RAIL_WIDTH = 44
    /** Where the dragged right-panel width is kept, apart from the two switches. */
    const RIGHT_WIDTH_KEY = 'dsh-activity-bar.rightbar-width'
    /** The host's own floor for the right panel; a drag never goes below it. */
    const RIGHTBAR_MIN_WIDTH = 300

    // ---------------------------------------------------------------- dictionary

    const dictionaries = {
      zh: {
        'rail.left': '左侧活动栏',
        'rail.workspace': '工作区',
        'rail.right': '右侧活动栏',
        'rail.resize': '拖动调整右侧面板宽度',
        'rail.expand': '展开侧边栏',
        'rail.newSession': '新会话',
        'settings.section': '活动栏',
        'settings.intro': '把两侧收起后的竖排图标条打开或关闭。',
        'settings.left': '启用左侧活动栏',
        'settings.left.desc': '侧边栏展开或收起时，左侧都显示一条 44px 的图标条。',
        'settings.right': '启用右侧活动栏',
        'settings.right.desc': '右侧栏收起后，在右侧显示一条 44px 的图标条。',
        'settings.hint': '设置保存在本机浏览器中，刷新后仍然生效。',
      },
      en: {
        'rail.left': 'Left activity bar',
        'rail.workspace': 'Workspace',
        'rail.right': 'Right activity bar',
        'rail.resize': 'Drag to resize the right panel',
        'rail.expand': 'Expand sidebar',
        'rail.newSession': 'New session',
        'settings.section': 'Activity Bar',
        'settings.intro': 'Turn the collapsed-rail icon bars on the two edges on or off.',
        'settings.left': 'Enable left activity bar',
        'settings.left.desc': 'Show a 44px icon rail on the left, whether the sidebar is expanded or collapsed.',
        'settings.right': 'Enable right activity bar',
        'settings.right.desc': 'Once the right bar is collapsed, show a 44px icon rail on the right.',
        'settings.hint': 'Saved in this browser and kept across reloads.',
      },
    }

    function prefersChinese() {
      try {
        const lang = document.documentElement.getAttribute('lang') || navigator.language || ''
        return /^zh/i.test(lang)
      } catch (error) {
        return true
      }
    }

    // --------------------------------------------------------------- stylesheet

    const CSS = `
.dsh-ab-rail{
  /* Fixed to the viewport, not to the frame: the strip has to survive the frame's
     overflow clip and any future change to its containing block. The space itself is
     still reserved by the frame padding, so the strip is always empty. */
  position:fixed;
  top:var(--dsh-ab-top,0px);
  bottom:var(--dsh-ab-bottom,0px);
  width:${RAIL_WIDTH}px;
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:2px;
  padding:8px 0;
  box-sizing:border-box;
  overflow:visible;
  z-index:2;
  color:var(--dsw-alias-label-secondary,#6b7280);
  /* The strip borrows the surface of the column it stands on, so rows the shell paints
     there (the sidebar foot) stay visible under it; a collapsed column has no surface of
     its own, so the strip paints one then. */
  background:transparent;
  /* The rail is a full-height strip over the column it belongs to; only its buttons may
     take clicks, or the sidebar foot rows behind it would stop responding. */
  pointer-events:none;
}
.dsh-ab-rail-left{
  /* The overlay spans the frame's whole padding box, so the strip the frame gave up is
     already inside its left edge; the rail only has to sit at zero. */
  left:0;
  border-right:.5px solid var(--dsw-alias-border-l3,rgba(0,0,0,.08));
}
html[data-dsh-ab-left="center"] .dsh-ab-rail-left{
  background:var(--dsw-specific-sidebar-fill,var(--dsw-alias-bg-base,#fff));
}
.dsh-ab-rail-right{
  /* Same box as the left rail: the frame's padding box already ends outside the strip. */
  right:0;
  /* The right edge belongs to the tool panel, which sits on the base surface. */
  border-left:.5px solid var(--dsw-alias-border-l3,rgba(0,0,0,.08));
}
html[data-dsh-ab-right="center"] .dsh-ab-rail-right{
  background:var(--dsw-alias-bg-base,var(--dsw-specific-sidebar-fill,#fff));
}
.dsh-ab-btn{
  position:relative;
  flex:none;
  width:32px;
  height:32px;
  padding:0;
  pointer-events:auto;
  border:0;
  border-radius:var(--dsw-radius-md,8px);
  display:inline-flex;
  align-items:center;
  justify-content:center;
  background:transparent;
  color:inherit;
  cursor:pointer;
}
.dsh-ab-btn:hover{
  background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));
  color:var(--dsw-alias-label-primary,#111);
}
.dsh-ab-btn:focus-visible{
  outline:2px solid var(--dsw-alias-state-business-primary,#4d6bfe);
  outline-offset:-2px;
}
.dsh-ab-btn[aria-current="true"],
.dsh-ab-btn.dsh-ab-btn-on{
  color:var(--dsw-alias-label-primary,#111);
}
.dsh-ab-btn[aria-current="true"]::before,
.dsh-ab-btn.dsh-ab-btn-on::before{
  content:"";
  position:absolute;
  left:-6px;
  top:50%;
  width:2px;
  height:18px;
  margin-top:-9px;
  border-radius:1px;
  background:var(--dsw-alias-state-business-primary,#4d6bfe);
}
.dsh-ab-rail-right .dsh-ab-btn[aria-current="true"]::before,
.dsh-ab-rail-right .dsh-ab-btn.dsh-ab-btn-on::before{
  left:auto;
  right:-6px;
}
.dsh-ab-btn svg{
  display:block;
  width:18px;
  height:18px;
}
.dsh-ab-btn::after{
  content:attr(data-label);
  position:absolute;
  top:50%;
  left:calc(100% + 10px);
  transform:translateY(-50%);
  max-width:40vw;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  padding:3px 8px;
  border-radius:var(--dsw-radius-sm,6px);
  border:.5px solid var(--dsw-alias-border-l3,rgba(0,0,0,.08));
  background:var(--dsw-alias-bg-base,#fff);
  color:var(--dsw-alias-label-primary,#111);
  font-size:12px;
  line-height:18px;
  box-shadow:0 4px 12px rgba(0,0,0,.12);
  opacity:0;
  pointer-events:none;
  z-index:40;
  transition:opacity .08s ease;
}
.dsh-ab-rail-right .dsh-ab-btn::after{
  left:auto;
  right:calc(100% + 10px);
}
.dsh-ab-btn:hover::after,
.dsh-ab-btn:focus-visible::after{
  opacity:1;
  transition-delay:.5s;
}
.dsh-ab-sep{
  flex:none;
  width:20px;
  height:.5px;
  margin:5px 0;
  background:var(--dsw-alias-border-l3,rgba(0,0,0,.12));
}
.dsh-ab-spacer{
  flex:1 1 auto;
}
/* Panel entries keep the upper two thirds; the host's footer row owns the rest. */
.dsh-ab-top{
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:2px;
  width:100%;
  flex:0 1 67%;
  min-height:0;
  overflow-y:auto;
  scrollbar-width:none;
}
.dsh-ab-top::-webkit-scrollbar{
  display:none;
}

/* Space reservation. The rail gets a strip of its own: the frame pads on that side, so
   every host column (the fixed sidebar track, the flexible centre, the right column with
   its header and collapse button) shifts inward together and the middle column reflows
   through the host's own grid. Padding an inner box or a grid item instead left shell
   chrome — the right panel header, the sidebar's fixed 280px box — sitting under the rail,
   which is what "no separate strip, buttons overlap" looked like. */
html[data-dsh-ab-left] [data-dsh-ab-frame]{
  padding-left:${RAIL_WIDTH}px !important;
  box-sizing:border-box !important;
}
html[data-dsh-ab-right] [data-dsh-ab-frame]{
  padding-right:${RAIL_WIDTH}px !important;
  box-sizing:border-box !important;
}
/* The rail carries the panel entries itself, so the sidebar drops the duplicated
   navigation and keeps the workspace content only. */
html[data-dsh-ab-left="sidebar"] [data-dsh-ab-sidebar] nav[class*="panelList"]{
  display:none;
}
/* The sidebar foot (its action rows, the settings trigger, the account launcher) moves
   into the rail's own strip. It is pinned to the rail's coordinates, the same box the
   rail draws itself in, instead of being measured into place: every earlier attempt
   measured the host's padding chain and stepped the strip left by that amount, and each
   build moved the chain a few pixels, so the tiles never landed on the rail's centre
   line — which is exactly what "the icons are still not centred" looked like. A fixed
   box at left:0 with the rail width cannot drift, and the wrappers in between are
   dissolved with display:contents so the real buttons, not their groups, are the flex
   items. Rules are !important because the host writes its own sizes inline. */
/* The pinned strip sits in the rail's own 44px column — the frame is padded by exactly
   that width — so the sidebar never runs underneath the tiles. Reserving the strip's
   height at the sidebar's foot, as an earlier build did, only shortened the workspace
   tree and left a blank band over it (the 16:22 report: "the tree should render here"). */
html[data-dsh-ab-left="sidebar"] [data-dsh-ab-sidebar]{
  overflow:visible !important;
}
html[data-dsh-ab-left="sidebar"] [data-dsh-ab-sidebar] [class*="footArea"]{
  position:fixed !important;
  left:0 !important;
  right:auto !important;
  top:auto !important;
  bottom:var(--dsh-ab-bottom,0px) !important;
  width:${RAIL_WIDTH}px !important;
  min-width:0 !important;
  margin:0 !important;
  display:flex !important;
  flex-direction:column !important;
  align-items:center !important;
  justify-content:flex-end !important;
  gap:2px !important;
  padding:8px 0 !important;
  border:0 !important;
  overflow:visible !important;
  box-sizing:border-box !important;
  /* Above the rail (z-index:2) so the tiles keep their clicks; the rail only takes
     pointer events on its own buttons, which sit in the strip's upper half. */
  z-index:3 !important;
  font-size:0 !important;
  line-height:0 !important;
}
/* Dissolve the host's row groups: their buttons become the foot's own flex items.
   Every div in between goes too — the account menu wraps its trigger in a root and an
   anchor that are 100% wide, and dissolving only the direct children left the 32px
   trigger pinned to the left edge of that full-width chain (the "avatar not centred"
   report). With the whole div chain transparent, the buttons are footArea's flex items
   and align-items:center actually applies to them. */
html[data-dsh-ab-left="sidebar"] [data-dsh-ab-sidebar] [class*="footArea"] > *{
  display:contents !important;
}
html[data-dsh-ab-left="sidebar"] [data-dsh-ab-sidebar] [class*="footArea"] div{
  display:contents !important;
}
/* Nothing inside may re-anchor itself: the host's own absolute rows (the 远程 launcher
   drifted over the tree) join the flow instead. Portalled menus live outside this
   subtree and are unaffected. */
html[data-dsh-ab-left="sidebar"] [data-dsh-ab-sidebar] [class*="footArea"] *{
  position:static !important;
}
html[data-dsh-ab-left="sidebar"] [data-dsh-ab-sidebar] [class*="footArea"] button,
html[data-dsh-ab-left="sidebar"] [data-dsh-ab-sidebar] [class*="footArea"] a,
html[data-dsh-ab-left="sidebar"] [data-dsh-ab-sidebar] [class*="footArea"] [role="button"]{
  display:flex !important;
  align-items:center !important;
  justify-content:center !important;
  flex:0 0 auto !important;
  width:32px !important;
  min-width:32px !important;
  max-width:32px !important;
  height:32px !important;
  min-height:32px !important;
  /* auto side margins, not align-self: they are resolved before align-self is consulted,
     so they centre the tile even when the row ships align-self:stretch inline (the
     remote plugin does). One rule, every row any plugin adds. */
  margin:0 auto !important;
  padding:0 !important;
  /* The host's row rule sets gap:8px, and a gap survives even when the label's text is
     zero-width: the icon and the empty label box are centred as a pair, which puts the
     glyph half a gap off the tile's centre line. Keep the vertical rhythm, drop the
     horizontal gap. */
  gap:2px 0 !important;
  overflow:hidden !important;
  border-radius:8px !important;
  box-sizing:border-box !important;
  font-size:0 !important;
  line-height:0 !important;
}
html[data-dsh-ab-left="sidebar"] [data-dsh-ab-sidebar] [class*="footArea"] svg,
html[data-dsh-ab-left="sidebar"] [data-dsh-ab-sidebar] [class*="footArea"] img{
  flex:none !important;
  width:18px !important;
  height:18px !important;
  margin:0 !important;
}
/* Text dies at the source (the host's own title/aria-label still drives tooltips).
   The buttons keep their background: one of them is the account avatar. */
html[data-dsh-ab-left="sidebar"] [data-dsh-ab-sidebar] [class*="footArea"] span,
html[data-dsh-ab-left="sidebar"] [data-dsh-ab-sidebar] [class*="footArea"] small,
html[data-dsh-ab-left="sidebar"] [data-dsh-ab-sidebar] [class*="footArea"] p,
html[data-dsh-ab-left="sidebar"] [data-dsh-ab-sidebar] [class*="footArea"] div{
  font-size:0 !important;
  line-height:0 !important;
}
/* A label that survives font-size:0 still takes part in the flex row. JS marks the text
   leaves, and they leave the layout entirely, so the icon is the only thing the tile
   centres. The avatar span carries no text and is never marked, so the account button
   keeps its picture. */
html[data-dsh-ab-left="sidebar"] [data-dsh-ab-sidebar] [class*="footArea"] [data-dsh-ab-label]{
  display:none !important;
}
/* The account row: JS stamps data-dsh-ab-account on it, the CSS pins it to the bottom
   of the strip and centres it. Everything else keeps the flow the host chose. */
html[data-dsh-ab-left="sidebar"] [data-dsh-ab-sidebar] [class*="footArea"] [data-dsh-ab-account]{
  order:9999 !important;
  align-self:center !important;
  margin-top:auto !important;
}
/* The 远程 entry, moved in by JS from the dsh-web-remote plugin's own mount point,
   joins the same strip. It is not a host row: the plugin creates the button
   (#webrm-native) on a timer and sizes it with inline styles, so position:relative
   gives its channel-health dot an anchor inside the 32px tile. */
html[data-dsh-ab-left="sidebar"] [data-dsh-ab-sidebar] [class*="footArea"] [data-dsh-ab-remote]{
  position:relative !important;
  display:flex !important;
  align-items:center !important;
  justify-content:center !important;
  width:32px !important;
  min-width:32px !important;
  max-width:32px !important;
  height:32px !important;
  padding:0 !important;
  margin:0 auto !important;
  overflow:visible !important;
  border-radius:8px !important;
  font-size:0 !important;
  line-height:0 !important;
}
/* The blanket position:static must not flatten the dot the remote plugin pins to the
   button's corner; it stays absolute against the tile above. */
html[data-dsh-ab-left="sidebar"] [data-dsh-ab-sidebar] [class*="footArea"] [data-dsh-ab-remote] > i{
  position:absolute !important;
}

/* The right panel's own drag handle only exists while the panel is not fullscreen, and
   the layout service exposes no setRightbar. The width lives in two places: the panel
   element's inline width (from the rightbar slot's prop) and the frame's third grid
   track, which is only a ceiling, minmax(0px, rightbarMax). Rewriting the track alone
   slides the middle column and leaves the panel where it was — that is what the first
   build did. So the drag writes both: the track gives the column the space, and this
   rule pins the panel to the same width. The marker is the host's own
   data-sidebar-right-panel="push"; the fullscreen variant stays at 100vw. */
html[data-dsh-ab-right-w] [data-sidebar-right-panel="push"]{
  width:var(--dsh-ab-rightbar-width,auto) !important;
  /* The panel also receives its width as an inline custom property; an inline normal
     declaration outranks a normal author one, so this needs its own !important or the
     header and lists inside keep laying out for the host's old width. */
  --dsh-sidebar-width:var(--dsh-ab-rightbar-width,auto) !important;
}
.dsh-ab-resize{
  position:fixed;
  top:var(--dsh-ab-top,0px);
  bottom:var(--dsh-ab-bottom,0px);
  width:10px;
  margin-left:-5px;
  z-index:4;
  cursor:col-resize;
  touch-action:none;
  background:transparent;
}
.dsh-ab-resize::after{
  content:"";
  position:absolute;
  top:0;
  bottom:0;
  left:4px;
  width:2px;
  border-radius:1px;
  background:transparent;
  transition:background-color .12s ease;
}
.dsh-ab-resize:hover::after,
.dsh-ab-resize:focus-visible::after,
html[data-dsh-ab-resizing] .dsh-ab-resize::after{
  background:var(--dsw-alias-state-business-primary,#4d6bfe);
}
html[data-dsh-ab-resizing]{
  cursor:col-resize;
  user-select:none;
}

/* The macOS frame is translucent, so the rail borrows whatever is behind it. */
html[data-platform=darwin] .dsh-ab-rail{
  background:transparent;
}

/* Settings page rows. */
.dsh-ab-settings{
  display:flex;
  flex-direction:column;
  padding:4px 0 8px;
}
.dsh-ab-settings-intro{
  margin:0 0 8px;
  color:var(--dsw-alias-label-secondary,#6b7280);
  font-size:13px;
  line-height:20px;
}
.dsh-ab-row{
  display:flex;
  align-items:center;
  gap:16px;
  padding:14px 0;
  border-bottom:.5px solid var(--dsw-alias-border-l3,rgba(0,0,0,.08));
}
.dsh-ab-row:last-of-type{
  border-bottom:0;
}
.dsh-ab-row-copy{
  flex:1 1 auto;
  min-width:0;
}
.dsh-ab-row-title{
  color:var(--dsw-alias-label-primary,#111);
  font-size:14px;
  line-height:22px;
}
.dsh-ab-row-desc{
  margin-top:2px;
  color:var(--dsw-alias-label-secondary,#6b7280);
  font-size:12px;
  line-height:18px;
}
.dsh-ab-switch{
  position:relative;
  flex:none;
  width:36px;
  height:20px;
  padding:0;
  border:0;
  border-radius:10px;
  background:var(--dsw-alias-border-l3,rgba(0,0,0,.2));
  cursor:pointer;
  transition:background .15s ease;
}
.dsh-ab-switch:hover{
  background:var(--dsw-alias-border-l2,rgba(0,0,0,.28));
}
.dsh-ab-switch:focus-visible{
  outline:2px solid var(--dsw-alias-state-business-primary,#4d6bfe);
  outline-offset:2px;
}
.dsh-ab-switch-on,
.dsh-ab-switch-on:hover{
  background:var(--dsw-alias-state-business-primary,#4d6bfe);
}
.dsh-ab-knob{
  position:absolute;
  top:2px;
  left:2px;
  width:16px;
  height:16px;
  border-radius:50%;
  background:#fff;
  box-shadow:0 1px 2px rgba(0,0,0,.2);
  transition:transform .15s ease;
}
.dsh-ab-switch-on .dsh-ab-knob{
  transform:translateX(16px);
}
.dsh-ab-settings-hint{
  margin:4px 0 0;
  color:var(--dsw-alias-label-tertiary,#9ca3af);
  font-size:12px;
  line-height:18px;
}
`

    const STYLE_ID = 'dsh-activity-bar.css'

    function injectStyles() {
      if (document.querySelector('style[data-plugin-css="' + STYLE_ID + '"]')) return () => {}
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-activity-bar'
      tag.dataset.pluginCss = STYLE_ID
      tag.textContent = CSS
      document.head.appendChild(tag)
      return () => {
        tag.remove()
      }
    }

    // -------------------------------------------------------------- prefs store

    function readPrefs() {
      const prefs = { left: true, right: true }
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (typeof parsed.left === 'boolean') prefs.left = parsed.left
          if (typeof parsed.right === 'boolean') prefs.right = parsed.right
        }
      } catch (error) {
        /* private mode / corrupted value: fall back to the defaults */
      }
      return prefs
    }

    function createPrefsStore() {
      let snapshot = readPrefs()
      const listeners = new Set()
      return {
        getSnapshot: () => snapshot,
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        set(patch) {
          const next = { left: snapshot.left, right: snapshot.right }
          if (typeof patch.left === 'boolean') next.left = patch.left
          if (typeof patch.right === 'boolean') next.right = patch.right
          if (next.left === snapshot.left && next.right === snapshot.right) return
          snapshot = next
          try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
          } catch (error) {
            /* keep the in-memory value even when storage is unavailable */
          }
          for (const listener of Array.from(listeners)) {
            try {
              listener()
            } catch (error) {
              /* one broken listener must not stop the others */
            }
          }
        },
      }
    }

    // ------------------------------------------------------------------- icons

    /** 24×24 stroke icons, keyed by role. */
    const ICONS = {
      sidebar: ['M4 5h16v14H4z', 'M9 5v14'],
      expand: ['M4 5h16v14H4z', 'M9 5v14', 'M14 9l3 3-3 3'],
      puzzle: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
      clock: ['M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16', 'M12 8v4l3 2'],
      eye: ['M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z', 'M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z'],
      dots: ['M6 12h.01', 'M12 12h.01', 'M18 12h.01'],
      memory: ['M12 3a3 3 0 0 0-3 3v1a3 3 0 0 0 0 10v1a3 3 0 0 0 6 0v-1a3 3 0 0 0 0-10V6a3 3 0 0 0-3-3z', 'M12 8v8'],
      folder: ['M3 6h6l2 2h10v10H3z'],
      layers: ['M12 3l9 4.5-9 4.5-9-4.5z', 'M3 12.5l9 4.5 9-4.5'],
      terminal: ['M3 4h18v16H3z', 'M7 10l3 3-3 3', 'M13 16h4'],
      branch: ['M7 4v10', 'M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M17 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M17 8a8 8 0 0 1-8 8'],
      globe: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18', 'M3 12h18', 'M12 3c2.5 2.4 4 5.6 4 9s-1.5 6.6-4 9c-2.5-2.4-4-5.6-4-9s1.5-6.6 4-9z'],
      list: ['M4 7h16', 'M4 12h16', 'M4 17h10'],
      chat: ['M4 5h16v11H9l-5 4z'],
      book: ['M5 4h9l5 4v12H5z', 'M14 4v4h5'],
      spark: ['M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z'],
      dot: ['M12 11.25a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5z'],
    }

    /** Map a panel id or a tab kind onto one of the bundled glyphs. */
    function glyphFor(key) {
      const value = String(key || '').toLowerCase()
      if (!value) return 'dot'
      if (value.includes('plugin')) return 'puzzle'
      if (value.includes('schedul') || value.includes('automation') || value.includes('cron') || value.includes('task')) return 'clock'
      if (value.includes('context') || value.includes('insight')) return 'eye'
      if (value.includes('memor') || value.includes('mneme')) return 'memory'
      if (value.includes('more')) return 'dots'
      if (value.includes('terminal') || value.includes('shell') || value.includes('console')) return 'terminal'
      if (value.includes('git') || value.includes('change') || value.includes('diff')) return 'branch'
      if (value.includes('browser') || value.includes('preview') || value.includes('web')) return 'globe'
      if (value.includes('chat') || value.includes('side') || value.includes('conversation')) return 'chat'
      if (value.includes('layer')) return 'layers'
      if (value.includes('file') || value.includes('explorer') || value.includes('document')) return 'folder'
      if (value.includes('agent') || value.includes('bot') || value.includes('setting')) return 'spark'
      if (value.includes('list') || value.includes('queue') || value.includes('job')) return 'list'
      if (value.includes('note') || value.includes('doc') || value.includes('archive')) return 'book'
      return 'dot'
    }

    function Glyph(props) {
      const paths = ICONS[props.name] || ICONS.dot
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
          focusable: 'false',
        },
        paths.map((d, index) => h('path', { key: index, d })),
      )
    }

    // -------------------------------------------------------------- shell state

    /** The shell may mount behind a display:contents slot host; find the real box. */
    function resolveInner(column) {
      if (!column) return null
      let node = column.firstElementChild
      let guard = 0
      while (node && guard < 6) {
        let transparent = false
        try {
          transparent = window.getComputedStyle(node).display === 'contents'
        } catch (error) {
          transparent = false
        }
        if (!transparent) return node
        node = node.firstElementChild
        guard += 1
      }
      return column.firstElementChild || null
    }

    /**
     * The 远程 entry is not a host row at all: the dsh-web-remote plugin creates its
     * own button (#webrm-native) on a polling timer and mounts it wherever it finds
     * room — on desktop that is inside the workspace tree, never in the foot, so CSS
     * scoped to footArea cannot reach it. Its accessible name is 「远程访问」, so a
     * bare-text lookup misses it too. Claim it by id first, then fall back to any row
     * whose own text is exactly 远程 (host rows on other builds). The plugin may
     * create the button seconds after this effect first runs, so keep sweeping until
     * it shows up. The disposer puts the node back exactly where it came from.
     */
    function relocateRemoteRow() {
      const sidebar = document.querySelector('[data-dsh-ab-sidebar]')
      const foot = document.querySelector('[data-dsh-ab-sidebar] [class*="footArea"]')
      if (!sidebar || !foot) return () => {}
      const moved = []
      const claim = (node) => {
        if (!node || node.parentElement === foot) return
        const originalParent = node.parentElement
        const originalNext = node.nextSibling
        foot.appendChild(node)
        node.setAttribute('data-dsh-ab-remote', '')
        moved.push({ node, originalParent, originalNext })
      }
      const sweep = () => {
        // While the sidebar is collapsed the host sets the foot to display:none; claiming
        // the button then would hide it instead of showing it in the strip, so wait.
        if (foot.getBoundingClientRect().width <= 0) return
        claim(typeof document.getElementById === 'function' ? document.getElementById('webrm-native') : null)
        for (const node of sidebar.querySelectorAll('a, button, [role="button"], li, [role="menuitem"]')) {
          if (node.hasAttribute('data-dsh-ab-remote')) continue
          const text = (node.textContent || '').trim()
          const name = `${node.getAttribute('aria-label') || ''} ${node.getAttribute('title') || ''}`
          if (text === '远程' || (!text && /远程|remote/i.test(name))) claim(node)
        }
      }
      sweep()
      let timer = 0
      let tries = 0
      if (!moved.length) {
        timer = window.setInterval(() => {
          tries += 1
          sweep()
          if (moved.length || tries >= 30) window.clearInterval(timer)
        }, 1000)
      }
      return () => {
        if (timer) window.clearInterval(timer)
        for (const entry of moved) {
          entry.node.removeAttribute('data-dsh-ab-remote')
          if (entry.node.parentElement !== foot) continue
          if (!entry.originalParent || entry.originalParent.isConnected === false) continue
          try {
            entry.originalParent.insertBefore(entry.node, entry.originalNext || null)
          } catch (error) {
            entry.originalParent.appendChild(entry.node)
          }
        }
      }
    }

    /**
     * The foot strip is a flex column, so the account row is pushed to the bottom with a
     * flex order and centred there — stamped as a marker, never moved in the DOM.
     * The host labels the trigger 「账号菜单」/「Account menu」, which no keyword list
     * reliably covers, so match structurally first (the button owning the avatar span),
     * keep the old text match as a fallback, and re-scan on foot mutations: React remounts
     * the trigger whenever the account state changes, and an unstamped trigger falls back
     * to the host's width:100% row — which is exactly what "the avatar is not centred"
     * looks like.
     */
    function orderFootRows() {
      const foot = document.querySelector('[data-dsh-ab-sidebar] [class*="footArea"]')
      if (!foot) return () => {}
      const stamped = []
      const labelled = []
      const stamp = (node) => {
        if (!node || node.hasAttribute('data-dsh-ab-account')) return
        node.setAttribute('data-dsh-ab-account', '')
        stamped.push(node)
      }
      /**
       * The tile hides its text with font-size:0, but a text span is still a flex item:
       * its box plus the host's row gap are centred together with the glyph, which puts
       * the icon about half a gap off the tile's centre line. Marking the text leaves
       * lets the stylesheet take them out of the layout. Anything carrying an icon, or
       * with no text of its own (the avatar span, the channel dot), is left alone.
       */
      const stampLabels = () => {
        for (const node of foot.querySelectorAll('span, small, p, label, b, em, strong, i')) {
          if (node.hasAttribute('data-dsh-ab-label')) continue
          if (!(node.textContent || '').trim()) continue
          if (typeof node.querySelector === 'function' && node.querySelector('svg, img, canvas')) continue
          node.setAttribute('data-dsh-ab-label', '')
          labelled.push(node)
        }
      }
      const sweep = () => {
        stampLabels()
        for (const avatar of foot.querySelectorAll('span[class*="avatar"], img[class*="avatar"]')) {
          let node = avatar
          let guard = 0
          while (node && guard < 4) {
            if (node.tagName === 'BUTTON' || node.getAttribute('role') === 'button') break
            node = node.parentElement
            guard += 1
          }
          stamp(node)
        }
        for (const node of foot.querySelectorAll('button, a, [role="button"]')) {
          const name = `${node.getAttribute('aria-label') || ''} ${node.getAttribute('title') || ''} ${node.textContent || ''}`
          if (!/登录|账号|account|profile|用户|user|avatar|头像/i.test(name)) continue
          stamp(node)
        }
      }
      sweep()
      let observer = null
      if (typeof MutationObserver === 'function') {
        observer = new MutationObserver(sweep)
        observer.observe(foot, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
      }
      return () => {
        if (observer) observer.disconnect()
        for (const node of stamped) node.removeAttribute('data-dsh-ab-account')
        for (const node of labelled) node.removeAttribute('data-dsh-ab-label')
      }
    }

    /** Split a `grid-template-columns` value on the spaces that separate tracks. */
    function splitTracks(value) {
      const parts = []
      let depth = 0
      let current = ''
      for (const character of value) {
        if (character === '(') depth += 1
        if (character === ')') depth -= 1
        if (character === ' ' && depth === 0) {
          if (current) parts.push(current)
          current = ''
          continue
        }
        current += character
      }
      if (current) parts.push(current)
      return parts
    }

    /**
     * Resize the right panel by dragging its left edge.
     *
     * The host renders its own handle only while the panel is not fullscreen, and the
     * layout service exposes no setRightbar, so the width cannot be driven through the
     * store. The frame does write its three tracks inline — `1fr minmax(0,1fr)
     * minmax(0,Wpx)` — and the third one is the panel width, so a drag writes that
     * track directly. The host recomputes the track when the rails toggle or the window
     * resizes, so a MutationObserver puts the chosen width back.
     */
    function mountRightResize(shell, label) {
      const frame = shell.frame
      const column = shell.rightbar
      /* Mounted whether or not the panel is open right now: the handle has to be there
         the first time the host opens it, and a mount gated on the open state only came
         back on the next unrelated re-render. Visibility is gated in sync() instead. */
      if (!frame || !column) return () => {}
      if (typeof document.createElement !== 'function') return () => {}
      const root = document.documentElement
      const readSaved = () => {
        try {
          const value = Number(window.localStorage.getItem(RIGHT_WIDTH_KEY))
          return Number.isFinite(value) && value > 0 ? Math.round(value) : 0
        } catch (error) {
          return 0
        }
      }
      let saved = readSaved()
      let dragging = null
      /** The last width the drag wrote; measured boxes lag one frame behind it. */
      let liveWidth = 0
      const handle = document.createElement('div')
      handle.className = 'dsh-ab-resize'
      handle.setAttribute('data-dsh-ab-resize', '')
      handle.setAttribute('role', 'separator')
      handle.setAttribute('aria-orientation', 'vertical')
      if (label) handle.setAttribute('aria-label', label)
      handle.tabIndex = 0
      const mountPoint = document.body || root
      mountPoint.appendChild(handle)

      const clamp = (width) => {
        const frameWidth = Math.round(frame.getBoundingClientRect().width) || 0
        if (!frameWidth) return 0
        const ceiling = Math.max(RIGHTBAR_MIN_WIDTH, Math.min(Math.round(frameWidth * 0.6), frameWidth - 520))
        return Math.max(RIGHTBAR_MIN_WIDTH, Math.min(ceiling, Math.round(width)))
      }
      /* The thing the drag resizes is the panel box; the column only carries the track,
         and it is zero-width whenever the occupant hangs its panel over the centre. */
      const surface = () => {
        const panel = column.querySelector('[data-sidebar-right-panel="push"]')
        if (panel && Math.round(panel.getBoundingClientRect().width) > 0) return panel
        return column
      }
      const place = () => {
        const rect = surface().getBoundingClientRect()
        if (!rect.width) {
          handle.style.display = 'none'
          return
        }
        handle.style.display = ''
        handle.style.left = `${Math.round(rect.left)}px`
      }
      const write = (width, persist) => {
        const value = clamp(width)
        /* Closed panel, no track: see isOpen() below. */
        if (!value || !isOpen()) return 0
        const tracks = splitTracks(String(frame.style.gridTemplateColumns || ''))
        if (tracks.length !== 3) return 0
        tracks[2] = `minmax(0px,${value}px)`
        frame.style.gridTemplateColumns = tracks.join(' ')
        /* The track is only the column's ceiling; the panel is a fixed-width box inside
           it. Pinning both is what actually moves the panel's left edge. */
        document.documentElement.style.setProperty('--dsh-ab-rightbar-width', `${value}px`)
        root.setAttribute('data-dsh-ab-right-w', '')
        liveWidth = value
        if (persist) {
          saved = value
          try {
            window.localStorage.setItem(RIGHT_WIDTH_KEY, String(value))
          } catch (error) {
            /* storage is optional */
          }
        }
        place()
        return value
      }

      const onDown = (event) => {
        if (event && typeof event.button === 'number' && event.button !== 0) return
        if (event && typeof event.preventDefault === 'function') event.preventDefault()
        const startWidth =
          liveWidth || Math.round(surface().getBoundingClientRect().width) || saved || RIGHTBAR_MIN_WIDTH
        dragging = { x: event ? event.clientX : 0, width: startWidth }
        if (event && typeof handle.setPointerCapture === 'function' && event.pointerId !== undefined) {
          try {
            handle.setPointerCapture(event.pointerId)
          } catch (error) {
            /* capture is a nicety, not a requirement */
          }
        }
        root.setAttribute('data-dsh-ab-resizing', '')
      }
      const onMove = (event) => {
        if (!dragging) return
        const x = event ? event.clientX : dragging.x
        // The panel grows to the left, so a smaller clientX means a wider panel.
        write(dragging.width + (dragging.x - x), false)
      }
      const onUp = () => {
        if (!dragging) return
        dragging = null
        root.removeAttribute('data-dsh-ab-resizing')
        // The measured box still holds the pre-drag width for one frame, so the width the
        // drag itself wrote is what gets kept.
        write(liveWidth || Math.round(surface().getBoundingClientRect().width), true)
      }
      const onKey = (event) => {
        if (!event || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
        if (typeof event.preventDefault === 'function') event.preventDefault()
        const current = Math.round(surface().getBoundingClientRect().width) || saved || RIGHTBAR_MIN_WIDTH
        write(current + (event.key === 'ArrowLeft' ? 24 : -24), true)
      }
      handle.addEventListener('pointerdown', onDown)
      handle.addEventListener('pointermove', onMove)
      handle.addEventListener('pointerup', onUp)
      handle.addEventListener('pointercancel', onUp)
      handle.addEventListener('keydown', onKey)

      /* The host marks the open panel itself, and its dock children are translated out
         and hidden while it is closed. A width written in that state reserves a track
         nobody fills, which shows up as a blank band the width of the last drag — the
         blank strip in the first report of this build. So the width is only ever
         written while the panel is open, and the panel-box pin is dropped when it
         closes. */
      const isOpen = () => {
        const panel = column.querySelector('[data-sidebar-right-panel]')
        if (panel) {
          /* Fullscreen is an overlay at 100vw and the column keeps a zero track there,
             so a width must never be written for that mode. */
          return (
            panel.getAttribute('data-sidebar-right-panel') === 'push' &&
            panel.hasAttribute('data-sidebar-right-open')
          )
        }
        return Math.round(column.getBoundingClientRect().width) > 8
      }
      const sync = () => {
        if (dragging) return
        if (!isOpen()) {
          root.removeAttribute('data-dsh-ab-right-w')
          handle.style.display = 'none'
          return
        }
        if (saved && Math.round(surface().getBoundingClientRect().width) > 0) write(saved, false)
        place()
      }

      let observer = null
      if (typeof MutationObserver === 'function') {
        observer = new MutationObserver(sync)
        /* Not just style/class: the host opens and closes the panel by flipping
           data-* attributes on the frame and on the panel, so a filter on style/class
           alone left the first open without a handle until something else moved. */
        observer.observe(frame, { attributes: true })
        observer.observe(column, {
          attributes: true,
          childList: true,
          subtree: true,
          attributeFilter: ['data-sidebar-right-open', 'data-sidebar-right-panel', 'class', 'style'],
        })
      }
      let boxObserver = null
      if (typeof ResizeObserver === 'function') {
        boxObserver = new ResizeObserver(() => sync())
        boxObserver.observe(column)
      }
      window.addEventListener('resize', sync)

      sync()

      return () => {
        if (observer) observer.disconnect()
        if (boxObserver) boxObserver.disconnect()
        window.removeEventListener('resize', sync)
        root.removeAttribute('data-dsh-ab-resizing')
        root.removeAttribute('data-dsh-ab-right-w')
        if (typeof handle.remove === 'function') handle.remove()
      }
    }

    /** Read everything the rails need straight from the mounted AppFrame. */
    function readShellState() {
      const root = document.documentElement
      const overlay = document.querySelector('[data-shell-overlay]')
      const frame = overlay ? overlay.parentElement : null
      let center = null
      let bottom = 0
      let top = 0
      let sidebar = null
      let rightbar = null
      let sidebarInner = null
      let rightbarInner = null
      let sidebarWidth = 0
      let rightbarWidth = 0
      if (frame) {
        sidebar = frame.firstElementChild
        const rightbarCol = frame.querySelector('[data-rightbar-col]')
        rightbar = rightbarCol
        sidebarInner = resolveInner(sidebar)
        rightbarInner = resolveInner(rightbar)
        center = rightbarCol && rightbarCol.previousElementSibling ? rightbarCol.previousElementSibling : null
        // Measure the columns instead of trusting their attributes: the frame publishes
        // its collapse flags a tick late, and a stale flag left the rail padding the wrong
        // box while the column was already open.
        sidebarWidth = sidebar ? Math.round(sidebar.getBoundingClientRect().width) || 0 : 0
        rightbarWidth = rightbar ? Math.round(rightbar.getBoundingClientRect().width) || 0 : 0
        const bottomRow = frame.querySelector('[data-shell-bottom]')
        if (bottomRow) bottom = Math.round(bottomRow.getBoundingClientRect().height) || 0
        try {
          const style = window.getComputedStyle(frame)
          const padding = Math.round(parseFloat(style.paddingTop) || 0)
          const clearance = Math.round(
            parseFloat(window.getComputedStyle(root).getPropertyValue('--dsh-frame-top-clearance')) || 0,
          )
          // The overlay covers the frame's padding box, title-bar strip included, so the
          // rails have to start below it themselves.
          top = Math.max(padding, clearance)
        } catch (error) {
          top = 0
        }
      }
      // The host keeps its own 56px icon rail on a plain web page, so the rail there
      // only owns the expanded state. Both desktop shells collapse to width 0.
      const mode = root.hasAttribute('data-windows-titlebar')
        ? 'windows'
        : (root.dataset && root.dataset.platform === 'darwin' ? 'darwin' : 'web')
      return {
        frame,
        sidebar,
        sidebarInner,
        center,
        rightbar,
        rightbarInner,
        top,
        bottom,
        mode,
        desktop: mode !== 'web',
        sidebarWidth,
        rightbarWidth,
        sidebarOpen: sidebarWidth > 8,
        rightbarOpen: rightbarWidth > 8,
        sidebarCollapsed: frame ? frame.getAttribute('data-sidebar-collapsed') === 'true' : false,
        rightbarCollapsed: frame ? frame.getAttribute('data-rightbar-collapsed') === 'true' : true,
      }
    }

    function sameShellState(a, b) {
      return (
        a.frame === b.frame &&
        a.sidebar === b.sidebar &&
        a.sidebarInner === b.sidebarInner &&
        a.center === b.center &&
        a.rightbar === b.rightbar &&
        a.rightbarInner === b.rightbarInner &&
        a.top === b.top &&
        a.bottom === b.bottom &&
        a.mode === b.mode &&
        a.sidebarWidth === b.sidebarWidth &&
        a.rightbarWidth === b.rightbarWidth &&
        a.sidebarCollapsed === b.sidebarCollapsed &&
        a.rightbarCollapsed === b.rightbarCollapsed
      )
    }

    function useShellState() {
      const [state, setState] = useState(readShellState)
      useEffect(() => {
        let raf = 0
        const sync = () => {
          raf = 0
          setState((prev) => {
            const next = readShellState()
            return sameShellState(prev, next) ? prev : next
          })
        }
        const schedule = () => {
          if (!raf) raf = window.requestAnimationFrame(sync)
        }

        const moRoot = new MutationObserver(schedule)
        moRoot.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['data-windows-titlebar'],
        })

        // The frame shows up a tick after the overlay mounts; retry briefly, then stop.
        let frameObserver = null
        let bottomObserver = null
        let columnObserver = null
        const attach = () => {
          const current = readShellState()
          const frame = current.frame
          if (!frame) return false
          frameObserver = new MutationObserver(schedule)
          frameObserver.observe(frame, {
            attributes: true,
            attributeFilter: [
              'data-sidebar-collapsed',
              'data-rightbar-collapsed',
              'data-rightbar-fullscreen',
            ],
          })
          const bottomRow = frame.querySelector('[data-shell-bottom]')
          if (bottomRow && typeof ResizeObserver === 'function') {
            bottomObserver = new ResizeObserver(schedule)
            bottomObserver.observe(bottomRow)
          }
          // Both columns are measured, not flagged: a stale collapse attribute must not
          // decide where the 44px goes.
          if (typeof ResizeObserver === 'function') {
            columnObserver = new ResizeObserver(schedule)
            if (current.sidebar) columnObserver.observe(current.sidebar)
            if (current.rightbar) columnObserver.observe(current.rightbar)
          }
          return true
        }

        let tries = 0
        const timer = window.setInterval(() => {
          tries += 1
          if (attach() || tries > 40) window.clearInterval(timer)
        }, 250)
        attach()

        window.addEventListener('resize', schedule)
        schedule()

        return () => {
          moRoot.disconnect()
          if (frameObserver) frameObserver.disconnect()
          if (bottomObserver) bottomObserver.disconnect()
          if (columnObserver) columnObserver.disconnect()
          window.removeEventListener('resize', schedule)
          window.clearInterval(timer)
          if (raf) window.cancelAnimationFrame(raf)
        }
      }, [])
      return state
    }

    // -------------------------------------------------------------------- apply

    function apply(ctx) {
      const disposeStyles = injectStyles()

      /** Translate a key, preferring the locale service and falling back to our own table. */
      let bound = null
      let disposeLocale = null
      try {
        const off = ctx.locale.register(NS, dictionaries)
        if (typeof off === 'function') disposeLocale = off
        bound = ctx.locale.bind(NS)
      } catch (error) {
        bound = null
      }

      function t(key) {
        if (bound) {
          try {
            const value = bound(key)
            if (typeof value === 'string' && value && value !== key) return value
          } catch (error) {
            /* fall through to the local table */
          }
        }
        const table = prefersChinese() ? dictionaries.zh : dictionaries.en
        return table[key] || key
      }

      const store = createPrefsStore()

      let resolveSlotLabel = null
      try {
        resolveSlotLabel = require('@deepseek-ai/dsh-client-ui-slots').resolveSlotLabel || null
      } catch (error) {
        resolveSlotLabel = null
      }

      function labelOf(label, fallback) {
        if (resolveSlotLabel) {
          try {
            const value = resolveSlotLabel(label)
            if (typeof value === 'string' && value) return value
          } catch (error) {
            /* ignore */
          }
        }
        try {
          if (typeof label === 'function') {
            const value = label()
            if (typeof value === 'string' && value) return value
          }
        } catch (error) {
          /* ignore */
        }
        if (typeof label === 'string' && label) return label
        return fallback
      }

      /** Panels of the left sidebar, sorted the way the sidebar itself sorts them. */
      function readPanels() {
        let entries = []
        try {
          entries = ctx.slots.entriesOfSlot('sidebar.panellist') || []
        } catch (error) {
          entries = []
        }
        const panels = []
        for (const entry of entries) {
          const options = (entry && entry.options) || {}
          if (!options.id) continue
          const order = typeof options.order === 'number' ? options.order : 0
          panels.push({
            id: options.id,
            order,
            label: labelOf(options.label, options.id),
            // Entries expose the plugin's own slot component; the rail renders it so each
            // panel keeps the icon its author drew instead of a look-alike from our set.
            icon: entry && typeof entry.component === 'function' ? entry.component : null,
          })
        }
        // the sidebar keeps registration order for equal orders, so do the same
        panels.sort((a, b) => a.order - b.order)
        return panels
      }

      /** Guide entries of the right bar, i.e. every registered tool, in host order. */
      function readGuide() {
        let tabs = null
        try {
          tabs = typeof ctx.get === 'function' ? ctx.get('sidebarRightTabs') : null
        } catch (error) {
          tabs = null
        }
        if (!tabs || typeof tabs.guide !== 'function') return []
        let entries = []
        try {
          entries = tabs.guide() || []
        } catch (error) {
          return []
        }
        const items = []
        for (const entry of entries) {
          if (!entry || !entry.kind) continue
          items.push({
            key: entry.id || entry.kind,
            kind: entry.kind,
            label: labelOf(entry.title, entry.id || entry.kind),
            description: labelOf(entry.description, ''),
          })
        }
        return items
      }

      function readActivePanelId() {
        try {
          const info = ctx.layout.panelInfo.getSnapshot()
          return info && info.activePanelId ? info.activePanelId : null
        } catch (error) {
          return null
        }
      }

      function readSidebarRight() {
        try {
          return typeof ctx.get === 'function' ? ctx.get('sidebarRight') : null
        } catch (error) {
          return null
        }
      }

      function openPanel(id) {
        try {
          // On the desktop shells a collapsed sidebar is width 0, so the panel would be
          // selected behind a closed column; bring the column back first.
          if (readShellState().sidebarCollapsed) ctx.layout.toggleSidebar()
        } catch (error) {
          /* ignore */
        }
        try {
          ctx.layout.selectPanel(id)
        } catch (error) {
          console.warn('[dsh-activity-bar] cannot select panel', id, error)
        }
      }

      function expandSidebar() {
        try {
          ctx.layout.toggleSidebar()
        } catch (error) {
          console.warn('[dsh-activity-bar] cannot toggle sidebar', error)
        }
      }

      function activateTool(item) {
        const controller = readSidebarRight()
        if (!controller) {
          console.warn('[dsh-activity-bar] sidebarRight service is not available')
          return
        }
        try {
          // Open only. Toggle states were tried twice and both misfired on a real
          // session (active() cannot see an uncommitted tab; the widened check closed
          // the panel on first contact), so the icon is now just an entry point.
          controller.openTab(item.kind)
        } catch (error) {
          console.warn('[dsh-activity-bar] cannot open tab', item.kind, error)
        }
      }

      // ------------------------------------------------------------- components

      const ICON_SIZE = 18
      const ComponentBase = (React && React.Component) || function SlotBase() {}

      // A panel entry's component is written against the sidebar slot, so it may expect
      // context this rail cannot provide. Keep one of them failing from taking the whole
      // rail down: the error boundary swaps in our own glyph.
      class PanelIcon extends ComponentBase {
        constructor(props) {
          super(props)
          this.state = { failed: false }
        }

        static getDerivedStateFromError() {
          return { failed: true }
        }

        componentDidCatch(error) {
          console.warn('[dsh-activity-bar] panel icon failed to render', error)
        }

        render() {
          if (this.state.failed) return h(Glyph, { name: this.props.glyph })
          return h(this.props.component, { size: ICON_SIZE, active: !!this.props.active })
        }
      }

      function RailButton(props) {
        const icon = props.icon
          ? h(PanelIcon, { component: props.icon, glyph: props.glyph, active: props.active })
          : h(Glyph, { name: props.glyph })
        return h(
          'button',
          {
            type: 'button',
            className: 'dsh-ab-btn' + (props.active ? ' dsh-ab-btn-on' : ''),
            'data-label': props.label,
            title: props.label,
            'aria-label': props.label,
            'aria-current': props.active ? 'true' : undefined,
            onClick: props.onClick,
          },
          icon,
        )
      }

      function ActivityBarOverlay() {
        const prefs = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
        const shell = useShellState()
        const [, setTick] = useState(0)
        const rerender = useCallback(() => setTick((value) => (value + 1) % 1000000), [])

        // Repaint when plugins add panels or the user switches language.
        useEffect(() => {
          const disposers = []
          try {
            const off = ctx.slots.subscribe('sidebar.panellist', rerender)
            if (typeof off === 'function') disposers.push(off)
          } catch (error) {
            /* the sidebar slot may not exist in a stripped build */
          }
          try {
            const off = ctx.locale.subscribe(rerender)
            if (typeof off === 'function') disposers.push(off)
          } catch (error) {
            /* ignore */
          }
          let offInfo = null
          try {
            offInfo = ctx.layout.panelInfo.subscribe(rerender)
          } catch (error) {
            offInfo = null
          }
          if (typeof offInfo === 'function') disposers.push(offInfo)
          return () => {
            for (const dispose of disposers) {
              try {
                dispose()
              } catch (error) {
                /* ignore */
              }
            }
          }
        }, [rerender])

        // Both desktop shells collapse their column to zero width, so the rail owns the
        // expanded state as well. A plain web page keeps the host's own 56px track, so
        // the rail there only covers the expanded state and never doubles the host nav.
        const showLeft = prefs.left && !!shell.frame && (shell.desktop || shell.sidebarOpen)
        const showRight = prefs.right && !!shell.frame

        // Reserve the rail columns and publish the measured geometry.
        // Mark the frame pieces once, then steer the reservation with the rail state:
        // "sidebar"/"toolbar" when the panel is open next to the rail, "center" when the
        // rail sits alone against the conversation column.
        useEffect(() => {
          const root = document.documentElement
          const frame = shell.frame
          if (frame) frame.setAttribute('data-dsh-ab-frame', '')
          if (shell.sidebar) shell.sidebar.setAttribute('data-dsh-ab-sidebar', '')
          if (shell.rightbar) shell.rightbar.setAttribute('data-dsh-ab-rightbar', '')
          if (shell.center) shell.center.setAttribute('data-dsh-ab-center', '')
          if (showLeft) {
            root.setAttribute('data-dsh-ab-left', shell.sidebarOpen ? 'sidebar' : 'center')
          } else {
            root.removeAttribute('data-dsh-ab-left')
          }
          if (showRight) {
            root.setAttribute('data-dsh-ab-right', shell.rightbarOpen ? 'toolbar' : 'center')
          } else {
            root.removeAttribute('data-dsh-ab-right')
          }
          // Claim the foreign 远程 row first: the sweep below stamps the labels of
          // whatever is already in the strip, and a row that lands after it would keep
          // its label box until the next mutation.
          const releaseRemote = showLeft ? relocateRemoteRow() : () => {}
          const releaseOrder = showLeft ? orderFootRows() : () => {}
          const releaseResize = showRight ? mountRightResize(shell, t('rail.resize')) : () => {}
          return () => {
            releaseOrder()
            releaseRemote()
            releaseResize()
            root.removeAttribute('data-dsh-ab-left')
            root.removeAttribute('data-dsh-ab-right')
          }
        }, [showLeft, showRight, shell.frame, shell.sidebar, shell.center, shell.rightbar, shell.sidebarOpen, shell.rightbarOpen])

        useEffect(() => {
          const style = document.documentElement.style
          style.setProperty('--dsh-ab-top', shell.top + 'px')
          style.setProperty('--dsh-ab-bottom', shell.bottom + 'px')
        }, [shell.top, shell.bottom])

        useEffect(() => {
          return () => {
            const root = document.documentElement
            root.removeAttribute('data-dsh-ab-left')
            root.removeAttribute('data-dsh-ab-right')
            const frame = document.querySelector('[data-dsh-ab-frame]')
            if (frame) frame.removeAttribute('data-dsh-ab-frame')
            for (const selector of [
              '[data-dsh-ab-center]',
              '[data-dsh-ab-sidebar]',
              '[data-dsh-ab-rightbar]',
            ]) {
              const node = document.querySelector(selector)
              if (node) {
                const attribute = selector.slice(1, -1)
                node.removeAttribute(attribute)
              }
            }
            root.style.removeProperty('--dsh-ab-top')
            root.style.removeProperty('--dsh-ab-bottom')
          }
        }, [])

        if (!showLeft && !showRight) return null

        const nodes = []

        if (showLeft) {
          const activeId = readActivePanelId()
          const panels = readPanels()
          const items = []
          for (const panel of panels) {
            items.push(
              h(RailButton, {
                key: panel.id,
                glyph: glyphFor(panel.id),
                icon: panel.icon,
                label: panel.label,
                active: activeId === panel.id,
                onClick: () => openPanel(panel.id),
              }),
            )
          }
          nodes.push(
            h(
              'div',
              {
                key: 'left',
                className: 'dsh-ab-rail dsh-ab-rail-left',
                role: 'toolbar',
                'aria-orientation': 'vertical',
                'aria-label': t('rail.left'),
              },
              h('div', { key: 'top', className: 'dsh-ab-top' }, items),
            ),
          )
        }

        if (showRight) {
          const tools = readGuide()
          if (tools.length) {
            const controller = readSidebarRight()
            let activeKind = null
            try {
              const expanded = controller && typeof controller.isExpanded === 'function' ? controller.isExpanded() : false
              const active = expanded && controller && typeof controller.active === 'function' ? controller.active() : null
              activeKind = active && active.kind ? active.kind : null
            } catch (error) {
              activeKind = null
            }
            nodes.push(
              h(
                'div',
                {
                  key: 'right',
                  className: 'dsh-ab-rail dsh-ab-rail-right',
                  role: 'toolbar',
                  'aria-orientation': 'vertical',
                  'aria-label': t('rail.right'),
                },
                tools.map((item) =>
                  h(RailButton, {
                    key: item.key,
                    glyph: glyphFor(item.kind + ' ' + item.key),
                    label: item.label,
                    active: activeKind === item.kind,
                    onClick: () => activateTool(item),
                  }),
                ),
              ),
            )
          }
        }

        if (!nodes.length) return null
        return h(React.Fragment, null, nodes)
      }

      function SettingsSection() {
        const prefs = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
        const rows = [
          { key: 'left', checked: prefs.left, title: t('settings.left'), desc: t('settings.left.desc') },
          { key: 'right', checked: prefs.right, title: t('settings.right'), desc: t('settings.right.desc') },
        ]
        return h(
          'div',
          { className: 'dsh-ab-settings' },
          h('p', { className: 'dsh-ab-settings-intro' }, t('settings.intro')),
          rows.map((row) =>
            h(
              'div',
              { key: row.key, className: 'dsh-ab-row' },
              h(
                'div',
                { className: 'dsh-ab-row-copy' },
                h('div', { className: 'dsh-ab-row-title' }, row.title),
                h('div', { className: 'dsh-ab-row-desc' }, row.desc),
              ),
              h(
                'button',
                {
                  type: 'button',
                  role: 'switch',
                  'aria-checked': row.checked ? 'true' : 'false',
                  'aria-label': row.title,
                  className: 'dsh-ab-switch' + (row.checked ? ' dsh-ab-switch-on' : ''),
                  onClick: () => store.set({ [row.key]: !row.checked }),
                },
                h('span', { className: 'dsh-ab-knob' }),
              ),
            ),
          ),
          h('p', { className: 'dsh-ab-settings-hint' }, t('settings.hint')),
        )
      }

      // ------------------------------------------------------------ registration

      const disposers = []
      try {
        disposers.push(
          ctx.slots.inject('shell.overlay', () =>
            ctx.slots.register(
              {
                name: 'shell.overlay',
                locale: NS,
                id: 'activity-bar',
                inject: () => ({}),
              },
              ActivityBarOverlay,
            ),
          ),
        )
      } catch (error) {
        console.error('[dsh-activity-bar] cannot register the overlay', error)
      }

      try {
        disposers.push(
          ctx.slots.inject('settings.section', () =>
            ctx.slots.register(
              {
                name: 'settings.section',
                locale: NS,
                id: 'activity-bar',
                order: 120,
                label: () => t('settings.section'),
                inject: () => ({}),
              },
              SettingsSection,
            ),
          ),
        )
      } catch (error) {
        console.error('[dsh-activity-bar] cannot register the settings page', error)
      }

      const dispose = () => {
        for (const item of disposers) {
          try {
            const maybe = typeof item === 'function' ? item() : null
            if (typeof maybe === 'function') maybe()
          } catch (error) {
            /* ignore */
          }
        }
        try {
          if (disposeLocale) disposeLocale()
        } catch (error) {
          /* ignore */
        }
        disposeStyles()
      }
      try {
        if (typeof ctx.effect === 'function') ctx.effect(() => dispose, 'dsh-activity-bar: dispose')
      } catch (error) {
        /* ignore */
      }
      return dispose
    }

    exports.apply = apply
    exports.inject = ['slots', 'layout', 'locale']

    return module.exports
  },
})
