# My corner of the internet

[![Built with Astro](https://astro.badg.es/v2/built-with-astro/tiny.svg)](https://astro.build)
![Core Web Vitals](https://page-speed.dev/badge/felixs.dev)
[![Netlify Status](https://api.netlify.com/api/v1/badges/4f136a11-bf8c-4211-b702-78b79a5426ef/deploy-status)](https://app.netlify.com/projects/trueberryless/deploys)

## Development

Requires Node.js 24 and pnpm.

```shell
pnpm install
pnpm dev
```

| Command             | Description                                                              |
| ------------------- | ------------------------------------------------------------------------ |
| `pnpm check`        | Build the lexicons and type check with `astro check`                     |
| `pnpm lint`         | Lint with oxlint                                                         |
| `pnpm format:check` | Check formatting with Prettier                                           |
| `pnpm knip`         | Find unused files and dependencies                                       |
| `pnpm test`         | Unit tests with Vitest                                                   |
| `pnpm test:e2e`     | Build, then run the Playwright end-to-end tests against the node server  |

The content on the landing page is loaded at request time through server islands from GitHub and ATproto. The end-to-end tests therefore only assert what does not depend on that data.

## License

Licensed under the MIT license, Copyright © trueberryless.

See [LICENSE](https://github.com/trueberryless/felixs.dev/blob/main/LICENSE) for more information.
