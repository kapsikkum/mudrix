# Contributing to Mudrix

Thanks for helping out! Bug reports, ideas, translations and code are all welcome.

## Questions and ideas

Not sure whether something is a bug, or want to talk about an idea first? Open an [issue](https://github.com/kapsikkum/mudrix/issues) on GitHub.

## Reporting a bug

Open an [issue](https://github.com/kapsikkum/mudrix/issues). Search first, someone may have reported it already.
A good bug report has:

- **What happened**, and what you expected to happen instead
- **Steps to reproduce it**, as exact as you can
- **Where**: web, desktop (Windows, macOS or Linux), iOS or Android, and the version
- **Screenshots or logs** if they help. Remove anything private, like message content or access tokens.

Please dont report security problems in a public issue. Contact the maintainer privately instead.

## Suggesting a feature

Open an [issue](https://github.com/kapsikkum/mudrix/issues) and describe the problem it solves: what you are
trying to do. That helps us find the best solution, which may differ from the first idea.

The provided issue templates in this repository can help you write a good first issue, select them when opening a issue.

## Contributing code

- **Small fixes** (typos, obvious bugs) can go straight to a merge request.
- **Bigger changes and new features need an issue first**, so we can agree on the approach before you put time into
  it. A merge request for a large change nobody has discussed may not get merged.
- Keep a merge request to one change, link the issue, and say how you tested it.
- Mudrix runs on the web, desktop, iOS and Android. If you change or add a core feature it needs to be tested on all of those plaforms

To get started, see [Development](docs/DEVELOPMENT.md) for setting up and running the apps, and
[Working on the codebase](docs/CODEBASE.md) for where code goes and our conventions. Run `npm run check` before you
open a merge request.

## Using AI tools

> **Important:** Get to know the project and the Matrix protocol before you start building. Not everything that could
> be implemented should be, or will be. If you want a feature, open an issue and discuss it with the maintainers
> first: thats the best way to get it into the app.

- **You own what you submit.** Understand it, be able to explain it, and make sure it works.
- **The same bar applies to everyone.** Every contribution goes through the same review and checks. Merge requests that
  dont show minimal effort, like code that doesnt build or doesnt do what it says, will be closed.
- **Write descriptions yourself.** Keep issues and merge requests short and in your own words. We dont have the time
  to read generated essays.

[AGENTS.md](AGENTS.md) points AI tools to the docs, so they follow this projects conventions.

## License

Mudrix is a fork of [WizardChat](https://gitlab.com/wizardchat/wizardchat) and is licensed under the [AGPL-3.0](LICENSE). By contributing, you agree that your contribution is licensed
under it too.
