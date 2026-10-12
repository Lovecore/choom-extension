# Contributing

Thanks for wanting to help. Issues and pull requests are welcome.

- Run `npm run check`, `npm test` and `npm run build` before opening a pull request; CI runs them too.
- `vendor/choom-stream/` is generated from choom.gg and is not edited here. If a change needs the
  wire format to change, open an issue and we'll make it in choom.gg first.
- Keep the extension's reach where it is: no new permissions, hosts or data without a clear reason,
  and every new network request listed in README.md and PRIVACY.md in the same pull request.
- Security problems go through [SECURITY.md](SECURITY.md), never a public issue.
