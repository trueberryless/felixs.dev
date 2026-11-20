import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const pages = [
  { heading: 'Blog', path: '/blog', title: /Blog/ },
  { heading: 'Books', path: '/books', title: /Books/ },
  { heading: 'Music', path: '/music', title: /Music/ },
  { heading: 'Events', path: '/events', title: /Events/ },
  { heading: 'Open Source', path: '/projects', title: /Projects/ },
  { heading: 'Resume', path: '/resume', title: /Resume/ },
]

test.describe('home page', () => {
  test('introduces Felix and leads into every section', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveTitle('Felix Schneider')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Read the blog' })).toBeVisible()
    // Streams in once the repository export is downloaded.
    await expect(page.getByRole('link', { name: 'Dig into my music' })).toBeVisible({ timeout: 30_000 })
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
  for (const path of ['/', '/blog', '/books', '/music', '/events', '/projects', '/resume', '/404']) {
    for (const colorScheme of ['dark', 'light'] as const) {
      test(`${path} has no violations in ${colorScheme} mode`, async ({ page }) => {
        // Sections fade through each other while scrolling, which axe would
        // catch half way. Reduced motion shows every section as it settles.
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
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

// 320 is a small phone, 200 and 136 are the largest and smallest Apple Watch.
for (const width of [320, 200, 136]) {
  test.describe(`at ${width} pixels wide`, () => {
    test.use({ viewport: { height: 800, width } })

    for (const path of ['/', '/blog', '/books', '/music', '/events', '/projects', '/resume', '/404']) {
      test(`${path} keeps its content inside the screen`, async ({ page }) => {
        await page.goto(path)
        await page.waitForLoadState('networkidle')

        const offscreen = await page.evaluate(() => {
          const viewportWidth = document.documentElement.clientWidth
          return [...document.querySelectorAll('header *, main *, footer *')]
            .filter((element) => !element.closest('[aria-hidden="true"], .sr-only'))
            .filter((element) => getComputedStyle(element).visibility !== 'hidden')
            // Rows that scroll sideways on purpose, like the range picker.
            .filter((element) => {
              for (let parent = element.parentElement; parent; parent = parent.parentElement) {
                if (['auto', 'scroll'].includes(getComputedStyle(parent).overflowX)) return false
              }
              return true
            })
            // Wide charts scroll inside their own container on purpose.
            .filter((element) => !element.closest('[role="region"][tabindex="0"]'))
            .filter((element) => {
              const { height, left, right } = element.getBoundingClientRect()
              return height > 0 && (right > viewportWidth + 1 || left < -1)
            })
            .map((element) => `${element.tagName.toLowerCase()}.${[...element.classList].join('.')}`)
        })

        expect(offscreen).toEqual([])
      })
    }

    test('keeps the open menu inside the screen', async ({ page }) => {
      await page.goto('/')
      await page.getByRole('button', { name: 'Menu' }).click()

      for (const link of await page.getByRole('navigation', { name: 'Main Navigation' }).getByRole('link').all()) {
        await expect(link).toBeInViewport({ ratio: 1 })
      }
    })
  })
}

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

test.describe('live visitors', () => {
  test('stays out of the hero', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('live-visitors')).toHaveClass(/is-tucked/)
  })

  // Other tests run in parallel against the same server, so they may count too.
  test('counts every open tab', async ({ browser }) => {
    const first = await browser.newPage()
    // The count stays out of the hero, so the home page would hide it.
    await first.goto('/books')
    await expect(first.locator('live-visitors').getByRole('status')).toHaveText(/visit/)

    const second = await browser.newPage()
    await second.goto('/blog')

    await expect(second.locator('live-visitors').getByRole('status')).toHaveText(/^([2-9]|\d{2,}) people/)

    await first.close()
    await second.close()
  })
})
