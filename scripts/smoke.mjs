#!/usr/bin/env node
/**
 * Smoke test for lib/client.js.
 *
 * There is no DOM and no React in the plugin package, so this harness ships a
 * tiny fake of both: enough of `document`, `window`, `localStorage` and the React
 * hook contract to mount the plugin, render the two rails and click through them.
 * It asserts the browser-facing contract (slot registration, rails, labels,
 * click routing, switch persistence, space reservation) without a real browser.
 *
 * Run with: node scripts/smoke.mjs
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8')

// --------------------------------------------------------------------- fake DOM

let elementSeq = 0
const allElements = []

class FakeStyle {
  constructor(owner) {
    this.owner = owner
    this.props = new Map()
  }
  setProperty(name, value) {
    this.props.set(name, value)
  }
  removeProperty(name) {
    this.props.delete(name)
  }
  getPropertyValue(name) {
    return this.props.get(name) ?? ''
  }
}

const toDataAttribute = (property) =>
  'data-' + String(property).replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())

class FakeElement {
  constructor(tagName) {
    this.id = ++elementSeq
    this.tagName = String(tagName).toUpperCase()
    this.attributes = new Map()
    this.children = []
    this.parentElement = null
    this.style = new FakeStyle(this)
    // `dataset` reflects onto attributes, the way a real element behaves.
    this.dataset = new Proxy(
      {},
      {
        get: (_target, property) => {
          const value = this.attributes.get(toDataAttribute(property))
          return value === undefined ? undefined : value
        },
        set: (_target, property, value) => {
          this.attributes.set(toDataAttribute(property), String(value))
          return true
        },
        deleteProperty: (_target, property) => {
          this.attributes.delete(toDataAttribute(property))
          return true
        },
        has: (_target, property) => this.attributes.has(toDataAttribute(property)),
      },
    )
    this.textContent = ''
    this._height = 0
    this._width = 0
    this._paddingTop = '0px'
    allElements.push(this)
  }
  get firstElementChild() {
    return this.children[0] ?? null
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value))
  }
  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null
  }
  hasAttribute(name) {
    return this.attributes.has(name)
  }
  removeAttribute(name) {
    this.attributes.delete(name)
  }
  appendChild(child) {
    child.parentElement = this
    this.children.push(child)
    return child
  }
  insertBefore(child, ref) {
    if (ref && ref.parentElement === this) {
      const index = this.children.indexOf(ref)
      if (index >= 0) {
        this.children.splice(index, 1)
        this.children.splice(index, 0, child)
        child.parentElement = this
        return child
      }
    }
    return this.appendChild(child)
  }
  get nextSibling() {
    if (!this.parentElement) return null
    const index = this.parentElement.children.indexOf(this)
    return index >= 0 ? this.parentElement.children[index + 1] ?? null : null
  }
  get isConnected() {
    let node = this
    while (node.parentElement) node = node.parentElement
    return node === documentElement
  }
  remove() {
    if (!this.parentElement) return
    const index = this.parentElement.children.indexOf(this)
    if (index >= 0) this.parentElement.children.splice(index, 1)
    this.parentElement = null
  }
  addEventListener(type, handler) {
    if (!this._listeners) this._listeners = new Map()
    const list = this._listeners.get(type) ?? []
    list.push(handler)
    this._listeners.set(type, list)
  }
  removeEventListener(type, handler) {
    const list = this._listeners?.get(type)
    if (!list) return
    const index = list.indexOf(handler)
    if (index >= 0) list.splice(index, 1)
  }
  dispatchEvent(event) {
    const list = this._listeners?.get(event.type) ?? []
    for (const handler of [...list]) {
      handler({
        ...event,
        type: event.type,
        target: this,
        currentTarget: this,
        preventDefault() {},
        stopPropagation() {},
      })
    }
    return true
  }
  setPointerCapture() {}
  releasePointerCapture() {}
  hasPointerCapture() {
    return true
  }
  get previousElementSibling() {
    if (!this.parentElement) return null
    const index = this.parentElement.children.indexOf(this)
    return index > 0 ? this.parentElement.children[index - 1] : null
  }
  getBoundingClientRect() {
    return { height: this._height, width: this._width, top: 0, left: this._left ?? 0, right: this._width, bottom: this._height }
  }
  querySelector(selector) {
    return querySelectorAll(this, selector)[0] ?? null
  }
  querySelectorAll(selector) {
    return querySelectorAll(this, selector)
  }
}

function matches(element, selector) {
  const parts = selector.trim().split(/\s+/)
  if (parts.length === 1) return matchesCompound(element, parts[0])
  // descendant combinator: the element matches the last part and walking up finds the
  // earlier parts in order, outermost first.
  if (!matchesCompound(element, parts[parts.length - 1])) return false
  let node = element.parentElement
  let index = parts.length - 2
  while (node && index >= 0) {
    if (matchesCompound(node, parts[index])) index -= 1
    node = node.parentElement
  }
  return index < 0
}

function matchesCompound(element, selector) {
  const match = /^([a-zA-Z]+)?(?:\[([^\]=*]+)(?:\*)?(?:="([^"]*)")?\])?$/.exec(selector.trim())
  if (!match) return false
  const [, tag, attr, value] = match
  if (tag && element.tagName !== tag.toUpperCase()) return false
  if (attr) {
    const name = attr.endsWith('*') ? attr.slice(0, -1) : attr
    if (!element.attributes.has(name)) return false
    if (value !== undefined && !String(element.attributes.get(name)).includes(value)) return false
  }
  return true
}

function querySelectorAll(root, selector) {
  const list = selector.split(',').map((part) => part.trim())
  const found = []
  const walk = (node) => {
    for (const child of node.children) {
      if (list.some((entry) => matches(child, entry))) found.push(child)
      walk(child)
    }
  }
  walk(root)
  return found
}

const documentElement = new FakeElement('html')
const head = documentElement.appendChild(new FakeElement('head'))
const body = documentElement.appendChild(new FakeElement('body'))

const sidebarCol = new FakeElement('aside')
const centerCol = new FakeElement('main')
const rightbarCol = new FakeElement('aside')
const bottomRow = new FakeElement('div')
const overlay = new FakeElement('div')
const frame = new FakeElement('div')

frame.appendChild(sidebarCol)
frame.appendChild(centerCol)
frame.appendChild(rightbarCol)
frame.appendChild(bottomRow)
frame.appendChild(overlay)
body.appendChild(frame)

frame.setAttribute('data-sidebar-collapsed', 'true')
frame.setAttribute('data-rightbar-collapsed', 'true')
overlay.setAttribute('data-shell-overlay', '')
rightbarCol.setAttribute('data-rightbar-col', '')
bottomRow.setAttribute('data-shell-bottom', '')
bottomRow._height = 34
frame._paddingTop = '46px'
documentElement.setAttribute('data-windows-titlebar', '')

const storeMap = new Map()
const localStorage = {
  get length() {
    return storeMap.size
  },
  getItem: (key) => (storeMap.has(key) ? storeMap.get(key) : null),
  setItem: (key, value) => storeMap.set(key, String(value)),
  removeItem: (key) => storeMap.delete(key),
  clear: () => storeMap.clear(),
}

const document = {
  documentElement,
  head,
  body,
  createElement: (tag) => new FakeElement(tag),
  getElementById: (id) => allElements.find((el) => el.attributes.get('id') === id) ?? null,
  querySelector: (selector) => (matches(documentElement, selector) ? documentElement : querySelectorAll(documentElement, selector)[0] ?? null),
  querySelectorAll: (selector) => querySelectorAll(documentElement, selector),
  addEventListener() {},
  removeEventListener() {},
}

const windowListeners = new Map()
const window = {
  localStorage,
  document,
  navigator: { language: 'zh-CN' },
  getComputedStyle: (element) => ({
    paddingTop: element._paddingTop ?? '0px',
    getPropertyValue: (name) => (element._vars && element._vars.get(name)) || '',
  }),
  requestAnimationFrame: (fn) => setTimeout(fn, 0),
  cancelAnimationFrame: (id) => clearTimeout(id),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id),
  addEventListener: (name, handler) => {
    windowListeners.set(name, handler)
  },
  removeEventListener: (name) => windowListeners.delete(name),
}

const observerInstances = []
class MutationObserver {
  constructor(callback) {
    this.callback = callback
    observerInstances.push(this)
  }
  observe() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

class ResizeObserver {
  constructor(callback) {
    this.callback = callback
    observerInstances.push(this)
  }
  observe() {}
  disconnect() {}
}

/** Fire only the observers a given boot created, so older boots cannot write to the fixture. */
const fireObserversSince = (from) => {
  for (let index = from; index < observerInstances.length; index += 1) {
    observerInstances[index].callback([], observerInstances[index])
  }
}

function defineGlobal(name, value) {
  try {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  } catch (error) {
    /* a read-only platform global is fine to skip: the code under test reads the ones it needs */
  }
}

defineGlobal('window', window)
defineGlobal('document', document)
defineGlobal('navigator', window.navigator)
defineGlobal('localStorage', localStorage)
defineGlobal('MutationObserver', MutationObserver)
defineGlobal('ResizeObserver', ResizeObserver)

// ------------------------------------------------------------- fake React shims

const FRAGMENT = Symbol('fragment')

function createElement(type, props, ...children) {
  const flat = []
  const push = (child) => {
    if (child === null || child === undefined || child === false || child === true) return
    if (Array.isArray(child)) child.forEach(push)
    else flat.push(child)
  }
  children.forEach(push)
  return { type, props: props ?? {}, children: flat, key: props?.key ?? null }
}

/** Resolve nested function components (they use no hooks) into plain elements. */
function materialize(node) {
  if (!node || typeof node !== 'object') return node
  if (typeof node.type === 'function') return materialize(node.type(node.props))
  if (!node.children || !node.children.length) return node
  return { ...node, children: node.children.map(materialize) }
}

function makeRuntime() {
  const stores = new Map()
  let active = null
  let hookIndex = 0

  const storeFor = (component) => {
    let store = stores.get(component)
    if (!store) {
      store = { values: [], effects: [] }
      stores.set(component, store)
    }
    return store
  }

  const React = {
    Fragment: FRAGMENT,
    createElement,
    useState(initial) {
      const store = active
      const index = hookIndex++
      if (!(index in store.values)) {
        store.values[index] = typeof initial === 'function' ? initial() : initial
      }
      const setter = (next) => {
        store.values[index] = typeof next === 'function' ? next(store.values[index]) : next
      }
      return [store.values[index], setter]
    },
    useEffect(effect, deps) {
      const store = active
      const index = hookIndex++
      const previous = store.effects[index]
      const changed =
        !previous || !deps || !previous.deps || deps.length !== previous.deps.length || deps.some((d, i) => d !== previous.deps[i])
      if (!changed) return
      if (previous && typeof previous.cleanup === 'function') previous.cleanup()
      const cleanup = effect()
      store.effects[index] = { deps, cleanup: typeof cleanup === 'function' ? cleanup : undefined }
    },
    useCallback(fn) {
      hookIndex += 1
      return fn
    },
    useRef(initial) {
      const store = active
      const index = hookIndex++
      if (!(index in store.values)) store.values[index] = { current: initial }
      return store.values[index]
    },
    useSyncExternalStore(_subscribe, getSnapshot) {
      hookIndex += 1
      return getSnapshot()
    },
  }

  const render = (component) => {
    active = storeFor(component)
    hookIndex = 0
    const tree = component()
    active = null
    return materialize(tree)
  }

  return { React, render }
}

// ---------------------------------------------------------------- fake DSH ctx

function createHost() {
  const layoutCalls = []
  const registrations = []
  const localeSubs = new Set()
  const panelSubs = new Set()
  const state = { activePanelId: 'plugins' }

  const dictionaries = {}

  const tabsLedger = [
    { id: 'file-explorer', title: '文件', kind: 'files' },
    { id: 'context', title: '上下文', kind: 'context' },
    { id: 'git', title: 'Git', kind: 'git' },
    { id: 'memory', title: '记忆库', kind: 'memory' },
  ]

  const sidebarRight = {
    isExpanded: () => false,
    active: () => undefined,
    openTab: (kind, options) => layoutCalls.push(['openTab', kind, options]),
  }

  const tabs = {
    guide: () => tabsLedger.map((entry) => ({ ...entry })),
    get: (kind) => tabsLedger.find((entry) => entry.kind === kind),
  }

  const ctx = {
    effect(fn) {
      return fn()
    },
    get(name) {
      if (name === 'sidebarRight') return sidebarRight
      if (name === 'sidebarRightTabs') return tabs
      if (name === 'locale') return ctx.locale
      return undefined
    },
    locale: {
      register(namespace, table) {
        dictionaries[namespace] = table
      },
      bind(namespace) {
        return (key) => dictionaries[namespace]?.zh?.[key] ?? key
      },
      subscribe(callback) {
        localeSubs.add(callback)
        return () => localeSubs.delete(callback)
      },
    },
    slots: {
      entriesOfSlot(name) {
        if (name !== 'sidebar.panellist') return []
        return [
          { options: { id: 'context', order: 40, label: '上下文洞察' } },
          { options: { id: 'plugins', order: 10, label: '插件' } },
          { options: { id: 'memory', order: 30, label: () => '记忆' } },
          { options: { id: 'automation', order: 20, label: '定时任务' } },
        ]
      },
      subscribe(name, callback) {
        if (name === 'sidebar.panellist') panelSubs.add(callback)
        return () => panelSubs.delete(callback)
      },
      inject(name, factory) {
        factory()
        return () => {}
      },
      register(options, Component) {
        registrations.push({ options, Component })
        return () => {}
      },
    },
    layout: {
      panelInfo: {
        getSnapshot: () => ({ ...state }),
        subscribe: () => () => {},
      },
      selectPanel: (id) => layoutCalls.push(['selectPanel', id]),
      toggleSidebar: () => layoutCalls.push(['toggleSidebar']),
      closeRightbar: () => layoutCalls.push(['closeRightbar']),
    },
  }

  return { ctx, layoutCalls, registrations, sidebarRight, tabsLedger, state }
}

// ------------------------------------------------------------------- load module

const { React, render } = makeRuntime()
const factoryRequire = (name) => {
  if (name === 'react') return React
  throw new Error('unexpected require in smoke test: ' + name)
}

let loaded = null
const loader = {
  load(definition) {
    loaded = definition
  },
}
const sharedGlobals = { document, navigator: window.navigator, console, setTimeout, clearTimeout, MutationObserver, ResizeObserver }
const sandbox = { ...sharedGlobals, window: { ...window, __ModuleLoader__: loader } }
sandbox.window.__ModuleLoader__ = loader
vm.createContext(sandbox)
vm.runInContext(source, sandbox, { filename: 'lib/client.js' })

assert.ok(loaded, 'client.js must call window.__ModuleLoader__.load')
assert.equal(loaded.id, 'dsh-activity-bar', 'module id is the package name')

const plugin = loaded.factory(factoryRequire)
assert.ok(Array.isArray(plugin.inject), 'client module exports an inject list')
for (const service of ['slots', 'layout', 'locale']) {
  assert.ok(plugin.inject.includes(service), `inject must list the ${service} service`)
}

const host = createHost()
plugin.apply(host.ctx)

// -------------------------------------------------------------- style injection

const styleTag = document.head.children.find((node) => node.attributes.get('data-plugin-css') === 'dsh-activity-bar.css')
assert.ok(styleTag, 'stylesheet is injected once into <head>')
assert.match(styleTag.textContent, /\.dsh-ab-rail\{[\s\S]*?position:fixed/, 'the rail is fixed to the viewport, clear of the frame clip')
assert.match(
  styleTag.textContent,
  /html\[data-dsh-ab-left\] \[data-dsh-ab-frame\][\s\S]*?padding-left:44px !important/,
  'the left rail shrinks the whole frame grid instead of covering the sidebar chrome',
)
assert.match(
  styleTag.textContent,
  /html\[data-dsh-ab-right\] \[data-dsh-ab-frame\][\s\S]*?padding-right:44px !important/,
  'the right rail shrinks the whole frame grid, header and close button included',
)
assert.match(
  styleTag.textContent,
  /\.dsh-ab-rail-left\{[\s\S]*?left:0;/,
  'the left rail sits inside the strip the frame gave up',
)
assert.match(
  styleTag.textContent,
  /\.dsh-ab-rail-right\{[\s\S]*?right:0;/,
  'the right rail sits inside the strip the frame gave up',
)
assert.match(
  styleTag.textContent,
  /html\[data-dsh-ab-left="sidebar"\] \[data-dsh-ab-sidebar\] nav\[class\*="panelList"\][\s\S]*?display:none/,
  'the rail carries the panel entries, so the sidebar hides its own list',
)
assert.match(
  styleTag.textContent,
  /html\[data-dsh-ab-left="sidebar"\] \[data-dsh-ab-sidebar\] \[class\*="footArea"\]\{[\s\S]*?position:fixed !important;[\s\S]*?left:0 !important/,
  'the foot strip is pinned to the rail box, so its tiles share the rail centre line',
)
assert.doesNotMatch(
  styleTag.textContent,
  /--dsh-ab-foot-shift/,
  'the measured shift is gone: that measurement is what kept missing the centre',
)
assert.doesNotMatch(
  styleTag.textContent,
  /padding-bottom:var\(--dsh-ab-foot-space/,
  'the sidebar keeps its full height: the strip lives in the rail column, not over the tree',
)
assert.match(
  styleTag.textContent,
  /\[class\*="footArea"\] button,[^}]*?margin:0 auto !important/,
  'auto side margins centre every row, whatever align-self the row ships inline',
)
assert.match(
  styleTag.textContent,
  /\[class\*="footArea"\] button,[^}]*?gap:2px 0 !important/,
  'the host row gap is dropped horizontally, or the empty label box drags the icon off centre',
)
assert.match(
  styleTag.textContent,
  /\[data-dsh-ab-remote\]\{[^}]*?margin:0 auto !important/,
  'the remote tile centres by the same rule, not by a per-plugin exception',
)
assert.match(
  styleTag.textContent,
  /html\[data-dsh-ab-right-w\] \[data-sidebar-right-panel="push"\]\{[\s\S]*?width:var\(--dsh-ab-rightbar-width/,
  'the panel box itself is pinned to the dragged width, not just the grid track',
)
assert.match(
  styleTag.textContent,
  /\[class\*="footArea"\] \[data-dsh-ab-label\]\{[\s\S]*?display:none !important/,
  'text leaves are taken out of the layout instead of being shrunk to zero width',
)
assert.match(
  styleTag.textContent,
  /\.dsh-ab-resize\{[\s\S]*?cursor:col-resize/,
  'the right panel gets its own drag handle over the panel edge',
)
assert.match(
  styleTag.textContent,
  /html\[data-dsh-ab-left="sidebar"\] \[data-dsh-ab-sidebar\]\{[\s\S]*?overflow:visible !important/,
  'the open sidebar column stops clipping, or the foot parked one rail out vanishes',
)
assert.match(
  styleTag.textContent,
  /\[class\*="footArea"\] > \*\{[\s\S]*?display:contents !important/,
  'the foot wrappers dissolve so the real buttons become the flex items',
)
assert.match(
  styleTag.textContent,
  /html\[data-dsh-ab-left="sidebar"\] \[data-dsh-ab-sidebar\] \[class\*="footArea"\] button[\s\S]*?width:32px !important/,
  'and its rows shrink to their icons',
)
assert.match(
  styleTag.textContent,
  /\[class\*="footArea"\] span[\s\S]*?font-size:0 !important/,
  'the row labels are hidden, so no text is left under an icon',
)
assert.match(
  styleTag.textContent,
  /\[class\*="footArea"\] div\{[\s\S]*?display:contents !important/,
  'every div wrapper in the foot dissolves, or the 100%-wide account chain pins the avatar to the left edge',
)
assert.match(
  styleTag.textContent,
  /\[class\*="footArea"\] \[data-dsh-ab-remote\] > i\{[\s\S]*?position:absolute !important/,
  'the remote plugin health dot keeps its corner anchor inside the 32px tile',
)
assert.match(
  styleTag.textContent,
  /\[data-dsh-ab-account\]\{[\s\S]*?align-self:center !important/,
  'the account trigger is centred in the strip and pinned to its bottom',
)

// ---------------------------------------------------------------- registrations

assert.equal(host.registrations.length, 2, 'two slots are registered')
const overlayReg = host.registrations.find((entry) => entry.options.name === 'shell.overlay')
const settingsReg = host.registrations.find((entry) => entry.options.name === 'settings.section')
assert.ok(overlayReg, 'the overlay component is registered into shell.overlay')
assert.equal(overlayReg.options.id, 'activity-bar')
assert.equal(overlayReg.options.locale, 'activityBar')
assert.ok(settingsReg, 'the settings page is registered into settings.section')
assert.equal(settingsReg.options.order, 120)
assert.equal(settingsReg.options.label(), '活动栏', 'settings label goes through the dictionary')

// --------------------------------------------------------------------- rendering

const tree = render(overlayReg.Component)
assert.ok(tree, 'the overlay renders something while the rails are on')
const rails = collect(tree, (node) => node.props?.className?.includes('dsh-ab-rail'))
assert.equal(rails.length, 2, 'both rails render (sidebar collapsed + title bar + right bar collapsed)')

const leftRail = rails[0]
const rightRail = rails[1]
assert.equal(leftRail.props.className, 'dsh-ab-rail dsh-ab-rail-left')
assert.equal(rightRail.props.className, 'dsh-ab-rail dsh-ab-rail-right')
assert.equal(leftRail.props.role, 'toolbar')
assert.equal(leftRail.props['aria-orientation'], 'vertical')
assert.equal(leftRail.props['aria-label'], '左侧活动栏')

const leftButtons = collect(leftRail, (node) => node.type === 'button')
const rightButtons = collect(rightRail, (node) => node.type === 'button')
assert.equal(leftButtons.length, 4, 'left rail = the four registered panels')
assert.deepEqual(
  leftButtons.map((button) => button.props['aria-label']),
  ['插件', '定时任务', '记忆', '上下文洞察'],
  'panels keep the order the sidebar declared',
)
assert.equal(
  leftButtons.find((button) => button.props['aria-label'] === '插件').props['aria-current'],
  'true',
  'the active panel is marked',
)
assert.equal(
  rightButtons.map((button) => button.props['aria-label']).join(','),
  '文件,上下文,Git,记忆库',
  'right rail follows the guide ledger order',
)
for (const button of [...leftButtons, ...rightButtons]) {
  assert.equal(button.props.type, 'button')
  assert.ok(button.props['aria-label'], 'every button has an accessible name')
  assert.ok(button.props['data-label'], 'every button carries its tooltip text')
}

// icons: known ids resolve to their own glyph, unknown ones fall back to a dot
const glyphs = collect(leftRail, (node) => node.type === 'svg').map((node) => node.children.length)
assert.ok(glyphs.every((count) => count >= 1), 'every button renders at least one path')

// ------------------------------------------------------------- click routing

const automationButton = leftButtons.find((button) => button.props['aria-label'] === '定时任务')
automationButton.props.onClick()
assert.deepEqual(host.layoutCalls.at(-1), ['selectPanel', 'automation'], 'panel icons select the panel')

rightButtons[0].props.onClick()
assert.deepEqual(host.layoutCalls.at(-1), ['openTab', 'files', undefined], 'tool icons open the tab kind')

// a second click keeps working as open (open-only, no toggle states left to misfire)
host.sidebarRight.isExpanded = () => true
host.sidebarRight.active = () => ({ kind: 'git' })
const callsBeforeSecond = host.layoutCalls.length
rightButtons[2].props.onClick()
assert.deepEqual(host.layoutCalls.slice(callsBeforeSecond), [['openTab', 'git', undefined]], 'every click opens that tool')

// ------------------------------------------------------- effects and markers

assert.equal(documentElement.getAttribute('data-dsh-ab-left'), 'center', 'left rail takes the collapsed centre column')
assert.equal(documentElement.getAttribute('data-dsh-ab-right'), 'center', 'right rail takes the collapsed centre column')
assert.ok(frame.hasAttribute('data-dsh-ab-frame'), 'the frame carries the fallback marker')
assert.ok(sidebarCol.hasAttribute('data-dsh-ab-sidebar'), 'the sidebar column carries its marker')
assert.ok(rightbarCol.hasAttribute('data-dsh-ab-rightbar'), 'the right panel column carries its marker')
assert.ok(centerCol.hasAttribute('data-dsh-ab-center'), 'the conversation column carries the reservation marker')
assert.equal(
  documentElement.style.getPropertyValue('--dsh-ab-top'),
  '46px',
  'the rails start below the Windows title bar',
)
assert.equal(documentElement.style.getPropertyValue('--dsh-ab-bottom'), '34px', 'rail stops above the bottom row')

// ---------------------------------------------------------- switches and state

const settingsTree = render(settingsReg.Component)
const switches = collect(settingsTree, (node) => node.props?.role === 'switch')
assert.equal(switches.length, 2, 'the settings page exposes both switches')
assert.equal(switches[0].props['aria-checked'], 'true', 'left rail is on by default')
assert.equal(switches[1].props['aria-checked'], 'true', 'right rail is on by default')
assert.match(collect(settingsTree, (node) => node.props?.className === 'dsh-ab-settings-intro')[0].children[0], /图标条/)

switches[1].props.onClick()
assert.equal(localStorage.getItem('dsh-activity-bar.prefs'), '{"left":true,"right":false}', 'the switch persists')

const treeAfter = render(overlayReg.Component)
const railsAfter = collect(treeAfter, (node) => node.props?.className?.includes('dsh-ab-rail'))
assert.equal(railsAfter.length, 1, 'turning the right rail off removes it')
assert.equal(railsAfter[0].props.className, 'dsh-ab-rail dsh-ab-rail-left')

// reload the module: the stored preference must survive
storeMap.clear()
storeMap.set('dsh-activity-bar.prefs', '{"left":false,"right":true}')
const host2 = createHost()
const runtime2 = makeRuntime()
const sandbox2 = { ...sharedGlobals, window: { ...window, __ModuleLoader__: { load: (definition) => (loaded = definition) } } }
vm.createContext(sandbox2)
vm.runInContext(source, sandbox2, { filename: 'lib/client.js' })
const plugin2 = loaded.factory((name) => {
  if (name === 'react') return runtime2.React
  throw new Error('unexpected require: ' + name)
})
plugin2.apply(host2.ctx)
const overlay2 = host2.registrations.find((entry) => entry.options.name === 'shell.overlay')
const tree2 = runtime2.render(overlay2.Component)
assert.equal(collect(tree2, (node) => node.props?.className?.includes('dsh-ab-rail')).length, 1, 'stored preference is honoured')
assert.equal(
  collect(tree2, (node) => node.props?.className?.includes('dsh-ab-rail'))[0].props.className,
  'dsh-ab-rail dsh-ab-rail-right',
  'the stored left=false keeps only the right rail',
)

// an expanded sidebar keeps the left rail, and the reservation moves onto the sidebar
storeMap.set('dsh-activity-bar.prefs', '{"left":true,"right":true}')
frame.setAttribute('data-sidebar-collapsed', 'false')
// The shell reports zero width while collapsed; the reservation follows the measured box.
sidebarCol._width = 280
const runtime3 = makeRuntime()
const plugin3 = bootPlugin(runtime3.React)
const host3 = createHost()
plugin3.apply(host3.ctx)
const overlay3 = host3.registrations.find((entry) => entry.options.name === 'shell.overlay')
const tree3 = runtime3.render(overlay3.Component)
const rails3 = collect(tree3, (node) => node.props?.className?.includes('dsh-ab-rail'))
assert.equal(rails3.length, 2, 'the left rail stays while the sidebar is expanded')
assert.equal(rails3[0].props.className, 'dsh-ab-rail dsh-ab-rail-left')
const leftButtons3 = collect(rails3[0], (node) => node.type === 'button')
assert.equal(leftButtons3[0].props['aria-label'], '插件', 'the first icon stays the first panel while the sidebar is open')
assert.equal(leftButtons3[0].props['aria-current'], 'true', 'and the active panel keeps its marker')
assert.equal(
  documentElement.getAttribute('data-dsh-ab-left'),
  'sidebar',
  'the reservation moves onto the sidebar column',
)

// an open right panel moves the reservation onto its own column, header included
rightbarCol._width = 420
frame.setAttribute('data-rightbar-collapsed', 'false')
const runtime4 = makeRuntime()
const plugin4 = bootPlugin(runtime4.React)
const host4 = createHost()
plugin4.apply(host4.ctx)
const overlay4 = host4.registrations.find((entry) => entry.options.name === 'shell.overlay')
runtime4.render(overlay4.Component)
assert.equal(
  documentElement.getAttribute('data-dsh-ab-right'),
  'toolbar',
  'an open right panel reserves 44px inside its own column',
)

// ------------------------------------------- foot strip: remote row + centred avatar

storeMap.set('dsh-activity-bar.prefs', '{"left":true,"right":true}')
frame.setAttribute('data-sidebar-collapsed', 'false')
sidebarCol._width = 280

// The host's own markup around the account trigger: footArea > settingsArea >
// AccountMenu root > anchor > button > span.avatar. The trigger is only styleable
// once every wrapper div dissolves (display:contents).
const footArea = new FakeElement('div')
footArea.setAttribute('class', 'wtg9ga_footArea')
footArea._width = 44
footArea._left = 56
footArea._height = 112
sidebarCol.appendChild(footArea)
const settingsArea = new FakeElement('div')
settingsArea.setAttribute('class', 'wtg9ga_settingsArea')
footArea.appendChild(settingsArea)
const accountRoot = new FakeElement('div')
accountRoot.setAttribute('class', '_5Qcc8a_root')
settingsArea.appendChild(accountRoot)
const accountAnchor = new FakeElement('div')
accountAnchor.setAttribute('class', '_5Qcc8a_anchor')
accountRoot.appendChild(accountAnchor)
const accountTrigger = new FakeElement('button')
accountTrigger.setAttribute('aria-label', '账号菜单')
accountAnchor.appendChild(accountTrigger)
const avatarSpan = new FakeElement('span')
avatarSpan.setAttribute('class', '_5Qcc8a_avatar')
accountTrigger.appendChild(avatarSpan)

// dsh-web-remote's own button: created by another plugin and parked in the tree,
// labelled 「远程访问」 — the old exact-text lookup never matched it.
const treeRow = new FakeElement('div')
sidebarCol.appendChild(treeRow)
const remoteButton = new FakeElement('button')
remoteButton.setAttribute('id', 'webrm-native')
remoteButton.setAttribute('aria-label', '远程访问')
remoteButton.setAttribute('title', '远程访问')
// The real button keeps its icon and its label in separate children; the label is the
// box that used to survive font-size:0 inside the flex row.
const remoteLabelSpan = new FakeElement('span')
remoteLabelSpan.textContent = '远程'
remoteButton.appendChild(remoteLabelSpan)
treeRow.appendChild(remoteButton)

const runtime5 = makeRuntime()
const plugin5 = bootPlugin(runtime5.React)
const host5 = createHost()
plugin5.apply(host5.ctx)
const overlay5 = host5.registrations.find((entry) => entry.options.name === 'shell.overlay')
runtime5.render(overlay5.Component)

assert.equal(remoteButton.parentElement, footArea, 'the remote plugin button is claimed into the foot strip')
assert.ok(remoteButton.hasAttribute('data-dsh-ab-remote'), 'and marked so the CSS turns it into a 32px tile')
assert.ok(accountTrigger.hasAttribute('data-dsh-ab-account'), 'the account trigger is stamped through its avatar span')
assert.equal(
  documentElement.style.getPropertyValue('--dsh-ab-foot-shift'),
  '',
  'no measured shift is published any more',
)
assert.equal(
  documentElement.style.getPropertyValue('--dsh-ab-foot-space'),
  '',
  'nothing is published for a reserved band any more',
)
assert.ok(
  remoteLabelSpan.hasAttribute('data-dsh-ab-label'),
  'the 远程 label is marked so it leaves the tile layout',
)
assert.ok(
  !avatarSpan.hasAttribute('data-dsh-ab-label'),
  'the avatar span carries no text and is never marked',
)

// --------------------------------------- right panel: drag its left edge to resize

// The host writes its three frame tracks inline; the third one is the panel width.
storeMap.delete('dsh-activity-bar.rightbar-width')
rightbarCol._width = 320
rightbarCol._left = 1080
frame._width = 1400
frame.setAttribute('data-rightbar-collapsed', 'false')
frame.style.gridTemplateColumns = '1fr minmax(0,1fr) minmax(0,320px)'

const runtime6 = makeRuntime()
const plugin6 = bootPlugin(runtime6.React)
const host6 = createHost()
plugin6.apply(host6.ctx)
const overlay6 = host6.registrations.find((entry) => entry.options.name === 'shell.overlay')
runtime6.render(overlay6.Component)

const handles = allElements.filter((element) => element.attributes.has('data-dsh-ab-resize'))
assert.ok(handles.length > 0, 'an open right panel gets a drag handle')
const dragHandle = handles[handles.length - 1]
assert.equal(dragHandle.style.display, '', 'the handle is visible while the panel is open')
assert.equal(dragHandle.style.left, '1080px', 'the handle sits on the measured panel edge')

dragHandle.dispatchEvent({ type: 'pointerdown', button: 0, clientX: 1080, pointerId: 1 })
dragHandle.dispatchEvent({ type: 'pointermove', clientX: 980, pointerId: 1 })
assert.equal(
  frame.style.gridTemplateColumns,
  '1fr minmax(0,1fr) minmax(0px,420px)',
  'dragging the edge 100px left widens the panel by 100px',
)
dragHandle.dispatchEvent({ type: 'pointerup', clientX: 980, pointerId: 1 })
assert.equal(storeMap.get('dsh-activity-bar.rightbar-width'), '420', 'the chosen width is kept across reloads')
assert.equal(
  documentElement.style.getPropertyValue('--dsh-ab-rightbar-width'),
  '420px',
  'the width also reaches the panel box, which the grid track alone never moved',
)
assert.ok(documentElement.hasAttribute('data-dsh-ab-right-w'), 'the panel width rule only applies once a width is chosen')

dragHandle.dispatchEvent({ type: 'pointerdown', button: 0, clientX: 980, pointerId: 2 })
dragHandle.dispatchEvent({ type: 'pointermove', clientX: 0, pointerId: 2 })
const clamped = Number(/minmax\(0px,(\d+)px\)/.exec(frame.style.gridTemplateColumns)[1])
assert.ok(clamped <= 840, 'the drag never passes 60% of the frame')
assert.ok(clamped >= 300, 'and never shrinks the panel below the host floor')
dragHandle.dispatchEvent({ type: 'pointerup', clientX: 0, pointerId: 2 })

// The host rewrites the track on its own rerenders; the plugin puts the chosen width back.
const stored = storeMap.get('dsh-activity-bar.rightbar-width')
frame.style.gridTemplateColumns = '1fr minmax(0,1fr) minmax(0,320px)'
const runtime7 = makeRuntime()
const plugin7 = bootPlugin(runtime7.React)
const host7 = createHost()
plugin7.apply(host7.ctx)
const overlay7 = host7.registrations.find((entry) => entry.options.name === 'shell.overlay')
runtime7.render(overlay7.Component)
assert.equal(
  frame.style.gridTemplateColumns,
  `1fr minmax(0,1fr) minmax(0px,${stored}px)`,
  'a stored width is applied again after the host resets the track',
)

// ------------------------------------ closed panel: nothing is written until it opens
//
// The host hides the closed panel's dock children by translating them out; a width
// written in that state only reserves a track nobody fills. That band, as wide as the
// last drag, is the blank strip the second report showed.

storeMap.set('dsh-activity-bar.rightbar-width', '640')
rightbarCol._width = 0
frame._width = 1400
frame.setAttribute('data-rightbar-collapsed', 'true')
frame.style.gridTemplateColumns = '1fr minmax(0,1fr) minmax(0,0px)'
const closedPanel = new FakeElement('div')
closedPanel.setAttribute('data-sidebar-right-panel', 'push')
rightbarCol.appendChild(closedPanel)

const seen = observerInstances.length
// Earlier boots in this file leave the pin behind; in the real app the close path
// clears it, which is what the assertions below re-check for this boot.
documentElement.removeAttribute('data-dsh-ab-right-w')
const runtime8 = makeRuntime()
const plugin8 = bootPlugin(runtime8.React)
const host8 = createHost()
plugin8.apply(host8.ctx)
const overlay8 = host8.registrations.find((entry) => entry.options.name === 'shell.overlay')
runtime8.render(overlay8.Component)

assert.equal(
  frame.style.gridTemplateColumns,
  '1fr minmax(0,1fr) minmax(0,0px)',
  'a closed panel keeps the host track: no blank band is reserved',
)
assert.ok(!documentElement.hasAttribute('data-dsh-ab-right-w'), 'and the panel box is not pinned while closed')
const closedHandle = allElements.filter((element) => element.attributes.has('data-dsh-ab-resize')).at(-1)
assert.equal(closedHandle.style.display, 'none', 'no drag handle while the panel is closed')

// Opening flips the host's own attribute; the observers must notice without a resize.
closedPanel.setAttribute('data-sidebar-right-open', '')
rightbarCol._width = 640
fireObserversSince(seen)
assert.equal(
  frame.style.gridTemplateColumns,
  '1fr minmax(0,1fr) minmax(0px,640px)',
  'the first open applies the stored width immediately',
)
assert.equal(closedHandle.style.display, '', 'and the handle shows on that first open, no window resize needed')

// Closing releases both, so the band cannot come back.
closedPanel.removeAttribute('data-sidebar-right-open')
rightbarCol._width = 0
fireObserversSince(seen)
assert.ok(!documentElement.hasAttribute('data-dsh-ab-right-w'), 'closing releases the panel box pin')
assert.equal(closedHandle.style.display, 'none', 'and the handle goes away with the panel')

// Fullscreen is an overlay: the column's own track stays at zero, whatever was dragged.
closedPanel.setAttribute('data-sidebar-right-panel', 'fullscreen')
closedPanel.setAttribute('data-sidebar-right-open', '')
rightbarCol._width = 640
frame.style.gridTemplateColumns = '1fr minmax(0,1fr) minmax(0,0px)'
fireObserversSince(seen)
assert.equal(
  frame.style.gridTemplateColumns,
  '1fr minmax(0,1fr) minmax(0,0px)',
  'a fullscreen panel never gets a column track written for it',
)

function bootPlugin(reactModule) {
  let definition = null
  const sandbox = {
    ...sharedGlobals,
    window: { ...window, __ModuleLoader__: { load: (value) => (definition = value) } },
  }
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: 'lib/client.js' })
  return definition.factory((name) => {
    if (name === 'react') return reactModule
    throw new Error('unexpected require: ' + name)
  })
}

console.log('smoke: all assertions passed')
process.exit(0)

// -------------------------------------------------------------------- helpers

function collect(node, predicate) {
  const found = []
  const walk = (current) => {
    if (!current || typeof current !== 'object') return
    if (predicate(current)) found.push(current)
    const children = current.children ?? []
    children.forEach(walk)
  }
  walk(node)
  return found
}
