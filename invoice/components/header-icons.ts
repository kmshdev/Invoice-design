import { ArrowRight, ArrowUpRight, Code2, FileText, Grid2X2, LogIn, Menu, X } from 'lucide'
import { maskTarget } from 'morphicons/adapters'
import { createMorph } from 'morphicons/dom'

const iconData = {
  'arrow-right': ArrowRight,
  'code-2': Code2,
  'file-text': FileText,
  'grid-2x2': Grid2X2,
  'log-in': LogIn,
  menu: Menu,
} as const

type IconName = keyof typeof iconData

function isIconName(name: string | undefined): name is IconName {
  return Boolean(name && name in iconData)
}

export function initializeHeaderIcons(root: ParentNode = document): () => void {
  const cleanups: Array<() => void> = []
  const morphs = new Map<HTMLElement, ReturnType<typeof createMorph>>()

  root.querySelectorAll<HTMLElement>('[data-morph-icon]').forEach((element) => {
    const name = element.dataset.morphIcon
    if (!isIconName(name)) return

    const target = maskTarget(element)
    const morph = createMorph(target, iconData[name], {
      reducedMotion: 'user',
    })

    element.classList.add('is-morph-ready')
    morphs.set(element, morph)
    cleanups.push(() => {
      morph.destroy()
      target.dispose()
      element.classList.remove('is-morph-ready')
    })
  })

  root.querySelectorAll<HTMLElement>('[data-morph-link]').forEach((link) => {
    const icon = link.querySelector<HTMLElement>('[data-morph-icon]')
    const morph = icon && morphs.get(icon)
    const name = icon?.dataset.morphIcon
    if (!morph || !isIconName(name)) return

    const activate = () => morph.morphTo(ArrowUpRight, 'snappy')
    const restore = () => morph.morphTo(iconData[name], 'snappy')

    link.addEventListener('pointerenter', activate)
    link.addEventListener('pointerleave', restore)
    link.addEventListener('focusin', activate)
    link.addEventListener('focusout', restore)
    cleanups.push(() => {
      link.removeEventListener('pointerenter', activate)
      link.removeEventListener('pointerleave', restore)
      link.removeEventListener('focusin', activate)
      link.removeEventListener('focusout', restore)
    })
  })

  const menu = root.querySelector<HTMLDetailsElement>('.nav-menu')
  const summary = menu?.querySelector<HTMLElement>('summary')
  const menuIcon = menu?.querySelector<HTMLElement>('[data-morph-icon="menu"]')
  const menuMorph = menuIcon && morphs.get(menuIcon)
  const desktop = window.matchMedia('(min-width: 1024px)')

  if (menu && summary && menuMorph) {
    const updateMenuIcon = () => menuMorph.morphTo(menu.open ? X : Menu, 'snappy')
    const closeMenu = () => {
      menu.open = false
    }
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !menu.open) return
      closeMenu()
      summary.focus()
    }
    const onPointerDown = (event: PointerEvent) => {
      if (menu.open && event.target instanceof Node && !menu.contains(event.target))
        closeMenu()
    }
    const onDesktopChange = (event: MediaQueryListEvent) => {
      if (event.matches) closeMenu()
    }

    menu.addEventListener('toggle', updateMenuIcon)
    menu.addEventListener('keydown', onKeydown)
    menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu))
    document.addEventListener('pointerdown', onPointerDown)
    desktop.addEventListener('change', onDesktopChange)
    updateMenuIcon()

    cleanups.push(() => {
      menu.removeEventListener('toggle', updateMenuIcon)
      menu.removeEventListener('keydown', onKeydown)
      menu
        .querySelectorAll('a')
        .forEach((link) => link.removeEventListener('click', closeMenu))
      document.removeEventListener('pointerdown', onPointerDown)
      desktop.removeEventListener('change', onDesktopChange)
    })
  }

  return () =>
    cleanups
      .splice(0)
      .reverse()
      .forEach((cleanup) => cleanup())
}
