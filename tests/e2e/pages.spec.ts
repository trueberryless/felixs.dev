import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const pages = [
  { heading: 'Blog', path: '/blog', title: /Blog/ },
  { heading: 'Books', path: '/books', title: /Books/ },
  { heading: 'Events', path: '/events', title: /Events/ },
  { heading: 'Open Source', path: '/projects', title: /Projects/ },
  { heading: 'Resume', path: '/resume', title: /Resume/ },
]

test.describe('home page', () => {
  test('introduces Felix and lists the sections', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveTitle('Felix Schneider')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Recent Blog Posts' })).toBeVisible()
  })

  test('has the canonical url and the Open Graph image', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://felixs.dev/')
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://felixs.dev/og-image.png')
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg')
  })
})

for (const { heading, path, title } of pages) {
  test.describe(path, () => {
    test('renders the heading even when the data is not available', async ({ page }) => {
      await page.goto(path)

      await expect(page).toHaveTitle(title)
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    })
  })
}

test('shows the not found page', async ({ page }) => {
  const response = await page.goto('/does-not-exist')

  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { level: 1, name: '404' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Return to Home' })).toBeVisible()
})

test.describe('accessibility', () => {
  for (const path of ['/', '/blog', '/books', '/events', '/projects', '/resume', '/404']) {
    for (const colorScheme of ['dark', 'light'] as const) {
      test(`${path} has no violations in ${colorScheme} mode`, async ({ page }) => {
        await page.emulateMedia({ colorScheme })
        await page.goto(path)
        await page.waitForLoadState('networkidle')

        const { violations } = await new AxeBuilder({ page }).exclude('.year-watermark').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()

        expect(violations.map(({ id, nodes }) => `${id}: ${nodes.map(({ target }) => target.join(' ')).join(', ')}`)).toEqual([])
      })
    }
  }
})

test('has no horizontal overflow', async ({ page }) => {
  await page.goto('/')

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

  expect(overflow).toBeLessThanOrEqual(0)
})

test.describe('on a narrow screen', () => {
  test.use({ viewport: { height: 800, width: 320 } })

  for (const path of ['/', '/blog', '/books', '/events', '/projects', '/resume']) {
    test(`${path} keeps its content inside the screen`, async ({ page }) => {
      await page.goto(path)
      await page.waitForLoadState('networkidle')

      const offscreen = await page.evaluate(() => {
        const width = document.documentElement.clientWidth
        return [...document.querySelectorAll('main *, footer *')]
          .filter((element) => !element.closest('[aria-hidden="true"], .sr-only'))
          .filter((element) => {
            const { height, left, right } = element.getBoundingClientRect()
            return height > 0 && (right > width + 1 || left < -1)
          })
          .map((element) => `${element.tagName.toLowerCase()}.${[...element.classList].join('.')}`)
      })

      expect(offscreen).toEqual([])
    })
  }
})

test.describe('mobile menu', () => {
  test.use({ viewport: { height: 800, width: 375 } })

  test('hides the collapsed links from keyboard and screen reader users', async ({ page }) => {
    await page.goto('/')

    const toggle = page.getByRole('button', { name: 'Menu' })
    const navigation = page.locator('#main-navigation')

    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(navigation).toHaveJSProperty('inert', true)

    await toggle.click()

    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(navigation).toHaveJSProperty('inert', false)

    await page.keyboard.press('Escape')

    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(toggle).toBeFocused()
  })
})
